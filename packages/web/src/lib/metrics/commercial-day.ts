import type { SupabaseClient } from "@supabase/supabase-js"
import {
  commercialDayRange,
  previousCommercialDayRange,
  getOrgSchedule,
  type DayRange,
} from "@web/lib/roleta/business-time"

/**
 * "Dia comercial" para métricas de leads (Story 75-57), agora CIENTE DA AGENDA
 * por dia da semana (Story 75-58). O dia vira no FECHAMENTO de cada dia útil
 * (não à meia-noite) e PULA dias fechados — lead em dia fechado/após o fechamento
 * conta no próximo dia útil.
 *
 * Estes adaptadores apenas carregam a agenda do org (`roleta_schedule`, via motor
 * único `business-time.ts`) e delegam o cálculo. As assinaturas são mantidas para
 * os call sites da 75-57 (dashboard, leads, metrics route, analytics, relatório).
 */

export type { DayRange }

/** Dia comercial atual do org. */
export async function commercialDayRangeForOrg(
  orgId: string,
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<DayRange> {
  const { week, timezone } = await getOrgSchedule(orgId, supabase)
  return commercialDayRange(now, week, timezone)
}

/** Dia comercial COMPLETO anterior (relatório diário, que roda antes da abertura). */
export async function previousCommercialDayRangeForOrg(
  orgId: string,
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<DayRange> {
  const { week, timezone } = await getOrgSchedule(orgId, supabase)
  return previousCommercialDayRange(now, week, timezone)
}
