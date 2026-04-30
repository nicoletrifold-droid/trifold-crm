import { createAdminClient } from "@web/lib/supabase/admin"
import { sendTemplateEmail } from "@web/lib/email"

interface LeadForAutomation {
  id: string
  email: string | null
  name: string | null
  phone?: string | null
  org_id: string
}

export async function triggerAutomations(
  eventType: "lead.created" | "lead.status_changed",
  lead: LeadForAutomation,
  filter?: Record<string, string>
): Promise<void> {
  if (!lead.email) return

  const supabase = createAdminClient()

  const { data: automations } = await supabase
    .from("email_automations")
    .select("id, delay_minutes, trigger_filter, email_templates(slug)")
    .eq("org_id", lead.org_id)
    .eq("trigger_event", eventType)
    .eq("is_active", true)

  for (const automation of automations ?? []) {
    // Match trigger filter (e.g. { status: "Qualificado" })
    if (automation.trigger_filter && filter) {
      const tf = automation.trigger_filter as Record<string, string>
      const matches = Object.entries(tf).every(([k, v]) => filter[k] === v)
      if (!matches) continue
    }

    const alreadySent = await checkRecentSend(supabase, automation.id, lead.email!)
    if (alreadySent) continue

    const templateSlug = (automation.email_templates as unknown as { slug: string } | null)?.slug
    if (!templateSlug) continue

    const scheduledFor =
      automation.delay_minutes > 0
        ? new Date(Date.now() + automation.delay_minutes * 60000)
        : undefined

    await sendTemplateEmail({
      templateSlug,
      to: { email: lead.email!, name: lead.name ?? undefined },
      variables: {
        nome: lead.name ?? "",
        email: lead.email!,
        telefone: lead.phone ?? "",
      },
      triggeredBy: `automation:${automation.id}`,
      orgId: lead.org_id,
      scheduledFor,
      priority: 5,
    })
  }
}

async function checkRecentSend(
  supabase: ReturnType<typeof createAdminClient>,
  automationId: string,
  toEmail: string
): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from("email_logs")
    .select("*", { count: "exact", head: true })
    .like("triggered_by", `automation:${automationId}%`)
    .eq("to_email", toEmail)
    .gte("created_at", since)
  return (count ?? 0) > 0
}
