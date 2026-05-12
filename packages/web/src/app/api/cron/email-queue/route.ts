import { NextRequest, NextResponse } from "next/server"
import { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendEmail, getEmailsSentToday } from "@web/lib/email"

const CRON_SECRET = process.env.CRON_SECRET
const DAILY_QUOTA = 100
const BATCH_SIZE = 50

type ServiceClient = SupabaseClient

interface QueueItem {
  id: string
  attempts: number
  max_attempts: number
  email_logs: {
    id: string
    to_email: string
    subject: string
    template_id: string | null
    variables_used: Record<string, string> | null
    triggered_by: string | null
    email_templates: { slug: string; html_body: string } | null
  }
}

export async function GET(request: NextRequest) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()

  const now = new Date()
  let processed = 0
  let failed = 0

  const { data: pendingOrgs } = await supabase
    .from("email_sends_queue")
    .select("org_id")
    .eq("status", "pending")
    .lte("scheduled_for", now.toISOString())

  if (!pendingOrgs || pendingOrgs.length === 0) {
    return NextResponse.json({ processed: 0, failed: 0 })
  }

  const orgIds = [...new Set((pendingOrgs as { org_id: string }[]).map((r) => r.org_id))]

  for (const orgId of orgIds) {
    const sentToday = await getEmailsSentToday(orgId, supabase)
    const remaining = DAILY_QUOTA - sentToday
    if (remaining <= 0) continue

    const limit = Math.min(BATCH_SIZE, remaining)

    const { data: rawItems } = await supabase
      .from("email_sends_queue")
      .select(`
        id, attempts, max_attempts,
        email_logs!inner(
          id, to_email, subject, template_id, variables_used, triggered_by,
          email_templates(slug, html_body)
        )
      `)
      .eq("org_id", orgId)
      .eq("status", "pending")
      .lte("scheduled_for", now.toISOString())
      .order("priority", { ascending: true })
      .order("scheduled_for", { ascending: true })
      .limit(limit)

    if (!rawItems || rawItems.length === 0) continue

    // Cast to typed structure (Supabase JS returns join as array, take first)
    const items = (rawItems as unknown[]).map((raw) => {
      const r = raw as Record<string, unknown>
      const logsArr = r.email_logs as Record<string, unknown>[]
      const log = Array.isArray(logsArr) ? logsArr[0] : logsArr
      const templatesArr = log?.email_templates as Record<string, unknown>[] | null
      const tmpl = Array.isArray(templatesArr) ? templatesArr[0] : templatesArr
      return {
        id: r.id as string,
        attempts: (r.attempts as number) ?? 0,
        max_attempts: (r.max_attempts as number) ?? 3,
        email_logs: {
          id: log?.id as string,
          to_email: log?.to_email as string,
          subject: log?.subject as string,
          template_id: (log?.template_id as string) ?? null,
          variables_used: (log?.variables_used as Record<string, string>) ?? null,
          triggered_by: (log?.triggered_by as string) ?? null,
          email_templates: tmpl
            ? { slug: tmpl.slug as string, html_body: tmpl.html_body as string }
            : null,
        },
      } satisfies QueueItem
    })

    for (const item of items) {
      // Optimistic lock: mark processing before sending to prevent double-send
      const { error: lockError } = await supabase
        .from("email_sends_queue")
        .update({ status: "processing" })
        .eq("id", item.id)
        .eq("status", "pending")

      if (lockError) continue

      const log = item.email_logs

      if (!log.email_templates?.html_body) {
        await markFailed(supabase, item.id, log.id, item.attempts, item.max_attempts, now, "Template HTML not found")
        failed++
        continue
      }

      const variables = log.variables_used ?? {}
      const htmlBody = resolveTemplate(log.email_templates.html_body, variables)

      const resendTags = [
        { name: "email_log_id", value: log.id },
        { name: "template_slug", value: log.email_templates.slug },
        { name: "org_id", value: orgId },
      ]

      const { id: resendId, error } = await sendEmail({
        to: log.to_email,
        subject: log.subject,
        html: htmlBody,
        tags: resendTags,
      })

      if (error) {
        await markFailed(supabase, item.id, log.id, item.attempts, item.max_attempts, now, error)
        failed++
        continue
      }

      await supabase
        .from("email_sends_queue")
        .update({ status: "done", processed_at: now.toISOString() })
        .eq("id", item.id)

      await supabase
        .from("email_logs")
        .update({ status: "sent", resend_email_id: resendId, sent_at: now.toISOString() })
        .eq("id", log.id)

      // Update blast progress if this email belongs to a blast
      const blastId = log.triggered_by?.match(/^blast:([^:]+)/)?.[1]
      if (blastId) {
        await reconcileBlastProgress(supabase, blastId, now)
      }

      processed++
    }
  }

  return NextResponse.json({ processed, failed })
}

async function markFailed(
  supabase: ServiceClient,
  queueId: string,
  logId: string,
  attempts: number,
  maxAttempts: number,
  now: Date,
  errorMessage: string
) {
  const newAttempts = attempts + 1
  const isFinal = newAttempts >= maxAttempts

  await supabase
    .from("email_sends_queue")
    .update({
      status: isFinal ? "failed" : "pending",
      attempts: newAttempts,
      ...(isFinal ? { processed_at: now.toISOString() } : {}),
    })
    .eq("id", queueId)

  if (isFinal) {
    await supabase
      .from("email_logs")
      .update({ status: "failed", error_message: errorMessage })
      .eq("id", logId)
  }
}

async function reconcileBlastProgress(supabase: ServiceClient, blastId: string, now: Date) {
  const { data: blast } = await supabase
    .from("email_blasts")
    .select("id, total_recipients, status")
    .eq("id", blastId)
    .single()

  if (!blast || blast.status === "completed" || blast.status === "cancelled") return

  const { count } = await supabase
    .from("email_logs")
    .select("id", { count: "exact", head: true })
    .like("triggered_by", `blast:${blastId}%`)
    .in("status", ["sent", "delivered", "opened", "clicked"])

  const sentCount = count ?? 0
  const isComplete = sentCount >= blast.total_recipients

  await supabase
    .from("email_blasts")
    .update({
      sent_count: sentCount,
      ...(isComplete ? { status: "completed", completed_at: now.toISOString() } : {}),
    })
    .eq("id", blastId)
}

function resolveTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`)
}
