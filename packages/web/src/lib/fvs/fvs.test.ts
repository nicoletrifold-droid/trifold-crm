// Story 75-293 — núcleo puro do FVS: parse do lote de locais + validações.
import { describe, it, expect } from "vitest"
import {
  parseLocaisLote,
  validateLocal,
  validateEquipe,
  validateFichaModelo,
  validateFichaItens,
} from "./fvs"

describe("parseLocaisLote", () => {
  it("uma linha por local, ignorando vazias", () => {
    const r = parseLocaisLote("Apto 101\n\n  Apto 102  \n")
    expect(r.locais).toEqual([
      { nome: "Apto 101", pavimento: null },
      { nome: "Apto 102", pavimento: null },
    ])
    expect(r.duplicados).toEqual([])
    expect(r.invalidos).toEqual([])
  })

  it("pavimento opcional após ';' ou TAB (colar da planilha)", () => {
    const r = parseLocaisLote("Apto 1401; 14\nHall 3º\t3")
    expect(r.locais).toEqual([
      { nome: "Apto 1401", pavimento: 14 },
      { nome: "Hall 3º", pavimento: 3 },
    ])
  })

  it("dedup case-insensitive — segunda ocorrência vai para duplicados", () => {
    const r = parseLocaisLote("Apto 101\napto 101")
    expect(r.locais).toHaveLength(1)
    expect(r.duplicados).toEqual(["apto 101"])
  })

  it("pavimento não-inteiro invalida a linha, sem derrubar o lote", () => {
    const r = parseLocaisLote("Apto 101; abc\nApto 102; 2")
    expect(r.invalidos).toEqual(["Apto 101; abc"])
    expect(r.locais).toEqual([{ nome: "Apto 102", pavimento: 2 }])
  })
})

describe("validateLocal", () => {
  it("nome obrigatório", () => {
    expect(validateLocal({ nome: "  " }, { partial: false }).ok).toBe(false)
  })
  it("tipo fora da lista é rejeitado", () => {
    const r = validateLocal({ nome: "Apto 101", tipo: "quarto" }, { partial: false })
    expect(r.ok).toBe(false)
  })
  it("pavimento precisa ser inteiro", () => {
    expect(validateLocal({ nome: "A", pavimento: 1.5 }, { partial: false }).ok).toBe(false)
    const ok = validateLocal({ nome: "A", pavimento: 14 }, { partial: false })
    expect(ok).toMatchObject({ ok: true, value: { nome: "A", pavimento: 14 } })
  })
  it("partial só valida o que veio", () => {
    expect(validateLocal({ ativo: false }, { partial: true })).toEqual({ ok: true, value: { ativo: false } })
  })
})

describe("validateEquipe", () => {
  it("tipo fora de interna/empreiteiro é rejeitado", () => {
    expect(validateEquipe({ nome: "X", tipo: "terceirizada" }, { partial: false }).ok).toBe(false)
  })
  it("aceita empreiteiro", () => {
    const r = validateEquipe({ nome: "Hidro SA", tipo: "empreiteiro" }, { partial: false })
    expect(r).toMatchObject({ ok: true, value: { nome: "Hidro SA", tipo: "empreiteiro" } })
  })
})

describe("validateFichaItens", () => {
  it("ficha sem itens é rejeitada", () => {
    expect(validateFichaItens([]).ok).toBe(false)
    expect(validateFichaItens(undefined).ok).toBe(false)
  })
  it("normaliza ordem pela posição do array", () => {
    const r = validateFichaItens([
      { descricao: "Prumo", tipo: "medida", unidade: "mm", tolerancia: "±3 mm em 2 m", ordem: 99 },
      { descricao: "Rejunte uniforme", tipo: "botao" },
    ])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value[0]).toMatchObject({ descricao: "Prumo", ordem: 0, unidade: "mm", tolerancia: "±3 mm em 2 m" })
      expect(r.value[1]).toMatchObject({ descricao: "Rejunte uniforme", ordem: 1, tipo: "botao" })
    }
  })
  it("item botão descarta unidade/tolerância; medida preserva", () => {
    const r = validateFichaItens([{ descricao: "X", tipo: "botao", unidade: "mm", tolerancia: "±1" }])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value[0]).toMatchObject({ unidade: null, tolerancia: null })
  })
  it("descrição vazia aponta o item pelo número", () => {
    const r = validateFichaItens([{ descricao: "ok", tipo: "botao" }, { descricao: " " }])
    expect(r).toEqual({ ok: false, error: "Item 2: descrição é obrigatória" })
  })
})

describe("validateFichaModelo", () => {
  it("título + pelo menos 1 item no modo completo", () => {
    expect(validateFichaModelo({ titulo: "", itens: [] }, { partial: false }).ok).toBe(false)
    expect(validateFichaModelo({ titulo: "FVS Cerâmica", itens: [] }, { partial: false }).ok).toBe(false)
  })
  it("foto_config default por_ficha; inválida é rejeitada", () => {
    const ok = validateFichaModelo(
      { titulo: "FVS", itens: [{ descricao: "A", tipo: "botao" }] },
      { partial: false }
    )
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.value.header.foto_config).toBe("por_ficha")
    const bad = validateFichaModelo(
      { titulo: "FVS", foto_config: "sempre", itens: [{ descricao: "A" }] },
      { partial: false }
    )
    expect(bad.ok).toBe(false)
  })
  it("partial sem itens não exige itens", () => {
    const r = validateFichaModelo({ titulo: "Novo título" }, { partial: true })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.itens).toBeNull()
  })
})
