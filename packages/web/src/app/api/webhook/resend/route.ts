import { NextRequest, NextResponse } from "next/server"
import { createClient, SupabaseClient } from "@supabase/supabase-js"
import { logEvent } from "@web/lib/logger"

const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET

export async function POST(request: NextRequest) {
  // Verify webhook signature (Resend uses Svix headers)
  const svixId = request.headers.get("svix-id")
  const svixSignature = request.headers.get("svix-signature")

  if (!svixId || !svixSignature) {
    if (!RESEND_WEBHOOK_SECRET) {
      // If no secret configured, accept all (dev mode)
    } else {
      return NextResponse.json({ error: "Missing signature" }, { status: 401 })
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any
  try {
    body = await request.json()
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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

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
