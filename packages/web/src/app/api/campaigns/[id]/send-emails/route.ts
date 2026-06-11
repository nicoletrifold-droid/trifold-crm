import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { sendEmail } from "@web/lib/email"
import { injectUtmToHtml } from "@web/lib/campaign-utm"

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin", "supervisor"])
  if (forbidden) return forbidden

  const { id } = await params

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, org_id, name, email_enabled, email_subject, email_body_html")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!campaign) {
    return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 })
  }

  if (!campaign.email_enabled) {
    return NextResponse.json({ error: "E-mail não está habilitado nesta campanha" }, { status: 400 })
  }

  if (!campaign.email_subject || !campaign.email_body_html) {
    return NextResponse.json(
      { error: "Campanha sem assunto ou template de e-mail configurado. Configure em Editar → Corpo do e-mail." },
      { status: 400 }
    )
  }

  const { data: entries } = await supabase
    .from("campaign_entries")
    .select("id, name, email, custom_data")
    .eq("campaign_id", id)
    .eq("org_id", appUser.org_id)
    .eq("email_status", "pending")
    .neq("email", "")
    .not("email", "is", null)

  if (!entries || entries.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, message: "Nenhum cadastro com e-mail pendente" })
  }

  const { data: emailImages } = await supabase
    .from("campaign_email_images")
    .select("variant_id, image_url, link_url")
    .eq("campaign_id", id)

  let sent = 0
  let failed = 0

  for (const entry of entries) {
    try {
      let html = campaign.email_body_html!
        .replace(/\{\{nome\}\}/gi, entry.name ?? "")
        .replace(/\{\{name\}\}/gi, entry.name ?? "")
        .replace(/\{\{email\}\}/gi, entry.email ?? "")

      const custom = (entry.custom_data ?? {}) as Record<string, string>
      for (const [key, value] of Object.entries(custom)) {
        html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, "gi"), String(value))
      }

      html = injectUtmToHtml(html, emailImages ?? [])

      const subject = campaign.email_subject!.replace(/\{\{nome\}\}/gi, entry.name ?? "")

      const result = await sendEmail({
        to: entry.email!,
        subject,
        html,
        tags: [
          { name: "campaign_id", value: campaign.id },
          { name: "entry_id", value: entry.id },
        ],
      })

      const emailStatus = result.error ? "failed" : "sent"

      await supabase
        .from("campaign_entries")
        .update({ email_status: emailStatus, email_sent_at: new Date().toISOString() })
        .eq("id", entry.id)

      await supabase.from("campaign_events").insert({
        org_id: campaign.org_id,
        campaign_id: campaign.id,
        entry_id: entry.id,
        channel: "email",
        event_type: emailStatus,
        metadata: result.error ? { error: result.error } : {},
      })

      if (result.error) failed++
      else sent++
    } catch {
      failed++
      await supabase
        .from("campaign_entries")
        .update({ email_status: "failed" })
        .eq("id", entry.id)
    }
  }

  return NextResponse.json({ sent, failed, total: entries.length })
}
