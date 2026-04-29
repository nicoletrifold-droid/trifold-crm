import { Resend } from "resend"
import { createClient } from "@supabase/supabase-js"

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

// ─── Legacy send (backwards-compatible, unchanged signature) ─────────────────

export async function sendEmail(params: {
  to: string
  subject: string
  html: string
  tags?: { name: string; value: string }[]
}): Promise<{ id: string | null; error?: string }> {
  if (!resend) {
    return { id: null, error: "RESEND_API_KEY not configured" }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: "Trifold <contato@trifold.com.br>",
      to: params.to,
      subject: params.subject,
      html: params.html,
      tags: params.tags,
    })
    if (error) return { id: null, error: error.message }
    return { id: data?.id ?? null }
  } catch (err) {
    return {
      id: null,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

// ─── Template send engine ─────────────────────────────────────────────────────

export async function sendTemplateEmail(params: {
  templateSlug: string
  to: { email: string; name?: string }
  variables: Record<string, string>
  triggeredBy: string
  orgId: string
  scheduledFor?: Date
  priority?: 1 | 5 | 10
}): Promise<{ logId: string; queued: boolean; error?: string }> {
  const { templateSlug, to, variables, triggeredBy, orgId, scheduledFor, priority = 5 } = params

  const supabase = createServiceClient()

  // 1. Fetch template
  const { data: template, error: templateError } = await supabase
    .from("email_templates")
    .select("id, subject, html_body, is_active, slug")
    .eq("org_id", orgId)
    .eq("slug", templateSlug)
    .single()

  if (templateError || !template) {
    return { logId: "", queued: false, error: "Template not found" }
  }
  if (!template.is_active) {
    return { logId: "", queued: false, error: "Template is not active" }
  }

  // 2. Resolve variables in subject + body
  const subject = resolveTemplate(template.subject, variables)
  const htmlBody = resolveTemplate(template.html_body, variables)

  // 3. Create email_log with status='pending'
  const tags = { email_log_id: "", template_slug: templateSlug, org_id: orgId }
  const { data: log, error: logError } = await supabase
    .from("email_logs")
    .insert({
      org_id: orgId,
      template_id: template.id,
      to_email: to.email,
      to_name: to.name ?? null,
      subject,
      status: "pending",
      variables_used: variables,
      triggered_by: triggeredBy,
      tags,
    })
    .select("id")
    .single()

  if (logError || !log) {
    return { logId: "", queued: false, error: "Failed to create email log" }
  }

  const logId = log.id
  // Update tags to include the real log id
  await supabase
    .from("email_logs")
    .update({ tags: { ...tags, email_log_id: logId } })
    .eq("id", logId)

  // 4. Check quota
  const sentToday = await getEmailsSentToday(orgId, supabase)
  const shouldQueue =
    scheduledFor != null ||
    sentToday >= 100 ||
    (sentToday >= 95 && priority > 1)

  if (shouldQueue) {
    const { error: queueError } = await supabase.from("email_sends_queue").insert({
      org_id: orgId,
      email_log_id: logId,
      scheduled_for: scheduledFor?.toISOString() ?? new Date().toISOString(),
      priority,
      status: "pending",
    })

    if (queueError) {
      await supabase
        .from("email_logs")
        .update({ status: "failed", error_message: "Failed to enqueue" })
        .eq("id", logId)
      return { logId, queued: false, error: "Failed to enqueue" }
    }

    return { logId, queued: true }
  }

  // 5. Send immediately
  const resendTags = [
    { name: "email_log_id", value: logId },
    { name: "template_slug", value: templateSlug },
    { name: "org_id", value: orgId },
  ]

  const sendResult = await sendWithRetry({
    to: to.email,
    subject,
    html: htmlBody,
    tags: resendTags,
  })

  if (sendResult.error) {
    await supabase
      .from("email_logs")
      .update({ status: "failed", error_message: sendResult.error })
      .eq("id", logId)
    return { logId, queued: false, error: sendResult.error }
  }

  await supabase
    .from("email_logs")
    .update({
      status: "sent",
      resend_email_id: sendResult.id,
      sent_at: new Date().toISOString(),
    })
    .eq("id", logId)

  return { logId, queued: false }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Count emails sent today in BRT (UTC-3). BRT day starts at 03:00 UTC.
export async function getEmailsSentToday(
  orgId: string,
  supabase: ReturnType<typeof createServiceClient>
): Promise<number> {
  const now = new Date()
  const startOfDayBRT = new Date(now)
  startOfDayBRT.setUTCHours(3, 0, 0, 0)
  if (now.getUTCHours() < 3) {
    startOfDayBRT.setUTCDate(startOfDayBRT.getUTCDate() - 1)
  }

  const { count } = await supabase
    .from("email_logs")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .neq("status", "failed")
    .gte("sent_at", startOfDayBRT.toISOString())

  return count ?? 0
}

function resolveTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`)
}

// Retry up to 2 times with 1s/2s backoff for network errors (not 4xx)
async function sendWithRetry(
  params: Parameters<typeof sendEmail>[0],
  maxRetries = 2
): Promise<{ id: string | null; error?: string }> {
  let lastError = ""

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, attempt * 1000))
    }

    const result = await sendEmail(params)

    if (!result.error) return result

    // 4xx errors: don't retry
    const is4xx = result.error.includes("4") && /40\d/.test(result.error)
    if (is4xx) return result

    lastError = result.error
  }

  return { id: null, error: lastError }
}
