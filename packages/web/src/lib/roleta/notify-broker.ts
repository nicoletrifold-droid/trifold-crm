import "server-only"

import { createAdminClient } from "@web/lib/supabase/admin"
import { sendEmail } from "@web/lib/email"
import { sendPushToUser } from "@web/lib/server/push-service"

interface NotifyBrokerParams {
  orgId: string
  broker: {
    userId: string
    name: string
    email: string
    phone: string | null
  }
  lead: {
    id: string
    name: string | null
    phone: string
  }
  config: {
    notify_push: boolean
    notify_email: boolean
    notify_whatsapp: boolean
  }
}

interface NotifyResult {
  push: boolean
  email: boolean
  whatsapp: boolean
}

export async function notifyBroker(params: NotifyBrokerParams): Promise<NotifyResult> {
  const { orgId, broker, lead, config } = params
  const admin = createAdminClient()
  const result: NotifyResult = { push: false, email: false, whatsapp: false }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.trifold.com.br"
  const leadUrl = `${appUrl}/dashboard/leads/${lead.id}`
  const leadName = lead.name ?? "Novo Lead"

  const pushP = config.notify_push
    ? sendPushToUser(admin, broker.userId, {
        title: "Novo Lead Recebido",
        body: `${leadName} — ${lead.phone}`,
        url: leadUrl,
      })
        .then(() => { result.push = true })
        .catch((err: unknown) => console.error("[roleta] push error:", err))
    : Promise.resolve()

  const emailP = config.notify_email
    ? sendEmail({
        to: broker.email,
        subject: `Novo lead para você: ${leadName}`,
        html: buildBrokerEmailHtml({ brokerName: broker.name, leadName, leadPhone: lead.phone, leadUrl }),
        orgId,
      })
        .then(() => { result.email = true })
        .catch((err: unknown) => console.error("[roleta] email error:", err))
    : Promise.resolve()

  const waP = config.notify_whatsapp && broker.phone
    ? sendBrokerWhatsApp(admin, orgId, broker.phone, broker.name, leadName, lead.phone, leadUrl)
        .then(() => { result.whatsapp = true })
        .catch((err: unknown) => console.error("[roleta] whatsapp error:", err))
    : Promise.resolve()

  await Promise.allSettled([pushP, emailP, waP])
  return result
}

async function sendBrokerWhatsApp(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  phone: string,
  brokerName: string,
  leadName: string,
  leadPhone: string,
  leadUrl: string
): Promise<void> {
  const { data: waConfig } = await admin
    .from("whatsapp_config")
    .select("phone_number_id, access_token")
    .eq("org_id", orgId)
    .eq("status", "active")
    .maybeSingle()

  if (!waConfig?.phone_number_id || !waConfig?.access_token) return

  const message =
    `Olá ${brokerName}! Você recebeu um novo lead na roleta.\n` +
    `👤 Nome: ${leadName}\n` +
    `📱 Telefone: ${leadPhone}\n` +
    `🔗 Ver lead: ${leadUrl}`

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${waConfig.phone_number_id}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${waConfig.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: message },
      }),
      signal: AbortSignal.timeout(15000),
    }
  )

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`WhatsApp API error ${res.status}: ${errText}`)
  }
}

function buildBrokerEmailHtml(p: {
  brokerName: string
  leadName: string
  leadPhone: string
  leadUrl: string
}): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background: #f5f5f5; margin: 0; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden;">
    <div style="background: #0F0F0F; padding: 24px; text-align: center;">
      <span style="color: #F27A5E; font-size: 22px; font-weight: bold; letter-spacing: 2px;">TRIFOLD</span>
    </div>
    <div style="padding: 32px 24px;">
      <p style="color: #333; font-size: 16px; margin: 0 0 12px;">Olá, <strong>${p.brokerName}</strong>!</p>
      <p style="color: #555; font-size: 15px; margin: 0 0 20px;">Você recebeu um novo lead pela roleta:</p>
      <div style="background: #f9f9f9; border-left: 4px solid #F27A5E; padding: 16px; border-radius: 4px; margin-bottom: 24px;">
        <p style="margin: 0 0 8px; color: #333;"><strong>Nome:</strong> ${p.leadName}</p>
        <p style="margin: 0; color: #333;"><strong>Telefone:</strong> ${p.leadPhone}</p>
      </div>
      <div style="text-align: center; margin-bottom: 32px;">
        <a href="${p.leadUrl}"
           style="background: #F27A5E; color: #fff; padding: 12px 28px; border-radius: 6px;
                  text-decoration: none; font-weight: 600; font-size: 15px;">
          Ver Lead no CRM
        </a>
      </div>
      <p style="color: #999; font-size: 12px; margin: 0;">
        Você recebeu este lead pois está ativo na roleta de distribuição.
      </p>
    </div>
  </div>
</body>
</html>`
}
