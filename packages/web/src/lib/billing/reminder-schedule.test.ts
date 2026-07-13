// Story 78-11 — Testes das funções puras do motor de lembretes (sem I/O, sem mock de Supabase).
// Cobre: sinal de diffDias vs diffDiasAteVencer (armadilha @po), overflow de dia-do-mês em
// avancarCiclo e os 3 gatilhos discretos + dedup por dia de deveAlertar (AC1-AC6).

import { describe, it, expect } from "vitest"
import {
  diffDias,
  diffDiasAteVencer,
  avancarCiclo,
  deveAlertar,
  toIsoDate,
  hojeSaoPaulo,
  type SaoPauloDate,
} from "./reminder-schedule"

const hoje: SaoPauloDate = { y: 2026, m: 7, d: 13 }

describe("diffDias — sinal herdado da 78-8 (positivo = já vencida)", () => {
  it("é POSITIVO para due no passado (vencida)", () => {
    expect(diffDias("2026-07-10", hoje)).toBe(3) // vencida há 3 dias
  })
  it("é NEGATIVO para due no futuro (ainda não venceu)", () => {
    expect(diffDias("2026-07-16", hoje)).toBe(-3)
  })
  it("é 0 no dia do vencimento", () => {
    expect(diffDias("2026-07-13", hoje)).toBe(0)
  })
  it("retorna null para data inválida", () => {
    expect(diffDias("lixo", hoje)).toBeNull()
  })
})

describe("diffDiasAteVencer — sinal INVERSO (positivo = falta vencer)", () => {
  it("é POSITIVO para due no futuro (faltam N dias)", () => {
    expect(diffDiasAteVencer("2026-07-16", hoje)).toBe(3)
  })
  it("é NEGATIVO para due no passado (vencida)", () => {
    expect(diffDiasAteVencer("2026-07-10", hoje)).toBe(-3)
  })
  it("é 0 no dia do vencimento", () => {
    expect(diffDiasAteVencer("2026-07-13", hoje)).toBe(0)
  })
  it("é sempre o oposto exato de diffDias (garante que não se pode confundir os dois)", () => {
    for (const due of ["2026-07-01", "2026-07-30", "2026-12-31"]) {
      expect(diffDiasAteVencer(due, hoje)).toBe(-(diffDias(due, hoje) as number))
    }
    // due == hoje: ambos são 0 (função normaliza -0 → 0 para comparações estritas)
    expect(diffDiasAteVencer("2026-07-13", hoje)).toBe(0)
  })
})

describe("avancarCiclo — clamp de dia-do-mês", () => {
  it("mensal simples", () => {
    expect(avancarCiclo("2026-07-13", "monthly")).toBe("2026-08-13")
  })
  it("mensal 31/01 → 28/02 (ano não-bissexto)", () => {
    expect(avancarCiclo("2026-01-31", "monthly")).toBe("2026-02-28")
  })
  it("mensal 31/01 → 29/02 (ano bissexto)", () => {
    expect(avancarCiclo("2028-01-31", "monthly")).toBe("2028-02-29")
  })
  it("mensal vira o ano (dez → jan)", () => {
    expect(avancarCiclo("2026-12-15", "monthly")).toBe("2027-01-15")
  })
  it("anual simples", () => {
    expect(avancarCiclo("2026-03-10", "annual")).toBe("2027-03-10")
  })
  it("anual 29/02 → 28/02 (próximo ano não-bissexto)", () => {
    expect(avancarCiclo("2028-02-29", "annual")).toBe("2029-02-28")
  })
  it("retorna null para data inválida", () => {
    expect(avancarCiclo("lixo", "monthly")).toBeNull()
  })
})

describe("deveAlertar — gatilhos discretos + dedup por dia", () => {
  const base = { alert_days_before: 3, last_alerted_on: null as string | null }

  it("D-N exato (due = hoje+3, N=3) → dispara (AC1)", () => {
    expect(deveAlertar({ ...base, due_date: "2026-07-16" }, hoje)).toBe(true)
  })
  it("fora dos pontos de disparo (due = hoje+5, N=3) → NÃO dispara (AC2)", () => {
    expect(deveAlertar({ ...base, due_date: "2026-07-18" }, hoje)).toBe(false)
  })
  it("D-N-1 (due = hoje+2, N=3) → NÃO dispara (só igualdade exata, não janela)", () => {
    expect(deveAlertar({ ...base, due_date: "2026-07-15" }, hoje)).toBe(false)
  })
  it("D-0 (due = hoje) → dispara (AC3)", () => {
    expect(deveAlertar({ ...base, due_date: "2026-07-13" }, hoje)).toBe(true)
  })
  it("vencida há 1 dia → dispara (AC4)", () => {
    expect(deveAlertar({ ...base, due_date: "2026-07-12" }, hoje)).toBe(true)
  })
  it("vencida há 30 dias → dispara (diário até pagar, AC4)", () => {
    expect(deveAlertar({ ...base, due_date: "2026-06-13" }, hoje)).toBe(true)
  })
  it("dedup: já alertou hoje → NÃO dispara de novo no mesmo dia (AC1/AC4)", () => {
    expect(
      deveAlertar({ ...base, due_date: "2026-07-12", last_alerted_on: "2026-07-13" }, hoje)
    ).toBe(false)
  })
  it("dedup: alertou ontem, hoje é D-0 → dispara de novo (AC3)", () => {
    expect(
      deveAlertar({ ...base, due_date: "2026-07-13", last_alerted_on: "2026-07-10" }, hoje)
    ).toBe(true)
  })
  it("last_alerted_on com sufixo de hora (timestamp) é normalizado por data", () => {
    expect(
      deveAlertar(
        { ...base, due_date: "2026-07-12", last_alerted_on: "2026-07-13T00:00:00.000Z" },
        hoje
      )
    ).toBe(false)
  })
  it("due_date inválida → NÃO dispara", () => {
    expect(deveAlertar({ ...base, due_date: "lixo" }, hoje)).toBe(false)
  })
})

describe("hojeSaoPaulo/toIsoDate — timezone (AC10)", () => {
  it("02:00 UTC ainda é o dia anterior em São Paulo (BRT = UTC-3)", () => {
    // 2026-07-13T02:00:00Z = 2026-07-12 23:00 em America/Sao_Paulo
    const d = hojeSaoPaulo(new Date("2026-07-13T02:00:00Z"))
    expect(toIsoDate(d)).toBe("2026-07-12")
  })
})
