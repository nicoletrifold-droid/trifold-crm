import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { logEventOnce } from "@web/lib/logger"
import { classificarErroIA, deveAlertar, type TipoErroIA } from "@web/lib/alerts/erro-ia"
import {
  alertarAdminWhatsApp,
  carregarConfigWhatsApp,
  destinatariosConfigurados,
} from "@web/lib/alerts/admin-whatsapp"

// Story 87-19 — vigia da Nicole. Roda a cada 10 min (vercel.json), lê os erros que os
// `catch` do projeto JÁ gravam em `system_events`, e avisa o admin por WhatsApp quando
// o padrão é "a API de IA parou de atender".
//
// POR QUE LER O BANCO E NÃO INSTRUMENTAR AS CHAMADAS: existem 18 `messages.create` no
// monorepo. Instrumentar cada uma é 18 pontos de manutenção e um 19º que alguém
// esquece no próximo flow. Os 11 eventos do incidente de 27-28/08/2026 vieram de 3
// caminhos diferentes (`webhook/whatsapp`, `cron/followup`, `visit-feedback-core`) sem
// que nenhum precisasse ser tocado.
//
// POR QUE CRON E NÃO ENVIO NO `catch`: o caminho assíncrono do webhook roda DEPOIS da
// resposta HTTP e pode ser cortado pelo serverless. Um alerta que depende do mesmo
// runtime que acabou de falhar se perde exatamente quando é necessário. E o cron dá
// agregação de graça: 7 falhas viram 1 aviso, não 7.
//
// SEM GATE DE HORÁRIO COMERCIAL, de propósito — ao contrário de `cron/webhook-health`.
// O incidente que originou esta story foi às 06:05 BRT (09:05 UTC), fora da janela
// 11h–23h UTC daquele cron, que portanto jamais o teria detectado.
export const maxDuration = 60

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001" // Trifold Engenharia

/**
 * Janela de leitura, MAIOR que o intervalo do cron (10 min) de propósito: um erro nos
 * segundos finais de uma janela justa seria perdido. A sobreposição reprocessa o mesmo
 * erro na execução seguinte — inofensivo, porque o dedup horário impede o 2º envio.
 */
const JANELA_MIN = 15

interface Agregado {
  ocorrencias: number
  primeiraOcorrencia: string
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")
  if (!cronSecret) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if ((process.env.ALERTA_SISTEMA_OFF ?? "") === "1") {
    return NextResponse.json({ skipped: "desligado" })
  }

  const telefones = destinatariosConfigurados()
  if (telefones.length === 0) {
    // Explícito, nunca um "ok" silencioso: é o que aparece no log da Vercel se alguém
    // zerar a lista — ou se a env for gravada vazia pelo gotcha do `vercel env add`.
    return NextResponse.json({ skipped: "sem destinatário" })
  }

  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get("dry") === "1"

  const admin = createAdminClient()
  const desde = new Date(Date.now() - JANELA_MIN * 60 * 1000).toISOString()

