import type { SupabaseClient } from "@supabase/supabase-js"
import { getUpcomingAppointmentsCount } from "@web/lib/agenda/appointments-count"
import { getBrokerUnreadTotal } from "@web/lib/broker/unread-count"

/**
 * Story 75-287 — contagens dos 4 badges do menu do corretor, extraídas do
 * `broker/layout.tsx` (que congela em navegação interna — mesma causa da
 * 75-223/75-286). Fonte única: consumida pelo layout (valor inicial SSR) e
 * pela rota /api/broker/nav-counts (badge vivo, 1 request p/ os 4 números).
 * Cliente user-scoped — mesma RLS do layout.
 *
 * Réguas preservadas literalmente:
 * - agenda: compromissos futuros scheduled/confirmed DO corretor (75-286 + broker_id)
 * - chat: não-lidas do corretor (RPC get_broker_unread_total, Story 63-19)
 * - leads: distribuídos após leads_notifications_seen_at (Story 75-8)
 * - bolsao: pool real — bolsao_em not null e sem dono (Stories 75-83/75-89)
 */
export interface BrokerNavCounts {
  agenda: number
  chat: number
  leads: number
  bolsao: number
}

export async function getBrokerNavCounts(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
): Promise<BrokerNavCounts> {
  const [agenda, chat, leads, bolsao] = await Promise.all([
    getUpcomingAppointmentsCount(supabase, orgId, { brokerId: userId }),
    getBrokerUnreadTotal(supabase, orgId, userId),
    getNewDistributedLeadsCount(supabase, orgId, userId),
    getBolsaoPoolCount(supabase, orgId),
  ])
  return { agenda, chat, leads, bolsao }
}

// Story 75-8 — novos leads distribuídos desde a última visita a "Meus Leads".
// Fonte: lead_distribution_log (broker_id = brokers.id; created_at > seen_at).
async function getNewDistributedLeadsCount(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
): Promise<number> {
  const { data: brokerRow } = await supabase
    .from("brokers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle()
  if (!brokerRow) return 0

  const { data: seenRow } = await supabase
    .from("users")
    .select("leads_notifications_seen_at")
    .eq("id", userId)
    .maybeSingle()
  const seenAt =
    (seenRow as { leads_notifications_seen_at: string | null } | null)
      ?.leads_notifications_seen_at ?? "1970-01-01T00:00:00Z"

  const { count } = await supabase
    .from("lead_distribution_log")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("broker_id", (brokerRow as { id: string }).id)
    .eq("status", "distributed")
    .gt("created_at", seenAt)
  return count ?? 0
}

// Story 75-83 — leads no bolsão (pool = bolsao_em not null). RLS
// leads_select_bolsao (migration 128) libera o pool p/ o corretor contar.
// Story 75-89: contar só o pool real (sem dono).
async function getBolsaoPoolCount(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  const { count } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("is_active", true)
    .not("bolsao_em", "is", null)
    .is("assigned_broker_id", null)
  return count ?? 0
}
