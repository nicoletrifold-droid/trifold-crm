import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendEmail } from "@web/lib/email"
import { renderBaseLayout, renderButton } from "@web/lib/email-layout"

const CRON_SECRET = process.env.CRON_SECRET
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://crm.trifold.eng.br"

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    console.error("[EMAIL-REMINDERS] CRON_SECRET not configured")
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()

  // "Tomorrow in SP" = D+1 03:00 UTC to D+2 03:00 UTC (SP is UTC-3, no DST since 2019)
  const tomorrowStartUTC = new Date(now)
  tomorrowStartUTC.setUTCHours(3, 0, 0, 0)
  tomorrowStartUTC.setUTCDate(tomorrowStartUTC.getUTCDate() + 1)

  const tomorrowEndUTC = new Date(tomorrowStartUTC)
  tomorrowEndUTC.setUTCDate(tomorrowEndUTC.getUTCDate() + 1)

  const { data: appointments } = await supabase
    .from("appointments")
    .select(`
      id,
      scheduled_at,
      location,
      metadata,
      org_id,
      cancel_token,
      lead:leads!lead_id(id, name, email),
      broker:users!broker_id(id, name, email),
      property:properties!property_id(id, name)
    `)
    .eq("status", "scheduled")
    .gte("scheduled_at", tomorrowStartUTC.toISOString())
    .lt("scheduled_at", tomorrowEndUTC.toISOString())
    .or("metadata->>'email_reminded'.is.null,metadata->>'email_reminded'.eq.false")

  let sent = 0
  let errors = 0

  for (const appointment of appointments ?? []) {
    try {
      const lead = Array.isArray(appointment.lead) ? appointment.lead[0] : appointment.lead
      const broker = Array.isArray(appointment.broker) ? appointment.broker[0] : appointment.broker
      const property = Array.isArray(appointment.property) ? appointment.property[0] : appointment.property

      const scheduledDate = new Date(appointment.scheduled_at)

      const hora = scheduledDate.toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
      })

      const data = scheduledDate.toLocaleDateString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        weekday: "long",
        day: "numeric",
        month: "long",
      })

      const propertyName = property?.name ?? ""
      const leadName = lead?.name ?? "Lead"
      const cancelUrl = `${siteUrl}/agendar/cancelar/${appointment.cancel_token}`

      // E-mail ao corretor
      if (broker?.email) {
        const brokerHtml = renderBaseLayout(
          `<p>Olá, ${broker.name}!</p>
          <p>Passando para lembrar que você tem uma visita ao decorado <strong>${propertyName}</strong> agendada para amanhã, <strong>${data}</strong>, às <strong>${hora}</strong>, com <strong>${leadName}</strong>.</p>
          <p><strong>Endereço:</strong> Av. Nildo Ribeiro, 1337 - Maringá - PR</p>
          <p>Até lá! ☕</p>`,
          { orgName: "Trifold" }
        )
        const result = await sendEmail({
          to: broker.email,
          subject: `Lembrete: visita ao decorado amanhã às ${hora} — ${leadName}`,
          html: brokerHtml,
          orgId: appointment.org_id,
        })
        if (result.error) throw new Error(result.error)
        sent++
      }

      // E-mail ao lead
      if (lead?.email) {
        const cancelButtonHtml = renderButton("Cancelar compromisso", cancelUrl)
        const leadHtml = renderBaseLayout(
          `<p>Olá, ${leadName}!</p>
          <p>Lembramos que você tem uma visita ao decorado <strong>${propertyName}</strong> agendada para amanhã, <strong>${data}</strong>, às <strong>${hora}</strong>.</p>
          <p><strong>Endereço:</strong> Av. Nildo Ribeiro, 1337 - Maringá - PR</p>
          <p>Te esperamos com muito carinho! Em caso de dúvidas, é só responder este e-mail. ☕</p>
          <p style="margin-top:16px">${cancelButtonHtml}</p>`,
          { orgName: "Trifold" }
        )
        const result = await sendEmail({
          to: lead.email,
          subject: `Lembrete: sua visita ao decorado amanhã às ${hora}`,
          html: leadHtml,
          orgId: appointment.org_id,
        })
        if (result.error) throw new Error(result.error)
        sent++
      }

      const currentMetadata = (appointment.metadata as Record<string, unknown>) ?? {}
      await supabase
        .from("appointments")
        .update({ metadata: { ...currentMetadata, email_reminded: true } })
        .eq("id", appointment.id)

    } catch (err) {
      console.error(`[EMAIL-REMINDERS] Erro no appointment ${appointment.id}:`, err)
      errors++
    }
  }

  return NextResponse.json({ sent, errors })
}
