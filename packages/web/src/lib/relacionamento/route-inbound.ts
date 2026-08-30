import { createAdminClient } from "@web/lib/supabase/admin"
import { identifyClientByContact, type IdentifyClientResult } from "./identify-client"
import { notifyRelationshipManagers } from "./notify-relationship"
import { notifyRelationshipOnReply } from "./notify-relationship-on-reply"

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
  /**
   * Story 900-24 (C2): as duas colunas são NULLABLE em `whatsapp_config` (medido no
   * `information_schema`). O tipo passa a dizer a verdade; o RUNTIME não muda — este caminho já
   * enviava adiante o que estava na linha, e `Bearer null` já era o resultado possível antes,
   * tratado pelo 401 de `alertCredencialMorta`. Fechar aqui com um early-return criaria um
   * caminho novo de perda de dado, que é a classe que a AC5/B1 da 900-24 rejeitou.
   */
  waConfig: { phone_number_id: string | null; access_token: string | null }
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

  // Já é relacionamento → Nicole continua silente; Samara cuida. Story 75-86: notifica
  // a gerente de relacionamento por push (o 1º roteamento já notifica via
  // notifyRelationshipManagers; isto cobre as mensagens SEGUINTES, com deep-link p/ a conversa).
  if (conv?.is_relationship) {
    await notifyRelationshipOnReply({
      supabase: admin,
      conversationId: params.conversationId,
      orgId: params.orgId,
      contactName: params.name,
      messageExcerpt: "",
    })
    return true
  }
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
  // Obra única já é gravada; múltiplas obras → a Samara escolhe no Chat / Nicole pergunta.
  const obra = cliente.obras.length === 1 ? cliente.obras[0]! : null

  await applyRelationshipRouting(admin, {
    conversationId: params.conversationId,
    leadId: params.leadId,
    orgId: params.orgId,
    cliente: { cliente_id: cliente.cliente_id, nome: cliente.nome },
    obra: obra ? { obra_id: obra.obra_id, obra_name: obra.obra_name } : null,
    forward: { fromRaw: params.fromRaw, waConfig: params.waConfig },
  })

  return true
}

/**
 * Aplica o roteamento de relacionamento (compartilhado entre o webhook (76-2) e o
 * gate do `roleta-retry` (76-3)): marca a conversa como relacionamento + handoff,
 * tira o lead do funil, opcionalmente envia a msg de encaminhamento ao cliente e
 * notifica a gerente de relacionamento. `cliente`/`obra` podem ser null (ex.: cliente
 * confirmado pelo diálogo mas sem cadastro casado — a Samara identifica no Chat).
 */
export async function applyRelationshipRouting(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    conversationId: string
    leadId: string
    orgId: string
    cliente: { cliente_id: string; nome: string | null } | null
    obra: { obra_id: string; obra_name: string | null } | null
    forward: {
      fromRaw: string
      waConfig: { phone_number_id: string | null; access_token: string | null }
    } | null
  }
): Promise<void> {
  await admin
    .from("conversations")
    .update({
      is_relationship: true,
      relationship_checked: true,
      relationship_cliente_id: params.cliente?.cliente_id ?? null,
      relationship_obra_id: params.obra?.obra_id ?? null,
      is_ai_active: false,
      handoff_at: new Date().toISOString(),
      handoff_reason: RELATIONSHIP_HANDOFF_REASON,
    })
    .eq("id", params.conversationId)

  // Tira do funil de leads (é cliente, não lead).
  await admin.from("leads").update({ is_active: false }).eq("id", params.leadId)

  // Mensagem curta de encaminhamento ao cliente + registro no histórico (best-effort).
  if (params.forward) {
    try {
      await fetch(
        `https://graph.facebook.com/v21.0/${params.forward.waConfig.phone_number_id}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${params.forward.waConfig.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: params.forward.fromRaw,
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
  }

  await notifyRelationshipManagers(admin, params.orgId, {
    clienteNome: params.cliente?.nome ?? null,
    obraNome: params.obra?.obra_name ?? null,
  })
}

/**
 * Story 76-3 — Orquestra o roteamento a partir do `roleta-retry` (idle), quando o
 * diálogo foi classificado como `cliente_existente`. Reúne conversa/telefone/config,
 * tenta casar o cadastro (best-effort) e aplica o roteamento de relacionamento.
 * Retorna true se roteou. NÃO faz match por nome de forma decisiva — a classificação
 * por diálogo explícito é quem decide (evita falso-positivo de comprador real).
 */
export async function routeLeadIdToRelationship(
  admin: ReturnType<typeof createAdminClient>,
  leadId: string,
  orgId: string
): Promise<boolean> {
  const [{ data: lead }, { data: conv }] = await Promise.all([
    admin.from("leads").select("phone").eq("id", leadId).maybeSingle(),
    admin
      .from("conversations")
      .select("id, is_relationship")
      .eq("lead_id", leadId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (!conv || conv.is_relationship) return false

  // Best-effort: tenta casar o cadastro (telefone) p/ anexar cliente/obra; opcional.
  const ident = await identifyClientByContact(orgId, lead?.phone ?? null, null)
  const c = ident.candidates[0] ?? null
  const obra = c && c.obras.length === 1 ? c.obras[0]! : null

  const { data: wa } = await admin
    .from("whatsapp_config")
    .select("phone_number_id, access_token")
    .eq("org_id", orgId)
    .eq("status", "active")
    .maybeSingle()

  await applyRelationshipRouting(admin, {
    conversationId: conv.id as string,
    leadId,
    orgId,
    cliente: c ? { cliente_id: c.cliente_id, nome: c.nome } : null,
    obra: obra ? { obra_id: obra.obra_id, obra_name: obra.obra_name } : null,
    forward:
      lead?.phone && wa?.phone_number_id && wa?.access_token
        ? {
            fromRaw: lead.phone as string,
            waConfig: { phone_number_id: wa.phone_number_id, access_token: wa.access_token },
          }
        : null,
  })
  return true
}
