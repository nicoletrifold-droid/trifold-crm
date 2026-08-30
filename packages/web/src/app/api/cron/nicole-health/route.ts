import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { logEventOnce } from "@web/lib/logger"
import {
  classificarErroIA,
  deveAlertar,
  MOTIVO_POR_TIPO,
  type TipoErroIA,
} from "@web/lib/alerts/erro-ia"
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

/**
 * Story 900-23 · AC3 — **canal de ENTREGA do alerta de plataforma**, não filtro do que é lido, e
 * não o `org_id` do incidente.
 *
 * Este cron é vigia de PLATAFORMA: ele agrega os erros de IA de TODAS as organizações num único
 * aviso administrativo (o comentário acima explica por quê — "7 falhas viram 1 aviso, não 7").
 * Migrá-lo para `forEachActiveOrg` produziria N alertas para o mesmo incidente, o oposto do que
 * ele existe para fazer. O que sobrou do antigo `DEFAULT_ORG_ID` são as duas ocorrências abaixo,
 * renomeadas: é a org cujo `whatsapp_config` ENVIA o aviso — de quem recebe, não de quem falhou.
 * Quais orgs foram atingidas vai em `metadata.orgs_afetadas` e no corpo da mensagem.
 */
const PLATFORM_ALERT_ORG_ID = "00000000-0000-0000-0000-000000000001" // Trifold Engenharia

/**
 * Janela de leitura, MAIOR que o intervalo do cron (10 min) de propósito: um erro nos
 * segundos finais de uma janela justa seria perdido. A sobreposição reprocessa o mesmo
 * erro na execução seguinte — inofensivo, porque o dedup horário impede o 2º envio.
 */
const JANELA_MIN = 15

interface Agregado {
  ocorrencias: number
  primeiraOcorrencia: string
  /**
   * Story 900-23 · AC3 — quais organizações produziram este tipo de erro. `null` cobre os eventos
   * que já hoje são gravados sem `org_id`. Ler de todas as orgs já era o comportamento; o defeito
   * era o `select` não trazer `org_id`, então o alerta agregava sem saber DE QUEM.
   */
  orgsAfetadas: Set<string | null>
}

/**
 * Story 87-20 — o `event_type` que a trava de loop bot-a-bot grava, do webhook, com
 * `await logEventOnce`. Este cron é só o MENSAGEIRO: a contenção (`is_ai_active=false`
 * + `handoff_reason`) já aconteceu lá, síncrona. Se este branch inteiro falhar, a
 * Nicole continua contida — é o AC11.
 */
const EVENTO_LOOP = "NICOLE_LOOP_DETECTADO"

/** Base do link que vai dentro do `{{1}}`. `APP_URL` nu não existe — produziria `undefined/…`. */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.trifold.eng.br"

interface LoopAgregado {
  conversationId: string
  ocorrencias: number
  primeiraOcorrencia: string
}

/**
 * Loops contidos na janela, agregados POR CONVERSA.
 *
 * Por conversa e não por tipo de sinal: o admin precisa saber ONDE olhar. Dois loops
 * simultâneos em conversas diferentes viram dois alertas DISTINGUÍVEIS (cada um com
 * seu link), não duas mensagens idênticas.
 */
async function coletarLoops(
  admin: ReturnType<typeof createAdminClient>,
  desde: string
): Promise<LoopAgregado[]> {
  const { data, error } = await admin
    .from("system_events")
    .select("created_at, metadata")
    .eq("event_type", EVENTO_LOOP)
    .gte("created_at", desde)
    .order("created_at", { ascending: true })

  if (error || !data) return []

  const porConversa = new Map<string, LoopAgregado>()
  for (const ev of data) {
    const meta = (ev.metadata ?? {}) as Record<string, unknown>
    const conversationId = typeof meta.conversationId === "string" ? meta.conversationId : null
    if (!conversationId) continue
    const atual = porConversa.get(conversationId)
    if (atual) {
      atual.ocorrencias += 1
    } else {
      porConversa.set(conversationId, {
        conversationId,
        ocorrencias: 1,
        // Ordenado asc: o primeiro que vejo de cada conversa é o mais antigo.
        primeiraOcorrencia: ev.created_at as string,
      })
    }
  }
  return [...porConversa.values()]
}

