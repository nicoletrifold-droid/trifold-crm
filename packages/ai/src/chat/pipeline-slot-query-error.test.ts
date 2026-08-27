/**
 * Story 87-18 — o erro de consulta da agenda para de virar "horário livre" em
 * silêncio, medido no nível do `processMessage`.
 *
 * Por que este arquivo existe separado dos testes de unidade de
 * `flows/visit-slot.test.ts`: as `AC2-i`, `AC4-ii`, `AC5` e `AC8` não são sobre o
 * VALOR DE RETORNO das duas funções — são sobre a FRASE que a Nicole recebe e
 * sobre a linha em `appointments` que deixa de ser gravada. A `AC4-ii` existe
 * justamente porque uma implementação que passasse a `AC4` inteira (retorno certo)
 * podia ainda jogar no lixo uma oferta boa na camada da mensagem.
 *
 * `AC8` — os QUATRO sítios de `pipeline.ts` têm teste próprio, não um
 * representativo. A `87-17` (`R1`) registrou que é fácil esquecer o segundo sítio
 * de uma dupla porque o primeiro é o que aparece na evidência de produção, e o
 * `:1044` já tem histórico de teste que só confere presença de bloco, não
 * conteúdo.
 *
 * O harness é o `createFakeSupabase` da 75-279 (usar, não recriar), com a
 * injeção de erro de consulta da `T0`. `failOn` é seletivo de propósito:
 * `pipeline.ts` faz TRÊS tipos de `select` em `appointments` no mesmo turno, e
 * falhar todos mudaria o RAMO exercitado em vez de exercitar o ramo sob
 * incerteza. `candidatoDeIsSlotFree` isola exatamente a consulta do `isSlotFree`.
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type Anthropic from "@anthropic-ai/sdk"
import { STAGE_IDS } from "@trifold/shared"
import { processMessageWithMetadata } from "./pipeline"
import {
  createFakeSupabase,
  candidatoDeIsSlotFree,
  type FakeSupabase,
  type FakeFailOn,
  type FakeQueryProbe,
  type Row,
} from "./__fixtures__/fake-supabase"
import { buildAgendaState } from "../flows/agenda-state"

const ORG = "org-1"
const CONVERSATION = "conv-1"
const LEAD = "lead-1"

/** Quarta-feira 2026-08-12, 10:00 BRT — o mesmo relógio dos turnos-ouro da 87-4. */
const NOW = "2026-08-12T13:00:00Z"

/** Trechos das duas frases NOVAS desta story, e das duas EXISTENTES que elas não substituem. */
const FRASE_NOVA_PEDIDO = "Não consegui confirmar agora se"
const FRASE_NOVA_PERIODO = "Não consegui confirmar a agenda desse período agora"
const FRASE_LIVRE = "está LIVRE"
const FRASE_OCUPADO_AGENDAR = "JÁ existe uma visita nesse horário"
const FRASE_OCUPADO_REMARCAR = "esse horário está ocupado"
const FRASE_OFERTA = "Horários LIVRES nesse período"
const FRASE_SEM_HORARIO = "não há horário livre nesse período"

interface Turno {
  fake: FakeSupabase
  /** O `messageWithContext` exato que foi para o modelo — inclui o bloco [SISTEMA]. */
  bloco: string
  eventos: Array<{ event_type: string; category: string; metadata?: Record<string, unknown> }>
}

function anthropicCapturando(box: { bloco: string }): Anthropic {
  return {
    messages: {
      create: async (args: { messages: Array<{ role: string; content: unknown }> }) => {
        const last = args.messages[args.messages.length - 1]!
        const blocks = last.content as Array<{ type: string; text?: string }>
        box.bloco = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("")
        return {
          content: [{ type: "text", text: "Certo!" }],
          usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        }
      },
    },
  } as unknown as Anthropic
}

function seed(collectedData: Row, opts?: { appointments?: Row[]; historicoDaNicole?: string; visitProposed?: boolean }) {
  return {
    conversations: [{ id: CONVERSATION, lead_id: LEAD, org_id: ORG }],
    conversation_state: [
      {
        conversation_id: CONVERSATION,
        collected_data: collectedData,
        qualification_step: "floor",
        current_property_id: null,
        visit_proposed: opts?.visitProposed ?? false,
      },
    ],
    leads: [
      {
        id: LEAD, name: "Fixture", phone: "5544999999999", stage_id: STAGE_IDS.novo,
        assigned_broker_id: "broker-1", lost_reason: null, ai_summary: null,
        source: "whatsapp_organic", qualification_status: "in_progress",
      },
    ],
    messages: opts?.historicoDaNicole
      ? [{ id: "m1", conversation_id: CONVERSATION, role: "assistant", content: opts.historicoDaNicole, created_at: "2026-01-01T10:00:00.000Z" }]
      : [],
    appointments: opts?.appointments ?? [],
    activities: [],
    lead_facts: [],
    properties: [],
  }
}

