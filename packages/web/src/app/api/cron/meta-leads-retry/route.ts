import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { processMetaLead } from "@web/lib/meta/process-lead"

const CRON_SECRET = process.env.CRON_SECRET

// Story 75-214 — reprocessa eventos leadgen do Meta que ficaram processed=false
// (o after() do webhook pode morrer sem rastro; o Meta recebe 200 e não reenvia).
// Política de idade (ajustada na 75-215 — decisão Marcos 24/07):
//   < 6h  → fluxo normal completo (automations + roleta)
//   ≥ 6h  → recuperação tardia: distribui via roleta normalmente (justa por
//           construção), mas SEM automations (mensagem automática semanas
//           depois não faz sentido) e com created_at retrodatado ao momento
//           real do lead (não distorce métricas diárias)
const MIN_AGE_MINUTES = 10 // deixa o after() do webhook terminar em paz
const MAX_AGE_DAYS = 60 // Graph API retém dados de leadgen por ~90 dias
const LATE_RECOVERY_HOURS = 6
const MAX_ATTEMPTS = 3
const BATCH_SIZE = 20

const RETRY_MARKER = /^retry (\d+)\/\d+/

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    console.error("[META-LEADS-RETRY] CRON_SECRET not configured")
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = Date.now()
  const newestEligible = new Date(now - MIN_AGE_MINUTES * 60 * 1000).toISOString()
  const oldestEligible = new Date(now - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data: events, error } = await supabase
    .from("webhook_logs")
    .select("id, created_at, leadgen_id, payload, processing_error")
    .eq("source", "meta_ads")
    .eq("event_type", "leadgen")
    .eq("processed", false)
    .eq("signature_valid", true)
    .lt("created_at", newestEligible)
    .gt("created_at", oldestEligible)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE)

  if (error) {
    console.error("[META-LEADS-RETRY] Failed to query webhook_logs:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const summary = {
    scanned: events?.length ?? 0,
    recovered: 0,
    deduped: 0,
    failed: 0,
    skipped: 0,
  }

  for (const event of events ?? []) {
    const attempts = RETRY_MARKER.exec((event.processing_error as string | null) ?? "")
    const attemptCount = attempts ? parseInt(attempts[1] ?? "0", 10) : 0

    if (attemptCount >= MAX_ATTEMPTS) {
      summary.skipped++
      continue
    }

    // Evento de teste/sandbox (leadgen_id não numérico) — marca e segue
    if (!/^\d+$/.test(event.leadgen_id ?? "")) {
      await supabase
        .from("webhook_logs")
        .update({ processed: true, processing_error: "test_event_skipped" })
        .eq("id", event.id)
      summary.skipped++
      continue
    }

    const payload = event.payload as Record<string, unknown> | null
    const entry = (payload?.entry as Array<Record<string, unknown>> | undefined)?.[0]
    const changes = entry?.changes as Array<Record<string, unknown>> | undefined
    const value = (changes?.[0]?.value as Record<string, unknown> | undefined) ?? {}

    const ageMs = now - new Date(event.created_at).getTime()
    const isLateRecovery = ageMs >= LATE_RECOVERY_HOURS * 60 * 60 * 1000

    const result = await processMetaLead(event.leadgen_id, value, entry ?? {}, event.id, {
      automations: !isLateRecovery,
      distribute: true,
      backdateTo: isLateRecovery ? event.created_at : undefined,
    })

    if (result.ok) {
      if (result.deduped) summary.deduped++
      else summary.recovered++
    } else {
      summary.failed++
      // Contador de tentativas vive no processing_error (tabela de log; sem migration)
      await supabase
        .from("webhook_logs")
        .update({
          processing_error: `retry ${attemptCount + 1}/${MAX_ATTEMPTS}: ${result.error ?? "unknown"}`,
        })
        .eq("id", event.id)
    }
  }

  if (summary.recovered > 0 || summary.failed > 0) {
    console.log("[META-LEADS-RETRY]", JSON.stringify(summary))
  }

  return NextResponse.json({ ok: true, ...summary })
}
