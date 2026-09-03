import "server-only"

import { createAdminClient } from "@web/lib/supabase/admin"
import { sendEmail } from "@web/lib/email"
import { sendPushToUser } from "@web/lib/server/push-service"
import { logWhatsappSend } from "@web/lib/whatsapp/log-send"
import { leadDeepLink } from "@web/lib/leads/lead-url"
import { logEvent } from "@web/lib/logger"
import { tentarAppUrl } from "@web/lib/tenancy/app-url-fallback"

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
  context?: {
    title?: string
    body?: string
    /**
     * Story 75-354 — template HSM aprovado para ESTE aviso.
     *
     * Sem ele, o aviso com `context` sai em texto livre e só entrega se o corretor
     * tiver escrito para o número da empresa nas últimas 24h — o que praticamente
     * nunca acontece. Era falha silenciosa: o `catch` só fazia `console.error` e
     * nem `whatsapp_send_log` registrava. Push e e-mail seguem inalterados.
     *
     * Quem tem template aprovado passa aqui; quem não tem continua em texto livre
     * (agora com a falha registrada, nunca engolida).
     */
    template?: { name: string; params: string[] }
  }
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

  // Story 900-66 (AC4) — os TRÊS canais desta função carregam o deep link do lead (o push, o
  // botão do e-mail e o botão dinâmico do template HSM). Sem URL base, nada é enviado, e o
  // resultado devolvido é o mesmo `{ push:false, email:false, whatsapp:false }` que a função já
  // usa para dizer "nenhum canal saiu".
  const base = tentarAppUrl(process.env.NEXT_PUBLIC_APP_URL, "lib/roleta/notify-broker:notifyBroker", {
    orgId,
    leadId: lead.id,
  })
  if (!base.ok) return result
  const appUrl = base.url
  // Story 75-226: deep link segue o app do dono (SDR → /dashboard).
  // Limitação conhecida: o template HSM `novo_lead_corretor` tem botão com base
  // FIXA /broker/leads aprovada na Meta — p/ SDR o botão cai no /dashboard raiz.
  const { data: recipientUser } = await admin
    .from("users")
    .select("role")
    .eq("id", broker.userId)
    .maybeSingle()
  const leadUrl = leadDeepLink(appUrl, recipientUser?.role as string | undefined, lead.id)
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

  // Roleta → corretor (sem context): WhatsApp proativo via template HSM aprovado
  // `novo_lead_corretor`. Story 75-354: fluxo COM context também vai por template
  // quando o chamador informa um — entrega dentro e fora da janela de 24h. Sem
  // template informado, segue o texto livre de antes (que só entrega na janela).
  const waP = config.notify_whatsapp && broker.phone
    ? (context?.template
        ? sendBrokerContextTemplate(admin, orgId, broker.phone, context.template, lead.id)
        : context
          ? sendBrokerWhatsApp(admin, orgId, broker.phone, broker.name, leadName, lead.phone, leadUrl, context)
          : sendBrokerLeadTemplate(admin, orgId, broker.phone, broker.name, leadName, lead.phone, lead.id))
        .then(() => { result.whatsapp = true })
        .catch((err: unknown) => {
          // Story 75-354 — o `console.error` sozinho era o problema: em produção
          // ninguém abre o log da Vercel, e a falha do WhatsApp do corretor não
          // deixava rastro no banco. Agora deixa.
          console.error("[roleta] whatsapp error:", err)
          logEvent({
            level: "error",
            category: "system",
            event_type: "BROKER_WHATSAPP_FALHOU",
            message: `WhatsApp ao corretor falhou (lead ${lead.id}): ${err instanceof Error ? err.message : String(err)}`,
            metadata: {
              lead_id: lead.id,
              broker_user_id: broker.userId,
              via: context?.template ? "template" : context ? "texto_livre" : "template_roleta",
              template: context?.template?.name ?? null,
              erro: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
            },
            org_id: orgId,
            source: "lib/roleta/notify-broker",
          })
        })
    : Promise.resolve()

  await Promise.allSettled([pushP, emailP, waP])
  return result
}

/**
 * Notificação proativa de novo lead da roleta ao corretor via template HSM
 * aprovado `novo_lead_corretor` (pt_BR): body {{1}}=nome corretor, {{2}}=nome
 * lead, {{3}}=telefone lead. Entrega dentro e fora da janela de 24h. O botão do
 * template é estático (issue #26) — envio sem componente de botão.
 */
