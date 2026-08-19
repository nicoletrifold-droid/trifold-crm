/**
 * Story 75-347 (AC2/AC3) — a finalidade que JÁ EXISTE chega até a Nicole, e a que
 * o lead disser é gravada sem atropelar humano.
 *
 * Por que este arquivo existe separado do `finalidade.test.ts`: aquele prova a
 * extração (função pura); este prova a FIAÇÃO — que o valor sai de `leads`, entra
 * no `<lead_context>` e volta como patch. Medido em produção (19/08): 311 leads de
 * 90 dias tinham finalidade preenchida pelo formulário do Meta e a Nicole
 * reperguntava em todos, porque `buildLeadContext` nunca a injetou.
 *
 * CONTROLE NEGATIVO obrigatório: sem finalidade no lead, o bloco NÃO pode conter a
 * linha nem a regra 4 — senão o teste fica verde por o prompt inteiro estar lá.
 *
 * Harness: `createFakeSupabase` da 75-279 — usar, não recriar.
 */
import { describe, it, expect } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type Anthropic from "@anthropic-ai/sdk"
import { STAGE_IDS } from "@trifold/shared"
import { processMessageWithMetadata } from "./pipeline"
import { createFakeSupabase, type Row } from "./__fixtures__/fake-supabase"

const ORG = "org-1"
const CONVERSATION = "conv-1"
const LEAD = "lead-1"

function anthropicCapturando(box: { system: string }, resposta: string): Anthropic {
  return {
    messages: {
      create: async (args: { system?: Array<{ text?: string }> | string }) => {
        if (!box.system) {
          box.system = Array.isArray(args.system)
            ? args.system.map((b) => b.text ?? "").join("")
            : String(args.system ?? "")
        }
        return {
          content: [{ type: "text", text: resposta }],
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

async function turno(input: {
  mensagemDoLead: string
  finalidadeNoLead?: string | null
  prazoNoLead?: string | null
}) {
  const box = { system: "" }
  const lead: Row = {
    id: LEAD,
    name: "Andressa",
    phone: "5544999999999",
    stage_id: STAGE_IDS.novo,
    assigned_broker_id: "broker-1",
    lost_reason: null,
    ai_summary: null,
    source: "meta_ads",
    qualification_status: "in_progress",
    property_interest_id: null,
    interest_level_manual: null,
    finalidade: input.finalidadeNoLead ?? null,
    prazo_compra: input.prazoNoLead ?? null,
  }
  const fake = createFakeSupabase({
    conversations: [{ id: CONVERSATION, lead_id: LEAD, org_id: ORG }],
    conversation_state: [
      {
        conversation_id: CONVERSATION,
        collected_data: { name: "Andressa" },
        qualification_step: "finalidade",
        current_property_id: null,
        visit_proposed: false,
      },
    ],
    leads: [lead],
    messages: [],
    users: [],
    appointments: [],
    activities: [],
    lead_facts: [],
    properties: [],
  })
  await processMessageWithMetadata({
    supabase: fake as unknown as SupabaseClient,
    anthropic: anthropicCapturando(box, "Certo!"),
    conversationId: CONVERSATION,
    message: input.mensagemDoLead,
    orgId: ORG,
  })
  return { system: box.system, lead: fake.table("leads").find((l) => l.id === LEAD) }
}

describe("75-347 AC2 — a finalidade conhecida chega à Nicole", () => {
  it("injeta a finalidade e a regra de não-repergunta", async () => {
    const { system } = await turno({ mensagemDoLead: "Oi", finalidadeNoLead: "investimento" })
    expect(system).toContain("<lead_context>")
    expect(system).toContain("Finalidade: investimento")
    expect(system).toMatch(/Se a FINALIDADE está preenchida acima, NÃO pergunte de novo/)
  })

  it("traduz o rótulo em vez de mandar o valor cru do enum", async () => {
    const { system } = await turno({
      mensagemDoLead: "Oi",
      finalidadeNoLead: "moradia",
      prazoNoLead: "ate_3m",
    })
    expect(system).toContain("Finalidade: moradia (para morar)")
    expect(system).toContain("Prazo de compra: até 3 meses")
    expect(system).not.toContain("ate_3m")
  })

  it("CONTROLE NEGATIVO — sem finalidade no lead, nada é afirmado", async () => {
    const { system } = await turno({ mensagemDoLead: "Oi", finalidadeNoLead: null })
    expect(system).not.toContain("Finalidade:")
    expect(system).not.toContain("Prazo de compra:")
  })
})

describe("75-347 AC3 — a resposta do lead vira dado", () => {
  it("grava a finalidade dita pelo lead", async () => {
    const { lead } = await turno({ mensagemDoLead: "é pra morar, quero sair do aluguel" })
    expect(lead?.finalidade).toBe("moradia")
  })

  it("NÃO sobrescreve o que já estava lá (Meta ou humano manda)", async () => {
    const { lead } = await turno({
      mensagemDoLead: "é pra morar mesmo",
      finalidadeNoLead: "investimento",
    })
    expect(lead?.finalidade).toBe("investimento")
  })

  it("lead que não responde a pergunta deixa a finalidade nula", async () => {
    const { lead } = await turno({ mensagemDoLead: "e qual o valor?" })
    expect(lead?.finalidade ?? null).toBeNull()
  })
})
