import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Story 75-286 — compromissos futuros e ativos da org (badge do menu "Agenda").
 * Regra única: status scheduled/confirmed com scheduled_at a partir de agora.
 * Sem `brokerId`, escopo org-wide (menu do /dashboard, coerente com a página
 * /dashboard/agenda); com `brokerId` (Story 75-287), só os compromissos daquele
 * corretor (menu do /broker). Usada pelos layouts (valor inicial server-side) e
 * pelas rotas dos badges vivos. Cliente user-scoped — mesma RLS das páginas;
 * não usa admin client.
 */
export async function getUpcomingAppointmentsCount(
  supabase: SupabaseClient,
  orgId: string,
  opts?: { brokerId?: string },
): Promise<number> {
  let query = supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .in("status", ["scheduled", "confirmed"])
    .gte("scheduled_at", new Date().toISOString())
  if (opts?.brokerId) query = query.eq("broker_id", opts.brokerId)
  const { count } = await query
  return count ?? 0
}
