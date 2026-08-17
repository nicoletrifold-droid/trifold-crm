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
  //
  // Story 75-324 — o offset de Brasília é EXPLÍCITO. Sem ele, `new Date("...T00:00:00")`
  // é interpretado no fuso do SERVIDOR, que na Vercel é UTC: pedir 09/08 → 16/08 na tela
  // recortava de 08/08 21:00 a 16/08 20:59 BRT. O gráfico de Visitas, que agrupa em BRT
  // (`dayKey`, UTC-3 fixo), ganhava uma coluna fantasma de 08/08 e perdia as três últimas
  // horas do último dia. Na janela auditada em 17/08 isso não moveu nenhum número — zero
  // leads e zero visitas caíram nas bordas —, mas é erro que aparece sozinho um dia.
  //
  // -03:00 fixo é a mesma convenção do resto do analytics (`brtShift` em executive.ts):
  // o Brasil não tem horário de verão desde 2019.
  if (rangeRaw === "custom" && from && to) {
    const sinceMs = new Date(`${from}T00:00:00.000-03:00`).getTime()
    const untilMs = new Date(`${to}T23:59:59.999-03:00`).getTime()
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
