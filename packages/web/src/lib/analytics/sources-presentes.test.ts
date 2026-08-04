import { describe, it, expect } from "vitest"
import { opcoesDeOrigem, labelDaOrigem, SEM_ORIGEM_KEY } from "./sources-presentes"
import { SOURCE_LABELS_SHORT } from "@web/lib/constants"

// Story 75-269 — o filtro de Origem tem de oferecer o que os dados TÊM.
// A distribuição usada aqui é a medida em prod em 04/08 (janela de 90d), que é
// exatamente o caso que motivou a story: 4 das 8 origens não eram selecionáveis.

const PROD_04_08: Record<string, number> = {
  meta_ads: 285,
  other: 188,
  whatsapp_click_to_ad: 57,
  broker_sponsored: 55,
  walk_in: 10,
  website: 8,
  whatsapp_organic: 5,
  referral: 3,
  [SEM_ORIGEM_KEY]: 1,
}

describe("opcoesDeOrigem", () => {
  it("com os dados de prod, oferece as 4 origens que estavam inalcançáveis (AC1)", () => {
    const values = opcoesDeOrigem(PROD_04_08).map((o) => o.value)
    for (const antesEscondida of ["other", "broker_sponsored", "website", "referral"]) {
      expect(values).toContain(antesEscondida)
    }
  })

  it('"Todos" continua sendo a primeira opção', () => {
    const opts = opcoesDeOrigem(PROD_04_08)
    expect(opts[0]).toEqual({ value: "", label: "Todos" })
  })

  it("ordena por volume decrescente — a origem que domina o período vem antes", () => {
    const opts = opcoesDeOrigem(PROD_04_08).slice(1) // sem o "Todos"
    expect(opts.map((o) => o.value)).toEqual([
      "meta_ads",
      "other",
      "whatsapp_click_to_ad",
      "broker_sponsored",
      "walk_in",
      "website",
      "whatsapp_organic",
      "referral",
    ])
  })

  it("cobre 100% das origens com lead na janela (nenhum lead fica sem filtro)", () => {
    const values = new Set(opcoesDeOrigem(PROD_04_08).map((o) => o.value))
    const comLead = Object.keys(PROD_04_08).filter((k) => k !== SEM_ORIGEM_KEY)
    for (const k of comLead) expect(values).toContain(k)
    // 8 origens + "Todos"
    expect(values.size).toBe(comLead.length + 1)
  })

  it("omite a chave de lead SEM origem — ausência de dado não é canal (R3 do @po)", () => {
    const values = opcoesDeOrigem(PROD_04_08).map((o) => o.value)
    expect(values).not.toContain(SEM_ORIGEM_KEY)
  })

  it("origem nova, sem rótulo no mapa, aparece com a própria chave (AC2)", () => {
    const opts = opcoesDeOrigem({ tiktok_ads: 7 })
    expect(opts).toEqual([
      { value: "", label: "Todos" },
      { value: "tiktok_ads", label: "tiktok_ads" },
    ])
  })

  it("desempate por rótulo mantém a ordem estável entre renders", () => {
    const a = opcoesDeOrigem({ website: 10, referral: 10, meta_ads: 10 })
    const b = opcoesDeOrigem({ meta_ads: 10, referral: 10, website: 10 })
    expect(a).toEqual(b)
    // Indicação < Meta Ads < Website em pt-BR
    expect(a.slice(1).map((o) => o.label)).toEqual(["Indicação", "Meta Ads", "Website"])
  })

  it("origem com contagem zero não é oferecida", () => {
    const values = opcoesDeOrigem({ meta_ads: 5, telegram: 0 }).map((o) => o.value)
    expect(values).toContain("meta_ads")
    expect(values).not.toContain("telegram")
  })

  it("sem dados (carregando, erro, ou deploy antigo sem `sources`) devolve só Todos", () => {
    for (const vazio of [undefined, null, {}]) {
      expect(opcoesDeOrigem(vazio)).toEqual([{ value: "", label: "Todos" }])
    }
  })
})

describe("labelDaOrigem", () => {
  it("usa a fonte canônica SOURCE_LABELS_SHORT, não uma cópia (AC2)", () => {
    // Se alguém duplicar o mapa, este teste passa a divergir da fonte.
    for (const key of ["meta_ads", "whatsapp_click_to_ad", "walk_in", "broker_sponsored"]) {
      expect(labelDaOrigem(key)).toBe(SOURCE_LABELS_SHORT[key])
    }
  })

  it("chave desconhecida volta como ela mesma", () => {
    expect(labelDaOrigem("canal_que_nao_existe")).toBe("canal_que_nao_existe")
  })
})