async function turno(input: {
  collectedData: Row
  mensagemDoLead: string
  appointments?: Row[]
  historicoDaNicole?: string
  visitProposed?: boolean
  failOn?: FakeFailOn
}): Promise<Turno> {
  const box = { bloco: "" }
  const eventos: Turno["eventos"] = []
  const fake = createFakeSupabase(
    seed(input.collectedData, {
      appointments: input.appointments,
      historicoDaNicole: input.historicoDaNicole,
      visitProposed: input.visitProposed,
    }),
    { failOn: input.failOn }
  )
  await processMessageWithMetadata({
    supabase: fake as unknown as SupabaseClient,
    anthropic: anthropicCapturando(box),
    conversationId: CONVERSATION,
    message: input.mensagemDoLead,
    orgId: ORG,
    onEvent: (e) => eventos.push({ event_type: e.event_type, category: e.category, metadata: e.metadata as Record<string, unknown> }),
  })
  return { fake, bloco: box.bloco, eventos }
}

const ERRO = { message: 'permission denied for table "appointments"' }

/** Falha TODA consulta de disponibilidade (outage total), preservando as outras. */
const falharTodosOsCandidatos: FakeFailOn = (probe) => (candidatoDeIsSlotFree(probe) ? ERRO : null)

/** Falha SÓ o candidato pedido (por horário UTC) — as demais consultas seguem normais. */
function falharCandidato(...isoUtc: string[]): FakeFailOn {
  return (probe: FakeQueryProbe) => {
    const c = candidatoDeIsSlotFree(probe)
    return c && isoUtc.includes(c.toISOString()) ? ERRO : null
  }
}

function fixarRelogio(iso: string) {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(iso))
}
afterEach(() => { vi.useRealTimers() })

/** Visita ativa da fixture — sexta 14/08 às 10:00 BRT. Arma os sítios `:1015`/`:1044`. */
const VISITA_ATIVA: Row = {
  id: "appt-1", lead_id: LEAD, org_id: ORG, team: "house", status: "scheduled",
  scheduled_at: "2026-08-14T13:00:00.000Z", google_event_id: null, broker_id: "broker-1",
}

const PENDENCIA_SABADO = (): Row => ({
  name: "Ana",
  agenda_state: buildAgendaState({
    citacao: "pode ser sábado", now: new Date(NOW), fonte: "pendencia", dataAbsoluta: "2026-08-15",
  }),
})

