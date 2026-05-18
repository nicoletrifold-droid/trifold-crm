import { NextRequest, NextResponse } from "next/server"
import { SupabaseClient } from "@supabase/supabase-js"
import { sendTemplateEmail } from "@web/lib/email"
import { createAdminClient } from "@web/lib/supabase/admin"

const CRON_SECRET = process.env.CRON_SECRET

function createServiceClient(): SupabaseClient {
  return createAdminClient()
}

async function checkRecentSend(
  supabase: SupabaseClient,
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

async function checkBirthdaySend(
  supabase: SupabaseClient,
  automationId: string,
  toEmail: string
): Promise<boolean> {
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from("email_logs")
    .select("*", { count: "exact", head: true })
    .like("triggered_by", `automation:${automationId}:birthday%`)
    .eq("to_email", toEmail)
    .gte("created_at", since)
  return (count ?? 0) > 0
}

export async function GET(request: NextRequest) {
  if (!CRON_SECRET) return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createServiceClient()

  // ── cron.daily: follow-up automations for leads ──────────────────────────
  const { data: automations } = await supabase
    .from("email_automations")
    .select("id, org_id, delay_minutes, email_templates(slug)")
    .eq("trigger_event", "cron.daily")
    .eq("is_active", true)

  let fired = 0
  let skipped = 0

  for (const automation of automations ?? []) {
    const templateSlug = (automation.email_templates as unknown as { slug: string } | null)?.slug
    if (!templateSlug) continue

    const { data: leads } = await supabase
      .from("leads")
      .select("id, email, name, phone")
      .eq("org_id", automation.org_id)
      .eq("is_active", true)
      .not("email", "is", null)
      .limit(50)

    for (const lead of leads ?? []) {
      if (!lead.email) continue

      const alreadySent = await checkRecentSend(supabase, automation.id, lead.email)
      if (alreadySent) { skipped++; continue }

      const scheduledFor =
        automation.delay_minutes > 0
          ? new Date(Date.now() + automation.delay_minutes * 60000)
          : undefined

      await sendTemplateEmail({
        templateSlug,
        to: { email: lead.email, name: lead.name ?? undefined },
        variables: {
          nome: lead.name ?? "",
          email: lead.email,
          telefone: lead.phone ?? "",
        },
        triggeredBy: `automation:${automation.id}`,
        orgId: automation.org_id as string,
        scheduledFor,
        priority: 5,
      })
      fired++
    }
  }

  // ── client.birthday: birthday automations for CRM clients ────────────────
  const { data: birthdayAutomations } = await supabase
    .from("email_automations")
    .select("id, org_id, email_templates(slug)")
    .eq("trigger_event", "client.birthday")
    .eq("is_active", true)

  let birthdayFired = 0

  // Vercel runs in UTC — getUTC* methods used throughout for consistency
  const now = new Date()
  const todayMonth = now.getUTCMonth() + 1
  const todayDay = now.getUTCDate()

  for (const automation of birthdayAutomations ?? []) {
    const templateSlug = (automation.email_templates as unknown as { slug: string } | null)?.slug
    if (!templateSlug) continue

    const { data: clientes } = await supabase
      .from("clientes")
      .select("id, nome, email, data_nascimento")
      .eq("org_id", automation.org_id)
      .not("email", "is", null)
      .not("data_nascimento", "is", null)

    for (const cliente of clientes ?? []) {
      if (!cliente.email || !cliente.data_nascimento) continue

      // date-only ISO strings ("YYYY-MM-DD") are parsed as UTC midnight per spec
      const bday = new Date(cliente.data_nascimento)
      if (bday.getUTCMonth() + 1 !== todayMonth || bday.getUTCDate() !== todayDay) continue

      const alreadySent = await checkBirthdaySend(supabase, automation.id, cliente.email)
      if (alreadySent) { skipped++; continue }

      await sendTemplateEmail({
        templateSlug,
        to: { email: cliente.email, name: cliente.nome ?? undefined },
        variables: {
          nome: cliente.nome ?? "",
          email: cliente.email,
          data_nascimento: cliente.data_nascimento,
        },
        triggeredBy: `automation:${automation.id}:birthday`,
        orgId: automation.org_id as string,
        priority: 5,
      })
      birthdayFired++
    }
  }

  return NextResponse.json({
    fired,
    skipped,
    birthdayFired,
    automations: (automations?.length ?? 0) + (birthdayAutomations?.length ?? 0),
  })
}
