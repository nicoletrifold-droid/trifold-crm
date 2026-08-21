/**
 * Story 75-365 — "Origem: 120246224161970741". A URL do anúncio pago grava os
 * macros do Meta nos UTMs; estes testes fixam a tradução ID → nome e o
 * best-effort (falha = nulls, nunca lança).
 */
import { describe, it, expect } from "vitest"
import { ehIdMeta, resolverNomesUtm } from "./meta-utm"

describe("ehIdMeta", () => {
  it("reconhece IDs do Meta (inteiro longo)", () => {
    expect(ehIdMeta("120246224161970741")).toBe(true)
    expect(ehIdMeta("1202462241")).toBe(true) // 10 dígitos, borda
  })

  it("não engole utm legítimo", () => {
    expect(ehIdMeta("black-friday-24")).toBe(false)
    expect(ehIdMeta("2024")).toBe(false) // número curto ≠ ID
    expect(ehIdMeta("LP Vind")).toBe(false)
    expect(ehIdMeta("")).toBe(false)
    expect(ehIdMeta(null)).toBe(false)
    expect(ehIdMeta(undefined)).toBe(false)
    expect(ehIdMeta("12024622416197074a")).toBe(false)
  })
})

// fake supabase: from(tabela).select().eq().eq().maybeSingle() — as travas de
// tabela/filtro são explícitas (fakeDb que ignora .eq() já escondeu bug antes).
function fakeSupabase(rows: { meta_campaigns?: Record<string, string>; meta_ads?: Record<string, string> }) {
  const calls: Array<{ tabela: string; filtros: Record<string, string> }> = []
  const client = {
    from(tabela: string) {
      const filtros: Record<string, string> = {}
      const q = {
        select: () => q,
        eq: (col: string, val: string) => {
          filtros[col] = val
          return q
        },
        maybeSingle: async () => {
          calls.push({ tabela, filtros })
          const porTabela = rows[tabela as keyof typeof rows] ?? {}
          const chave = tabela === "meta_campaigns" ? filtros.meta_campaign_id : filtros.meta_ad_id
          const name = chave ? porTabela[chave] : undefined
          return { data: name !== undefined ? { name } : null, error: null }
        },
      }
      return q
    },
  }
  return { client: client as unknown as import("@supabase/supabase-js").SupabaseClient, calls }
}

describe("resolverNomesUtm", () => {
  const CAMPANHA = "120246224161970741"
  const ANUNCIO = "120246224161940741"

  it("resolve campanha e anúncio pelos IDs (o caso Antonio Campi)", async () => {
    const { client, calls } = fakeSupabase({
      meta_campaigns: { [CAMPANHA]: "[LEADS. VIND. INVESTIDORES.CAPITAIS] [18.08.26]" },
      meta_ads: { [ANUNCIO]: "PLANTA+MGA_VIND_INVISTA EM MGA+PREÇO + ENTREGA" },
    })
    const r = await resolverNomesUtm(client, "org-1", {
      utm_campaign: CAMPANHA,
      utm_content: ANUNCIO,
    })
    expect(r.utm_campaign_nome).toBe("[LEADS. VIND. INVESTIDORES.CAPITAIS] [18.08.26]")
    expect(r.utm_content_nome).toBe("PLANTA+MGA_VIND_INVISTA EM MGA+PREÇO + ENTREGA")
    // escopo de org viaja nas duas consultas
    expect(calls.every((c) => c.filtros.org_id === "org-1")).toBe(true)
  })

  it("utm não-numérico nem consulta o banco", async () => {
    const { client, calls } = fakeSupabase({})
    const r = await resolverNomesUtm(client, "org-1", {
      utm_campaign: "LP Vind",
      utm_content: null,
    })
    expect(r).toEqual({ utm_campaign_nome: null, utm_content_nome: null })
    expect(calls).toHaveLength(0)
  })

  it("sync ainda não conhece o ID → null (quem exibe cai no rótulo do source)", async () => {
    const { client } = fakeSupabase({})
    const r = await resolverNomesUtm(client, "org-1", { utm_campaign: CAMPANHA })
    expect(r.utm_campaign_nome).toBeNull()
  })

  it("best-effort: banco explodindo devolve nulls, nunca lança", async () => {
    const explosivo = {
      from: () => {
        throw new Error("boom")
      },
    } as unknown as import("@supabase/supabase-js").SupabaseClient
    await expect(
      resolverNomesUtm(explosivo, "org-1", { utm_campaign: CAMPANHA })
    ).resolves.toEqual({ utm_campaign_nome: null, utm_content_nome: null })
  })
})