// ═══════════════════════════════════════════════════════════════════════════
// AC8 sítio 3 (`:1107`) — AGENDAR: dia + hora, sem visita ativa.
// AC2-i — a frase nova, e o `.insert()` que NÃO acontece.
// ═══════════════════════════════════════════════════════════════════════════
describe("AC2-i/AC8 — sítio :1107 (AGENDAR): horário pedido incerto", () => {
  const pedir = (failOn?: FakeFailOn) =>
    turno({
      collectedData: { name: "Ana" },
      mensagemDoLead: "Quero visitar sábado às 10h",
      historicoDaNicole: "Que tal agendar uma visita ao decorado?",
      failOn,
    })

  it("🔴 diz 'não consegui confirmar' — nem LIVRE (a mentira do HEAD) nem ocupado", async () => {
    fixarRelogio(NOW)
    const t = await pedir(falharTodosOsCandidatos)
    expect(t.bloco).toContain(FRASE_NOVA_PEDIDO)
    expect(t.bloco).not.toContain(FRASE_LIVRE)
    expect(t.bloco).not.toContain(FRASE_OCUPADO_AGENDAR)
  })

  it("🔴 NÃO grava nada em appointments — o INSERT do :1563 fica sem bookableSlotUtc", async () => {
    // É este o passo que o defeito original alcançava: `free === true` setava
    // `bookableSlotUtc` E `authorizedSlotUtc`, e a linha era criada por cima de um
    // horário que ninguém conseguiu conferir, com carimbo de legítima.
    fixarRelogio(NOW)
    const t = await pedir(falharTodosOsCandidatos)
    expect(t.fake.table("appointments")).toHaveLength(0)
    expect(t.fake.table("leads")[0]!.stage_id).not.toBe(STAGE_IDS.visita_agendada)
  })

  it("AC6 — o evento chega ao onEvent do processMessage (não só ao emit interno)", async () => {
    fixarRelogio(NOW)
    const t = await pedir(falharTodosOsCandidatos)
    const meus = t.eventos.filter((e) => e.event_type === "NICOLE_SLOT_QUERY_ERROR")
    expect(meus).toHaveLength(1)
    expect(meus[0]!.category).toBe("ai")
    expect(meus[0]!.metadata?.primario_com_erro).toBe(true)
    expect(meus[0]!.metadata?.candidatos_com_erro).toBe(1)
  })

  it("controle — sem erro de consulta, o sítio continua dizendo LIVRE e gravando", async () => {
    fixarRelogio(NOW)
    const t = await pedir()
    expect(t.bloco).toContain(FRASE_LIVRE)
    expect(t.bloco).not.toContain(FRASE_NOVA_PEDIDO)
    expect(t.fake.table("appointments")).toHaveLength(1)
    expect(t.eventos.filter((e) => e.event_type === "NICOLE_SLOT_QUERY_ERROR")).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AC8 sítio 1 (`:1015`) — REMARCAR: visita ativa + novo dia/hora.
// ═══════════════════════════════════════════════════════════════════════════
describe("AC2-i/AC8 — sítio :1015 (REMARCAR): horário pedido incerto", () => {
  const remarcar = (failOn?: FakeFailOn) =>
    turno({
      collectedData: PENDENCIA_SABADO(),
      mensagemDoLead: "às 10h",
      appointments: [VISITA_ATIVA],
      failOn,
    })

  it("🔴 diz 'não consegui confirmar' — nem LIVRE nem ocupado", async () => {
    fixarRelogio(NOW)
    const t = await remarcar(falharTodosOsCandidatos)
    expect(t.bloco).toContain(FRASE_NOVA_PEDIDO)
    expect(t.bloco).not.toContain(FRASE_LIVRE)
    expect(t.bloco).not.toContain(FRASE_OCUPADO_REMARCAR)
  })

  it("🔴 NÃO move a visita — rescheduleSlotUtc fica sem valor", async () => {
    fixarRelogio(NOW)
    const t = await remarcar(falharTodosOsCandidatos)
    expect(t.fake.table("appointments")).toHaveLength(1)
    expect(t.fake.table("appointments")[0]!.scheduled_at).toBe("2026-08-14T13:00:00.000Z")
  })

  it("controle — sem erro de consulta, o sítio continua REMARCANDO", async () => {
    fixarRelogio(NOW)
    const t = await remarcar()
    expect(t.bloco).toContain("REMARCAR")
    expect(t.fake.table("appointments")[0]!.scheduled_at).toBe("2026-08-15T13:00:00.000Z")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AC8 sítio 4 (`:1123`) — dia + período, sem visita ativa. AC4-ii e AC5.
// ═══════════════════════════════════════════════════════════════════════════
describe("AC4-ii/AC5/AC8 — sítio :1123 (dia + período, sem visita ativa)", () => {
  // Sábado 15/08 de manhã: 7 candidatos (08:00…11:00 BRT = 11:00Z…14:00Z), todos
  // livres na fixture. É o turno-ouro "dia+período" da 87-4, já recalibrado pela
  // 87-17 para `08:00 ou 09:30 ou 11:00`.
  const ofertar = (failOn?: FakeFailOn) =>
    turno({
      collectedData: { name: "Ana" },
      mensagemDoLead: "Sábado de manhã",
      historicoDaNicole: "Que tal agendar uma visita ao decorado?",
      failOn,
    })

  it("🔴 AC4-ii — incerteza PARCIAL (1 de 7) mantém a oferta normal, NÃO a frase nova", async () => {
    // A inversão da ordem (`houveIncerteza ? novo : …`) passaria AC4, AC5 e AC8 e
    // ainda assim descartaria uma oferta boa a cada soluço de UM candidato — a
    // opção (b) que o §5 rejeitou, entrando pela camada da mensagem.
    fixarRelogio(NOW)
    const t = await ofertar(falharCandidato("2026-08-15T12:30:00.000Z")) // 09:30 BRT
    expect(t.bloco).toContain(FRASE_OFERTA)
    expect(t.bloco).not.toContain(FRASE_NOVA_PERIODO)
    // O candidato incerto sai da amostra; os 6 confirmados livres continuam.
    expect(t.bloco).not.toContain("às 09:30")
    expect(t.bloco).toContain("às 08:00")
    expect(t.bloco).toContain("às 11:00")
    // E o evento é emitido de todo jeito: a oferta é boa, mas algo está quebrado.
    expect(t.eventos.filter((e) => e.event_type === "NICOLE_SLOT_QUERY_ERROR")).toHaveLength(1)
  })

  it("🔴 AC5 — TODOS incertos: diz 'não consegui confirmar', NÃO 'não há horário livre'", async () => {
    fixarRelogio(NOW)
    const t = await ofertar(falharTodosOsCandidatos)
    expect(t.bloco).toContain(FRASE_NOVA_PERIODO)
    expect(t.bloco).not.toContain(FRASE_SEM_HORARIO)
    expect(t.bloco).not.toContain(FRASE_OFERTA)
  })

  it("AC6 — evento agregado: UM por chamada, com os 7 candidatos contados", async () => {
    fixarRelogio(NOW)
    const t = await ofertar(falharTodosOsCandidatos)
    const meus = t.eventos.filter((e) => e.event_type === "NICOLE_SLOT_QUERY_ERROR")
    expect(meus).toHaveLength(1)
    expect(meus[0]!.metadata?.candidatos_totais).toBe(7)
    expect(meus[0]!.metadata?.candidatos_com_erro).toBe(7)
    expect(meus[0]!.metadata?.dia).toBe("2026-08-15")
    expect(meus[0]!.metadata?.periodo).toBe("manha")
  })

  it("controle — sem erro de consulta, a oferta existente é byte a byte a de sempre", async () => {
    fixarRelogio(NOW)
    const t = await ofertar()
    expect(t.bloco).toContain(
      "Horários LIVRES nesse período: sábado, 15 de agosto às 08:00 ou sábado, 15 de agosto às 09:30 ou sábado, 15 de agosto às 11:00."
    )
    expect(t.bloco).not.toContain(FRASE_NOVA_PERIODO)
    expect(t.eventos.filter((e) => e.event_type === "NICOLE_SLOT_QUERY_ERROR")).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AC8 sítio 2 (`:1044`) — período + visita ativa. O sítio com histórico de
// teste que só confere presença de bloco (87-17 §5) — aqui vai conteúdo.
// ═══════════════════════════════════════════════════════════════════════════
describe("AC4-ii/AC5/AC8 — sítio :1044 (período + visita ativa)", () => {
  const ofertar = (failOn?: FakeFailOn) =>
    turno({
      collectedData: PENDENCIA_SABADO(),
      mensagemDoLead: "de manhã",
      appointments: [VISITA_ATIVA],
      failOn,
    })

  it("🔴 AC4-ii — incerteza PARCIAL mantém a oferta normal e a visita atual mantida", async () => {
    fixarRelogio(NOW)
    const t = await ofertar(falharCandidato("2026-08-15T12:30:00.000Z")) // 09:30 BRT
    expect(t.bloco).toContain(FRASE_OFERTA)
    expect(t.bloco).not.toContain(FRASE_NOVA_PERIODO)
    expect(t.bloco).not.toContain("às 09:30")
    expect(t.bloco).toContain("segue mantida até ele escolher")
    expect(t.eventos.filter((e) => e.event_type === "NICOLE_SLOT_QUERY_ERROR")).toHaveLength(1)
  })

  it("🔴 AC5 — TODOS incertos: diz 'não consegui confirmar', NÃO 'não há horário livre'", async () => {
    fixarRelogio(NOW)
    const t = await ofertar(falharTodosOsCandidatos)
    expect(t.bloco).toContain(FRASE_NOVA_PERIODO)
    expect(t.bloco).not.toContain(FRASE_SEM_HORARIO)
    expect(t.bloco).not.toContain(FRASE_OFERTA)
    // A visita ativa segue intacta — nada foi remarcado sob incerteza.
    expect(t.fake.table("appointments")).toHaveLength(1)
    expect(t.fake.table("appointments")[0]!.scheduled_at).toBe("2026-08-14T13:00:00.000Z")
  })

  it("controle — sem erro de consulta, a oferta existente é a de sempre (golden G6)", async () => {
    fixarRelogio(NOW)
    const t = await ofertar()
    expect(t.bloco).toContain(
      "Horários LIVRES nesse período: sábado, 15 de agosto às 08:00 ou sábado, 15 de agosto às 09:30 ou sábado, 15 de agosto às 11:00."
    )
    expect(t.bloco).not.toContain(FRASE_NOVA_PERIODO)
    expect(t.eventos.filter((e) => e.event_type === "NICOLE_SLOT_QUERY_ERROR")).toHaveLength(0)
  })
})
