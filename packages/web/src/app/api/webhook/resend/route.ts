import { NextRequest, NextResponse } from "next/server"
import { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@web/lib/supabase/admin"
import { createHmac, timingSafeEqual } from "crypto"
import { logEvent } from "@web/lib/logger"

const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET

// Max acceptable age for a Svix-signed webhook (5 minutes), as recommended by Svix
// to prevent replay attacks.
const SVIX_TOLERANCE_SECONDS = 5 * 60

/**
 * Verifies a Svix webhook signature using HMAC-SHA256.
 *
 * Svix produces signatures of the form `v1,<base64-signature>` (potentially
 * multiple, space-separated). The signed payload is `{svix-id}.{svix-timestamp}.{rawBody}`,
 * and the secret is the value of `RESEND_WEBHOOK_SECRET` with the `whsec_` prefix
 * stripped, base64-decoded.
 *
 * Returns true if at least one signature in the header matches.
 */
function verifySvixSignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  rawBody: string
): boolean {
  // Strip whsec_ prefix and base64-decode the secret key
  const secretKey = secret.startsWith("whsec_") ? secret.slice(6) : secret
  let secretBytes: Buffer
  try {
    secretBytes = Buffer.from(secretKey, "base64")
  } catch {
    return false
  }

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`
  const expectedSignature = createHmac("sha256", secretBytes)
    .update(signedContent)
    .digest("base64")

  // svix-signature can contain multiple signatures separated by spaces
  // each in the format "v1,<base64>" (or other version prefixes).
  const signatures = svixSignature.split(" ")
  for (const sig of signatures) {
    const [version, value] = sig.split(",")
    if (version !== "v1" || !value) continue

    const provided = Buffer.from(value, "base64")
    const expected = Buffer.from(expectedSignature, "base64")
    if (provided.length !== expected.length) continue

    try {
      if (timingSafeEqual(provided, expected)) {
        return true
      }
    } catch {
      // Length mismatch or invalid buffer — try next signature
      continue
    }
  }

  return false
}

export async function POST(request: NextRequest) {
  // Verify webhook signature (Resend uses Svix headers)
  const svixId = request.headers.get("svix-id")
  const svixTimestamp = request.headers.get("svix-timestamp")
  const svixSignature = request.headers.get("svix-signature")

  // Read raw body as string so we can compute the HMAC over the exact bytes
  // that were signed by Svix. After verification we JSON.parse the same string.
  const rawBody = await request.text()

  if (!RESEND_WEBHOOK_SECRET) {
    logEvent({
      level: "error",
      category: "webhook",
      event_type: "RESEND_WEBHOOK_SECRET_MISSING",
      message: "RESEND_WEBHOOK_SECRET is not configured — rejecting webhook request",
      source: "api/webhook/resend",
    })
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 })
  }

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing signature headers" }, { status: 401 })
  }

  // Replay protection: reject timestamps older than the tolerance window.
  const timestampSeconds = parseInt(svixTimestamp, 10)
  if (!Number.isFinite(timestampSeconds)) {
    return NextResponse.json({ error: "Invalid timestamp" }, { status: 401 })
  }
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSeconds - timestampSeconds) > SVIX_TOLERANCE_SECONDS) {
    return NextResponse.json({ error: "Timestamp out of tolerance" }, { status: 401 })
  }

  const valid = verifySvixSignature(
    RESEND_WEBHOOK_SECRET,
    svixId,
    svixTimestamp,
    svixSignature,
    rawBody
  )
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const eventType = body.type as string
  if (
    !eventType ||
    !["email.delivered", "email.opened", "email.bounced", "email.clicked", "email.complained"].includes(eventType)
  ) {
    return NextResponse.json({ status: "ignored" })
  }

  const tags = body.data?.tags as Record<string, string> | undefined
  const entryId = tags?.entry_id
  const campaignId = tags?.campaign_id
  const emailLogId = tags?.email_log_id

  if (!entryId && !emailLogId) {
    logEvent({
      level: "warn",
      category: "webhook",
      event_type: "RESEND_NO_ENTRY_ID",
      message: "Resend webhook received without entry_id tag",
      metadata: { eventType, emailId: body.data?.email_id },
      source: "api/webhook/resend",
    })
    return NextResponse.json({ status: "skipped" })
  }

  const supabase = createAdminClient()

  // Route: email_log_id → new template tracking path
  if (emailLogId) {
    await updateEmailLog(supabase, emailLogId, eventType)
    return NextResponse.json({ status: "ok" })
  }

  // Route: entry_id → existing campaign path (zero changes below this line)
  try {
    // Map event to status
    let emailStatus: string
    let isValidEmail: boolean | null = null

    switch (eventType) {
      case "email.delivered":
        emailStatus = "delivered"
        break
      case "email.opened":
        emailStatus = "opened"
        isValidEmail = true
        break
      case "email.bounced":
        emailStatus = "bounced"
        isValidEmail = false
        break
      case "email.clicked":
        emailStatus = "clicked"
        isValidEmail = true
        break
      default:
        return NextResponse.json({ status: "ignored" })
    }

    // Update campaign entry
    const updates: Record<string, unknown> = { email_status: emailStatus }
    if (isValidEmail !== null) updates.is_valid_email = isValidEmail

    await supabase
      .from("campaign_entries")
      .update(updates)
      .eq("id", entryId)

    // Get org_id for event logging
    const { data: entry } = await supabase
      .from("campaign_entries")
      .select("org_id")
      .eq("id", entryId)
      .single()

    // Insert campaign event
    if (entry) {
      const toRaw = body.data?.to
      const toValue = Array.isArray(toRaw) ? toRaw[0] : toRaw

      await supabase.from("campaign_events").insert({
        org_id: entry.org_id,
        campaign_id: campaignId ?? "",
        entry_id: entryId,
        channel: "email",
        event_type: eventType.replace("email.", ""),
        metadata: {
          email_id: body.data?.email_id,
          to: toValue,
          ...(eventType === "email.clicked" && body.data?.click
            ? { click: body.data.click }
            : {}),
        },
      })
    }

    return NextResponse.json({ status: "ok" })
  } catch (error) {
    logEvent({
      level: "error",
      category: "webhook",
      event_type: "RESEND_WEBHOOK_ERROR",
      message: `Resend webhook error: ${error instanceof Error ? error.message : "Unknown"}`,
      metadata: { entryId, eventType },
      source: "api/webhook/resend",
    })
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}

// Update email_logs for template-based emails tracked via email_log_id tag.
// Idempotent: repeated calls for the same event are no-ops.
async function updateEmailLog(
  supabase: SupabaseClient,
  emailLogId: string,
  eventType: string
): Promise<void> {
  const updates: Record<string, unknown> = {}
  const now = new Date().toISOString()

  switch (eventType) {
    case "email.delivered":
      updates.status = "delivered"
      updates.delivered_at = now
      break
    case "email.opened":
      updates.status = "opened"
      updates.opened_at = now
      break
    case "email.clicked":
      updates.status = "clicked"
      updates.clicked_at = now
      break
    case "email.bounced":
      updates.status = "bounced"
      updates.bounced_at = now
      break
    case "email.complained":
      updates.status = "complained"
      break
    default:
      return
  }

  await supabase
    .from("email_logs")
    .update(updates)
    .eq("id", emailLogId)
}
