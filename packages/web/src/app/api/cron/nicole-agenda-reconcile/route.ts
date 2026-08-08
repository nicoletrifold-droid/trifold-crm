import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendTelegramAdminAlert } from "@web/lib/telegram"
import { logEvent } from "@web/lib/logger"
import { reconciliarAgenda } from "@trifold/ai"

/**
 * Story 87-3 — reconciliação diária entre o que a Nicole AFIRMOU e o que existe
 * em `appointments`. Wrapper fino: auth, janela, chamada do módulo puro
 * (`packages/ai/src/flows/agenda-reconcile.ts`), evento e alerta.
 *
 * Origem: em 28/06 a lead Célia ouviu "Agendei sua visita para este sábado às
 * 9h" e o banco tem ZERO appointments dela até hoje — 40 dias. O caso só
 * apareceu numa auditoria manual de 8 semanas. Enquanto nada compara a fala com
 * a linha no banco, todo defeito de agenda tem tempo de descoberta medido em
 * semanas e um descobridor humano por acidente.
 *
 * READ-ONLY em tabela de negócio. O único write é `system_events` (aqui, não no
 * módulo) — ver AC5.
 *
 *   GET /api/cron/nicole-agenda-reconcile           janela padrão de 24 h
 *   GET /api/cron/nicole-agenda-reconcile?days=60   rodada retroativa (baseline)
 *   GET /api/cron/nicole-agenda-reconcile?dry=1     calcula e devolve JSON,
 *                                                   NÃO emite evento nem alerta
 */

// A rodada de 60 dias lê ~2.500 mensagens e cruza com os appointments.
export const maxDuration = 300

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001" // Trifold Engenharia
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.trifold.eng.br"
const MAX_DIAS = 180
/** Teto de alertas por rodada — a retroativa de 60 dias não pode virar 12 pushes. */
const MAX_ALERTAS_TELEGRAM = 10

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
  const orgId = process.env.DAILY_REPORT_ORG_ID ?? DEFAULT_ORG_ID

  const ate = new Date()
  const desde = new Date(ate.getTime() - dias * 86400_000)
  const admin = createAdminClient()

  try {
    const rel = await reconciliarAgenda(admin, { desde, ate, orgId })

    // `?dry=1` não emite evento nem alerta — é o modo em que o baseline é
    // produzido e conferido antes de qualquer push (AC4-ii).
    if (dry) {
      return NextResponse.json({ dry: true, ...rel })
    }

    // Dedupe por `message_id`: rodar a rota duas vezes no mesmo dia produz UM
    // evento e UM alerta por caso. O cron pode rodar em dois projetos Vercel —
    // é o que segura o alerta em dobro (Risco 4).
    const idsCandidatos = rel.alertas.map((a) => a.message_id)
    const jaEmitidos = new Set<string>()
    if (idsCandidatos.length > 0) {
      const { data } = await admin
        .from("system_events")
        .select("metadata")
        .eq("event_type", "NICOLE_AFIRMACAO_SEM_LASTRO")
        .gte("created_at", new Date(Date.now() - MAX_DIAS * 86400_000).toISOString())
      for (const e of (data ?? []) as Array<{ metadata: Record<string, unknown> | null }>) {
        const mid = e.metadata?.message_id
        if (typeof mid === "string") jaEmitidos.add(mid)
      }
    }

    const novos = rel.alertas.filter((a) => !jaEmitidos.has(a.message_id))

    for (const a of novos) {
      logEvent({
        level: "warn",
        category: "ai",
        event_type: "NICOLE_AFIRMACAO_SEM_LASTRO",
        message: `Nicole afirmou visita sem lastro para ${a.lead_nome} — ${a.afirmado_para_brt} BRT`,
        org_id: orgId,
        source: "cron/nicole-agenda-reconcile",
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
    }

    // O resumo diário publica o NÚMERO — é dele que o PM2 do Epic 88 sai. Um
    // cron que dispara alerta e não publica a taxa deixa o epic sem como ser
    // dimensionado.
    logEvent({
      level: "info",
      category: "ai",
      event_type: "NICOLE_LASTRO_DIARIO",
      message: `Lastro ${rel.lastro_pct}% (${rel.com_lastro}/${rel.denominador}) em ${dias}d — ${rel.sem_lastro} sem lastro`,
      org_id: orgId,
      source: "cron/nicole-agenda-reconcile",
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
        alertas_novos: novos.length,
      },
    })

    // O alerta NOMEIA o lead, a data, o horário afirmado e traz o deep link —
    // é o que faz valer a pena abrir mesmo com ~1 em 3 sendo falso positivo
    // (a guarda de interrogação do Epic 88 é o conserto disso, não heurística
    // nova aqui).
    for (const a of novos.slice(0, MAX_ALERTAS_TELEGRAM)) {
      const msg =
        `⚠️ *Nicole afirmou visita SEM LASTRO*\n\n` +
        `Lead: *${a.lead_nome}*\n` +
        `Ela falou em: ${a.falado_em_brt} BRT\n` +
        `Afirmou a visita para: *${a.afirmado_para_brt} BRT*\n` +
        `Não existe appointment correspondente.\n\n` +
        `_"${a.trecho}"_\n\n` +
        `${APP_URL}/dashboard/leads/${a.lead_id}`
      await sendTelegramAdminAlert(msg)
    }
    if (novos.length > MAX_ALERTAS_TELEGRAM) {
      await sendTelegramAdminAlert(
        `⚠️ Reconciliação de agenda: +${novos.length - MAX_ALERTAS_TELEGRAM} casos sem lastro além dos listados (janela de ${dias}d).`
      )
    }

    return NextResponse.json({
      ok: true,
      alertas_novos: novos.length,
      alertas_deduplicados: rel.alertas.length - novos.length,
      ...rel,
    })
  } catch (e) {
    console.error("[nicole-agenda-reconcile] falha:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
