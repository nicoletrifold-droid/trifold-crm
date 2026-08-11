import { describe, expect, it, vi } from "vitest"
import type Anthropic from "@anthropic-ai/sdk"

import {
  generateMarketingPostFromRequest,
  parseMarketingPostRequest,
  type MarketingPostRequestInput,
} from "./marketing-post-request"

// Story 75-239 — "Pedir à Lídia": pedido livre → um post pronto na fila.

const VALID = {
  copy: "Legenda pronta",
  roteiro: null,
  justificativa: "Racional",
  scheduled_for: "2026-08-05",
  arte: null,
  // Story 75-255 — o resultado ganhou a lista `artes`; `arte` segue como artes[0].
  artes: null,
  // Story 75-294 — ad copy (só destino=pago; resposta sem os campos = null).
  ad_primary_text: null,
  ad_headline: null,
}

describe("parseMarketingPostRequest", () => {
  it("aceita JSON válido (estático)", () => {
    const r = parseMarketingPostRequest(JSON.stringify(VALID), "estatico")
    expect(r).toEqual(VALID)
  })

  // Story 75-294 — ad copy do modo tráfego pago
  it("ad_primary_text/ad_headline passam quando presentes; ausentes viram null", () => {
    const r = parseMarketingPostRequest(
      JSON.stringify({ ...VALID, ad_primary_text: " Texto do anúncio ", ad_headline: "Título" }),
      "estatico"
    )
    expect(r?.ad_primary_text).toBe("Texto do anúncio")
    expect(r?.ad_headline).toBe("Título")
    const sem = parseMarketingPostRequest(JSON.stringify(VALID), "estatico")
    expect(sem?.ad_primary_text).toBeNull()
    expect(sem?.ad_headline).toBeNull()
  })

  it("reel SEM roteiro é entrega incompleta → null (não enfileira)", () => {
    expect(parseMarketingPostRequest(JSON.stringify(VALID), "reel")).toBeNull()
    const comRoteiro = { ...VALID, roteiro: "CENA 1: fachada…" }
    const r = parseMarketingPostRequest(JSON.stringify(comRoteiro), "reel")
    expect(r?.roteiro).toBe("CENA 1: fachada…")
  })

  it("roteiro devolvido em formato não-reel é descartado", () => {
    const r = parseMarketingPostRequest(JSON.stringify({ ...VALID, roteiro: "lixo" }), "story")
    expect(r?.roteiro).toBeNull()
  })

  it("sem copy ou sem justificativa → null; data inválida vira null", () => {
    expect(parseMarketingPostRequest(JSON.stringify({ ...VALID, copy: " " }), "estatico")).toBeNull()
    expect(parseMarketingPostRequest(JSON.stringify({ ...VALID, justificativa: "" }), "estatico")).toBeNull()
    const r = parseMarketingPostRequest(JSON.stringify({ ...VALID, scheduled_for: "amanhã" }), "estatico")
    expect(r?.scheduled_for).toBeNull()
  })

  // Story 75-240 — bloco de direção de arte
  it("bloco arte é parseado (descrição + arquivos), tolerante a lixo, e nunca em reel", () => {
    const comArte = {
      ...VALID,
      arte: { descricao: "Fundo verde #11220F, título 'Entrega em abril'", arquivos_kit: ["logo.png", "  ", 42] },
    }
    const r = parseMarketingPostRequest(JSON.stringify(comArte), "story")
    // 75-256: o contrato ganhou titulo/subtitulo. Ausentes ⇒ null, e o
    // arte-service não compõe faixa — a arte sai no modo anterior, sem quebrar.
    expect(r?.arte).toEqual({
      descricao: "Fundo verde #11220F, título 'Entrega em abril'",
      arquivos_kit: ["logo.png"],
      cta: null,
      titulo: null,
      subtitulo: null,
    })
    // sem descrição = sem arte (a rota pula a geração, copy sobrevive)
    const semDesc = parseMarketingPostRequest(JSON.stringify({ ...VALID, arte: { arquivos_kit: ["x"] } }), "estatico")
    expect(semDesc?.arte).toBeNull()
    // reel nunca tem arte, mesmo que o modelo mande
    const reel = parseMarketingPostRequest(
      JSON.stringify({ ...VALID, roteiro: "CENA 1", arte: { descricao: "x", arquivos_kit: [] } }),
      "reel"
    )
    expect(reel?.arte).toBeNull()
  })

  // 75-248: o CTA é COMPOSTO pelo código, então vem como dado, não como desenho.
  it("arte.cta é parseado, tolerante e limitado; ausente = null (post antigo segue funcionando)", () => {
    const comCta = { ...VALID, arte: { descricao: "Fachada ao anoitecer", arquivos_kit: [], cta: "  Arraste e agende sua visita  " } }
    expect(parseMarketingPostRequest(JSON.stringify(comCta), "story")?.arte?.cta).toBe("Arraste e agende sua visita")

    // ausente, vazio ou de tipo errado ⇒ null: NUNCA inventar CTA
    for (const cta of [undefined, "", "   ", 42, null, {}]) {
      const j = JSON.stringify({ ...VALID, arte: { descricao: "x", arquivos_kit: [], cta } })
      expect(parseMarketingPostRequest(j, "story")?.arte?.cta).toBeNull()
    }

    // CTA absurdamente longo é truncado (a pílula tem largura finita)
    const longo = { ...VALID, arte: { descricao: "x", arquivos_kit: [], cta: "a".repeat(200) } }
    expect(parseMarketingPostRequest(JSON.stringify(longo), "story")?.arte?.cta?.length).toBe(60)
  })

  it("JSON cercado de prosa/code block é recortado; lixo → null", () => {
    const r = parseMarketingPostRequest("Aqui está:\n```json\n" + JSON.stringify(VALID) + "\n```", "estatico")
    expect(r?.copy).toBe("Legenda pronta")
    expect(parseMarketingPostRequest("não é json", "estatico")).toBeNull()
  })
})

