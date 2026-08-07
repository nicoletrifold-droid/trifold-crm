import { describe, it, expect } from "vitest"
import {
  PROPERTY_STATUSES,
  PROPERTY_STATUS_OPTIONS,
  propertyStatusLabel,
  propertyStatusBadge,
} from "./property-status"

// Story 75-283 — "planning" apareceu em inglês na lista de Empreendimentos porque as telas
// traduziam só `selling` e `launching`, e o fallback imprimia o valor cru do Postgres.

describe("propertyStatusLabel", () => {
  it("traduz TODOS os valores do enum — nenhum vaza em inglês", () => {
    for (const status of PROPERTY_STATUSES) {
      const label = propertyStatusLabel(status)
      expect(label).not.toBe(status)
      expect(label).not.toMatch(/^[a-z_]+$/) // nada de snake_case cru na tela
    }
  })

  it("traduz o caso que quebrou (Solun e Japura em planejamento)", () => {
    expect(propertyStatusLabel("planning")).toBe("Planejamento")
  })

  it("mantém os que já funcionavam", () => {
    expect(propertyStatusLabel("selling")).toBe("Em venda")
    expect(propertyStatusLabel("launching")).toBe("Lançamento")
  })

  it("cobre os que ninguém tinha traduzido", () => {
    expect(propertyStatusLabel("delivered")).toBe("Entregue")
    expect(propertyStatusLabel("sold_out")).toBe("Esgotado")
  })

  it("valor fora do enum é exibido cru (melhor que sumir), e vazio vira travessão", () => {
    expect(propertyStatusLabel("valor_futuro")).toBe("valor_futuro")
    expect(propertyStatusLabel(null)).toBe("—")
    expect(propertyStatusLabel(undefined)).toBe("—")
    expect(propertyStatusLabel("")).toBe("—")
  })
})

describe("propertyStatusBadge", () => {
  it("preserva a paleta que já estava em produção", () => {
    expect(propertyStatusBadge("selling")).toContain("green")
    expect(propertyStatusBadge("launching")).toContain("blue")
    expect(propertyStatusBadge("planning")).toContain("gray")
  })

  it("todo status do enum tem classe de light E dark mode", () => {
    for (const status of PROPERTY_STATUSES) {
      const cls = propertyStatusBadge(status)
      expect(cls).toMatch(/\bbg-/)
      expect(cls).toMatch(/dark:/)
    }
  })

  it("status desconhecido não fica sem estilo", () => {
    expect(propertyStatusBadge("valor_futuro")).toMatch(/\bbg-/)
    expect(propertyStatusBadge(null)).toMatch(/\bbg-/)
  })
})

describe("PROPERTY_STATUS_OPTIONS", () => {
  it("cobre o enum inteiro, na ordem, com o mesmo rótulo da exibição", () => {
    expect(PROPERTY_STATUS_OPTIONS.map((o) => o.value)).toEqual([
      ...PROPERTY_STATUSES,
    ])
    for (const opt of PROPERTY_STATUS_OPTIONS) {
      expect(opt.label).toBe(propertyStatusLabel(opt.value))
    }
  })
})
