import { createAdminClient } from "@web/lib/supabase/admin"
import { identifyClientByContact, type IdentifyClientResult } from "./identify-client"
import { notifyRelationshipManagers } from "./notify-relationship"

/**
 * Story 76-2 (Épico 76) — Roteia a entrada do WhatsApp para RELACIONAMENTO quando o
 * contato já é cliente da base de obras (match de alta confiança por telefone).
 *
 * Efeitos quando identifica cliente:
 *  - marca a conversa como relacionamento (+ cliente/obra) e faz handoff (Nicole para);
 *  - tira o "lead" do funil (is_active=false — é cliente, não lead);
 *  - manda uma mensagem curta de encaminhamento ao cliente;
 *  - notifica a gerente de relacionamento (Samara) por push/e-mail.
 *
 * Retorna `true` se a conversa foi tratada como relacionamento → a Nicole NÃO responde.
 *
 * Escopo 76-2: só o caso de ALTA confiança (telefone). name/ambíguo e "perguntar qual
 * obra" (múltiplas) vêm na 76-3.
 */

export const RELATIONSHIP_HANDOFF_REASON = "relationship"

export const RELATIONSHIP_FORWARD_MESSAGE =
  "Oi! Como você já é nosso cliente, vou te encaminhar para a Samara, do nosso time de " +
  "relacionamento — ela te responde por aqui. 😊"

export type IdentifyAction = "route" | "mark_checked" | "skip"

/**
 * PURO: a partir do resultado da identificação, decide a ação.
 *  - phone_match → route (vira relacionamento)
 *  - none        → mark_checked (não é cliente; não re-checar)
 *  - name/ambiguous → skip (fluxo normal por ora; 76-3 trata e por isso NÃO marca checked)
 */
export function actionFromIdentify(result: IdentifyClientResult): IdentifyAction {
  if (result.status === "phone_match") return "route"
  if (result.status === "none") return "mark_checked"
  return "skip"
}

interface RouteParams {
  conversationId: string
  leadId: string
  orgId: string
  phone: string | null
  name: string | null
  /** Número (raw) para responder via WhatsApp. */
  fromRaw: string
  waConfig: { phone_number_id: string; access_token: string }
}

export async function maybeRouteInboundToRelationship(
  admin: ReturnType<typeof createAdminClient>,
  params: RouteParams
): Promise<boolean> {
  const [{ data: conv }, { data: lead }] = await Promise.all([
    admin
      .from("conversations")
      .select("is_relationship, relationship_checked")
      .eq("id", params.conversationId)
      .maybeSingle(),
    admin
      .from("leads")
      .select("assigned_broker_id")
      .eq("id", params.leadId)
      .maybeSingle(),
  ])

  // Já é relacionamento → Nicole continua silente; Samara cuida (sem re-notificar).
  if (conv?.is_relationship) return true
  // Já checado (não é cliente) → fluxo normal.
  if (conv?.relationship_checked) return false
  // Lead já em atendimento por um corretor → não sequestra um lead real.
  if (lead?.assigned_broker_id) {
    await admin
      .from("conversations")
      .update({ relationship_checked: true })
      .eq("id", params.conversationId)
    return false
  }

  const result = await identifyClientByContact(params.orgId, params.phone, params.name)
  const action = actionFromIdentify(result)

  if (action !== "route") {
    if (action === "mark_checked") {
      await admin
        .from("conversations")
        .update({ relationship_checked: true })
        .eq("id", params.conversationId)
    }
    return false
  }

  const cliente = result.candidates[0]!
  // Obra única já é gravada; múltiplas obras → a Nicole pergunta na 76-3.
  const obra = cliente.obras.length === 1 ? cliente.obras[0]! : null

  // Marca relacionamento + handoff (Nicole para de responder).
  await admin
    .from("conversations")
    .update({
      is_relationship: true,
      relationship_checked: true,
      relationship_cliente_id: cliente.cliente_id,
      relationship_obra_id: obra?.obra_id ?? null,
      is_ai_active: false,
      handoff_at: new Date().toISOString(),
      handoff_reason: RELATIONSHIP_HANDOFF_REASON,
    })
    .eq("id", params.conversationId)

  // Tira do funil de leads (é cliente, não lead).
  await admin.from("leads").update({ is_active: false }).eq("id", params.leadId)

  // Mensagem curta de encaminhamento ao cliente + registro no histórico.
  try {
    await fetch(
      `https://graph.facebook.com/v21.0/${params.waConfig.phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.waConfig.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: params.fromRaw,
          type: "text",
          text: { body: RELATIONSHIP_FORWARD_MESSAGE },
        }),
      }
    )
    await admin.from("messages").insert({
      conversation_id: params.conversationId,
      role: "assistant",
      content: RELATIONSHIP_FORWARD_MESSAGE,
      metadata: { relationship_handoff: true },
    })
  } catch (e) {
    console.error("[relacionamento] erro ao enviar msg de encaminhamento:", e)
  }

  // Notifica a gerente de relacionamento (Samara).
  await notifyRelationshipManagers(admin, params.orgId, {
    clienteNome: cliente.nome,
    obraNome: obra?.obra_name ?? null,
  })

  return true
}
