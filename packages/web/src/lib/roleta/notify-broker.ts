import "server-only"

import { createAdminClient } from "@web/lib/supabase/admin"
import { sendEmail } from "@web/lib/email"
import { sendPushToUser } from "@web/lib/server/push-service"
import { sendWhatsAppTemplate } from "../whatsapp/send-whatsapp-template"

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
  /**
   * Optional custom messaging context. When provided, overrides the default
   * "Novo Lead Recebido" copy used for roulette distribution. Used by the
   * appointment-scheduling notification (Story 51-3) and future triggers (51-4).
   * Backward compatible: when absent, the original roulette copy is preserved.
   */
  context?: { title?: string; body?: string }
}

interface NotifyResult {
  push: boolean
  email: boolean
  whatsapp: boolean
}

export async function notifyBroker(params: NotifyBrokerParams): Promise<NotifyResult> {
  const { orgId, broker, lead, config, context } = params
  const admin = createAdminClient()
  const result: NotifyResult = { push: false, email: false, whatsapp: false }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.trifold.com.br"
  const leadUrl = `${appUrl}/broker/leads/${lead.id}`
  const leadName = lead.name ?? "Novo Lead"

  // Custom context (Story 51-3) overrides the default roulette copy when present.
  const pushTitle = context?.title ?? "Novo Lead Recebido"
  const pushBody = context?.body ?? `${leadName} — ${lead.phone}`
  const emailSubject = context?.title ?? `Novo lead para você: ${leadName}`

  const pushP = config.notify_push
    ? sendPushToUser(admin, broker.userId, {
        title: pushTitle,
        body: pushBody,
        url: leadUrl,
      })
        .then(() => { result.push = true })
        .catch((err: unknown) => console.error("[roleta] push error:", err))
    : Promise.resolve()

  const emailP = config.notify_email
    ? sendEmail({
        to: broker.email,
        subject: emailSubject,
        html: buildBrokerEmailHtml({ brokerName: broker.name, leadName, leadPhone: lead.phone, leadUrl, context }),
        orgId,
      })
        .then(() => { result.email = true })
        .catch((err: unknown) => console.error("[roleta] email error:", err))
    : Promise.resolve()

  const waP = config.notify_whatsapp && broker.phone
    ? sendBrokerWhatsApp(admin, orgId, broker.phone, broker.name, leadName, lead.phone, lead.id, context)
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
  leadId: string,
  context?: { title?: string; body?: string }
): Promise<void> {
  // Story 51-8 (AC3): os paths com `context` (agendamento 51-3 / follow-ups 51-4)
  // não têm template HSM aprovado para a sua copy. Enviar o template
  // `novo_lead_corretor` ("você recebeu um novo lead") nesses casos seria
  // confuso. Por isso o WhatsApp proativo é pulado aqui — push e email
  // continuam sendo disparados pelo caller `notifyBroker`, intactos.
  if (context) return

  const { data: waConfig } = await admin
    .from("whatsapp_config")
    .select("phone_number_id, access_token")
    .eq("org_id", orgId)
    .eq("status", "active")
    .maybeSingle()

  if (!waConfig?.phone_number_id || !waConfig?.access_token) return

  // Story 51-8 (AC2): template HSM `novo_lead_corretor`. A URL base do botão
  // (`https://crm.trifold.eng.br/broker/leads/`) está embutida no template Meta —
  // enviamos apenas o sufixo (UUID do lead).
  const res = await sendWhatsAppTemplate(waConfig, phone, {
    name: "novo_lead_corretor",
    languageCode: "pt_BR",
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: brokerName },
          { type: "text", text: leadName },
          { type: "text", text: leadPhone },
        ],
      },
      {
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: leadId }],
      },
    ],
  })

  if (!res.sent) {
    throw new Error(`WhatsApp template error: ${res.error}`)
  }
}

// ============================================================================
// notifyImobiliaria — avisa o usuário gestor (admin/supervisor)
// ============================================================================

interface NotifyImobiliariaParams {
  orgId: string
  userId: string
  title: string
  messageBody: string
  lead: { id: string; name: string | null; phone: string | null }
  brokerName?: string
}

