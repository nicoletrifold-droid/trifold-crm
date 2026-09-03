import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { sendPushToUser } from "@web/lib/server/push-service"
import { leadDeepLink } from "@web/lib/leads/lead-url"
import { tentarAppUrl } from "@web/lib/tenancy/app-url-fallback"

/**
 * Story 75-361 — chama o corretor quando o lead insiste em preço.
 *
 * Medido em 90 dias (20/08/2026): **134 conversas** com lead pedindo valor,
 * **2** em que saiu um número. A Nicole respondia "os valores variam conforme o
 * andar…" e repetia a mesma frase — 7 vezes na pior conversa, inclusive
 * respondendo a "Sim.", "?" e "0k". Das 8 piores, 6 terminaram em
 * Perdido/Represamento e **4 nunca tiveram uma única fala de corretor**.
 *
 * Decisão do Marcos (caminho A): a política de preço NÃO muda — a Nicole segue
 * sem cotar, porque ela é SDR e o corretor é closer. O que muda é que na 2ª
 * insistência entra gente.
 *
 * Por que não reusar `notifyBrokerOnReply` (63-12): o gate Q1 dela exige que o
 * corretor JÁ tenha assumido a conversa (`role='broker'` nas últimas 24h) —
 * exatamente o oposto do caso aqui, em que ninguém assumiu. Reaproveitar
 * significaria afrouxar aquele gate e passar a notificar em toda mensagem de
 * lead sem dono, que é o spam que a 63-12 evitou de propósito.
 *
 * `assigned_broker_id` nulo → não notifica ninguém, sem fallback para gerente
 * (mesma decisão Q3 da 63-12). Medido: das 73 conversas que cruzariam o limiar
 * em 90 dias, **as 73 têm corretor atribuído** — o fallback seria código morto.
 *
 * Best-effort: NUNCA lança. Uma falha aqui não pode afetar o webhook nem o
 * pipeline da Nicole.
 */
export interface NotifyPriceEscalationParams {
  supabase: SupabaseClient
  leadId: string
  orgId: string
  /** Dono do lead resolvido pelo pipeline; se nulo, é buscado aqui. */
  brokerUserId?: string | null
  /** Quantas vezes o lead pediu preço (entra na copy). */
  pedidos: number
}

/** Payload do push (helper puro, testável sem banco). */
export function buildPriceEscalationPush(args: {
  leadName: string | null
  pedidos: number
  appUrl: string
  leadId: string
  ownerRole?: string | null
}): { title: string; body: string; url: string } {
  const { leadName, pedidos, appUrl, leadId, ownerRole } = args
  return {
    title: `${leadName ?? "Lead"} quer saber o valor`,
    body:
      `Pediu preço ${pedidos}x e a Nicole não cota. ` +
      `Assuma a conversa antes que ele desista.`,
    url: leadDeepLink(appUrl, ownerRole, leadId),
  }
}

export async function notifyBrokerOfPriceEscalation(
  params: NotifyPriceEscalationParams
): Promise<void> {
  try {
    const { supabase, leadId, orgId, pedidos } = params

    const { data: lead } = await supabase
      .from("leads")
      .select("id, name, assigned_broker_id, owner:users!assigned_broker_id(role)")
      .eq("id", leadId)
      .eq("org_id", orgId)
      .maybeSingle()

    const brokerUserId =
      params.brokerUserId ?? (lead?.assigned_broker_id as string | null) ?? null
    if (!brokerUserId) return

    // Story 900-66 (AC4) — o push É um deep link para o lead; sem URL base ele não sai.
    const base = tentarAppUrl(process.env.NEXT_PUBLIC_APP_URL, "lib/broker/notify-price-escalation", {
      orgId,
      leadId,
    })
    if (!base.ok) return
    const appUrl = base.url
    const owner = Array.isArray(lead?.owner) ? lead?.owner[0] : lead?.owner
    const payload = buildPriceEscalationPush({
      leadName: (lead?.name as string | null) ?? null,
      pedidos,
      appUrl,
      leadId,
      ownerRole: (owner as { role?: string } | null)?.role ?? null,
    })
    await sendPushToUser(supabase, brokerUserId, payload)
  } catch (err) {
    console.error("[notify-price-escalation] failed:", err)
  }
}
