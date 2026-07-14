// Story 78-12 — Testes das funções puras de agregação/janela/comparação (sem I/O, sem mock de
// Supabase). Cobre: janela do mês anterior + virada de ano, últimoDiaDoMes, janelas MTD (dia 1 →
// null, clamp de fim-de-mês), percentual MoM (incl. divisão por zero), agregações por moeda,
// exclusão de Meta Ads do total e de bookkeeping do uso técnico, e os gatilhos de anomalia.

import { describe, it, expect } from "vitest"
import {
  ultimoDiaDoMes,
  mesAnterior,
  mtdWindows,
  percentualMoM,
  somarMonetarioPorServicoMoeda,
  somarTotalPorMoeda,
  somarTecnicoPorServicoMetrica,
  somarPorMoeda,
  avaliarAnomalias,
  ANOMALY_MOM_THRESHOLD,
  type CostRow,
} from "./cost-summary"
import { type SaoPauloDate } from "./reminder-schedule"

describe("ultimoDiaDoMes", () => {
  it("fevereiro não-bissexto = 28", () => expect(ultimoDiaDoMes(2026, 2)).toBe(28))
  it("fevereiro bissexto = 29", () => expect(ultimoDiaDoMes(2024, 2)).toBe(29))
  it("abril = 30", () => expect(ultimoDiaDoMes(2026, 4)).toBe(30))
  it("janeiro = 31", () => expect(ultimoDiaDoMes(2026, 1)).toBe(31))
})

describe("mesAnterior", () => {
  it("mês comum: julho → junho", () => {
    const r = mesAnterior({ y: 2026, m: 7, d: 1 })
    expect(r.periodo).toBe("2026-06")
    expect(r.inicio).toBe("2026-06-01")
    expect(r.fim).toBe("2026-06-30")
  })
  it("virada de ano: janeiro → dezembro do ano anterior", () => {
    const r = mesAnterior({ y: 2026, m: 1, d: 1 })
    expect(r.periodo).toBe("2025-12")
    expect(r.inicio).toBe("2025-12-01")
    expect(r.fim).toBe("2025-12-31")
  })
})

describe("mtdWindows", () => {
  it("dia 1 → null (sem 'ontem' no mês corrente)", () => {
    expect(mtdWindows({ y: 2026, m: 7, d: 1 })).toBeNull()
  })
  it("dia comum: MTD = [dia 1, ontem], mesmo intervalo no mês anterior", () => {
    const w = mtdWindows({ y: 2026, m: 7, d: 11 })!
    expect(w.periodoAtual).toBe("2026-07")
    expect(w.atualInicio).toBe("2026-07-01")
    expect(w.atualFim).toBe("2026-07-10")
    expect(w.anteriorInicio).toBe("2026-06-01")
    expect(w.anteriorFim).toBe("2026-06-10")
  })
  it("clamp: mês corrente com mais dias que o anterior (31/03 → fev 28)", () => {
    // hoje = 31/03/2026, ontem = 30 → mês anterior fev só tem 28 → clamp para 28
    const w = mtdWindows({ y: 2026, m: 3, d: 31 })!
    expect(w.atualFim).toBe("2026-03-30")
    expect(w.anteriorInicio).toBe("2026-02-01")
    expect(w.anteriorFim).toBe("2026-02-28")
  })
  it("virada de ano: janeiro compara com dezembro do ano anterior", () => {
    const w = mtdWindows({ y: 2026, m: 1, d: 6 })!
    expect(w.periodoAtual).toBe("2026-01")
    expect(w.atualFim).toBe("2026-01-05")
    expect(w.anteriorInicio).toBe("2025-12-01")
    expect(w.anteriorFim).toBe("2025-12-05")
  })
})

describe("percentualMoM", () => {
  it("aumento normal", () => expect(percentualMoM(150, 100)).toBeCloseTo(0.5))
  it("queda", () => expect(percentualMoM(70, 100)).toBeCloseTo(-0.3))
  it("mês anterior 0 e atual > 0 → Infinity (anomalia por definição)", () => {
    expect(percentualMoM(10, 0)).toBe(Infinity)
  })
  it("ambos 0 → 0 (nada a avaliar)", () => {
    expect(percentualMoM(0, 0)).toBe(0)
  })
})

describe("somarMonetarioPorServicoMoeda / somarTotalPorMoeda", () => {
  const rows: CostRow[] = [
    { service_id: "anthropic", metric: "cost_usd", value: 50, currency: "USD" },
    { service_id: "anthropic", metric: "cost_usd", value: 70, currency: "USD" },
    { service_id: "openai", metric: "cost_usd", value: 30, currency: "USD" },
    { service_id: "supabase", metric: "cost_brl", value: 200, currency: "BRL" },
    { service_id: "meta_ads", metric: "spend", value: 500, currency: "USD" },
    { service_id: "supabase", metric: "requests", value: 9999, currency: null },
  ]

  it("agrega por (serviço, moeda)", () => {
    const m = somarMonetarioPorServicoMoeda(rows)
    expect(m.get("anthropic:USD")?.total).toBe(120)
    expect(m.get("openai:USD")?.total).toBe(30)
    expect(m.get("supabase:BRL")?.total).toBe(200)
  })

  it("total por moeda nunca soma USD+BRL e exclui Meta Ads (CON-8)", () => {
    const total = somarTotalPorMoeda(rows, new Set(["meta_ads"]))
    expect(total.get("USD")).toBe(150) // anthropic 120 + openai 30 (meta_ads 500 excluído)
    expect(total.get("BRL")).toBe(200)
  })
})

