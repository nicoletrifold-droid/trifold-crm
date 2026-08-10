import { describe, expect, it } from "vitest"

import { QUALIFICACAO_LABELS, QUALIFICACAO_VALUES, parseQualificacao } from "./qualificacao"

// Story 84-2 (Epic 84) — whitelist do filtro de Qualificação Comercial (nada cru na query).
describe("parseQualificacao", () => {
  it("aceita só bom/regular/ruim/invalido/none", () => {
    expect(parseQualificacao("bom")).toBe("bom")
    expect(parseQualificacao("regular")).toBe("regular")
    expect(parseQualificacao("ruim")).toBe("ruim")
    expect(parseQualificacao("invalido")).toBe("invalido")
    expect(parseQualificacao("none")).toBe("none")
  })

  it("recusa vazio, indefinido, caixa errada e lixo (inclusive tentativa de injeção)", () => {
    expect(parseQualificacao("")).toBeNull()
    expect(parseQualificacao(undefined)).toBeNull()
    expect(parseQualificacao(null)).toBeNull()
    expect(parseQualificacao("BOM")).toBeNull()
    expect(parseQualificacao("otimo")).toBeNull()
    expect(parseQualificacao("bom,regular")).toBeNull()
    expect(parseQualificacao("null")).toBeNull()
  })

  it("todo valor da whitelist tem rótulo em PT", () => {
    for (const v of QUALIFICACAO_VALUES) expect(QUALIFICACAO_LABELS[v]).toBeTruthy()
  })
})