describe("generateMarketingPostFromRequest — prompt", () => {
  const input: MarketingPostRequestInput = {
    pedido: "Story pra investidor batendo na entrega, usa a foto da fachada",
    formato: "story",
    canal: "instagram",
    empreendimentoId: "prop-1",
    empreendimentoNome: "Vind Residence",
    brands: [
      { nome: "Trifold", tipo: "institucional", property_id: null, voz_da_marca: "sóbria", diretrizes: "nunca prometer valorização", briefing: "time desde 1997" },
      { nome: "Vind Residence", tipo: "empreendimento", property_id: "prop-1", voz_da_marca: null, diretrizes: "não falar do entorno", briefing: "entrega abril/2027" },
    ],
    assets: [
      { marca: "Vind Residence", tipo: "foto", label: "fachada", file_name: "fachada-01.jpg" },
    ],
    now: "2026-07-30T12:00:00Z",
  }

  function spyClient(): { client: Anthropic; getPrompt: () => string } {
    const create = vi.fn().mockResolvedValue({
      content: [
        { type: "thinking", thinking: "" },
        { type: "text", text: JSON.stringify(VALID) },
      ],
    })
    const client = { messages: { create } } as unknown as Anthropic
    return {
      client,
      getPrompt: () => {
        const params = create.mock.calls[0]![0] as Anthropic.MessageCreateParams
        const first = params.messages[0]!
        if (typeof first.content !== "string") throw new Error("prompt não é string simples")
        return first.content
      },
    }
  }

  it("prompt carrega pedido, formato, Kit e arquivos (e lê após bloco thinking)", async () => {
    const { client, getPrompt } = spyClient()
    const result = await generateMarketingPostFromRequest(client, input)
    expect(result).not.toBeNull()
    const prompt = getPrompt()
    expect(prompt).toContain("PEDIDO DO HUMANO")
    expect(prompt).toContain("usa a foto da fachada")
    expect(prompt).toContain("FORMATO: story")
    expect(prompt).toContain("EMPREENDIMENTO — Vind Residence")
    expect(prompt).toContain("nunca prometer valorização")
    expect(prompt).toContain('foto "fachada" — fachada-01.jpg')
    expect(prompt).toContain("ESCOPO POR MARCA")
  })

  // 75-244: a direção de arte do Sonnet era a origem das peças quase pretas —
  // a regra de legibilidade nasce aqui, não no motor.
  // 75-248 SUPERSEDE a parte do CTA desta regra: pedir "CTA com peso visual"
  // produziu um botão desproporcional, então o CTA saiu do modelo e virou
  // composição. O que resta aqui é contraste e área luminosa, que seguem valendo.
  // 75-256 SUPERSEDE a parte de contraste desta regra, pela mesma lógica com que
  // a 75-248 superseded a do CTA: o texto saiu do modelo e virou composição, então
  // instruir contraste de TEXTO na imagem passou a não ter objeto. O que resta —
  // e continua valendo — é a luz da CENA e a proibição de moldura.
  it("prompt exige luz na cena e não pede mais contraste de texto na imagem", async () => {
    const { client, getPrompt } = spyClient()
    await generateMarketingPostFromRequest(client, input)
    const prompt = getPrompt()
    expect(prompt).toContain("LUZ DA ARTE")
    expect(prompt).toContain("area luminosa")
    // proibição de moldura seguiu, e endurecida
    expect(prompt).toContain("Nao peca forma geometrica solta, moldura ou linha decorativa")
    // o texto agora é campo próprio, e a imagem é só cena
    expect(prompt).toContain("titulo")
    expect(prompt).toContain("subtitulo")
    expect(prompt).toContain("NAO escreva texto nenhum aqui")
  })

  // 75-250: o Sonnet escrevia hex inventado porque nunca recebia a paleta — e o
  // único hex do contexto era o #F27A5E solto no briefing da Trifold, que virou
  // céu laranja numa marca verde, contradizendo a PALETA OBRIGATÓRIA do motor.
  it("prompt entrega a PALETA e proíbe hex de fora dela (75-250)", async () => {
    const { client, getPrompt } = spyClient()
    await generateMarketingPostFromRequest(client, {
      ...input,
      paleta: [{ hex: "#FFFFFF", nome: null }, { hex: "#8FE6A7", nome: "Menta" }],
    })
    const prompt = getPrompt()
    expect(prompt).toContain("PALETA DA MARCA")
    expect(prompt).toContain("#8FE6A7 (Menta)")
    expect(prompt).toContain("E PROIBIDO escrever qualquer outro codigo hex")
    // a regra antiga mandava ele inventar "os HEX da marca" sem receber nenhum
    expect(prompt).not.toContain("paleta com os HEX da marca")
  })

  it("sem paleta cadastrada, o prompt manda descrever cor por NOME e não usar hex", async () => {
    const { client, getPrompt } = spyClient()
    await generateMarketingPostFromRequest(client, { ...input, paleta: [] })
    expect(getPrompt()).toContain("descreva as cores por NOME e NAO escreva hex algum")
  })

  it("prompt manda o CTA vir no campo cta e NÃO ser desenhado (75-248)", async () => {
    const { client, getPrompt } = spyClient()
    await generateMarketingPostFromRequest(client, input)
    const prompt = getPrompt()
    expect(prompt).toContain("CTA (Story 75-248)")
    expect(prompt).toContain("NAO** e desenhado pelo gerador de imagem")
    expect(prompt).toContain('"cta": "texto curto do CTA ou null"')
    // a regra antiga, que mandava descrever o CTA com peso visual, saiu
    expect(prompt).not.toContain("Descreva o CTA com peso visual proprio")
  })

  it("direção visual do humano entra no prompt com instrução de incorporar (75-241)", async () => {
    const { client, getPrompt } = spyClient()
    await generateMarketingPostFromRequest(client, { ...input, direcaoArte: "pôr do sol atrás do prédio" })
    const prompt = getPrompt()
    expect(prompt).toContain("DIRECAO VISUAL DO HUMANO")
    expect(prompt).toContain("pôr do sol atrás do prédio")
    // sem direção (ou vazia), a seção não aparece
    const { client: c2, getPrompt: g2 } = spyClient()
    await generateMarketingPostFromRequest(c2, { ...input, direcaoArte: "   " })
    expect(g2()).not.toContain("DIRECAO VISUAL DO HUMANO")
  })

  it("sem Kit e sem arquivos o prompt avisa em vez de inventar", async () => {
    const { client, getPrompt } = spyClient()
    await generateMarketingPostFromRequest(client, { ...input, brands: [], assets: [] })
    const prompt = getPrompt()
    expect(prompt).toContain("Nenhuma marca cadastrada no Kit")
    expect(prompt).toContain("Nenhum arquivo no Kit ainda.")
  })
})

