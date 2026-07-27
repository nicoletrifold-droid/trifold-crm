import { describe, it, expect, vi } from "vitest"
import type Anthropic from "@anthropic-ai/sdk"
import {
  generateMarketingSuggestions,
  parseMarketingSuggestions,
  type MarketingSuggestionsInput,
} from "./marketing-suggestions"

const VALID_POST = {
  empreendimento_id: "5f0e6b1c-1111-4222-8333-444455556666",
  canal: "instagram",
  copy: "Conheça o Residencial Aurora: lazer completo e entrega em 2027. Agende sua visita!",
  scheduled_for: "2026-07-30",
  justificativa: "Criativo 'Aurora Torre 2': CPL R$ 12,40 e 4 visitas no CRM em 30d — formato vencedor.",
}

const VALID = { posts: [VALID_POST, { ...VALID_POST, canal: "facebook", empreendimento_id: null }] }

describe("parseMarketingSuggestions", () => {
  it("aceita JSON válido completo", () => {
    const result = parseMarketingSuggestions(JSON.stringify(VALID))
    expect(result).not.toBeNull()
    expect(result).toHaveLength(2)
    expect(result![0]!.canal).toBe("instagram")
    expect(result![1]!.empreendimento_id).toBeNull()
  })

  it("aceita JSON embrulhado em code block markdown", () => {
    const result = parseMarketingSuggestions("```json\n" + JSON.stringify(VALID) + "\n```")
    expect(result).not.toBeNull()
    expect(result![0]!.justificativa).toContain("CPL")
  })

  it("recorta JSON cercado de prosa (primeiro { ao último })", () => {
    const wrapped = `Aqui estão as sugestões:\n${JSON.stringify(VALID)}\nBom trabalho!`
    const result = parseMarketingSuggestions(wrapped)
    expect(result).not.toBeNull()
    expect(result).toHaveLength(2)
  })

  it("rejeita canal inválido", () => {
    const bad = { posts: [{ ...VALID_POST, canal: "stories" }] }
    expect(parseMarketingSuggestions(JSON.stringify(bad))).toBeNull()
  })

  it("rejeita post sem copy ou sem justificativa", () => {
    expect(
      parseMarketingSuggestions(JSON.stringify({ posts: [{ ...VALID_POST, copy: "  " }] }))
    ).toBeNull()
    const { justificativa: _omit, ...semJustificativa } = VALID_POST
    expect(
      parseMarketingSuggestions(JSON.stringify({ posts: [semJustificativa] }))
    ).toBeNull()
  })

  it("rejeita lista vazia de posts", () => {
    expect(parseMarketingSuggestions(JSON.stringify({ posts: [] }))).toBeNull()
  })

  it("rejeita texto que não é JSON", () => {
    expect(parseMarketingSuggestions("Sugiro postar sobre o empreendimento novo.")).toBeNull()
  })

  it("rejeita JSON truncado", () => {
    const truncated = JSON.stringify(VALID).slice(0, 80)
    expect(parseMarketingSuggestions(truncated)).toBeNull()
  })

  it("normaliza scheduled_for inválido para null e limita a 5 posts", () => {
    const six = {
      posts: Array.from({ length: 6 }, (_, i) => ({
        ...VALID_POST,
        copy: `Post ${i}`,
        scheduled_for: i === 0 ? "amanhã" : VALID_POST.scheduled_for,
      })),
    }
    const result = parseMarketingSuggestions(JSON.stringify(six))
    expect(result).not.toBeNull()
    expect(result).toHaveLength(5)
    expect(result![0]!.scheduled_for).toBeNull()
    expect(result![1]!.scheduled_for).toBe("2026-07-30")
  })
})

describe("generateMarketingSuggestions — blocos de resposta do Sonnet", () => {
  const input: MarketingSuggestionsInput = {
    periodDays: 30,
    creatives: [
      {
        meta_ad_id: "123",
        ad_name: "Aurora Torre 2",
        total_spend: 250.5,
        total_impressions: 10000,
        avg_ctr: 1.2,
        avg_cost_per_lead: 12.4,
        total_leads: 20,
        crm_leads_total: 8,
        crm_leads_agendado: 5,
        crm_leads_visitou: 4,
        crm_leads_proposta: 1,
        crm_leads_fechado: 0,
      },
    ],
    campaigns: [
      { name: "Ação Muffato", status: "ACTIVE", spend: 900, impressions: 50000, clicks: 700, leads_meta: 176 },
    ],
    properties: [
      {
        id: VALID_POST.empreendimento_id,
        name: "Residencial Aurora",
        status: "em_obras",
        city: "Cascavel",
        delivery_date: "2027-06-01",
        differentials: ["lazer completo"],
      },
    ],
    now: "2026-07-27T12:00:00Z",
  }

  function mockClient(content: unknown[]): Anthropic {
    return {
      messages: { create: vi.fn().mockResolvedValue({ content }) },
    } as unknown as Anthropic
  }

  it("lê o texto mesmo com bloco de thinking ANTES (adaptive thinking padrão do Sonnet 5)", async () => {
    const client = mockClient([
      { type: "thinking", thinking: "" },
      { type: "text", text: JSON.stringify(VALID) },
    ])
    const result = await generateMarketingSuggestions(client, input)
    expect(result).not.toBeNull()
    expect(result).toHaveLength(2)
  })

  it("concatena múltiplos blocos de texto", async () => {
    const json = JSON.stringify(VALID)
    const client = mockClient([
      { type: "thinking", thinking: "" },
      { type: "text", text: json.slice(0, 50) },
      { type: "text", text: json.slice(50) },
    ])
    const result = await generateMarketingSuggestions(client, input)
    expect(result).not.toBeNull()
  })

  it("devolve null se só vier thinking (sem texto)", async () => {
    const client = mockClient([{ type: "thinking", thinking: "" }])
    const result = await generateMarketingSuggestions(client, input)
    expect(result).toBeNull()
  })
})
