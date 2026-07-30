import { describe, expect, it } from "vitest"

import { CALOR_LABELS, CALOR_VALUES, parseCalor } from "./calor"

// Story 75-236 — whitelist do filtro de Calor do Lead (nada cru na query).
describe("parseCalor", () => {
  it("aceita só hot/warm/cold/none", () => {
    expect(parseCalor("hot")).toBe("hot")
    expect(parseCalor("warm")).toBe("warm")
    expect(parseCalor("cold")).toBe("cold")
    expect(parseCalor("none")).toBe("none")
  })

  it("recusa vazio, indefinido, caixa errada e lixo (inclusive tentativa de injeção)", () => {
    expect(parseCalor("")).toBeNull()
    expect(parseCalor(undefined)).toBeNull()
    expect(parseCalor(null)).toBeNull()
    expect(parseCalor("HOT")).toBeNull()
    expect(parseCalor("quente")).toBeNull()
    expect(parseCalor("hot,warm")).toBeNull()
    expect(parseCalor("null")).toBeNull()
  })

  it("todo valor da whitelist tem rótulo em PT", () => {
    for (const v of CALOR_VALUES) expect(CALOR_LABELS[v]).toBeTruthy()
  })
})
