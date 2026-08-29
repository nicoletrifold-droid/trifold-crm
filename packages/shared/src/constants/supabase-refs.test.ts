/**
 * Story 900-3b · correção do PR #524 — a fonte única de "que ref é qual".
 *
 * O furo que estes casos guardam: o ref era extraído por regex **case-insensitive** e
 * comparado com `Set.has()`, que é **case-sensitive**. Com a URL em maiúsculas, a guarda de
 * produção do `reset-tenancy-testdb.ts` devolvia `false` e o script seguia para
 * `drop schema ... cascade` **contra produção**. A normalização mora aqui, no ponto único de
 * extração — se ela sair daqui, estes casos acendem antes de qualquer consumidor.
 */

import { describe, it, expect } from "vitest"
import {
  REFS_PERMITIDOS_PRODUCAO,
  REFS_PERMITIDOS_TESTE,
  extrairRefDeUrlSupabase,
  ehRefDeProducao,
  ehRefDeTeste,
} from "./supabase-refs"

const PROD = [...REFS_PERMITIDOS_PRODUCAO][0]!
const TESTE = [...REFS_PERMITIDOS_TESTE][0]!

describe("extrairRefDeUrlSupabase normaliza a caixa", () => {
  it.each([
    ["minúsculas", (r: string) => r],
    ["MAIÚSCULAS", (r: string) => r.toUpperCase()],
    ["caixa mista", (r: string) => r.slice(0, 4).toUpperCase() + r.slice(4)],
  ])("%s ⇒ ref em minúsculas", (_rotulo, transformar) => {
    expect(extrairRefDeUrlSupabase(`https://${transformar(PROD)}.supabase.co`)).toBe(PROD)
  })

  it("aceita barra final e recusa o que não é URL de projeto", () => {
    expect(extrairRefDeUrlSupabase(`https://${TESTE}.supabase.co/`)).toBe(TESTE)
    expect(extrairRefDeUrlSupabase(undefined)).toBeNull()
    expect(extrairRefDeUrlSupabase("")).toBeNull()
    expect(extrairRefDeUrlSupabase(`http://${TESTE}.supabase.co`)).toBeNull()
    expect(extrairRefDeUrlSupabase("https://exemplo.com")).toBeNull()
  })
})

describe("as guardas aceitam qualquer caixa — falham FECHADAS", () => {
  it("produção é reconhecida em maiúsculas, minúsculas e mista", () => {
    for (const v of [PROD, PROD.toUpperCase(), PROD.slice(0, 5).toUpperCase() + PROD.slice(5)]) {
      expect(ehRefDeProducao(v), `ehRefDeProducao(${v})`).toBe(true)
    }
  })

  it("teste é reconhecido em qualquer caixa", () => {
    for (const v of [TESTE, TESTE.toUpperCase()]) {
      expect(ehRefDeTeste(v), `ehRefDeTeste(${v})`).toBe(true)
    }
  })

  it("ref desconhecido não é nem produção nem teste (e o chamador deve recusá-lo)", () => {
    expect(ehRefDeProducao("refnovodeproducao0")).toBe(false)
    expect(ehRefDeTeste("refnovodeproducao0")).toBe(false)
  })

  it("null/undefined não estouram e não são classificados", () => {
    expect(ehRefDeProducao(null)).toBe(false)
    expect(ehRefDeProducao(undefined)).toBe(false)
    expect(ehRefDeTeste(null)).toBe(false)
  })
})

describe("as duas listas são disjuntas", () => {
  it("nenhum ref está nas duas ao mesmo tempo", () => {
    for (const r of REFS_PERMITIDOS_PRODUCAO) expect(REFS_PERMITIDOS_TESTE.has(r)).toBe(false)
    expect(REFS_PERMITIDOS_PRODUCAO.size).toBeGreaterThan(0)
    expect(REFS_PERMITIDOS_TESTE.size).toBeGreaterThan(0)
  })
})
