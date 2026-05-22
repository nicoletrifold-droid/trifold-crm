import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { sendEmail } from "@web/lib/email"

const CRON_SECRET = process.env.CRON_SECRET

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
  // Cron runs at 12:00 UTC — already past 03:00 UTC, so advance to next day
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
      lead:leads!lead_id(id, name),
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

      if (!broker?.email) continue

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

      const result = await sendEmail({
        to: broker.email,
        subject: `Lembrete: visita amanhã às ${hora} — ${lead?.name ?? "Lead"}`,
        html: `
          <p>Olá, ${broker.name}!</p>
          <p>Você tem uma visita agendada para amanhã, <strong>${data}</strong>, às <strong>${hora}</strong> com <strong>${lead?.name ?? "Lead"}</strong> no imóvel <strong>${property?.name ?? "não informado"}</strong>.</p>
          <p><strong>Local:</strong> ${appointment.location ?? "Não informado"}</p>
          <p>Boas vendas!</p>
        `,
        orgId: appointment.org_id,
      })

      if (result.error) {
        throw new Error(result.error)
      }

      const currentMetadata = (appointment.metadata as Record<string, unknown>) ?? {}
      await supabase
        .from("appointments")
        .update({ metadata: { ...currentMetadata, email_reminded: true } })
        .eq("id", appointment.id)

      sent++
    } catch (err) {
      console.error(`[EMAIL-REMINDERS] Erro no appointment ${appointment.id}:`, err)
      errors++
    }
  }

  return NextResponse.json({ sent, errors })
}
