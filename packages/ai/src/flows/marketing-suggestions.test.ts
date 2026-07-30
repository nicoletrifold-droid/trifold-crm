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

// Story 75-238 — Kit de Marcas no prompt (voz/diretrizes/briefing por marca)
describe("generateMarketingSuggestions — Kit de Marcas no prompt", () => {
  const baseInput: MarketingSuggestionsInput = {
    periodDays: 30,
    creatives: [],
    campaigns: [
      { name: "X", status: "ACTIVE", spend: 1, impressions: 1, clicks: 1, leads_meta: 1 },
    ],
    properties: [],
    now: "2026-07-30T12:00:00Z",
  }

  // Tipado com o tipo REAL do SDK: se o prompt migrar de messages[] p/ system,
  // este teste quebra em compile-time, não com undefined em runtime (QA 75-238).
  function spyClient(): { client: Anthropic; getPrompt: () => string } {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ posts: [VALID_POST] }) }],
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

  it("inclui voz, diretrizes e briefing de cada marca no prompt", async () => {
    const { client, getPrompt } = spyClient()
    const result = await generateMarketingSuggestions(client, {
      ...baseInput,
      brands: [
        { nome: "Trifold", tipo: "institucional", property_id: null, voz_da_marca: "sóbria e próxima", diretrizes: "nunca prometer valorização", briefing: "time desde 1997" },
        { nome: "Vind", tipo: "empreendimento", property_id: "prop-1", voz_da_marca: null, diretrizes: "não falar do entorno", briefing: "entrega abril/2027" },
      ],
    })
    const prompt = getPrompt()
    expect(prompt).toContain("KIT DE MARCAS")
    expect(prompt).toContain("ESCOPO POR MARCA")
    expect(prompt).toContain("MARCA INSTITUCIONAL — Trifold")
    expect(prompt).toContain("sóbria e próxima")
    expect(prompt).toContain("nunca prometer valorização")
    expect(prompt).toContain("EMPREENDIMENTO — Vind (id=prop-1)")
    expect(prompt).toContain("não falar do entorno")
    expect(prompt).toContain("entrega abril/2027")
    expect(result).not.toBeNull()
  })

  it("sem marcas (ou lista vazia) o prompt não ganha bloco de Kit", async () => {
    const { client, getPrompt } = spyClient()
    await generateMarketingSuggestions(client, baseInput)
    expect(getPrompt()).not.toContain("KIT DE MARCAS")
    const { client: c2, getPrompt: g2 } = spyClient()
    await generateMarketingSuggestions(c2, { ...baseInput, brands: [] })
    expect(g2()).not.toContain("KIT DE MARCAS")
  })

  it("campos nulos da marca não viram 'null' no prompt", async () => {
    const { client, getPrompt } = spyClient()
    await generateMarketingSuggestions(client, {
      ...baseInput,
      brands: [{ nome: "Yarden", tipo: "empreendimento", property_id: null, voz_da_marca: null, diretrizes: null, briefing: null }],
    })
    const prompt = getPrompt()
    expect(prompt).toContain("EMPREENDIMENTO — Yarden")
    expect(prompt).not.toContain("Voz da marca: null")
    expect(prompt).not.toContain("Briefing: null")
  })
})
