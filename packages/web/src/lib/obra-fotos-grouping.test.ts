import { describe, expect, it } from "vitest"

import { fasesComFotos } from "./obra-fotos-grouping"

// Story 75-253 — quais fases merecem pílula de filtro. Dados reais de produção.
describe("fasesComFotos", () => {
  const f = (id: string, name: string, order_index: number) => ({ id, name, order_index })
  const foto = (fase_id: string | null) => ({ fase_id })

  it("🔴 O CASO DO VIND — 38 fases cadastradas, só as com foto viram pílula", () => {
    const fases = Array.from({ length: 38 }, (_, i) => f(`fase-${i}`, `FASE ${i}`, i + 1))
    // só 9 têm foto, espalhadas na ordem (como em produção: #1, #4, #8, #9, #11, #12, #19, #20, #23)
    const comFoto = [0, 3, 7, 8, 10, 11, 18, 19, 22]
    const fotos = comFoto.flatMap((i) => [foto(`fase-${i}`), foto(`fase-${i}`)])

    const r = fasesComFotos(fotos, fases)
    expect(r).toHaveLength(9)
    expect(r.every((x) => x.totalFotos === 2)).toBe(true)
  })

  it("AC2 — a contagem por fase é exata", () => {
    const fases = [f("a", "SUPERESTRUTURA", 8), f("b", "ALVENARIAS", 9)]
    const fotos = [foto("a"), foto("a"), foto("a"), foto("b")]
    expect(fasesComFotos(fotos, fases).map((x) => [x.name, x.totalFotos])).toEqual([
      ["SUPERESTRUTURA", 3],
      ["ALVENARIAS", 1],
    ])
  })

  it("respeita order_index, não a ordem das fotos", () => {
    const fases = [f("z", "ÚLTIMA", 20), f("a", "PRIMEIRA", 1)]
    const fotos = [foto("z"), foto("a")]
    expect(fasesComFotos(fotos, fases).map((x) => x.name)).toEqual(["PRIMEIRA", "ÚLTIMA"])
  })

  it("nome repetido do cronograma vira DUAS pílulas com contagens diferentes", () => {
    // no Vind, "REVESTIMENTOS E PAVIMENTOS" aparece 2× entre as que têm foto
    const fases = [f("r1", "REVESTIMENTOS E PAVIMENTOS", 11), f("r2", "REVESTIMENTOS E PAVIMENTOS", 12)]
    const fotos = [foto("r1"), foto("r2"), foto("r2")]
    expect(fasesComFotos(fotos, fases).map((x) => x.totalFotos)).toEqual([1, 2])
  })

  it("AC4 — CASO SOLUM (existe em produção): fotos todas SEM fase ⇒ nenhuma pílula", () => {
    expect(fasesComFotos([foto(null), foto(null), foto(null)], [])).toEqual([])
    // e mesmo havendo fases cadastradas, se nenhuma tem foto, a faixa não aparece
    expect(fasesComFotos([foto(null)], [f("a", "FUNDAÇÃO", 1)])).toEqual([])
  })

  it("foto com fase ÓRFÃ (fase_id que não existe em fases) não inventa pílula", () => {
    expect(fasesComFotos([foto("apagada")], [f("a", "FUNDAÇÃO", 1)])).toEqual([])
  })

  it("entradas vazias não quebram", () => {
    expect(fasesComFotos([], [])).toEqual([])
    expect(fasesComFotos([], [f("a", "X", 1)])).toEqual([])
  })
})
