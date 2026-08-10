import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Story 75-286 — compromissos futuros e ativos da org (badge do menu "Agenda").
 * Regra única: status scheduled/confirmed com scheduled_at a partir de agora,
 * escopo org-wide (todos os corretores), coerente com a página /dashboard/agenda.
 * Usada pelo layout (valor inicial server-side) e pela rota
 * /api/agenda/appointments-count (badge vivo). Cliente user-scoped — mesma RLS
 * da página; não usa admin client.
 */
export async function getUpcomingAppointmentsCount(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  const { count } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .in("status", ["scheduled", "confirmed"])
    .gte("scheduled_at", new Date().toISOString())
  return count ?? 0
}