// Story 75-255 — o contrato virou LISTA: uma direção de arte POR TELA.
describe("parse de artes (75-255)", () => {
  const base = { copy: "c", roteiro: null, justificativa: "j", scheduled_for: null }

  it("story de 2 telas devolve 2 artes, na ordem", () => {
    const j = JSON.stringify({
      ...base,
      artes: [
        { descricao: "tela 1", arquivos_kit: ["a.jpg"], cta: "Agende" },
        { descricao: "tela 2", arquivos_kit: ["b.jpg"], cta: null },
      ],
    })
    const r = parseMarketingPostRequest(j, "story")
    expect(r?.artes).toHaveLength(2)
    expect(r?.artes?.[0]!.descricao).toBe("tela 1")
    expect(r?.artes?.[1]!.arquivos_kit).toEqual(["b.jpg"])
  })

  it("`arte` singular ANTIGO vira lista de 1 — retrocompatibilidade", () => {
    const j = JSON.stringify({ ...base, arte: { descricao: "única", arquivos_kit: [], cta: "X" } })
    const r = parseMarketingPostRequest(j, "story")
    expect(r?.artes).toHaveLength(1)
    expect(r?.arte?.descricao).toBe("única") // o campo antigo segue populado
  })

  it("`arte` espelha `artes[0]`", () => {
    const j = JSON.stringify({ ...base, artes: [{ descricao: "primeira", arquivos_kit: [], cta: null }, { descricao: "segunda", arquivos_kit: [], cta: null }] })
    const r = parseMarketingPostRequest(j, "story")
    expect(r?.arte?.descricao).toBe("primeira")
  })

  it("teto de 3 no parse — lista de 8 não passa de 3", () => {
    const artes = Array.from({ length: 8 }, (_, i) => ({ descricao: `t${i}`, arquivos_kit: [], cta: null }))
    expect(parseMarketingPostRequest(JSON.stringify({ ...base, artes }), "story")?.artes).toHaveLength(3)
  })

  it("entrada sem descrição é descartada, as boas ficam", () => {
    const j = JSON.stringify({ ...base, artes: [{ descricao: "ok", arquivos_kit: [], cta: null }, { arquivos_kit: [] }, { descricao: "  " }] })
    expect(parseMarketingPostRequest(j, "story")?.artes).toHaveLength(1)
  })

  it("reel nunca tem arte, mesmo que o modelo mande lista", () => {
    const j = JSON.stringify({ ...base, roteiro: "CENA 1", artes: [{ descricao: "x", arquivos_kit: [], cta: null }] })
    expect(parseMarketingPostRequest(j, "reel")?.artes).toBeNull()
  })
})