async function sendBrokerLeadTemplate(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  phone: string,
  brokerName: string,
  leadName: string,
  leadPhone: string,
  leadId: string
): Promise<void> {
  const { data: waConfig } = await admin
    .from("whatsapp_config")
    .select("phone_number_id, access_token")
    .eq("org_id", orgId)
    .eq("status", "active")
    .maybeSingle()

  if (!waConfig?.phone_number_id || !waConfig?.access_token) return

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
        type: "template",
        template: {
          name: "novo_lead_corretor",
          language: { code: "pt_BR" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: brokerName },
                { type: "text", text: leadName },
                { type: "text", text: leadPhone },
              ],
            },
            // Story 75-67: botão de URL dinâmica — o param substitui {{1}} na URL do template
            // (base https://crm.trifold.eng.br/broker/leads/{{1}}). Só funciona com o template
            // APROVADO como dinâmico; param em template estático = erro 132018.
            {
              type: "button",
              sub_type: "url",
              index: "0",
              parameters: [{ type: "text", text: leadId }],
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(15000),
    }
  )

  if (!res.ok) {
    const errText = await res.text()
    void logWhatsappSend(admin, { orgId, template: "novo_lead_corretor", category: "utility", recipientType: "corretor", toPhone: phone, status: "failed", error: `${res.status} ${errText.slice(0, 300)}` })
    throw new Error(`WhatsApp API error ${res.status}: ${errText}`)
  }
  const json = (await res.json().catch(() => null)) as { messages?: Array<{ id?: string }> } | null
  void logWhatsappSend(admin, { orgId, template: "novo_lead_corretor", category: "utility", recipientType: "corretor", toPhone: phone, status: "sent", wamId: json?.messages?.[0]?.id ?? null })
}

/**
 * Story 75-354 — aviso ao corretor por template HSM informado pelo chamador.
 *
 * Mesma mecânica do `novo_lead_corretor` (que entrega 38 msgs/semana): botão de
 * URL dinâmica cujo parâmetro é o id do lead, sobre a base
 * `https://crm.trifold.eng.br/broker/leads/{{1}}`. Categoria `utility` no log de
 * custo — é aviso operacional, não divulgação.
 */
