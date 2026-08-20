import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizePhoneBR } from "@trifold/shared"
import { logWhatsappSend } from "@web/lib/whatsapp/log-send"

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
    | "visita_cancelada_aviso"
  bodyParams: string[]
  /** Presente → adiciona o parâmetro do botão URL "Cancelar visita". */
  cancelToken?: string | null
}

/**
 * Story 75-353 — `admin`/`orgId` opcionais para registrar o envio em
 * `whatsapp_send_log`.
 *
 * Por que faltava importar: estes templates CUSTAM na Meta e não registravam
 * nada. Conferido em produção — `whatsapp_send_log` não tinha uma linha de
 * `lembrete_visita_cliente` em 7 dias, embora os flags `whatsapp_reminded_24h`/
 * `_3h` provem que os lembretes saíram. Ou seja: o custo e a taxa de falha do
 * caminho de visita estavam invisíveis, e uma queda de entrega passaria em branco.
 * Sem os parâmetros, o comportamento é exatamente o de antes.
 */
export async function sendVisitTemplate(
  config: VisitWaConfig,
  send: VisitTemplateSend,
  log?: { admin: SupabaseClient; orgId: string; recipientType?: string }
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
    if (!res.ok) {
      const erro = `${res.status} ${await res.text()}`
      if (log) {
        void logWhatsappSend(log.admin, {
          orgId: log.orgId,
          template: send.template,
          category: "utility",
          recipientType: log.recipientType ?? null,
          toPhone: send.to,
          status: "failed",
          error: erro.slice(0, 300),
        })
      }
      return { ok: false, error: `${send.to}: ${erro}` }
    }
    const json = (await res.json().catch(() => null)) as { messages?: Array<{ id?: string }> } | null
    if (log) {
      void logWhatsappSend(log.admin, {
        orgId: log.orgId,
        template: send.template,
        category: "utility",
        recipientType: log.recipientType ?? null,
        toPhone: send.to,
        status: "sent",
        wamId: json?.messages?.[0]?.id ?? null,
      })
    }
    return { ok: true }
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e)
    if (log) {
      void logWhatsappSend(log.admin, {
        orgId: log.orgId,
        template: send.template,
        category: "utility",
        recipientType: log.recipientType ?? null,
        toPhone: send.to,
        status: "failed",
        error: erro.slice(0, 300),
      })
    }
    return { ok: false, error: `${send.to}: ${erro}` }
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

/**
 * Story 75-192 — cliente cancelou pelo link público: avisa quem ia atender.
 * - team='house' → corretor interno (appointments.broker_id; fallback: responsável
 *   do lead), via template `visita_cancelada_aviso`.
 * - team='imob'  → corretor parceiro (metadata.corretor_parceiro) + TODOS os
 *   usuários role=imob ativos com telefone (Daiana) — mesmo público da 75-174.
 * Best-effort: nunca lança; dedup por telefone.
 */
export async function notifyVisitCancelledWhatsApp(
  admin: SupabaseClient,
  appointment: {
    org_id: string
    team: string | null
    broker_id: string | null
    lead_id: string | null
    metadata: Record<string, unknown> | null
    client_name: string | null
    location: string | null
    scheduled_at: string
    propertyName?: string | null
  }
): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = []
  const { data: config } = await admin
    .from("whatsapp_config")
    .select("phone_number_id, access_token")
    .eq("org_id", appointment.org_id)
    .eq("status", "active")
    .maybeSingle()
  if (!config?.phone_number_id || !config?.access_token) {
    return { sent: 0, errors: ["whatsapp_config ausente/inativa"] }
  }

  // Nome do cliente: client_name (link IMOB) ou nome do lead.
  let clientName = appointment.client_name?.trim() || null
  if (!clientName && appointment.lead_id) {
    const { data: lead } = await admin
      .from("leads")
      .select("name")
      .eq("id", appointment.lead_id)
      .maybeSingle()
    clientName = (lead?.name as string | null) ?? null
  }

  const propertyName =
    appointment.propertyName ??
    appointment.location?.replace(/^Decorado\s+/i, "") ??
    "Trifold"
  const whenLabel = new Date(appointment.scheduled_at).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })

  const recipients: Array<{ name: string; phone: string }> = []

  if (appointment.team === "imob") {
    const parceiro = appointment.metadata?.corretor_parceiro as
      | { nome?: string | null; telefone?: string | null }
      | undefined
    if (parceiro?.telefone) {
      recipients.push({ name: parceiro.nome ?? "Corretor", phone: parceiro.telefone })
    }
    const { data: imobUsers } = await admin
      .from("users")
      .select("name, phone")
      .eq("org_id", appointment.org_id)
      .eq("role", "imob")
      .eq("is_active", true)
      .not("phone", "is", null)
    for (const u of imobUsers ?? []) {
      recipients.push({ name: (u.name as string) ?? "Equipe IMOB", phone: u.phone as string })
    }
  } else {
    // House: corretor do agendamento; fallback = responsável do lead.
    let brokerUserId = appointment.broker_id
    if (!brokerUserId && appointment.lead_id) {
      const { data: lead } = await admin
        .from("leads")
        .select("assigned_broker_id")
        .eq("id", appointment.lead_id)
        .maybeSingle()
      brokerUserId = (lead?.assigned_broker_id as string | null) ?? null
    }
    if (brokerUserId) {
      const { data: broker } = await admin
        .from("users")
        .select("name, phone")
        .eq("id", brokerUserId)
        .maybeSingle()
      if (broker?.phone) {
        recipients.push({ name: (broker.name as string) ?? "Corretor", phone: broker.phone as string })
      }
    }
  }

  let sent = 0
  const seen = new Set<string>()
  for (const r of recipients) {
    const to = waPhone(r.phone)
    if (!to || seen.has(to)) continue
    seen.add(to)
    const res = await sendVisitTemplate(config, {
      to,
      template: "visita_cancelada_aviso",
      bodyParams: [r.name, clientName ?? "Cliente", propertyName, whenLabel],
    })
    if (res.ok) sent++
    else errors.push(res.error ?? "erro desconhecido")
  }

  return { sent, errors }
}