describe("somarTecnicoPorServicoMetrica — exclui bookkeeping", () => {
  it("mantém uso técnico real, remove collection_error/collection_health_alert_sent", () => {
    const rows: CostRow[] = [
      { service_id: "supabase", metric: "requests", value: 1000, currency: null },
      { service_id: "supabase", metric: "egress_bytes", value: 2048, currency: null },
      { service_id: "supabase", metric: "collection_error", value: 3, currency: null },
      { service_id: "anthropic", metric: "collection_health_alert_sent", value: 1, currency: null },
      { service_id: "anthropic", metric: "cost_usd", value: 50, currency: "USD" }, // monetário: ignorado
    ]
    const t = somarTecnicoPorServicoMetrica(rows)
    expect(t.get("supabase:requests")?.total).toBe(1000)
    expect(t.get("supabase:egress_bytes")?.total).toBe(2048)
    expect(t.has("supabase:collection_error")).toBe(false)
    expect(t.has("anthropic:collection_health_alert_sent")).toBe(false)
    expect(t.has("anthropic:cost_usd")).toBe(false)
  })
})

describe("avaliarAnomalias", () => {
  it("MoM dispara exatamente no limiar de +50% (AC6)", () => {
    const triggers = avaliarAnomalias({
      atualPorMoeda: new Map([["USD", 150]]),
      anteriorPorMoeda: new Map([["USD", 100]]),
      thresholdAbsoluto: null,
    })
    expect(triggers).toHaveLength(1)
    expect(triggers[0]?.type).toBe("cost_anomaly_mom")
    expect(triggers[0]?.percentual).toBeCloseTo(ANOMALY_MOM_THRESHOLD)
  })

  it("MoM NÃO dispara abaixo do limiar (+30%) (AC7)", () => {
    const triggers = avaliarAnomalias({
      atualPorMoeda: new Map([["USD", 130]]),
      anteriorPorMoeda: new Map([["USD", 100]]),
      thresholdAbsoluto: null,
    })
    expect(triggers).toHaveLength(0)
  })

  it("threshold absoluto dispara mesmo sem aumento percentual (AC8)", () => {
    const triggers = avaliarAnomalias({
      atualPorMoeda: new Map([["USD", 105]]),
      anteriorPorMoeda: new Map([["USD", 110]]), // queda → sem MoM
      thresholdAbsoluto: 100,
    })
    expect(triggers).toHaveLength(1)
    expect(triggers[0]?.type).toBe("threshold_absolute")
  })

  it("os dois tipos podem disparar no mesmo mês", () => {
    const triggers = avaliarAnomalias({
      atualPorMoeda: new Map([["USD", 300]]),
      anteriorPorMoeda: new Map([["USD", 100]]), // +200% MoM
      thresholdAbsoluto: 100, // 300 >= 100
    })
    const tipos = triggers.map((t) => t.type).sort()
    expect(tipos).toEqual(["cost_anomaly_mom", "threshold_absolute"])
  })

  it("mês anterior sem gasto e atual > 0 → anomalia MoM (percentual infinito)", () => {
    const triggers = avaliarAnomalias({
      atualPorMoeda: new Map([["USD", 42]]),
      anteriorPorMoeda: new Map(),
      thresholdAbsoluto: null,
    })
    expect(triggers).toHaveLength(1)
    expect(triggers[0]?.type).toBe("cost_anomaly_mom")
    expect(triggers[0]?.percentual).toBe(Infinity)
  })

  it("sem gasto no mês corrente → nenhum trigger", () => {
    const triggers = avaliarAnomalias({
      atualPorMoeda: new Map(),
      anteriorPorMoeda: new Map([["USD", 100]]),
      thresholdAbsoluto: 50,
    })
    expect(triggers).toHaveLength(0)
  })
})

describe("somarPorMoeda", () => {
  it("soma monetária por moeda de uma janela", () => {
    const rows: CostRow[] = [
      { service_id: "x", metric: "cost_usd", value: 10, currency: "USD" },
      { service_id: "x", metric: "cost_usd", value: 5, currency: "USD" },
      { service_id: "x", metric: "requests", value: 999, currency: null },
    ]
    const m = somarPorMoeda(rows)
    expect(m.get("USD")).toBe(15)
    expect(m.has("null")).toBe(false)
  })
})

// Guard de tipo para uso local (garante compilação com o import do tipo).
const _sample: SaoPauloDate = { y: 2026, m: 7, d: 13 }
void _sample
