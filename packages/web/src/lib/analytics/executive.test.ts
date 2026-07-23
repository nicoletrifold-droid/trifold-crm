import { describe, it, expect } from "vitest"
import {
  pickGranularity,
  dayKey,
  weekKey,
  listPeriods,
  buildComparison,
  buildSourceTrend,
  buildHeatmap,
  classifyOutcome,
  buildOutcomeRows,
  buildVisits,
} from "./executive"

describe("chaves de período (BRT = UTC-3)", () => {
  it("dayKey vira o dia às 03:00 UTC (meia-noite BRT)", () => {
    expect(dayKey("2026-07-23T02:59:00Z")).toBe("2026-07-22")
    expect(dayKey("2026-07-23T03:00:00Z")).toBe("2026-07-23")
  })

  it("weekKey ancora na segunda-feira (domingo pertence à semana anterior)", () => {
    // 2026-07-20 é segunda; 2026-07-19 (domingo) pertence à semana de 13/07.
    expect(weekKey("2026-07-20T12:00:00Z")).toBe("2026-07-20")
    expect(weekKey("2026-07-19T12:00:00Z")).toBe("2026-07-13")
    expect(weekKey("2026-07-26T12:00:00Z")).toBe("2026-07-20")
  })

  it("listPeriods cobre a janela com zeros, inclusive semanas", () => {
    const days = listPeriods("2026-07-01T03:00:00Z", "2026-07-07T03:00:00Z", "day")
    expect(days).toHaveLength(7)
    expect(days[0]).toBe("2026-07-01")
    expect(days[6]).toBe("2026-07-07")

    const weeks = listPeriods("2026-07-01T03:00:00Z", "2026-07-23T03:00:00Z", "week")
    expect(weeks[0]).toBe("2026-06-29") // segunda da semana de 01/07
    expect(weeks).toContain("2026-07-20")
  })

  it("pickGranularity: semanal a partir de 42 dias", () => {
    expect(pickGranularity(30)).toBe("day")
    expect(pickGranularity(42)).toBe("week")
    expect(pickGranularity(90)).toBe("week")
  })
})

describe("buildComparison", () => {
  const from = "2026-07-21T03:00:00Z"
  const to = "2026-07-23T03:00:00Z"
  const prevFrom = "2026-07-18T03:00:00Z"
  const prevTo = "2026-07-20T03:00:00Z"

  it("alinha por índice de dia e acumula os dois períodos", () => {
    const current = ["2026-07-21T12:00:00Z", "2026-07-21T13:00:00Z", "2026-07-23T12:00:00Z"]
    const previous = ["2026-07-18T12:00:00Z"]
    const r = buildComparison(current, previous, from, to, prevFrom, prevTo)

    expect(r.points).toHaveLength(3)
    expect(r.points[0]!).toMatchObject({ index: 1, count: 2, cumulative: 2, prevCount: 1, prevCumulative: 1 })
    expect(r.points[1]!).toMatchObject({ count: 0, cumulative: 2, prevCount: 0, prevCumulative: 1 })
    expect(r.points[2]!).toMatchObject({ count: 1, cumulative: 3, prevCumulative: 1 })
    expect(r.totals).toEqual({ current: 3, previous: 1, deltaPct: 200 })
  })

  it("delta é null quando o período anterior não tem leads", () => {
    const r = buildComparison(["2026-07-21T12:00:00Z"], [], from, to, prevFrom, prevTo)
    expect(r.totals.deltaPct).toBeNull()
  })
})

describe("buildSourceTrend", () => {
  it("top N vira série própria e o resto dobra em Outros", () => {
    const rows = [
      { created_at: "2026-07-21T12:00:00Z", source: "meta_ads" },
      { created_at: "2026-07-21T13:00:00Z", source: "meta_ads" },
      { created_at: "2026-07-22T12:00:00Z", source: "whatsapp_organic" },
      { created_at: "2026-07-22T13:00:00Z", source: "telegram" },
      { created_at: "2026-07-22T14:00:00Z", source: null },
    ]
    const r = buildSourceTrend(rows, "2026-07-21T03:00:00Z", "2026-07-22T03:00:00Z", "day", { meta_ads: "Meta Ads" }, 2)

    expect(r.periods).toEqual(["2026-07-21", "2026-07-22"])
    expect(r.series.map((s) => s.key)).toEqual(["meta_ads", "whatsapp_organic", "__outros"])
    expect(r.series[0]!.label).toBe("Meta Ads")
    expect(r.series[0]!.data).toEqual([2, 0])
    expect(r.series[2]!.data).toEqual([0, 2]) // telegram + null dobram em Outros
    expect(r.total).toBe(5)
  })

  it("sem cauda não cria série Outros", () => {
    const rows = [{ created_at: "2026-07-21T12:00:00Z", source: "meta_ads" }]
    const r = buildSourceTrend(rows, "2026-07-21T03:00:00Z", "2026-07-21T03:00:00Z", "day", {}, 4)
    expect(r.series.map((s) => s.key)).toEqual(["meta_ads"])
  })
})

