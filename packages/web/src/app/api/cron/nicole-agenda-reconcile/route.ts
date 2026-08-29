import { NextRequest, NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { sendTelegramAdminAlert } from "@web/lib/telegram"
import { logEventOnce } from "@web/lib/logger"
import { reconciliarAgenda, diaBrt } from "@trifold/ai"
import {
  forEachActiveOrg,
  statusHttpParaResumo,
  type OrgAtiva,
} from "@web/lib/tenancy/for-each-org"
import { trifoldOrgId } from "@web/lib/tenancy/trifold-org"

/**
 * Story 87-3 — reconciliação diária entre o que a Nicole AFIRMOU e o que existe
 * em `appointments`. Wrapper fino: auth, janela, chamada do módulo puro
 * (`packages/ai/src/flows/agenda-reconcile.ts`), evento e alerta.
 *
 * Origem: em 28/06 a lead Célia ouviu "Agendei sua visita para este sábado às
 * 9h" e o banco tem ZERO appointments dela até hoje — 40 dias. O caso só
 * apareceu numa auditoria manual de 8 semanas. Enquanto nada comparar a fala com
 * a linha no banco, todo defeito de agenda tem tempo de descoberta medido em
 * semanas e um descobridor humano por acidente.
 *
 * READ-ONLY em tabela de negócio. O único write é `system_events` (aqui, não no
 * módulo) — ver AC5.
 *
 * Story 900-23 — roda para TODAS as organizações ativas (`forEachActiveOrg`), não mais para um
 * `DEFAULT_ORG_ID`. Duas consequências que NÃO podem ser desfeitas por engano:
 *  - o `try/catch` do callback continua existindo e emitindo `NICOLE_LASTRO_FALHA` antes de
 *    relançar (é AC da Story 87-6, não redundância do helper);
 *  - o despacho de Telegram é escopado à Trifold (`trifoldOrgId()`), porque
 *    `TELEGRAM_ADMIN_CHAT_ID` é um chat só, global, e o corpo do alerta nomeia o lead, cita o
 *    trecho da conversa e traz o deep link do cadastro.
 *
 *   GET /api/cron/nicole-agenda-reconcile           janela padrão de 24 h
 *   GET /api/cron/nicole-agenda-reconcile?days=60   rodada retroativa (baseline)
 *   GET /api/cron/nicole-agenda-reconcile?dry=1     calcula e devolve JSON POR ORG,
 *                                                   NÃO emite evento nem alerta
 */

// A rodada de 60 dias lê ~2.500 mensagens e cruza com os appointments.
export const maxDuration = 300

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.trifold.eng.br"
const MAX_DIAS = 180
/** Teto de alertas por rodada — a retroativa de 60 dias não pode virar 12 pushes. */
const MAX_ALERTAS_TELEGRAM = 10
/**
 * Story 87-6 — todo cron do projeto grava `api/cron/…`; só esta rota gravava
 * `cron/…`. A divergência já fez alguém concluir, por `source like 'cron/%'`,
 * que crons não gravam evento nenhum. Alinhado.
 */
const SOURCE = "api/cron/nicole-agenda-reconcile"

/**
 * Story 87-6 — a COSTURA do canal de aviso. Hoje encapsula o Telegram; a 87-9
 * troca só o corpo desta função (WhatsApp com template aprovado) sem reabrir a
 * rota.
 *
 * ⚠️ O número devolvido é de avisos DESPACHADOS, não entregues:
 * `sendTelegramAdminAlert` devolve `void` e suprime em silêncio quando falta
 * `TELEGRAM_BOT_TOKEN`/`TELEGRAM_ADMIN_CHAT_ID` — que é o estado de produção
 * hoje. Fazer o notificador devolver o que REALMENTE saiu (e registrar a
 * supressão em `system_events`) é requisito da 87-9, não desta story.
 */
async function notificarAdmins(msgs: string[]): Promise<number> {
  let despachados = 0
  for (const msg of msgs) {
    await sendTelegramAdminAlert(msg)
    despachados++
  }
  return despachados
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

  const url = new URL(request.url)
  const dry = url.searchParams.get("dry") === "1"
  const diasParam = Number.parseInt(url.searchParams.get("days") ?? "1", 10)
  const dias = Number.isFinite(diasParam) ? Math.min(Math.max(diasParam, 1), MAX_DIAS) : 1

  const ate = new Date()
  const desde = new Date(ate.getTime() - dias * 86400_000)

  const resumo = await forEachActiveOrg(
    (org, db) => reconciliarOrg(org, db, { desde, ate, dias, dry }),
    { source: SOURCE },
  )

  // `?dry=1` continua sem efeito colateral de domínio, mas o corpo é POR ORG (R4): não existe
  // "dry run de todas as orgs num JSON só", e fingir que existe esconderia qual org produziu
  // qual número.
  if (dry) {
    return NextResponse.json(
      {
        dry: true,
        resultados: resumo.resultados.map((r) => ({
          orgId: r.org.id,
          org: r.org.name,
          ok: r.ok,
          ...(r.ok ? r.resultado : { erro: r.erro }),
        })),
      },
      { status: statusHttpParaResumo(resumo) },
    )
  }

  return NextResponse.json(
    {
      ok: resumo.falha === 0,
      total: resumo.total,
      sucesso: resumo.sucesso,
      falha: resumo.falha,
      resultados: resumo.resultados.map((r) => ({
        orgId: r.org.id,
        org: r.org.name,
        ok: r.ok,
        ...(r.ok ? r.resultado : { erro: r.erro }),
      })),
    },
    { status: statusHttpParaResumo(resumo) },
  )
}

/**
 * O trabalho de UMA organização. Devolve o relatório; **lança** quando falha, para o helper
 * contabilizar (Propriedade 1) — mas nunca antes de emitir `NICOLE_LASTRO_FALHA`.
 */
async function reconciliarOrg(
  org: OrgAtiva,
  db: SupabaseClient,
  { desde, ate, dias, dry }: { desde: Date; ate: Date; dias: number; dry: boolean },
) {
  const orgId = org.id
  try {
    const rel = await reconciliarAgenda(db, { desde, ate, orgId })

    // `?dry=1` não emite evento nem alerta — é o modo em que o baseline é
    // produzido e conferido antes de qualquer push (AC4-ii).
    if (dry) {
      return { dry: true, ...rel }
    }

    // REIVINDICAÇÃO (claim), no lugar do `select`-depois-`insert` que existia
    // aqui. O INSERT é o dedupe: quem grava a linha é quem alerta. Não há janela
    // entre ler e escrever porque não se lê — o par de invocações dos dois
    // projetos Vercel lia o mesmo vazio (gap medido: mín. 2,9 s, mediana 43 s).
    // Quem leva `23505` perdeu a corrida: a linha já existe, o caso já foi
    // alertado, e o silêncio é o comportamento certo.
    const reivindicados: typeof rel.alertas = []
    for (const a of rel.alertas) {
      const { inserted } = await logEventOnce({
        level: "warn",
        category: "ai",
        event_type: "NICOLE_AFIRMACAO_SEM_LASTRO",
        message: `Nicole afirmou visita sem lastro para ${a.lead_nome} — ${a.afirmado_para_brt} BRT`,
        org_id: orgId,
        source: SOURCE,
        metadata: {
          lead_id: a.lead_id,
          lead_name: a.lead_nome,
          conversation_id: a.conversation_id,
          message_id: a.message_id,
          falado_em: a.falado_em_brt,
          afirmado_para: a.afirmado_para_brt,
          trecho: a.trecho,
        },
      })
      if (inserted) reivindicados.push(a)
    }

    // O resumo diário publica o NÚMERO — é dele que o PM2 do Epic 88 sai. Um
    // cron que dispara alerta e não publica a taxa deixa o epic sem como ser
    // dimensionado.
    //
    // 🔴 Este `await` é o conserto principal da 87-6. Em 10/08 11:38 UTC as duas
    // invocações rodaram (11:38:24 gravou o alerta; 11:38:46 gravou o recibo com
    // `alertas_novos: 0`, portanto já enxergava o alerta da primeira). O recibo
    // da PRIMEIRA — que diria `alertas_novos: 1` — não existe no banco. Ele não
    // foi pulado: é emitido incondicionalmente. Foi PERDIDO, porque era a última
    // escrita antes do `NextResponse.json` e o `logEvent` não era aguardado.
    // Consequência retroativa: o vazio de 09/08 deixa de ser evidência de que o
    // agendador não disparou.
    //
    // O `dedupe_key` é o que impede o conserto de piorar: com a escrita agora
    // garantida e DUAS invocações por dia, sairiam dois números por dia. A chave
    // inclui `dias` de propósito — a rodada retroativa (`?days=60`) não pode ser
    // engolida pela diária. E o `orgId` vai DENTRO da string porque `org_id`
    // pode ser `NULL`, e `NULL` em coluna de índice único é distinto de `NULL`
    // (o dedupe evaporaria em silêncio).
    //
    // Story 900-23: com DUAS orgs na mesma rodada, o `orgId` dentro da chave deixou de ser
    // detalhe e virou a garantia que impede a org B de ser suprimida como duplicata da org A —
    // o índice `ux_system_events_dedupe_key` não inclui `org_id` (ver JSDoc de `for-each-org.ts`).
    await logEventOnce({
      level: "info",
      category: "ai",
      event_type: "NICOLE_LASTRO_DIARIO",
      message: `Lastro ${rel.lastro_pct}% (${rel.com_lastro}/${rel.denominador}) em ${dias}d — ${rel.sem_lastro} sem lastro`,
      org_id: orgId,
      source: SOURCE,
      dedupe_key: `lastro:${orgId}:${diaBrt(ate)}:${dias}d`,
      metadata: {
        unidade: rel.unidade,
        janela: rel.janela,
        total_disparos: rel.total_disparos,
        descartes: rel.descartes,
        lembrete: rel.lembrete,
        denominador: rel.denominador,
        com_lastro: rel.com_lastro,
        reparo_humano: rel.reparo_humano,
        sem_lastro: rel.sem_lastro,
        lastro_pct: rel.lastro_pct,
        lastro_frouxo_pct: rel.lastro_frouxo_pct,
        lastro_frouxo_rotulo: rel.lastro_frouxo_rotulo,
        sensibilidade: rel.sensibilidade,
        alertas_novos: reivindicados.length,
      },
    })

    // O alerta NOMEIA o lead, a data, o horário afirmado e traz o deep link —
    // é o que faz valer a pena abrir mesmo com ~1 em 3 sendo falso positivo
    // (a guarda de interrogação do Epic 88 é o conserto disso, não heurística
    // nova aqui). Itera os REIVINDICADOS: sem isso, o índice único tornaria a
    // linha única e mesmo assim os dois lados alertariam.
    const avisos: string[] = reivindicados.slice(0, MAX_ALERTAS_TELEGRAM).map(
      (a) =>
        `⚠️ *Nicole afirmou visita SEM LASTRO*\n\n` +
        `Lead: *${a.lead_nome}*\n` +
        `Ela falou em: ${a.falado_em_brt} BRT\n` +
        `Afirmou a visita para: *${a.afirmado_para_brt} BRT*\n` +
        `Não existe appointment correspondente.\n\n` +
        `_"${a.trecho}"_\n\n` +
        `${APP_URL}/dashboard/leads/${a.lead_id}`,
    )
    if (reivindicados.length > MAX_ALERTAS_TELEGRAM) {
      avisos.push(
        `⚠️ Reconciliação de agenda: +${reivindicados.length - MAX_ALERTAS_TELEGRAM} casos sem lastro além dos listados (janela de ${dias}d).`,
      )
    }

    // ⚠️ C5 — o canal é GLOBAL: `TELEGRAM_ADMIN_CHAT_ID` é um chat só, sem destino por org, e o
    // corpo acima nomeia o lead, cita a fala da Nicole com ele e traz o link direto para o
    // cadastro dele. Despachar para toda org ativa mandaria PII da empresa B para o Telegram
    // administrativo da Trifold. Enquanto o canal não tiver destino por org
    // (`org_integrations.provider = 'telegram'`, Onda 7), só a Trifold despacha — as demais
    // orgs continuam com o caso GRAVADO em `system_events` (`NICOLE_AFIRMACAO_SEM_LASTRO`,
    // acima, sem mudança), rastreável, só não empurrado para um canal que não é delas.
    const podeDespachar = orgId === trifoldOrgId()
    const avisos_despachados = podeDespachar ? await notificarAdmins(avisos) : 0

    return {
      ok: true,
      alertas_novos: reivindicados.length,
      alertas_deduplicados: rel.alertas.length - reivindicados.length,
      avisos_despachados,
      avisos_suprimidos_canal_global: podeDespachar ? 0 : avisos.length,
      ...rel,
    }
  } catch (e) {
    const detalhe = e instanceof Error ? e.message : String(e)
    console.error(`[nicole-agenda-reconcile] falha (${org.name}):`, e)
    // ⚠️ C4 — NÃO apague este `catch` achando que "o helper agora trata". O helper só sabe "a org
    // X falhou com esta mensagem"; ele NÃO sabe que, para este cron, a falha também precisa virar
    // um evento nomeado. Sem esta linha, uma falha de execução devolve 500 e NÃO deixa rastro em
    // `system_events` — o dia fica indistinguível de "o agendador não disparou". Foi essa
    // ambiguidade que custou quatro dias de diagnóstico (Story 87-6). Aguardado pela mesma razão
    // do recibo. Depois de emitir, RELANÇA: quem contabiliza a falha e decide o status HTTP é o
    // helper (`statusHttpParaResumo`) — com 1 org ativa que falha, `sucesso === 0 && total === 1`
    // ⇒ 500, exatamente o status que a AC da 87-6 exige.
    await logEventOnce({
      level: "error",
      category: "ai",
      event_type: "NICOLE_LASTRO_FALHA",
      message: detalhe,
      org_id: orgId,
      source: SOURCE,
      metadata: {
        dias,
        janela: { desde: desde.toISOString(), ate: ate.toISOString() },
      },
    })
    throw e
  }
}
