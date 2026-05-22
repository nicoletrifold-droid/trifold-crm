import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    console.error("[WHATSAPP-REMINDERS] CRON_SECRET not configured")
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()

  // Window centered at 3h before scheduled_at, with ±15min tolerance
  const windowStart = new Date(now.getTime() + (2 * 60 + 45) * 60 * 1000) // now + 2h45m
  const windowEnd = new Date(now.getTime() + (3 * 60 + 15) * 60 * 1000)   // now + 3h15m

  const { data: appointments } = await supabase
    .from("appointments")
    .select(`
      id,
      scheduled_at,
      metadata,
      org_id,
      lead:leads!lead_id(id, name, phone),
      property:properties!property_id(id, name)
    `)
    .eq("status", "scheduled")
    .gte("scheduled_at", windowStart.toISOString())
    .lte("scheduled_at", windowEnd.toISOString())
    .or("metadata->>'whatsapp_reminded'.is.null,metadata->>'whatsapp_reminded'.eq.false")

  let sent = 0
  let skipped = 0
  let errors = 0

  for (const appointment of appointments ?? []) {
    try {
      const lead = Array.isArray(appointment.lead) ? appointment.lead[0] : appointment.lead
      const property = Array.isArray(appointment.property) ? appointment.property[0] : appointment.property

      if (!lead?.phone || lead.phone.startsWith("tg:")) {
        skipped++
        continue
      }

      const { data: waConfig } = await supabase
        .from("whatsapp_config")
        .select("phone_number_id, access_token")
        .eq("org_id", appointment.org_id)
        .eq("status", "active")
        .maybeSingle()

      if (!waConfig) {
        skipped++
        continue
      }

      const hora = new Date(appointment.scheduled_at).toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
      })

      const message = `Olá ${lead.name}! Lembramos que você tem uma visita agendada hoje às ${hora} no imóvel ${property?.name ?? "não informado"}. Em caso de dúvidas, entre em contato.`

      const url = `https://graph.facebook.com/v21.0/${waConfig.phone_number_id}/messages`
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${waConfig.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: lead.phone,
          type: "text",
          text: { body: message },
        }),
        signal: AbortSignal.timeout(15000),
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`WhatsApp API error ${res.status}: ${errText}`)
      }

      const currentMetadata = (appointment.metadata as Record<string, unknown>) ?? {}
      await supabase
        .from("appointments")
        .update({ metadata: { ...currentMetadata, whatsapp_reminded: true } })
        .eq("id", appointment.id)

      sent++
    } catch (err) {
      console.error(`[WHATSAPP-REMINDERS] Erro no appointment ${appointment.id}:`, err)
      errors++
    }
  }

  return NextResponse.json({ sent, skipped, errors })
}
