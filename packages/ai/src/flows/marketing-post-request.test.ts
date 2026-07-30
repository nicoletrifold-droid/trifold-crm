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
}

describe("parseMarketingPostRequest", () => {
  it("aceita JSON válido (estático)", () => {
    const r = parseMarketingPostRequest(JSON.stringify(VALID), "estatico")
    expect(r).toEqual(VALID)
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

  it("sem Kit e sem arquivos o prompt avisa em vez de inventar", async () => {
    const { client, getPrompt } = spyClient()
    await generateMarketingPostFromRequest(client, { ...input, brands: [], assets: [] })
    const prompt = getPrompt()
    expect(prompt).toContain("Nenhuma marca cadastrada no Kit")
    expect(prompt).toContain("Nenhum arquivo no Kit ainda.")
  })
})
