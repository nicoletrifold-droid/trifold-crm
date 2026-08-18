import { describe, it, expect } from "vitest"
import {
  formatarTelefoneBR,
  formatarTelefone,
  montarTelefone,
  separarTelefone,
  telefoneCompleto,
  apenasDigitos,
} from "./phone-mask"
import { normalizePhoneBR } from "@trifold/shared"

// Story 75-338 — máscara do telefone. Erro de máscara só se vê digitando, e o
// projeto não tem jsdom: a conta vem para cá.

describe("formatarTelefoneBR — progressiva", () => {
  it("formata enquanto digita, sem esperar o número completo", () => {
    expect(formatarTelefoneBR("")).toBe("")
    expect(formatarTelefoneBR("4")).toBe("(4")
    expect(formatarTelefoneBR("44")).toBe("(44")
    expect(formatarTelefoneBR("449")).toBe("(44) 9")
    expect(formatarTelefoneBR("449999")).toBe("(44) 9999")
  })

  it("🔴 fixo e celular quebram o hífen em lugares diferentes", () => {
    // A diferença só existe no 11º dígito. Quebrar antes disso deixaria o fixo
    // com o hífen no lugar errado durante a digitação.
    expect(formatarTelefoneBR("4433334444")).toBe("(44) 3333-4444") // 10 = fixo
    expect(formatarTelefoneBR("44999994444")).toBe("(44) 99999-4444") // 11 = celular
  })

  it("descarta o que passa de 11 dígitos", () => {
    expect(formatarTelefoneBR("4499999444455555")).toBe("(44) 99999-4444")
  })

  it("ignora o que a pessoa digita de não-numérico", () => {
    expect(formatarTelefoneBR("(44) 99999-4444")).toBe("(44) 99999-4444")
    expect(formatarTelefoneBR("44 abc 99999 def 4444")).toBe("(44) 99999-4444")
  })
})

describe("formatarTelefone — fora do Brasil", () => {
  it("não inventa formato: agrupa em blocos de 3", () => {
    expect(formatarTelefone("912345678", "351")).toBe("912 345 678")
  })

  it("respeita o máximo de dígitos do país", () => {
    expect(apenasDigitos("12345678901234", 9)).toHaveLength(9)
  })
})

describe("montarTelefone / separarTelefone", () => {
  it("grava com DDI e volta a separar", () => {
    const v = montarTelefone("55", "44999994444")
    expect(v).toBe("+55 (44) 99999-4444")
    expect(separarTelefone(v)).toEqual({ ddi: "55", nacional: "(44) 99999-4444" })
  })

  it("vazio não vira '+55 '", () => {
    expect(montarTelefone("55", "")).toBe("")
  })

  it("valor antigo sem DDI volta como Brasil", () => {
    // Formulário preenchido antes desta story guardava só o número.
    expect(separarTelefone("44999994444")).toEqual({ ddi: "55", nacional: "44999994444" })
  })

  it("DDI desconhecido cai no padrão em vez de quebrar", () => {
    expect(separarTelefone("+999 12345").ddi).toBe("55")
  })
})

describe("🔴 o valor gravado sobrevive ao normalizePhoneBR", () => {
  // É o que a API usa para achar/criar o lead. Se a máscara quebrasse isso, o
  // lead não seria encontrado e duplicaria a cada preenchimento.
  it("celular brasileiro mascarado normaliza igual ao número cru", () => {
    const mascarado = montarTelefone("55", "44999994444")
    expect(normalizePhoneBR(mascarado)).toBe(normalizePhoneBR("5544999994444"))
    expect(normalizePhoneBR(mascarado)).toBeTruthy()
  })

  it("fixo brasileiro também", () => {
    expect(normalizePhoneBR(montarTelefone("55", "4433334444"))).toBeTruthy()
  })
})

describe("telefoneCompleto", () => {
  it("Brasil aceita fixo (10) e celular (11)", () => {
    expect(telefoneCompleto("443333444", "55")).toBe(false) // 9
    expect(telefoneCompleto("4433334444", "55")).toBe(true) // 10
    expect(telefoneCompleto("44999994444", "55")).toBe(true) // 11
  })

  it("fora do Brasil exige o comprimento cheio", () => {
    expect(telefoneCompleto("91234567", "351")).toBe(false)
    expect(telefoneCompleto("912345678", "351")).toBe(true)
  })
})
