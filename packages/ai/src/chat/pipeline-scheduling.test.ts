import { describe, it, expect } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { STAGE_IDS } from "@trifold/shared"
import { processMessage, SANITIZED_EMPTY_FALLBACK } from "./pipeline"
import { createFakeSupabase, type FakeSupabase } from "./__fixtures__/fake-supabase"
import { criarAnthropicFake, type CapturaAnthropic } from "./__fixtures__/anthropic-harness"

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

/**
 * Estado exato do incidente: a Nicole já perguntou o horário no turno anterior
 * (`visit_proposed`), o dia ficou pendente e o lead responde só com a hora.
 *
 * Story 87-4 — o dia pendente mudou de forma: era `visit_pending_date` (uma das
 * quatro chaves soltas) e passou a ser `agenda_state.data_absoluta`. O cenário é
 * IDÊNTICO; o que muda é o formato. A chave antiga não arma mais nada — e isso é
 * o objetivo da story, coberto por `pipeline-agenda-state.test.ts` (AC4).
 */
function seedDoIncidente(sabadoIso: string) {
  return {
    conversations: [{ id: CONVERSATION, lead_id: LEAD, org_id: ORG }],
    conversation_state: [
      {
        conversation_id: CONVERSATION,
        collected_data: {
          name: "Maria Oliveira",
          agenda_state: {
            citacao: "Pode ser sábado",
            origem: "lead",
            data_absoluta: sabadoIso,
            hora: null,
            minuto: null,
            periodo: null,
            ancorado_em: new Date().toISOString(),
            expira_em: new Date(Date.now() + 48 * 3600_000).toISOString(),
          },
        },
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

async function rodarTurno(
  mensagem: string
): Promise<{ fake: FakeSupabase; sabadoIso: string; captura: CapturaAnthropic }> {
  const sabadoIso = nextSaturdayIso()
  const fake = createFakeSupabase(seedDoIncidente(sabadoIso))
  const { anthropic, captura } = criarAnthropicFake({
    resposta: "Anotado, Maria! Te espero sábado às 11h.",
  })
  await processMessage({
    supabase: fake as unknown as SupabaseClient,
    anthropic,
    conversationId: CONVERSATION,
    message: mensagem,
    orgId: ORG,
  })
  return { fake, sabadoIso, captura }
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
    // que o ramo que agenda nunca rodou. Story 87-4 — a pendência agora mora em
    // `agenda_state`, e o teste continua verificando a MESMA coisa: ela some.
    const { fake } = await rodarTurno("As 11hrs")
    const estado = fake.table("conversation_state")[0]!
    expect(estado.collected_data).not.toHaveProperty("visit_pending_date")
    expect(estado.collected_data).not.toHaveProperty("agenda_state")
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

  it("QA — resposta que era SÓ o bloco vazado não vira mensagem vazia", async () => {
    // Sem esta guarda, a higienização do AC5 deixaria "" e o cliente receberia
    // silêncio: o webhook manda `text.body` sem checar vazio e a Graph API
    // recusa. Silêncio é pior que a fala que vazava.
    const sabadoIso = nextSaturdayIso()
    const fake = createFakeSupabase(seedDoIncidente(sabadoIso))
    await processMessage({
      supabase: fake as unknown as SupabaseClient,
      anthropic: criarAnthropicFake({ resposta: "[SISTEMA: horário 11h — LIVRE]" }).anthropic,
      conversationId: CONVERSATION,
      message: "As 11hrs",
      orgId: ORG,
    })
    const enviada = fake.table("messages").filter((m) => m.role === "assistant").pop()!
    expect(String(enviada.content).trim()).not.toBe("")
    expect(enviada.content).toBe(SANITIZED_EMPTY_FALLBACK)
    expect(String(enviada.content)).not.toContain("SISTEMA")
  })

  it("horário fora do expediente de sábado NÃO agenda nada", async () => {
    // Sábado fecha ao meio-dia: 15h não pode virar visita.
    const { fake } = await rodarTurno("As 15hrs")
    expect(fake.table("appointments")).toHaveLength(0)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Story 88-2 (AC6-iv) — este arquivo passa a afirmar sobre a ENTRADA do modelo
// ────────────────────────────────────────────────────────────────────────────

/**
 * Até a 88-2 este era o único dos cinco arquivos de turno que **não capturava
 * nada** (`create: async () => (...)`, zero argumentos): ele provava o EFEITO no
 * banco e nunca a INSTRUÇÃO que produziu o efeito. Migrar a fábrica sem acrescentar
 * uma asserção sobre a entrada deixaria a migração decorativa.
 *
 * 🔴 ACESSORES DECLARADOS (AC6-iv / emenda E1-b): estes casos exercitam **`bloco`
 * (M1a)** e **`historico` (M1c)**. Ambos pertencem à família de mutações do harness,
 * então este arquivo tem como ficar vermelho — o que a AC6-iii exige e que ele, com
 * 0 asserções sobre a entrada, não tinha.
 */
describe("Story 88-2 — AC6-iv: o que o modelo RECEBEU no turno da Maria", () => {
  it("o bloco [SISTEMA] autoriza o horário pedido, e é o mesmo que virou linha em appointments", async () => {
    const { fake, sabadoIso, captura } = await rodarTurno("As 11hrs")
    const bloco = captura.resposta().bloco

    // O dia é DERIVADO do sábado da fixture — nada de data fixa: `nextSaturdayIso`
    // depende do relógio da máquina de propósito (o horário tem de estar no futuro).
    const diaLegivel = new Date(saturdayAt11Utc(sabadoIso)).toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "long",
      day: "numeric",
      month: "long",
    })

    expect(bloco).toContain(`O cliente quer a visita em ${diaLegivel} às 11:00`)
    expect(bloco).toContain("Esse horário está LIVRE")
    // A instrução e o efeito falam do MESMO instante — é isto que a captura permite
    // afirmar e que o teste de efeito sozinho não alcança.
    expect(fake.table("appointments")[0]!.scheduled_at).toBe(saturdayAt11Utc(sabadoIso))
    // Controle: a mensagem crua do lead vai junto, embaixo do bloco.
    expect(bloco).toContain("As 11hrs")
  })

  it("o histórico entregue ao modelo é a pergunta da Nicole que armou a pendência", async () => {
    const { captura } = await rodarTurno("As 11hrs")
    expect(captura.resposta().historico).toEqual([
      "Ótimo, sábado funciona bem! Qual horário fica melhor pra você? Atendemos das 8h às 12h.",
    ])
  })

  it("horário fora do expediente: o bloco RECUSA, em vez de autorizar em silêncio", async () => {
    // O espelho do caso de efeito "As 15hrs não agenda nada": ali se prova que a
    // linha não nasce; aqui, que o modelo foi INSTRUÍDO a não confirmar. Sem isto,
    // um pipeline que ficasse mudo passaria igual nos dois.
    const { captura } = await rodarTurno("As 15hrs")
    const bloco = captura.resposta().bloco
    expect(bloco).toContain("fora do atendimento")
    expect(bloco).not.toContain("está LIVRE")
  })
})
