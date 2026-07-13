import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { runCollector } from "@web/lib/billing-collectors/run-collector"
import {
  vercelCollector,
  assertVercelWindow,
  VercelWindowTooLargeError,
} from "@web/lib/billing-collectors/vercel"

// Story 78-5 — Coletor Vercel (Epic 78, Painel de Saúde & Billing).
// Cron 1×/dia (vercel.json: "20 10 * * *" = 07:20 BRT). Auth via CRON_SECRET,
// mesmo padrão de daily-report / billing-collect-anthropic (78-3). Grava
// snapshots de custo (USD) em service_cost_snapshots via runner genérico.
export const maxDuration = 60

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Data de "ontem" em America/Sao_Paulo (NFR-8), no formato `YYYY-MM-DD`. */
function saoPauloYesterday(now: Date = new Date()): string {
  // en-CA formata como YYYY-MM-DD.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
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

  // AC7: ausência de credencial degrada graciosamente (503) SEM chamar a API nem
  // gravar snapshot algum (nem uma linha collection_status='error').
  if (!(process.env.VERCEL_BILLING_TOKEN ?? "").trim()) {
    return NextResponse.json({ error: "VERCEL_BILLING_TOKEN not set" }, { status: 503 })
  }
  if (!(process.env.VERCEL_TEAM_ID ?? "").trim()) {
    return NextResponse.json({ error: "VERCEL_TEAM_ID not set" }, { status: 503 })
  }

  // AC9: janela configurável (?from=&to=); default = ontem em America/Sao_Paulo.
  const { searchParams } = new URL(request.url)
  const yesterday = saoPauloYesterday()
  const from = searchParams.get("from") ?? yesterday
  const to = searchParams.get("to") ?? yesterday

  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json(
      { error: "Invalid date format — use ?from=YYYY-MM-DD&to=YYYY-MM-DD" },
      { status: 400 }
    )
  }
  if (from > to) {
    return NextResponse.json({ error: "`from` must be <= `to`" }, { status: 400 })
  }

  // AC5: janela > 1 ano é erro de INPUT do chamador — 400 explícito, ANTES de
  // delegar ao runCollector() (que trataria como falha de coleta -> status error).
  try {
    assertVercelWindow({ from, to })
  } catch (err) {
    if (err instanceof VercelWindowTooLargeError) {
      return NextResponse.json({ error: "Window exceeds 1 year limit" }, { status: 400 })
    }
    throw err
  }

  const admin = createAdminClient()
  // runCollector nunca lança: isola falhas de coleta (AC8). Por isso a rota
  // sempre responde 200 aqui — nunca 500 por falha isolada do coletor.
  const result = await runCollector(admin, vercelCollector, { from, to })

  return NextResponse.json({ ok: result.status !== "error", ...result })
}
