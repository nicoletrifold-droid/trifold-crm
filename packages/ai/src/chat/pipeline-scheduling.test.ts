import { describe, it, expect } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type Anthropic from "@anthropic-ai/sdk"
import { STAGE_IDS } from "@trifold/shared"
import { processMessage } from "./pipeline"
import { createFakeSupabase, type FakeSupabase } from "./__fixtures__/fake-supabase"

/**
 * Story 75-279 — AC6/AC7: o INSERT em `appointments` exercitado de ponta a ponta.
 *
 * Este é o teste que faltava. As stories 75-245 e 75-268 mexeram neste mesmo
 * fluxo e passaram por QA sem nunca executar o trecho que grava a visita — o
 * defeito da Maria Oliveira (06/08) vivia exatamente ali.
 */

const ORG = "org-1"
const CONVERSATION = "conv-1"
const LEAD = "lead-1"
const BRT_OFFSET_MS = 3 * 3600_000

/** Próximo sábado (sempre no futuro) — o teste não pode depender da data da máquina. */
function nextSaturdayIso(): string {
  const brtNow = new Date(Date.now() - BRT_OFFSET_MS)
  const d = new Date(Date.UTC(brtNow.getUTCFullYear(), brtNow.getUTCMonth(), brtNow.getUTCDate()))
  do {
    d.setUTCDate(d.getUTCDate() + 1)
  } while (d.getUTCDay() !== 6)
  return d.toISOString().slice(0, 10)
}

/** ISO UTC do sábado às 11h BRT. */
function saturdayAt11Utc(iso: string): string {
  return new Date(`${iso}T11:00:00.000-03:00`).toISOString()
}

function fakeAnthropic(resposta: string): Anthropic {
  return {
    messages: {
      create: async () => ({
        content: [{ type: "text", text: resposta }],
        usage: {
          input_tokens: 10,
          output_tokens: 10,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      }),
    },
  } as unknown as Anthropic
}

/**
 * Estado exato do incidente: a Nicole já perguntou o horário no turno anterior
 * (`visit_proposed`), o dia ficou pendente (`visit_pending_date`) e o lead
 * responde só com a hora.
 */
function seedDoIncidente(sabadoIso: string) {
  return {
    conversations: [{ id: CONVERSATION, lead_id: LEAD, org_id: ORG }],
    conversation_state: [
      {
        conversation_id: CONVERSATION,
        collected_data: { name: "Maria Oliveira", visit_pending_date: sabadoIso },
        qualification_step: "floor",
        current_property_id: null,
        visit_proposed: true,
      },
    ],
    leads: [
      {
        id: LEAD,
        name: "Maria Oliveira",
        phone: "554491753925",
        stage_id: STAGE_IDS.novo,
        assigned_broker_id: "broker-1",
        lost_reason: null,
        ai_summary: null,
        source: "whatsapp_click_to_ad",
        qualification_status: "in_progress",
      },
    ],
    messages: [
      {
        id: "m1",
        conversation_id: CONVERSATION,
        role: "assistant",
        content: "Ótimo, sábado funciona bem! Qual horário fica melhor pra você? Atendemos das 8h às 12h.",
        created_at: "2026-01-01T10:00:00.000Z",
      },
    ],
    appointments: [],
    activities: [],
    lead_facts: [],
    properties: [],
  }
}

async function rodarTurno(mensagem: string): Promise<{ fake: FakeSupabase; sabadoIso: string }> {
  const sabadoIso = nextSaturdayIso()
  const fake = createFakeSupabase(seedDoIncidente(sabadoIso))
  await processMessage({
    supabase: fake as unknown as SupabaseClient,
    anthropic: fakeAnthropic("Anotado, Maria! Te espero sábado às 11h."),
    conversationId: CONVERSATION,
    message: mensagem,
    orgId: ORG,
  })
  return { fake, sabadoIso }
}

describe("Story 75-279 — AC6: 'As 11hrs' grava a visita de verdade", () => {
  it("cria UMA linha em appointments, no horário pedido", async () => {
    const { fake, sabadoIso } = await rodarTurno("As 11hrs")

    const visitas = fake.table("appointments")
    expect(visitas).toHaveLength(1)
    expect(visitas[0]!.scheduled_at).toBe(saturdayAt11Utc(sabadoIso))
    expect(visitas[0]!.lead_id).toBe(LEAD)
    expect(visitas[0]!.org_id).toBe(ORG)
    expect(visitas[0]!.created_by).toBe("nicole")
    expect(visitas[0]!.status).toBe("scheduled")
    expect(visitas[0]!.team).toBe("house")
  })

  it("limpa a pendência de dia — o rastro que denunciou o defeito em prod", async () => {
    // Em produção o `visit_pending_date` da Maria continuava gravado: prova de
    // que o ramo que agenda nunca rodou.
    const { fake } = await rodarTurno("As 11hrs")
    const estado = fake.table("conversation_state")[0]!
    expect(estado.collected_data).not.toHaveProperty("visit_pending_date")
  })

  it("avança o lead para Visita Agendada e carimba visit_scheduled_at", async () => {
    const { fake, sabadoIso } = await rodarTurno("As 11hrs")
    const lead = fake.table("leads")[0]!
    expect(lead.stage_id).toBe(STAGE_IDS.visita_agendada)
    expect(lead.visit_scheduled_at).toBe(saturdayAt11Utc(sabadoIso))
  })

  it("AC7 — a grafia que já funcionava continua gravando (não é regressão de rota)", async () => {
    const { fake, sabadoIso } = await rodarTurno("as 11h")
    expect(fake.table("appointments")).toHaveLength(1)
    expect(fake.table("appointments")[0]!.scheduled_at).toBe(saturdayAt11Utc(sabadoIso))
  })

  it("horário fora do expediente de sábado NÃO agenda nada", async () => {
    // Sábado fecha ao meio-dia: 15h não pode virar visita.
    const { fake } = await rodarTurno("As 15hrs")
    expect(fake.table("appointments")).toHaveLength(0)
  })
})