  // Sem filtro de `category`: o incidente atingiu `webhook` E `cron`. Filtrar por
  // categoria perderia metade dos caminhos.
  const { data: eventos, error } = await admin
    .from("system_events")
    .select("created_at, message, source")
    .eq("level", "error")
    .gte("created_at", desde)
    .order("created_at", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const porTipo = new Map<TipoErroIA, Agregado>()
  for (const ev of eventos ?? []) {
    const tipo = classificarErroIA((ev.message as string) ?? "")
    if (!tipo) continue
    const atual = porTipo.get(tipo)
    if (atual) {
      atual.ocorrencias += 1
    } else {
      // `eventos` vem ordenado por `created_at` asc, então o primeiro que vejo de cada
      // tipo é genuinamente o mais antigo da janela.
      porTipo.set(tipo, { ocorrencias: 1, primeiraOcorrencia: ev.created_at as string })
    }
  }

  const aAlertar = [...porTipo.entries()].filter(([tipo, ag]) =>
    deveAlertar(tipo, ag.ocorrencias)
  )

  const resumo = {
    janelaMin: JANELA_MIN,
    eventosLidos: (eventos ?? []).length,
    porTipo: Object.fromEntries(porTipo),
    dryRun,
  }

  if (aAlertar.length === 0) {
    return NextResponse.json({ ok: true, ...resumo, alertasEnviados: 0, dedupPulados: 0 })
  }

  // AC14 — só agora buscamos o canal. Se ele não estiver utilizável, saímos ANTES de
  // gravar qualquer marcador de dedup: um alerta consumido por um envio que nunca
  // aconteceu seria um segundo silêncio.
  const config = await carregarConfigWhatsApp(admin, DEFAULT_ORG_ID)
  if (!config) {
    await logEventOnce({
      level: "warn",
      category: "cron",
      event_type: "NICOLE_HEALTH_SEM_CANAL",
      message: "Falha de IA detectada, mas whatsapp_config indisponível — alerta não enviado",
      metadata: { tipos: aAlertar.map(([t]) => t) },
      source: "api/cron/nicole-health",
      org_id: DEFAULT_ORG_ID,
    })
    return NextResponse.json({ skipped: "whatsapp indisponível", ...resumo })
  }

  // Dedup horário: a chave inclui a hora UTC truncada, então enquanto a falha persistir
  // sai no máximo 1 alerta por tipo por hora — e um NOVO alerta na hora seguinte, em
  // vez de um aviso único que se perde. O índice único parcial que garante isso é o
  // `ux_system_events_dedupe_key` (migration 218, Story 87-6).
  const horaAtual = new Date().toISOString().slice(0, 13)

  let alertasEnviados = 0
  let dedupPulados = 0
  /** Tipos cujo marcador foi desfeito por falha total de entrega (retenta em 10 min). */
  let entregasFalhas = 0

  for (const [tipo, ag] of aAlertar) {
    if (dryRun) continue

    const { inserted } = await logEventOnce({
      level: "warn",
      category: "system",
      event_type: "NICOLE_HEALTH_ALERTA",
      message: `Nicole parada por erro da API de IA (${tipo}) — ${ag.ocorrencias} falha(s) na janela`,
      metadata: {
        tipo,
        ocorrencias: ag.ocorrencias,
        primeira_ocorrencia: ag.primeiraOcorrencia,
      },
      dedupe_key: `nicole-health:${tipo}:${horaAtual}`,
      source: "api/cron/nicole-health",
      org_id: DEFAULT_ORG_ID,
    })

    if (!inserted) {
      dedupPulados += 1
      continue
    }

    const { enviados } = await alertarAdminWhatsApp(admin, {
      orgId: DEFAULT_ORG_ID,
      config,
      telefones,
      tipo,
      desdeIso: ag.primeiraOcorrencia,
      ocorrencias: ag.ocorrencias,
    })

    if (enviados === 0) {
      // COMPENSAÇÃO — mesma regra do AC14, agora para o envio que falhou.
      //
      // O marcador é gravado ANTES do envio de propósito: é ele que dá o dedup
      // atômico contra duas execuções concorrentes. Mas se NINGUÉM recebeu, manter
      // o marcador transforma a falha de entrega em silêncio pela hora inteira —
      // o defeito que esta story existe para matar. Então desfazemos, e o próximo
      // ciclo (10 min) tenta de novo.
      //
      // Não é hipotético: enquanto o template `alerta_sistema_admin` estiver
      // `PENDING` na Meta, TODO envio devolve 400 e cai exatamente aqui.
      await admin
        .from("system_events")
        .delete()
        .eq("event_type", "NICOLE_HEALTH_ALERTA")
        .eq("metadata->>dedupe_key", `nicole-health:${tipo}:${horaAtual}`)
      entregasFalhas += 1
      continue
    }

    alertasEnviados += enviados
  }

  return NextResponse.json({
    ok: true,
    ...resumo,
    tiposAlertaveis: aAlertar.map(([t]) => t),
    alertasEnviados,
    dedupPulados,
    entregasFalhas,
  })
}
