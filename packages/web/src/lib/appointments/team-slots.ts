import type { SupabaseClient } from "@supabase/supabase-js"
import { getOrgSchedule } from "@web/lib/roleta/business-time"
import { imobSlotsForDay, buildDayOptions, type ImobBusySlot } from "./imob-slots"

// Story 75-331 (Epic 89) — a grade de horários de UMA equipe, num dia.
//
// Extraído de `app/api/appointments/slots/route.ts` (Story 81-8) porque a rota
// PÚBLICA do formulário precisa exatamente da mesma conta. Duplicar a query de
// ocupados e a montagem dos slots significaria duas grades que divergem no
// primeiro ajuste — e a divergência apareceria como horário oferecido ao lead que
// na verdade já estava ocupado.
//
// Cada chamador mantém a SUA autorização: a rota interna com capability, a
// pública validando o token. Este helper não decide acesso.

export interface GradeDoDia {
  days: ReturnType<typeof buildDayOptions>
  slots?: ReturnType<typeof imobSlotsForDay>
  timezone: string
}

/**
 * Compromissos ativos da equipe numa janela. `scheduled` E `confirmed` ocupam:
 * pré-agendado bloqueia igual (decisão D1 do Epic 89).
 *
 * Story 81-1: house e imob não se enxergam — a query filtra por `team`.
 * Story 81-9: o conflito é por HORÁRIO, sem olhar o local.
 */
export async function ocupadosDaEquipe(
  supabase: SupabaseClient,
  orgId: string,
  team: "house" | "imob",
  deIso: string,
  ateIso: string
): Promise<ImobBusySlot[]> {
  const { data } = await supabase
    .from("appointments")
    .select("scheduled_at, duration_minutes")
    .eq("org_id", orgId)
    .eq("team", team)
    .in("status", ["scheduled", "confirmed"])
    .gte("scheduled_at", deIso)
    .lte("scheduled_at", ateIso)
  return (data ?? []) as ImobBusySlot[]
}

/**
 * Dias abertos e, quando `date` (YYYY-MM-DD) é válida, a grade daquele dia.
 *
 * A janela consultada tem folga de um dia para cada lado de propósito: o filtro
 * é por instante UTC e o dia é do fuso da org, então sem folga um compromisso na
 * borda escaparia da consulta e o slot apareceria livre.
 */
export async function gradeDaEquipe(params: {
  supabase: SupabaseClient
  orgId: string
  team: "house" | "imob"
  date?: string | null
  now?: Date
}): Promise<GradeDoDia> {
  const { supabase, orgId, team, date, now = new Date() } = params
  const { week, timezone } = await getOrgSchedule(orgId, supabase)

  const resultado: GradeDoDia = { days: buildDayOptions(timezone, week, now), timezone }

  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, mo, d] = date.split("-").map(Number) as [number, number, number]
    const inicio = new Date(Date.UTC(y, mo - 1, d - 1, 0, 0)).toISOString()
    const fim = new Date(Date.UTC(y, mo - 1, d + 2, 0, 0)).toISOString()
    const busy = await ocupadosDaEquipe(supabase, orgId, team, inicio, fim)
    resultado.slots = imobSlotsForDay({ y, mo, d, week, timezone, busy, now })
  }

  return resultado
}
