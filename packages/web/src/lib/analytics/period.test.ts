/**
 * Story 75-324 — a janela de "Custom" é ancorada em Brasília, não no fuso do servidor.
 *
 * Sem o offset explícito, `new Date("2026-08-09T00:00:00")` valia o fuso do processo —
 * UTC na Vercel, BRT na máquina de quem desenvolve. O mesmo período dava recortes
 * diferentes em produção e no local, e o gráfico de Visitas (que agrupa em BRT) ganhava
 * uma coluna fantasma do dia anterior.
 */
import { describe, it, expect } from "vitest"
import { resolvePeriod } from "./period"

describe("resolvePeriod — Custom em BRT", () => {
  it("00:00 de Brasília = 03:00Z do mesmo dia", () => {
    const p = resolvePeriod("custom", "2026-08-09", "2026-08-16")
    expect(p.sinceISO).toBe("2026-08-09T03:00:00.000Z")
  })

  it("23:59:59.999 de Brasília do último dia = 02:59:59.999Z do dia seguinte", () => {
    const p = resolvePeriod("custom", "2026-08-09", "2026-08-16")
    expect(p.untilISO).toBe("2026-08-17T02:59:59.999Z")
  })

  it("dias inclusivos nas duas pontas (09→16 são 8 dias, não 7)", () => {
    const p = resolvePeriod("custom", "2026-08-09", "2026-08-16")
    expect(p.days).toBe(8)
  })

  it("preserva as datas cruas para os inputs do seletor", () => {
    const p = resolvePeriod("custom", "2026-08-09", "2026-08-16")
    expect(p.from).toBe("2026-08-09")
    expect(p.to).toBe("2026-08-16")
  })

  it("intervalo invertido cai no preset padrão de 30 dias", () => {
    const p = resolvePeriod("custom", "2026-08-16", "2026-08-09")
    expect(p.range).toBe("30d")
    expect(p.days).toBe(30)
  })

  it("presets seguem janelas móveis a partir de agora", () => {
    for (const [range, days] of [["7d", 7], ["30d", 30], ["90d", 90]] as const) {
      const p = resolvePeriod(range)
      expect(p.range).toBe(range)
      expect(p.days).toBe(days)
    }
  })
})
