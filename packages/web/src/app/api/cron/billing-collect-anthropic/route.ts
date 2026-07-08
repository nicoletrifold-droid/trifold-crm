import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { runCollector } from "@web/lib/billing-collectors/run-collector"
import { anthropicCollector } from "@web/lib/billing-collectors/anthropic"

// Story 78-3 — Coletor Anthropic (Epic 78, Painel de Saúde & Billing).
// Cron 1×/dia (vercel.json: "0 10 * * *" = 07:00 BRT). Auth via CRON_SECRET,
// mesmo padrão de daily-report / supremo-sync. Grava snapshots de custo (USD)
// e tokens em service_cost_snapshots via runner genérico.
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

  // AC8: ausência do secret degrada graciosamente (503) SEM chamar a API nem
  // gravar snapshot (nem uma linha collection_status='error').
  if (!(process.env.ANTHROPIC_ADMIN_KEY ?? "").trim()) {
    return NextResponse.json({ error: "ANTHROPIC_ADMIN_KEY not set" }, { status: 503 })
  }

  // AC6: janela configurável (?from=&to=); default = ontem em America/Sao_Paulo.
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

  const admin = createAdminClient()
  // runCollector nunca lança: isola falhas de coleta (AC3). Por isso a rota
  // sempre responde 200 aqui — nunca 500 por falha isolada do coletor.
  const result = await runCollector(admin, anthropicCollector, { from, to })

  return NextResponse.json({ ok: result.status !== "error", ...result })
}
