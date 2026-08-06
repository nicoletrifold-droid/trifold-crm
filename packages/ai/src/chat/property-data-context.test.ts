import { describe, it, expect } from "vitest"
import { buildPropertyDataContext } from "./pipeline"

// Story 75-64: a linha de estoque do contexto dinamico deve enquadrar escassez
// (ancora no que JA FOI VENDIDO), nunca apresentar disponiveis como abundancia.

const VIND = {
  id: "00000000-0000-0000-0004-000000000001",
  name: "Vind Residence",
  slug: "vind-residence",
  status: "selling",
  total_units: 48,
  available_units: 13,
  reserved_units: 0,
  sold_units: 35,
}

describe("buildPropertyDataContext — estoque/escassez (Story 75-64)", () => {
  it("AC1: total>0 → ancora no vendido com % e 'restam apenas N', sem o formato antigo", () => {
    const ctx = buildPropertyDataContext([VIND], VIND.id)
    expect(ctx).toContain("35 de 48 unidades ja vendidas (73% vendido)")
    expect(ctx).toContain("restam apenas 13 disponiveis")
    expect(ctx).toMatch(/SUTILEZA/)
    // formato antigo NAO deve mais aparecer
    expect(ctx).not.toContain("13 disponiveis, 0 reservadas, 35 vendidas")
    expect(ctx).not.toMatch(/\(total: 48\)/)
  })

  it("AC2: total=0 → sem divisao por zero e sem '0% vendido, restam 0'", () => {
    const ctx = buildPropertyDataContext(
      [{ ...VIND, total_units: 0, available_units: 0, sold_units: 0 }],
      VIND.id
    )
    expect(ctx).not.toContain("% vendido")
    expect(ctx).not.toContain("restam apenas 0 disponiveis")
    expect(ctx).not.toContain("NaN")
  })

  it("AC2b: total=0 mas com disponiveis → usa fallback 'restam apenas N'", () => {
    const ctx = buildPropertyDataContext(
      [{ ...VIND, total_units: 0, available_units: 5, sold_units: 0 }],
      VIND.id
    )
    expect(ctx).toContain("restam apenas 5 unidades disponiveis")
    expect(ctx).not.toContain("% vendido")
  })

  it("lista vazia → string vazia", () => {
    expect(buildPropertyDataContext([], null)).toBe("")
  })

  // Story 75-65 — enquadramento por estagio de vendas
  it("AC1 (regressão): empreendimento maduro (>=40% vendido) mantém o formato 75-64", () => {
    const ctx = buildPropertyDataContext([{ ...VIND, total_units: 60, sold_units: 51, available_units: 9 }], VIND.id)
    expect(ctx).toContain("51 de 60 unidades ja vendidas (85% vendido)")
    expect(ctx).toContain("restam apenas 9 disponiveis")
    expect(ctx).not.toContain("LANCAMENTO")
  })

  it("AC2: poucas vendas (<40%) → enquadramento de lançamento, sem % vendido nem 'restam apenas'", () => {
    const ctx = buildPropertyDataContext(
      [{ ...VIND, name: "Novo Empreendimento", total_units: 60, sold_units: 0, available_units: 60, status: "selling" }],
      VIND.id
    )
    expect(ctx).toMatch(/LANCAMENTO\/fase inicial/)
    expect(ctx).not.toMatch(/\d+% vendido/) // sem percentual numerico (a instrucao menciona "% vendido baixo" em texto)
    expect(ctx).not.toContain("restam apenas 60")
    expect(ctx).not.toContain("0 de 60")
  })

  it("AC2: status pré-lançamento força enquadramento de lançamento mesmo com vendas", () => {
    const ctx = buildPropertyDataContext(
      [{ ...VIND, total_units: 60, sold_units: 30, available_units: 30, status: "launching" }],
      VIND.id
    )
    expect(ctx).toMatch(/LANCAMENTO\/fase inicial/)
    expect(ctx).not.toContain("50% vendido")
  })

  it("AC3: esgotado (available=0) → sinaliza ESGOTADO, sem 'restam apenas 0'", () => {
    const ctx = buildPropertyDataContext(
      [{ ...VIND, total_units: 48, sold_units: 48, available_units: 0 }],
      VIND.id
    )
    expect(ctx).toContain("ESGOTADO")
    expect(ctx).not.toContain("restam apenas 0")
  })
})

// Story 75-281: empreendimento em planejamento (ex.: Solun e Japura, cadastrados em
// 06/08/2026 apenas para permitir vinculo de lead) precisa ser RECONHECIDO pela Nicole
// mas nunca OFERECIDO — nao tem endereco, planta, preco nem previsao definidos.
const SOLUN = {
  id: "00000000-0000-0000-0004-000000000009",
  name: "Solun",
  slug: "solun",
  status: "planning",
  address: "A definir",
  city: "Maringa",
  state: "PR",
  total_units: undefined,
  available_units: 0,
  reserved_units: 0,
  sold_units: 0,
}

describe("buildPropertyDataContext — planejamento: reconhece mas nao oferece (Story 75-281)", () => {
  it("AC1: empreendimento em planejamento CONTINUA no contexto (nome reconhecivel)", () => {
    const ctx = buildPropertyDataContext([SOLUN], null)
    expect(ctx).toContain("Solun")
    expect(ctx).toContain("Em planejamento")
  })

  it("AC2: traz instrucao explicita de NAO oferecer por iniciativa propria", () => {
    const ctx = buildPropertyDataContext([SOLUN], null)
    expect(ctx).toContain("EM PLANEJAMENTO")
    expect(ctx).toMatch(/NAO ofereca/)
    expect(ctx).toMatch(/ainda NAO foram liberadas/)
    expect(ctx).toMatch(/avisar assim que o lancamento for anunciado/)
  })

  it("AC3: proibe inventar planta, preco, metragem e previsao", () => {
    const ctx = buildPropertyDataContext([SOLUN], null)
    expect(ctx).toMatch(/NUNCA invente/)
    expect(ctx).toMatch(/previsao de entrega/)
  })

  it("AC4: planejamento com total_units preenchido e zero unidades NAO diz ESGOTADO", () => {
    const ctx = buildPropertyDataContext(
      [{ ...SOLUN, total_units: 48, available_units: 0, sold_units: 0 }],
      SOLUN.id
    )
    expect(ctx).not.toContain("ESGOTADO")
    expect(ctx).toMatch(/LANCAMENTO\/fase inicial/)
  })

  it("AC4b: pre-lancamento (launching) com zero unidades tambem NAO diz ESGOTADO", () => {
    const ctx = buildPropertyDataContext(
      [{ ...SOLUN, status: "launching", total_units: 60, available_units: 0, sold_units: 0 }],
      SOLUN.id
    )
    expect(ctx).not.toContain("ESGOTADO")
  })

  it("AC5: empreendimento em comercializacao NAO recebe a instrucao de planejamento", () => {
    const ctx = buildPropertyDataContext([VIND], VIND.id)
    expect(ctx).not.toContain("EM PLANEJAMENTO")
    expect(ctx).not.toMatch(/NAO ofereca/)
    // e o comportamento de esgotado segue valendo para selling
    const esgotado = buildPropertyDataContext(
      [{ ...VIND, total_units: 48, sold_units: 48, available_units: 0 }],
      VIND.id
    )
    expect(esgotado).toContain("ESGOTADO")
  })
})