export async function notifyImobiliaria(params: NotifyImobiliariaParams): Promise<void> {
  const { orgId, userId, title, messageBody, lead } = params
  const admin = createAdminClient()

  // Story 51-8 (AC4): WA config fetchada em paralelo com a query de `users`.
  const [userRes, waConfigRes] = await Promise.all([
    admin.from("users").select("name, email, phone").eq("id", userId).maybeSingle(),
    admin
      .from("whatsapp_config")
      .select("phone_number_id, access_token")
      .eq("org_id", orgId)
      .eq("status", "active")
      .maybeSingle(),
  ])
  const user = userRes.data
  const waConfig = waConfigRes.data

  if (!user?.email) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.trifold.com.br"
  const leadUrl = `${appUrl}/dashboard/leads/${lead.id}`

  await Promise.allSettled([
    sendPushToUser(admin, userId, { title, body: messageBody, url: leadUrl })
      .catch((e: unknown) => console.error("[roleta] imob push error:", e)),

    sendEmail({
      to: user.email as string,
      subject: title,
      html: buildImobiliariaEmailHtml({ title, body: messageBody, leadUrl }),
      orgId,
    }).catch((e: unknown) => console.error("[roleta] imob email error:", e)),

    // Story 51-8 (AC4): template HSM `aviso_roleta_gestor`. A URL base do botão
    // (`https://crm.trifold.eng.br/dashboard/leads/`) está embutida no template —
    // enviamos apenas o sufixo (UUID do lead).
    (user.phone as string | null) && waConfig?.phone_number_id && waConfig?.access_token
      ? sendWhatsAppTemplate(waConfig, user.phone as string, {
          name: "aviso_roleta_gestor",
          languageCode: "pt_BR",
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: (user.name as string | null) ?? "" },
                { type: "text", text: messageBody },
                { type: "text", text: `${lead.name ?? "Lead"} — ${lead.phone ?? ""}`.trim() },
              ],
            },
            {
              type: "button",
              sub_type: "url",
              index: "0",
              parameters: [{ type: "text", text: lead.id }],
            },
          ],
        })
          .then((res) => {
            if (!res.sent) throw new Error(res.error ?? "SEND_FAILED")
          })
          .catch((e: unknown) => console.error("[roleta] imob whatsapp error:", e))
      : Promise.resolve(),
  ])
}

function buildImobiliariaEmailHtml(p: { title: string; body: string; leadUrl: string }): string {
  const title = escHtml(p.title)
  const body  = escHtml(p.body)
  return `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background: #f5f5f5; margin: 0; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden;">
    <div style="background: #0F0F0F; padding: 24px; text-align: center;">
      <span style="color: #F27A5E; font-size: 22px; font-weight: bold; letter-spacing: 2px;">TRIFOLD</span>
    </div>
    <div style="padding: 32px 24px;">
      <p style="color: #333; font-size: 16px; margin: 0 0 16px; font-weight: 600;">${title}</p>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">${body}</p>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${p.leadUrl}"
           style="background: #F27A5E; color: #fff; padding: 12px 28px; border-radius: 6px;
                  text-decoration: none; font-weight: 600; font-size: 15px;">
          Ver Lead no CRM
        </a>
      </div>
    </div>
  </div>
</body>
</html>`
}

// ============================================================================

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function buildBrokerEmailHtml(p: {
  brokerName: string
  leadName: string
  leadPhone: string
  leadUrl: string
  context?: { title?: string; body?: string }
}): string {
  const name = escHtml(p.brokerName)
  const lead = escHtml(p.leadName)
  const phone = escHtml(p.leadPhone)

  // Custom context (Story 51-3): override the roulette-specific copy/footer
  // while keeping the same branded layout and lead details card.
  const intro = p.context?.body
    ? escHtml(p.context.body)
    : "Você recebeu um novo lead pela roleta:"
  const footer = p.context
    ? "Notificação enviada pela Nicole."
    : "Você recebeu este lead pois está ativo na roleta de distribuição."

  return `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background: #f5f5f5; margin: 0; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden;">
    <div style="background: #0F0F0F; padding: 24px; text-align: center;">
      <span style="color: #F27A5E; font-size: 22px; font-weight: bold; letter-spacing: 2px;">TRIFOLD</span>
    </div>
    <div style="padding: 32px 24px;">
      <p style="color: #333; font-size: 16px; margin: 0 0 12px;">Olá, <strong>${name}</strong>!</p>
      <p style="color: #555; font-size: 15px; margin: 0 0 20px;">${intro}</p>
      <div style="background: #f9f9f9; border-left: 4px solid #F27A5E; padding: 16px; border-radius: 4px; margin-bottom: 24px;">
        <p style="margin: 0 0 8px; color: #333;"><strong>Nome:</strong> ${lead}</p>
        <p style="margin: 0; color: #333;"><strong>Telefone:</strong> ${phone}</p>
      </div>
      <div style="text-align: center; margin-bottom: 32px;">
        <a href="${p.leadUrl}"
           style="background: #F27A5E; color: #fff; padding: 12px 28px; border-radius: 6px;
                  text-decoration: none; font-weight: 600; font-size: 15px;">
          Ver Lead no CRM
        </a>
      </div>
      <p style="color: #999; font-size: 12px; margin: 0;">
        ${footer}
      </p>
    </div>
  </div>
</body>
</html>`
}