async function sendBrokerContextTemplate(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  phone: string,
  template: { name: string; params: string[] },
  leadId: string
): Promise<void> {
  const { data: waConfig } = await admin
    .from("whatsapp_config")
    .select("phone_number_id, access_token")
    .eq("org_id", orgId)
    .eq("status", "active")
    .maybeSingle()

  if (!waConfig?.phone_number_id || !waConfig?.access_token) return

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
        type: "template",
        template: {
          name: template.name,
          language: { code: "pt_BR" },
          components: [
            {
              type: "body",
              parameters: template.params.map((text) => ({ type: "text", text })),
            },
            {
              type: "button",
              sub_type: "url",
              index: "0",
              parameters: [{ type: "text", text: leadId }],
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(15000),
    }
  )

  if (!res.ok) {
    const errText = await res.text()
    void logWhatsappSend(admin, { orgId, template: template.name, category: "utility", recipientType: "corretor", toPhone: phone, status: "failed", error: `${res.status} ${errText.slice(0, 300)}` })
    throw new Error(`WhatsApp API error ${res.status}: ${errText}`)
  }
  const json = (await res.json().catch(() => null)) as { messages?: Array<{ id?: string }> } | null
  void logWhatsappSend(admin, { orgId, template: template.name, category: "utility", recipientType: "corretor", toPhone: phone, status: "sent", wamId: json?.messages?.[0]?.id ?? null })
}

async function sendBrokerWhatsApp(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  phone: string,
  brokerName: string,
  leadName: string,
  leadPhone: string,
  leadUrl: string,
  context?: {
    title?: string
    body?: string
    /**
     * Story 75-354 — template HSM aprovado para ESTE aviso.
     *
     * Sem ele, o aviso com `context` sai em texto livre e só entrega se o corretor
     * tiver escrito para o número da empresa nas últimas 24h — o que praticamente
     * nunca acontece. Era falha silenciosa: o `catch` só fazia `console.error` e
     * nem `whatsapp_send_log` registrava. Push e e-mail seguem inalterados.
     *
     * Quem tem template aprovado passa aqui; quem não tem continua em texto livre
     * (agora com a falha registrada, nunca engolida).
     */
    template?: { name: string; params: string[] }
  }
): Promise<void> {
  const { data: waConfig } = await admin
    .from("whatsapp_config")
    .select("phone_number_id, access_token")
    .eq("org_id", orgId)
    .eq("status", "active")
    .maybeSingle()

  if (!waConfig?.phone_number_id || !waConfig?.access_token) return

  // Custom context (Story 51-3) overrides the default roulette message.
  const message = context?.body
    ? `Olá ${brokerName}! ${context.body}\n🔗 Ver lead: ${leadUrl}`
    : `Olá ${brokerName}! Você recebeu um novo lead na roleta.\n` +
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

  const { data: user } = await admin
    .from("users")
    .select("name, email, phone")
    .eq("id", userId)
    .maybeSingle()

  if (!user?.email) return

  // Story 900-66 (AC4) — push, e-mail e WhatsApp desta função levam ao lead: sem URL base
  // nenhum dos três sai.
  const base = tentarAppUrl(process.env.NEXT_PUBLIC_APP_URL, "lib/roleta/notify-broker:notifyImobiliaria", {
    orgId,
    leadId: lead.id,
  })
  if (!base.ok) return
  const leadUrl = `${base.url}/dashboard/leads/${lead.id}`

  await Promise.allSettled([
    sendPushToUser(admin, userId, { title, body: messageBody, url: leadUrl })
      .catch((e: unknown) => console.error("[roleta] imob push error:", e)),

    sendEmail({
      to: user.email as string,
      subject: title,
      html: buildImobiliariaEmailHtml({ title, body: messageBody, leadUrl }),
      orgId,
    }).catch((e: unknown) => console.error("[roleta] imob email error:", e)),

    // Story 75-68: WhatsApp do gestor via template HSM `aviso_roleta_gestor` (proativo, fora da
    // janela de 24h) com botão dinâmico que abre o lead exato — em vez de texto (só janela de 24h).
    (user.phone as string | null)
      ? sendImobiliariaTemplate(
          admin, orgId,
          user.phone as string,
          (user.name as string) ?? "",
          messageBody,
          `${lead.name ?? "Lead"}${lead.phone ? " — " + lead.phone : ""}`,
          lead.id,
        ).catch((e: unknown) => console.error("[roleta] imob whatsapp error:", e))
      : Promise.resolve(),
  ])
}

/**
 * Story 75-68 — Notificação proativa ao gestor via template HSM aprovado `aviso_roleta_gestor`
 * (pt_BR): body {{1}}=nome gestor, {{2}}=mensagem do evento, {{3}}=lead (nome — telefone). Botão de
 * URL dinâmica (base /dashboard/leads/{{1}}) → param = leadId abre o lead exato. O template já está
 * APPROVED como dinâmico (Story 75-67), então o param de botão NÃO causa 132018.
 */
async function sendImobiliariaTemplate(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  phone: string,
  gestorName: string,
  messageBody: string,
  leadLabel: string,
  leadId: string
): Promise<void> {
  const { data: waConfig } = await admin
    .from("whatsapp_config")
    .select("phone_number_id, access_token")
    .eq("org_id", orgId)
    .eq("status", "active")
    .maybeSingle()

  if (!waConfig?.phone_number_id || !waConfig?.access_token) return

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
        type: "template",
        template: {
          name: "aviso_roleta_gestor",
          language: { code: "pt_BR" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: gestorName },
                { type: "text", text: messageBody },
                { type: "text", text: leadLabel },
              ],
            },
            {
              type: "button",
              sub_type: "url",
              index: "0",
              parameters: [{ type: "text", text: leadId }],
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(15000),
    }
  )

  if (!res.ok) {
    const errText = await res.text()
    void logWhatsappSend(admin, { orgId, template: "aviso_roleta_gestor", category: "utility", recipientType: "gestor", toPhone: phone, status: "failed", error: `${res.status} ${errText.slice(0, 300)}` })
    throw new Error(`WhatsApp API error ${res.status}: ${errText}`)
  }
  const json = (await res.json().catch(() => null)) as { messages?: Array<{ id?: string }> } | null
  void logWhatsappSend(admin, { orgId, template: "aviso_roleta_gestor", category: "utility", recipientType: "gestor", toPhone: phone, status: "sent", wamId: json?.messages?.[0]?.id ?? null })
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
  context?: {
    title?: string
    body?: string
    /**
     * Story 75-354 — template HSM aprovado para ESTE aviso.
     *
     * Sem ele, o aviso com `context` sai em texto livre e só entrega se o corretor
     * tiver escrito para o número da empresa nas últimas 24h — o que praticamente
     * nunca acontece. Era falha silenciosa: o `catch` só fazia `console.error` e
     * nem `whatsapp_send_log` registrava. Push e e-mail seguem inalterados.
     *
     * Quem tem template aprovado passa aqui; quem não tem continua em texto livre
     * (agora com a falha registrada, nunca engolida).
     */
    template?: { name: string; params: string[] }
  }
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