/** União das orgs afetadas de vários tipos — `null` (evento sem org) vira "desconhecida". */
function orgsAfetadasDe(entradas: Array<[TipoErroIA, Agregado]>): string[] {
  const uniao = new Set<string>()
  for (const [, ag] of entradas) {
    for (const o of ag.orgsAfetadas) uniao.add(o ?? "desconhecida")
  }
  return [...uniao]
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
    .select("created_at, message, source, org_id")
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
    const orgDoEvento = (ev.org_id as string | null) ?? null
    const atual = porTipo.get(tipo)
    if (atual) {
      atual.ocorrencias += 1
      atual.orgsAfetadas.add(orgDoEvento)
    } else {
      // `eventos` vem ordenado por `created_at` asc, então o primeiro que vejo de cada
      // tipo é genuinamente o mais antigo da janela.
      porTipo.set(tipo, {
        ocorrencias: 1,
        primeiraOcorrencia: ev.created_at as string,
        orgsAfetadas: new Set([orgDoEvento]),
      })
    }
  }

  const aAlertar = [...porTipo.entries()].filter(([tipo, ag]) =>
    deveAlertar(tipo, ag.ocorrencias)
  )

  // Story 87-20 — branch INDEPENDENTE: roda mesmo quando não há erro de API de IA na
  // janela (o caso comum), e um loop contido não é um erro de API.
  const loops = await coletarLoops(admin, desde)

  const resumo = {
    janelaMin: JANELA_MIN,
    eventosLidos: (eventos ?? []).length,
    conversasEmLoop: loops.map((l) => l.conversationId),
    porTipo: Object.fromEntries(
      [...porTipo].map(([tipo, ag]) => [
        tipo,
        {
          ocorrencias: ag.ocorrencias,
          primeiraOcorrencia: ag.primeiraOcorrencia,
          // `Set` vira `{}` em JSON.stringify — sem esta conversão o campo existiria e seria
          // sempre vazio, que é pior que não existir.
          orgsAfetadas: [...ag.orgsAfetadas].map((o) => o ?? "desconhecida"),
        },
      ]),
    ),
    dryRun,
  }

  if (aAlertar.length === 0 && loops.length === 0) {
    return NextResponse.json({ ok: true, ...resumo, alertasEnviados: 0, dedupPulados: 0 })
  }

  // AC14 — só agora buscamos o canal. Se ele não estiver utilizável, saímos ANTES de
  // gravar qualquer marcador de dedup: um alerta consumido por um envio que nunca
  // aconteceu seria um segundo silêncio.
  const config = await carregarConfigWhatsApp(admin, PLATFORM_ALERT_ORG_ID)
  if (!config) {
    await logEventOnce({
      level: "warn",
      category: "cron",
      event_type: "NICOLE_HEALTH_SEM_CANAL",
      message: "Falha de IA detectada, mas whatsapp_config indisponível — alerta não enviado",
      metadata: {
        tipos: aAlertar.map(([t]) => t),
        orgs_afetadas: orgsAfetadasDe(aAlertar),
        // Story 87-20 — sem isto, um loop contido que não conseguiu alertar sairia
        // do registro por completo: o evento de "não consegui avisar" não diria que
        // havia um loop a avisar.
        conversas_em_loop: loops.map((l) => l.conversationId),
      },
      source: "api/cron/nicole-health",
      // Story 900-23 · AC3 — SEM `org_id`: o alerta é evento de PLATAFORMA, não de tenant.
      // Gravá-lo como se fosse da Trifold é a mesma classe de erro de atribuição que motivou
      // esta reclassificação. Quais orgs foram atingidas vai em `metadata.orgs_afetadas`.
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
        orgs_afetadas: [...ag.orgsAfetadas].map((o) => o ?? "desconhecida"),
      },
      dedupe_key: `nicole-health:${tipo}:${horaAtual}`,
      source: "api/cron/nicole-health",
      // Sem `org_id` — ver comentário do NICOLE_HEALTH_SEM_CANAL acima (AC3 da 900-23).
    })

    if (!inserted) {
      dedupPulados += 1
      continue
    }

    const { enviados } = await alertarAdminWhatsApp(admin, {
      // Canal de entrega, não org do incidente — ver PLATFORM_ALERT_ORG_ID.
      orgId: PLATFORM_ALERT_ORG_ID,
      config,
      telefones,
      // Story 87-20 — a resolução do texto subiu um nível (`tipo` → `motivo`) para o
      // transporte poder servir o alerta de loop, que não é um `TipoErroIA`. O texto
      // que sai daqui é byte-a-byte o de antes.
      motivo: MOTIVO_POR_TIPO[tipo],
      desdeIso: ag.primeiraOcorrencia,
      ocorrencias: ag.ocorrencias,
      // ⚠️ Story 900-23 — `orgs_afetadas` NÃO entra aqui de propósito. `alertarAdminWhatsApp`
      // dispara o template APROVADO `alerta_sistema_admin`, de 3 parâmetros fixos: um 4º faria a
      // Meta devolver 400 e o alerta pararia de sair — mudança de comportamento em produção,
      // exatamente o que a AC9 proíbe. A informação de quais orgs foram atingidas vai em
      // `metadata.orgs_afetadas` dos dois eventos e no corpo da resposta HTTP (rastreável), até
      // que uma story de template cuide do texto.
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

  // ─── Story 87-20 · alerta de loop bot-a-bot ───────────────────────────────
  //
  // Branch NOVO e independente do de erro de API de IA acima: mesma infraestrutura de
  // transporte (`alertarAdminWhatsApp`), classificador diferente (nenhum — o webhook
  // já classificou), agregação por CONVERSA em vez de por tipo.
  //
  // AC11 — se tudo aqui falhar, a contenção continua de pé: ela aconteceu dentro do
  // `processMessageWithMetadata`, aguardada, antes e independentemente deste cron.
  let alertasDeLoop = 0
  for (const loop of loops) {
    if (dryRun) continue

    // O link cabe no `{{1}}` (texto livre) e é a diferença entre "loop detectado" e
    // "loop detectado NESTA conversa". Sem ele, trocamos um loop infinito por uma
    // conversa contida que ninguém acha: `handoff_reason` é escrito em 6 rotas de API
    // e lido em ZERO telas.
    const motivo = `loop bot-a-bot detectado — ${APP_URL}/dashboard/conversas/${loop.conversationId}`

    const { inserted } = await logEventOnce({
      level: "warn",
      category: "system",
      event_type: "NICOLE_LOOP_ALERTA",
      message: `Loop bot-a-bot contido — ${loop.ocorrencias} bloqueio(s) na janela`,
      metadata: {
        conversation_id: loop.conversationId,
        ocorrencias: loop.ocorrencias,
        primeira_ocorrencia: loop.primeiraOcorrencia,
      },
      // Dedup POR CONVERSA e por hora: dois loops simultâneos em conversas diferentes
      // produzem dois alertas distintos, não um só nem dois idênticos.
      dedupe_key: `nicole-loop-alerta:${loop.conversationId}:${horaAtual}`,
      source: "api/cron/nicole-health",
    })

    if (!inserted) {
      dedupPulados += 1
      continue
    }

    const { enviados } = await alertarAdminWhatsApp(admin, {
      orgId: PLATFORM_ALERT_ORG_ID,
      config,
      telefones,
      motivo,
      desdeIso: loop.primeiraOcorrencia,
      ocorrencias: loop.ocorrencias,
    })

    if (enviados === 0) {
      // Mesma compensação do branch acima: marcador gravado ANTES do envio dá o dedup
      // atômico, mas mantê-lo depois de uma falha total de entrega transformaria a
      // falha em silêncio pela hora inteira.
      await admin
        .from("system_events")
        .delete()
        .eq("event_type", "NICOLE_LOOP_ALERTA")
        .eq("metadata->>dedupe_key", `nicole-loop-alerta:${loop.conversationId}:${horaAtual}`)
      entregasFalhas += 1
      continue
    }

    alertasEnviados += enviados
    alertasDeLoop += 1
  }

  return NextResponse.json({
    ok: true,
    ...resumo,
    tiposAlertaveis: aAlertar.map(([t]) => t),
    orgsAfetadas: orgsAfetadasDe(aAlertar),
    alertasEnviados,
    alertasDeLoop,
    dedupPulados,
    entregasFalhas,
  })
}
