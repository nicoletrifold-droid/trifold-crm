import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * "Dia comercial" para métricas de leads (Story 75-57).
 *
 * O dia NÃO vira à meia-noite, e sim no horário de FECHAMENTO comercial
 * (`roleta_config.business_hour_end`, hoje 20:00). Assim um lead que chega fora
 * do horário (ex.: 21:00, sem corretor) é contado no dia em que será trabalhado
 * (o seguinte), e a madrugada (00:00–08:00) conta no dia comercial atual.
 *
 * O servidor roda em America/Sao_Paulo (`instrumentation.ts` seta `process.env.TZ`),
 * então `new Date()`/`setHours` já estão em horário de Brasília — por isso o cálculo
 * usa horário local diretamente. `now` é injetável para testes determinísticos.
 */

export interface DayRange {
  /** Início inclusivo (use `.gte`). */
  from: Date
  /** Fim exclusivo (use `.lt`). */
  to: Date
}

export const DEFAULT_CLOSE_HOUR = "20:00"

/** Parseia "HH:MM" ou "HH:MM:SS" → {h, m}. Entrada vazia/inválida cai no fallback 20:00. */
function parseCloseHour(closeHour: string): { h: number; m: number } {
  const [hRaw, mRaw] = (closeHour ?? "").split(":")
  const h = Number(hRaw)
  const m = Number(mRaw)
  // Number("") === 0, então checa string vazia explicitamente antes de aceitar.
  if (hRaw === undefined || hRaw === "" || !Number.isInteger(h) || h < 0 || h > 23) {
    return { h: 20, m: 0 }
  }
  return { h, m: Number.isInteger(m) && m >= 0 && m <= 59 ? m : 0 }
}

/**
 * Dia comercial que CONTÉM `now`. Vira no fechamento:
 * - `now` antes do fechamento de hoje → janela [fechamento de ontem, fechamento de hoje)
 * - `now` no/depois do fechamento de hoje → janela [fechamento de hoje, fechamento de amanhã)
 */
export function commercialDayRange(now: Date, closeHour: string = DEFAULT_CLOSE_HOUR): DayRange {
  const { h, m } = parseCloseHour(closeHour)
  const closeToday = new Date(now)
  closeToday.setHours(h, m, 0, 0)

  if (now.getTime() < closeToday.getTime()) {
    const from = new Date(closeToday)
    from.setDate(from.getDate() - 1)
    return { from, to: closeToday }
  }
  const to = new Date(closeToday)
  to.setDate(to.getDate() + 1)
  return { from: closeToday, to }
}

/**
 * Dia comercial COMPLETO imediatamente anterior ao que contém `now`.
 * Usado pelo relatório diário (roda 07:59 BRT, antes da abertura): reporta o
 * último dia comercial já fechado.
 */
export function previousCommercialDayRange(now: Date, closeHour: string = DEFAULT_CLOSE_HOUR): DayRange {
  const current = commercialDayRange(now, closeHour)
  const to = current.from
  const from = new Date(to)
  from.setDate(from.getDate() - 1)
  return { from, to }
}

/** Lê `business_hour_end` da `roleta_config` do org; fallback 20:00. */
export async function getCloseHour(orgId: string, supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from("roleta_config")
    .select("business_hour_end")
    .eq("org_id", orgId)
    .maybeSingle()
  const raw = data?.business_hour_end as string | null | undefined
  return raw ? raw.slice(0, 5) : DEFAULT_CLOSE_HOUR
}

/** `commercialDayRange` usando o fechamento configurado do org. */
export async function commercialDayRangeForOrg(
  orgId: string,
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<DayRange> {
  const closeHour = await getCloseHour(orgId, supabase)
  return commercialDayRange(now, closeHour)
}

/** `previousCommercialDayRange` usando o fechamento configurado do org. */
export async function previousCommercialDayRangeForOrg(
  orgId: string,
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<DayRange> {
  const closeHour = await getCloseHour(orgId, supabase)
  return previousCommercialDayRange(now, closeHour)
}
