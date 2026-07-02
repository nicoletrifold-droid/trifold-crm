import { createAdminClient } from "@web/lib/supabase/admin"
import { businessMinutesBetweenSchedule, getOrgSchedule } from "@web/lib/roleta/business-time"

/** Etapa "Aguardando atendimento" (stage novo). */
export const AGUARDANDO_STAGE_ID = "00000000-0000-0000-0001-000000000001"

/**
 * Minutos de HORÁRIO COMERCIAL que cada lead está aguardando atendimento,
 * contados desde a última distribuição (`lead_distribution_log`, status distributed).
 * Stories 75-49 (lista do corretor) / 75-91 (kanban do dashboard).
 *
 * Passe SÓ ids de leads em "Aguardando atendimento" ainda não atendidos. Usa admin
 * client porque `lead_distribution_log` costuma ser bloqueado por RLS pro JWT humano.
 * Leads sem distribuição registrada (ou só com distribuição no futuro) são omitidos.
 */
export async function computeWaitingMinutes(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  leadIds: string[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  if (leadIds.length === 0) return out

  const [{ week, timezone }, { data: distLog }, { data: leadStamps }] = await Promise.all([
    getOrgSchedule(orgId, admin),
    admin
      .from("lead_distribution_log")
      .select("lead_id, created_at")
      .eq("org_id", orgId)
      .eq("status", "distributed")
      .in("lead_id", leadIds),
    // Story 75-106: distribuido_em é a fonte primária (carimbo atômico com a atribuição).
    // Usamos COALESCE das duas fontes para (a) retrocompat com leads antigos (só log) e
    // (b) cobrir órfãos cujo insert em lead_distribution_log falhou (só distribuido_em).
    admin
      .from("leads")
      .select("id, distribuido_em")
      .eq("org_id", orgId)
      .in("id", leadIds),
  ])

  const now = new Date()
  const distByLead = new Map<string, number[]>()
  for (const d of (distLog ?? []) as Array<{ lead_id: string; created_at: string }>) {
    const arr = distByLead.get(d.lead_id) ?? []
    arr.push(new Date(d.created_at).getTime())
    distByLead.set(d.lead_id, arr)
  }
  for (const l of (leadStamps ?? []) as Array<{ id: string; distribuido_em: string | null }>) {
    if (!l.distribuido_em) continue
    const arr = distByLead.get(l.id) ?? []
    arr.push(new Date(l.distribuido_em).getTime())
    distByLead.set(l.id, arr)
  }
  for (const id of leadIds) {
    const dists = (distByLead.get(id) ?? []).filter((t) => t <= now.getTime())
    if (dists.length === 0) continue
    out[id] = businessMinutesBetweenSchedule(new Date(Math.max(...dists)), now, week, timezone)
  }
  return out
}
