/**
 * Resolve o período selecionado no Analytics (filtro global da página).
 *
 * Isola a leitura do relógio fora do corpo do Server Component (evita o lint
 * react-hooks/purity), igual ao helper de "Sem contato". Retorna o intervalo
 * [sinceISO, untilISO) + nº de dias, a partir do `range` e das datas de Custom.
 */
export type AnalyticsRange = "7d" | "30d" | "90d" | "custom"

export interface ResolvedPeriod {
  range: AnalyticsRange
  sinceISO: string
  untilISO: string
  days: number
  /** Datas (yyyy-mm-dd) preservadas para os inputs de Custom. */
  from?: string
  to?: string
}

const PRESET_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 }

export function resolvePeriod(
  rangeRaw?: string,
  from?: string,
  to?: string
): ResolvedPeriod {
  const now = Date.now()

  // Custom com data inicial e final válidas.
  if (rangeRaw === "custom" && from && to) {
    const sinceMs = new Date(`${from}T00:00:00`).getTime()
    const untilMs = new Date(`${to}T23:59:59.999`).getTime()
    if (Number.isFinite(sinceMs) && Number.isFinite(untilMs) && untilMs > sinceMs) {
      const days = Math.max(1, Math.round((untilMs - sinceMs) / 86400000))
      return {
        range: "custom",
        sinceISO: new Date(sinceMs).toISOString(),
        untilISO: new Date(untilMs).toISOString(),
        days,
        from,
        to,
      }
    }
  }

  // Presets (default 30d).
  const range: AnalyticsRange =
    rangeRaw === "7d" || rangeRaw === "90d" ? rangeRaw : "30d"
  const days = PRESET_DAYS[range] ?? 30
  return {
    range,
    sinceISO: new Date(now - days * 86400000).toISOString(),
    untilISO: new Date(now).toISOString(),
    days,
  }
}
