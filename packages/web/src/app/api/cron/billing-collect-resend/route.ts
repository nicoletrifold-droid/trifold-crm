import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { runCollector } from "@web/lib/billing-collectors/run-collector"
import { createResendUsageCollector } from "@web/lib/billing-collectors/resend-usage"

// Story 78-7 — Coletor de USO TÉCNICO Resend (Epic 78, Painel de Saúde & Billing).
// Cron 1×/dia (vercel.json: "0 14 * * *" = 11:00 BRT). Auth via CRON_SECRET,
// mesmo padrão de billing-collect-anthropic/vercel (78-3/78-5). Grava snapshots
// de USO (quota + contagem de envios) com currency=null via runner — NUNCA custo.
export const maxDuration = 60

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Data de "ontem" em America/Sao_Paulo (NFR-8), no formato `YYYY-MM-DD`. */
function saoPauloYesterday(now: Date = new Date()): string {
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

  // AC5 / T3.5 — DECISÃO DOCUMENTADA: a ausência de RESEND_API_KEY NÃO bloqueia a
  // rota com 503. A contagem via `email_logs` é independente do Resend estar
  // configurado, então prosseguimos: o coletor pula graciosamente a sub-chamada de
  // quota (loga warn) e ainda grava `resend_emails_sent_count_email_logs`. Um 503
  // "seco" descartaria esse dado útil que não depende do Resend. Sinalizamos a
  // condição no corpo da resposta (`resend_api_key_missing`) em vez de um HTTP 503.
  const resendApiKeyMissing = !(process.env.RESEND_API_KEY ?? "").trim()

  // Janela configurável (?from=&to=); default = ontem em America/Sao_Paulo.
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
  const collector = createResendUsageCollector(admin)
  // runCollector nunca lança: isola falhas de coleta. A rota sempre responde 200
  // aqui — nunca 500 por falha isolada do coletor.
  const result = await runCollector(admin, collector, { from, to })

  return NextResponse.json({
    ok: result.status !== "error",
    resend_api_key_missing: resendApiKeyMissing,
    ...result,
  })
}
