/**
 * Story 75-349 (AC1/AC2/AC3) — a FIAÇÃO dos dois bloqueios dentro do pipeline.
 *
 * `model-compat.test.ts` prova as funções puras; este prova que o pipeline as usa:
 * que `temperature` sai da requisição quando o modelo é da geração nova, que a fala
 * é lida mesmo com `thinking` no bloco 0, e que resposta sem texto ACENDE evento em
 * vez de virar frase neutra em silêncio.
 *
 * Harness: `createFakeSupabase` da 75-279 — usar, não recriar.
 */
import { describe, it, expect } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type Anthropic from "@anthropic-ai/sdk"
import { STAGE_IDS } from "@trifold/shared"
import { processMessageWithMetadata, SANITIZED_EMPTY_FALLBACK } from "./pipeline"
import { createFakeSupabase } from "./__fixtures__/fake-supabase"

const ORG = "org-1"
const CONVERSATION = "conv-1"
const LEAD = "lead-1"

type Bloco = { type: string; text?: string; thinking?: string }

function anthropicFake(
  box: { params: Record<string, unknown> },
  content: Bloco[]
): Anthropic {
  return {
    messages: {
      create: async (args: Record<string, unknown>) => {
        if (!box.params.model) box.params = { ...args }
        return {
          content,
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        }
      },
    },
  } as unknown as Anthropic
}

async function turno(input: { model: string; content?: Bloco[] }) {
  const box = { params: {} as Record<string, unknown> }
  const eventos: Array<{ event_type: string; level: string; metadata?: Record<string, unknown> }> = []
  const fake = createFakeSupabase({
    conversations: [{ id: CONVERSATION, lead_id: LEAD, org_id: ORG }],
    conversation_state: [
      {
        conversation_id: CONVERSATION,
        collected_data: { name: "Ana" },
        qualification_step: "finalidade",
        current_property_id: null,
        visit_proposed: false,
      },
    ],
    leads: [
      {
        id: LEAD, name: "Ana", phone: "5544999999999", stage_id: STAGE_IDS.novo,
        assigned_broker_id: "broker-1", lost_reason: null, ai_summary: null,
        source: "meta_ads", qualification_status: "in_progress",
        property_interest_id: null, interest_level_manual: null,
        finalidade: null, prazo_compra: null,
      },
    ],
    agent_config: [
      // `is_active: true` não é enfeite: `loadAgentConfig` filtra por ele, e sem
      // isso o pipeline cai no default do código (sonnet-4-6) e o teste mediria
      // o fallback em vez do modelo configurado — verde por acidente.
      { org_id: ORG, is_active: true, model_primary: input.model, temperature: 0.7, max_tokens: 1024 },
    ],
    messages: [],
    users: [],
    appointments: [],
    activities: [],
    lead_facts: [],
    properties: [],
  })
  const resultado = await processMessageWithMetadata({
    supabase: fake as unknown as SupabaseClient,
    anthropic: anthropicFake(box, input.content ?? [{ type: "text", text: "Oi!" }]),
    conversationId: CONVERSATION,
    message: "oi",
    orgId: ORG,
    onEvent: (e) =>
      eventos.push({
        event_type: e.event_type,
        level: e.level,
        metadata: e.metadata as Record<string, unknown>,
      }),
  })
  return { params: box.params, eventos, resposta: resultado.response }
}

describe("75-349 AC1 — temperature condicional", () => {
  it("modelo com sampling recebe temperature (comportamento de hoje intacto)", async () => {
    const { params } = await turno({ model: "claude-sonnet-4-6" })
    expect(params.model).toBe("claude-sonnet-4-6")
    expect(params.temperature).toBe(0.7)
  })

  it("🔥 modelo da geração nova NÃO recebe temperature (seria 400)", async () => {
    const { params } = await turno({ model: "claude-sonnet-5" })
    expect(params.model).toBe("claude-sonnet-5")
    expect(params).not.toHaveProperty("temperature")
  })

  it("o resto da requisição não muda", async () => {
    const { params } = await turno({ model: "claude-opus-5" })
    expect(params.max_tokens).toBe(1024)
    expect(Array.isArray(params.system)).toBe(true)
  })
})

describe("75-349 AC2/AC3 — leitura da fala e falha que se anuncia", () => {
  it("🔥 lê a fala com thinking no bloco 0", async () => {
    const { resposta } = await turno({
      model: "claude-opus-5",
      content: [
        { type: "thinking", thinking: "o lead disse oi" },
        { type: "text", text: "Oi, Ana! Tudo bem?" },
      ],
    })
    expect(resposta).toBe("Oi, Ana! Tudo bem?")
    expect(resposta).not.toBe(SANITIZED_EMPTY_FALLBACK)
  })

  it("resposta SEM bloco de texto acende evento de erro", async () => {
    const { eventos, resposta } = await turno({
      model: "claude-opus-5",
      content: [{ type: "thinking", thinking: "..." }],
    })
    const ev = eventos.find((e) => e.event_type === "nicole_resposta_vazia")
    expect(ev, "resposta vazia passou em silêncio").toBeTruthy()
    expect(ev!.level).toBe("error")
    expect(ev!.metadata!.model).toBe("claude-opus-5")
    expect(ev!.metadata!.tipos_de_bloco).toEqual(["thinking"])
    // O lead continua recebendo a frase neutra — o que muda é ter rastro.
    expect(resposta).toBe(SANITIZED_EMPTY_FALLBACK)
  })

  it("turno normal NÃO acende o evento", async () => {
    const { eventos } = await turno({ model: "claude-sonnet-4-6" })
    expect(eventos.find((e) => e.event_type === "nicole_resposta_vazia")).toBeUndefined()
  })
})