describe("buildHeatmap", () => {
  it("acumula por dia-da-semana × hora em BRT", () => {
    // 2026-07-23T14:30:00Z = 11:30 BRT, quinta-feira (getUTCDay=4)
    const r = buildHeatmap([
      { created_at: "2026-07-23T14:30:00Z" },
      { created_at: "2026-07-23T14:45:00Z" },
    ])
    expect(r.grid[4]![11]).toBe(2)
    expect(r.max).toBe(2)
    expect(r.total).toBe(2)
  })
})

describe("classifyOutcome / buildOutcomeRows", () => {
  const fechadoIds = new Set(["st-fechou"])

  it("prioriza fechado > perdido > ativo > outro", () => {
    expect(classifyOutcome({ stage_id: "st-fechou", lost_reason: "x", is_active: true }, fechadoIds)).toBe("fechado")
    expect(classifyOutcome({ stage_id: "st-1", lost_reason: "invalido", is_active: true }, fechadoIds)).toBe("perdido")
    expect(classifyOutcome({ stage_id: "st-1", lost_reason: null, is_active: true }, fechadoIds)).toBe("ativo")
    expect(classifyOutcome({ stage_id: "st-1", lost_reason: null, is_active: false }, fechadoIds)).toBe("outro")
  })

  it("agrega por chave, soma = total e ordena por volume", () => {
    const rows = [
      { stage_id: "st-fechou", lost_reason: null, is_active: false, source: "meta_ads" },
      { stage_id: "st-1", lost_reason: "sem retorno", is_active: false, source: "meta_ads" },
      { stage_id: "st-1", lost_reason: null, is_active: true, source: "meta_ads" },
      { stage_id: "st-1", lost_reason: null, is_active: true, source: "telegram" },
      { stage_id: "st-1", lost_reason: null, is_active: true, source: null },
    ]
    const r = buildOutcomeRows(rows, fechadoIds, (l) => l.source, (k) => k.toUpperCase())
    expect(r.map((x) => x.key)).toEqual(["meta_ads", "telegram"]) // null ignorado
    expect(r[0]!).toMatchObject({ label: "META_ADS", total: 3, fechados: 1, perdidos: 1, ativos: 1, outros: 0 })
    expect(r[0]!.fechados + r[0]!.ativos + r[0]!.perdidos + r[0]!.outros).toBe(r[0]!.total)
  })
})

describe("buildVisits", () => {
  it("classifica status nos baldes e calcula taxa de no-show sobre decididas", () => {
    const appts = [
      { scheduled_at: "2026-07-21T14:00:00Z", status: "completed" },
      { scheduled_at: "2026-07-21T15:00:00Z", status: "completed" },
      { scheduled_at: "2026-07-21T16:00:00Z", status: "no_show" },
      { scheduled_at: "2026-07-22T14:00:00Z", status: "scheduled" },
      { scheduled_at: "2026-07-22T15:00:00Z", status: "confirmed" },
      { scheduled_at: "2026-07-22T16:00:00Z", status: "cancelled" },
    ]
    const r = buildVisits(appts, "2026-07-21T03:00:00Z", "2026-07-22T03:00:00Z", "day")
    expect(r.realizadas).toEqual([2, 0])
    expect(r.noShow).toEqual([1, 0])
    expect(r.agendadas).toEqual([0, 2])
    expect(r.canceladas).toEqual([0, 1])
    expect(r.totals.taxaNoShow).toBe(33) // 1 de 3 decididas
  })

  it("taxa é null sem visitas decididas", () => {
    const r = buildVisits([{ scheduled_at: "2026-07-21T14:00:00Z", status: "scheduled" }], "2026-07-21T03:00:00Z", "2026-07-21T03:00:00Z", "day")
    expect(r.totals.taxaNoShow).toBeNull()
  })
})
