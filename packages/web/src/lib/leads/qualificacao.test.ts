import { describe, expect, it } from "vitest"

import { QUALIFICACAO_LABELS, QUALIFICACAO_VALUES, parseQualificacao, qualificacaoEstaMudando } from "./qualificacao"

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

// Fix 31/08/2026 — o reenvio do valor atual (todo save dos forms) NÃO é mudança.
describe("qualificacaoEstaMudando", () => {
  it("campo ausente do payload não é mudança", () => {
    expect(qualificacaoEstaMudando("bom", undefined)).toBe(false)
    expect(qualificacaoEstaMudando(null, undefined)).toBe(false)
  })

  it("reenvio do mesmo valor não é mudança", () => {
    expect(qualificacaoEstaMudando("bom", "bom")).toBe(false)
    expect(qualificacaoEstaMudando(null, null)).toBe(false)
  })

  it("null e string vazia são o mesmo 'não definido'", () => {
    expect(qualificacaoEstaMudando(null, "")).toBe(false)
    expect(qualificacaoEstaMudando("", null)).toBe(false)
  })

  it("definir, trocar ou limpar É mudança", () => {
    expect(qualificacaoEstaMudando(null, "bom")).toBe(true)
    expect(qualificacaoEstaMudando("bom", "regular")).toBe(true)
    expect(qualificacaoEstaMudando("bom", null)).toBe(true)
    expect(qualificacaoEstaMudando("bom", "")).toBe(true)
  })
})
