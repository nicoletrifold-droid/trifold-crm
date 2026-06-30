import { describe, it, expect } from "vitest"
import {
  normalizeName,
  selectByPhone,
  selectByName,
  resolveStatus,
  type RawCliente,
} from "./identify-client"

const C = (id: string, nome: string, telefone: string | null, whatsapp: string | null = telefone): RawCliente => ({
  id,
  nome,
  telefone,
  whatsapp,
})

const BASE: RawCliente[] = [
  C("c1", "Francisco José Scramin", "5544991280117"),
  C("c2", "Márcia Nery Scramin", "5544991256735"),
  C("c3", "Cliente Sem Whats", "5544999998888", null),
]

describe("normalizeName", () => {
  it("remove acentos, caixa e espaços extras", () => {
    expect(normalizeName("  Márcia   Nery  ")).toBe("marcia nery")
    expect(normalizeName("José")).toBe("jose")
    expect(normalizeName(null)).toBe("")
  })
})

describe("selectByPhone", () => {
  it("casa telefone canônico", () => {
    const norm = "5544991280117"
    expect(selectByPhone(norm, BASE).map((c) => c.id)).toEqual(["c1"])
  })

  it("tolera 9º dígito ausente na entrada (12 dígitos do Meta)", () => {
    // Entrada sem o 9 (12 dígitos) deve ser normalizada para 13 e casar.
    // normalizePhoneBR("554499761478") => "5544999761478"
    const base = [C("cx", "Cliente Nove", "5544999761478")]
    expect(selectByPhone("5544999761478", base).map((c) => c.id)).toEqual(["cx"])
  })

  it("casa pelo campo whatsapp quando telefone difere/nulo", () => {
    const base = [C("cw", "So Whats", null, "5544123456789")]
    expect(selectByPhone("5544123456789", base).map((c) => c.id)).toEqual(["cw"])
  })

  it("sem telefone de entrada → vazio", () => {
    expect(selectByPhone(null, BASE)).toEqual([])
  })

  it("telefone que não existe → vazio", () => {
    expect(selectByPhone("5511000000000", BASE)).toEqual([])
  })
})

describe("selectByName", () => {
  it("casa por igualdade exata (ignorando acento/caixa)", () => {
    expect(selectByName("marcia nery scramin", BASE).map((c) => c.id)).toEqual(["c2"])
    expect(selectByName("FRANCISCO JOSÉ SCRAMIN", BASE).map((c) => c.id)).toEqual(["c1"])
  })

  it("casa por conteúdo parcial (um contém o outro)", () => {
    expect(selectByName("Francisco", BASE).map((c) => c.id)).toEqual(["c1"])
  })

  it("nome curto (<3) não dispara match", () => {
    expect(selectByName("Jo", BASE)).toEqual([])
  })
})

describe("resolveStatus", () => {
  it("1 por telefone → phone_match", () => {
    const r = resolveStatus([BASE[0]!], [])
    expect(r.status).toBe("phone_match")
    expect(r.matched.map((c) => c.id)).toEqual(["c1"])
  })

  it(">1 por telefone → ambiguous", () => {
    expect(resolveStatus([BASE[0]!, BASE[1]!], []).status).toBe("ambiguous")
  })

  it("sem telefone, 1 por nome → name_match", () => {
    expect(resolveStatus([], [BASE[1]!]).status).toBe("name_match")
  })

  it(">1 por nome → ambiguous", () => {
    expect(resolveStatus([], [BASE[0]!, BASE[1]!]).status).toBe("ambiguous")
  })

  it("nada → none", () => {
    expect(resolveStatus([], []).status).toBe("none")
  })

  it("telefone tem prioridade sobre nome", () => {
    const r = resolveStatus([BASE[0]!], [BASE[1]!])
    expect(r.status).toBe("phone_match")
    expect(r.matched.map((c) => c.id)).toEqual(["c1"])
  })

  it("dedupe por id (mesmo cliente repetido no match) → phone_match", () => {
    expect(resolveStatus([BASE[0]!, BASE[0]!], []).status).toBe("phone_match")
  })
})
