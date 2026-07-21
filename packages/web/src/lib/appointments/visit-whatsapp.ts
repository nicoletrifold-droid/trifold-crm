import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizePhoneBR } from "@trifold/shared"

/**
 * Story 75-191 — WhatsApp de visita via TEMPLATE aprovado (cliente + corretores).
 *
 * WhatsApp proativo fora da janela de 24h SÓ entrega por template HSM aprovado —
 * o lembrete antigo em texto livre falhava silenciosamente para todo cliente sem
 * conversa aberta com o número da empresa (caso típico: agendou pelo link da
 * imobiliária e nunca mandou mensagem). Templates (pt_BR, UTILITY, aprovados
 * 2026-07-21, mesmo padrão do `nova_visita_imob`/75-174):
 * - `visita_confirmada_cliente`  {{1}} nome · {{2}} decorado · {{3}} quando  + botão cancelar
 * - `visita_confirmada_corretor` {{1}} corretor · {{2}} cliente · {{3}} decorado · {{4}} quando
 * - `lembrete_visita_cliente`    {{1}} nome · {{2}} decorado · {{3}} quando  + botão cancelar
 * - `lembrete_visita_corretor`   {{1}} corretor · {{2}} cliente · {{3}} decorado · {{4}} quando
 *
 * O botão de cancelar é URL dinâmica: o parâmetro é o `cancel_token` do
 * agendamento (sufixo de https://crm.trifold.eng.br/agendar/cancelar/{{1}}).
 *
 * Todos os envios são best-effort: acumulam erros e nunca lançam.
 */

export interface VisitWaConfig {
  phone_number_id: string
  access_token: string
}

/** Telefone pronto p/ Cloud API (E.164 BR via normalizePhoneBR); null p/ tg:/inválido. */
export function waPhone(raw: string | null | undefined): string | null {
  if (!raw || raw.startsWith("tg:")) return null
  return normalizePhoneBR(raw)
}

export interface VisitTemplateSend {
  to: string
  template:
    | "visita_confirmada_cliente"
    | "visita_confirmada_corretor"
    | "lembrete_visita_cliente"
    | "lembrete_visita_corretor"
  bodyParams: string[]
  /** Presente → adiciona o parâmetro do botão URL "Cancelar visita". */
  cancelToken?: string | null
}

export async function sendVisitTemplate(
  config: VisitWaConfig,
  send: VisitTemplateSend
): Promise<{ ok: boolean; error?: string }> {
  const components: Record<string, unknown>[] = [
    {
      type: "body",
      parameters: send.bodyParams.map((text) => ({ type: "text", text })),
    },
  ]
  if (send.cancelToken) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: send.cancelToken }],
    })
  }
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: send.to,
          type: "template",
          template: {
            name: send.template,
            language: { code: "pt_BR" },
            components,
          },
        }),
        signal: AbortSignal.timeout(15000),
      }
    )
    if (!res.ok) return { ok: false, error: `${send.to}: ${res.status} ${await res.text()}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: `${send.to}: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/**
 * Confirmação NO ATO do agendamento via link da imobiliária: WhatsApp ao CLIENTE
 * (template com botão de cancelar) e ao CORRETOR PARCEIRO (quando informado).
 * Chamado fire-and-forget pelo POST /api/agendar/[token].
 */
export async function notifyVisitBookedWhatsApp(
  admin: SupabaseClient,
  orgId: string,
  params: {
    clientName: string
    clientPhone: string
    propertyName: string
    whenLabel: string
    cancelToken: string | null
    partnerBrokerName?: string | null
    partnerBrokerPhone?: string | null
  }
): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = []
  const { data: config } = await admin
    .from("whatsapp_config")
    .select("phone_number_id, access_token")
    .eq("org_id", orgId)
    .eq("status", "active")
    .maybeSingle()
  if (!config?.phone_number_id || !config?.access_token) {
    return { sent: 0, errors: ["whatsapp_config ausente/inativa"] }
  }

  let sent = 0
  const clientTo = waPhone(params.clientPhone)
  if (clientTo) {
    const r = await sendVisitTemplate(config, {
      to: clientTo,
      template: "visita_confirmada_cliente",
      bodyParams: [params.clientName, params.propertyName, params.whenLabel],
      cancelToken: params.cancelToken,
    })
    if (r.ok) sent++
    else errors.push(r.error ?? "erro desconhecido")
  }

  const brokerTo = waPhone(params.partnerBrokerPhone)
  if (brokerTo && params.partnerBrokerName) {
    const r = await sendVisitTemplate(config, {
      to: brokerTo,
      template: "visita_confirmada_corretor",
      bodyParams: [
        params.partnerBrokerName,
        params.clientName,
        params.propertyName,
        params.whenLabel,
      ],
    })
    if (r.ok) sent++
    else errors.push(r.error ?? "erro desconhecido")
  }

  return { sent, errors }
}
