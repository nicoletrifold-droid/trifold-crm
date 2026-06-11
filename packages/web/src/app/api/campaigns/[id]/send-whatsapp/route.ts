import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"

async function sendWhatsAppTemplate(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  templateName: string,
  components: { type: string; parameters: { type: string; text: string }[] }[]
): Promise<void> {
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: "pt_BR" },
        ...(components.length ? { components } : {}),
      },
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`WhatsApp API ${res.status}: ${err}`)
  }
}

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
    .select("id, org_id, whatsapp_template_name")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!campaign) {
    return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 })
  }

  if (!campaign.whatsapp_template_name) {
    return NextResponse.json(
      { error: "Campanha sem template de WhatsApp configurado. Configure em Editar → Template WhatsApp." },
      { status: 400 }
    )
  }

  const { data: waConfig } = await supabase
    .from("whatsapp_config")
    .select("phone_number_id, access_token")
    .eq("org_id", appUser.org_id)
    .eq("status", "active")
    .maybeSingle()

  if (!waConfig) {
    return NextResponse.json(
      { error: "WhatsApp não configurado para esta organização." },
      { status: 400 }
    )
  }

  const { data: entries } = await supabase
    .from("campaign_entries")
    .select("id, name, phone, custom_data")
    .eq("campaign_id", id)
    .eq("org_id", appUser.org_id)
    .in("whatsapp_status", ["pending", "failed"])

  if (!entries || entries.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, message: "Nenhum cadastro com WhatsApp pendente" })
  }

  let sent = 0
  let failed = 0

  for (const entry of entries) {
    try {
      const customValues = Object.values((entry.custom_data ?? {}) as Record<string, string>)
      const components: { type: string; parameters: { type: string; text: string }[] }[] = []

      if (entry.name || customValues.length > 0) {
        components.push({
          type: "body",
          parameters: [
            { type: "text", text: entry.name ?? "" },
            ...customValues.map((v) => ({ type: "text", text: String(v) })),
          ],
        })
      }

      await sendWhatsAppTemplate(
        waConfig.phone_number_id,
        waConfig.access_token,
        `55${entry.phone}`,
        campaign.whatsapp_template_name!,
        components
      )

      await supabase
        .from("campaign_entries")
        .update({ whatsapp_status: "sent", whatsapp_sent_at: new Date().toISOString() })
        .eq("id", entry.id)

      await supabase.from("campaign_events").insert({
        org_id: campaign.org_id,
        campaign_id: campaign.id,
        entry_id: entry.id,
        channel: "whatsapp",
        event_type: "sent",
      })

      sent++
    } catch (err) {
      failed++
      await supabase
        .from("campaign_entries")
        .update({ whatsapp_status: "failed" })
        .eq("id", entry.id)

      await supabase.from("campaign_events").insert({
        org_id: campaign.org_id,
        campaign_id: campaign.id,
        entry_id: entry.id,
        channel: "whatsapp",
        event_type: "failed",
        metadata: { error: err instanceof Error ? err.message : "Unknown" },
      })
    }
  }

  return NextResponse.json({ sent, failed, total: entries.length })
}
