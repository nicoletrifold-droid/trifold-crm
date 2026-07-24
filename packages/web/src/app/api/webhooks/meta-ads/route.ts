import { NextRequest, NextResponse, after } from "next/server"
import crypto from "crypto"
import { createAdminClient } from "@web/lib/supabase/admin"
import { processMetaLead } from "@web/lib/meta/process-lead"

// GET — Webhook verification (Meta sends this to verify the endpoint)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  if (mode === "subscribe" && token === process.env.META_WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}

// POST — Incoming lead from Meta Lead Form webhook
export async function POST(request: NextRequest) {
  const appSecret = process.env.META_APP_SECRET
  const rawBody = await request.text()

  if (!appSecret) {
    console.error("[META-WEBHOOK] META_APP_SECRET not configured — webhook blocked")
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 })
  }

  const signature = request.headers.get("x-hub-signature-256")
  const expectedSignature =
    "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")
  const signatureValid = signature === expectedSignature

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const entry = body.entry as Array<Record<string, unknown>> | undefined
  const firstEntry = entry?.[0] as Record<string, unknown> | undefined
  const changes = firstEntry?.changes as Array<Record<string, unknown>> | undefined
  const value = changes?.[0]?.value as Record<string, unknown> | undefined
  const leadgenId = value?.leadgen_id as string | undefined

  // Persistir todos os eventos em webhook_logs antes de qualquer early return
  const adminSupabase = createAdminClient()
  const { data: logEntry } = await adminSupabase
    .from("webhook_logs")
    .insert({
      source: "meta_ads",
      event_type: leadgenId ? (value?.form_id ? "leadgen" : "unknown") : "ping",
      payload: body,
      leadgen_id: leadgenId ?? null,
      signature_valid: signatureValid,
      processed: false,
    })
    .select("id")
    .single()

  if (!signatureValid) {
    if (logEntry?.id) {
      await adminSupabase
        .from("webhook_logs")
        .update({ processing_error: "invalid_signature" })
        .eq("id", logEntry.id)
    }
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 })
  }

  if (!leadgenId) {
    if (logEntry?.id) {
      await adminSupabase
        .from("webhook_logs")
        .update({ processed: true })
        .eq("id", logEntry.id)
    }
    return NextResponse.json({ status: "ok" })
  }

  // AC6: Log estruturado com resultado real da validação
  console.log(
    JSON.stringify({
      type: "meta_webhook_received",
      leadgen_id: leadgenId,
      form_id: value?.form_id ?? null,
      ad_id: value?.ad_id ?? null,
      campaign_id: value?.campaign_id ?? null,
      page_id: firstEntry?.id ?? null,
      timestamp: new Date().toISOString(),
      signature_valid: signatureValid,
      processing: "async",
    })
  )

  // AC3: Retornar 200 imediatamente; processamento é async via after().
  // Story 75-214: se o after() morrer, o evento fica processed=false e o cron
  // /api/cron/meta-leads-retry reprocessa — nenhum lead se perde mais.
  after(async () => {
    await processMetaLead(leadgenId, value ?? {}, firstEntry ?? {}, logEntry?.id)
  })

  return NextResponse.json({ status: "ok" })
}
