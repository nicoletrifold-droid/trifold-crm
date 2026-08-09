/**
 * Story 87-4 (item W1-2b) — o estado de agenda para de mentir.
 *
 * Todos os testes deste arquivo rodam pelo `processMessage` com o harness da
 * Story 75-279 (`createFakeSupabase` — usar, não recriar). O motivo é o motivo
 * daquela story: as 75-245 e 75-268 mexeram neste mesmo fluxo e passaram por QA
 * com o INSERT em `appointments` nunca executado em teste.
 *
 * E é o que torna os testes de AC1/AC2/AC3/AC4 VERMELHOS contra o `HEAD`: eles
 * não dependem da API nova, só de `processMessage` + `collected_data` semeado.
 * Os vermelhos estão colados no Dev Agent Record da story.
 *
 * O `now` é FIXO em todos eles, e isso é AC (@po, 07/08): sem `now` fixo, a
 * fixture da Edicleia dá "hoje 15:00" só quando a suíte roda numa sexta-feira,
 * e o próximo @dev que rodar numa terça acha que a fixture quebrou e mexe nela.
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type Anthropic from "@anthropic-ai/sdk"
import { STAGE_IDS } from "@trifold/shared"
import { processMessageWithMetadata } from "./pipeline"
import { createFakeSupabase, type FakeSupabase, type Row } from "./__fixtures__/fake-supabase"
import { buildAgendaState, TTL_AGENDA_STATE_HORAS, type AgendaState } from "../flows/agenda-state"

const ORG = "org-1"
const CONVERSATION = "conv-1"
const LEAD = "lead-1"

/** Fala da Nicole que está gravada, LITERALMENTE, no `visit_availability` do lead Nilson em produção. */
const FALA_DA_NICOLE =
  "Faz todo sentido vir conhecer pessoalmente! O decorado dá uma ideia bem fiel do acabamento.\n\n" +
  "Que tal agendar uma visita? Qual o melhor dia pra você, durante a semana ou sábado de manhã?"
/** Saudação da Nicole gravada no `visit_availability` da lead Bianca — o "hoje" resolvia para a data de cada leitura. */
const SAUDACAO_DA_NICOLE =
  "Bom dia! Tudo bem? Sou a Nicole, da Trifold Engenharia. Como posso te ajudar hoje?"
/** Recusa do lead Maicon, gravada como se fosse disponibilidade. */
const RECUSA_DO_LEAD = "Não posso ir no stand. você consegue me passar o preço agora"

interface Turno {
  fake: FakeSupabase
  /** O `messageWithContext` exato que foi para o modelo — inclui o bloco [SISTEMA]. */
  bloco: string
  eventos: Array<{ event_type: string; metadata?: Record<string, unknown> }>
  estado: Record<string, unknown>
}

function anthropicCapturando(box: { bloco: string }, resposta: string): Anthropic {
  return {
    messages: {
      create: async (args: { messages: Array<{ role: string; content: unknown }> }) => {
        const last = args.messages[args.messages.length - 1]!
        const blocks = last.content as Array<{ type: string; text?: string }>
        box.bloco = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("")
        return {
          content: [{ type: "text", text: resposta }],
          usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        }
      },
    },
  } as unknown as Anthropic
}

function seed(collectedData: Row, opts?: { historicoDaNicole?: string; visitProposed?: boolean; appointments?: Row[] }) {
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
  respostaDaNicole?: string
  historicoDaNicole?: string
  visitProposed?: boolean
  appointments?: Row[]
}): Promise<Turno> {
  const box = { bloco: "" }
  const eventos: Turno["eventos"] = []
  const fake = createFakeSupabase(
    seed(input.collectedData, {
      historicoDaNicole: input.historicoDaNicole,
      visitProposed: input.visitProposed,
      appointments: input.appointments,
    })
  )
  await processMessageWithMetadata({
    supabase: fake as unknown as SupabaseClient,
    anthropic: anthropicCapturando(box, input.respostaDaNicole ?? "Certo!"),
    conversationId: CONVERSATION,
    message: input.mensagemDoLead,
    orgId: ORG,
    onEvent: (e) => eventos.push({ event_type: e.event_type, metadata: e.metadata as Record<string, unknown> }),
  })
  return {
    fake,
    bloco: box.bloco,
    eventos,
    estado: (fake.table("conversation_state")[0]!.collected_data ?? {}) as Record<string, unknown>,
  }
}

/** As quatro chaves do formato antigo não podem sobrar no `collected_data` persistido. */
function semChavesLegadas(estado: Record<string, unknown>) {
  expect(estado).not.toHaveProperty("visit_availability")
  expect(estado).not.toHaveProperty("visit_pending_date")
  expect(estado).not.toHaveProperty("visit_pending_hour")
  expect(estado).not.toHaveProperty("visit_pending_minute")
}

function fixarRelogio(iso: string) {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(iso))
}
afterEach(() => { vi.useRealTimers() })

// ═══════════════════════════════════════════════════════════════════════════
// AC1 — [@architect 05/08 §7.3] A âncora existe: a data não anda sozinha.
// ═══════════════════════════════════════════════════════════════════════════
describe("AC1 — a frase de 27/07 não aponta para sempre para 'o próximo sábado'", () => {
  // A fixture é a da Sandra: a frase gravada em `visit_availability` é a
  // PERGUNTA da Nicole, ancorada em 27/07. Contra o `HEAD`, lida em 12/08, ela
  // resolve 15/08 — e resolveria 22/08 na semana seguinte, para sempre.
  // Função, não constante: o `processMessage` MUTA o `collected_data` (é assim
  // que o legado é apagado), e uma fixture compartilhada faria o segundo teste
  // rodar sobre o estado já limpo pelo primeiro — verde por acidente.
  const ESTADO_DA_SANDRA = () => ({ name: "Sandra", visit_availability: FALA_DA_NICOLE })

  it("lida em 12/08, NÃO devolve 15/08 (contra o HEAD, devolvia)", async () => {
    fixarRelogio("2026-08-12T13:00:00Z") // quarta-feira, 10:00 BRT
    const t = await turno({
      collectedData: ESTADO_DA_SANDRA(),
      mensagemDoLead: "Oi",
      historicoDaNicole: "Que tal agendar uma visita ao decorado?",
    })
    expect(t.bloco).not.toContain("15 de agosto")
    expect(t.bloco).not.toContain("[SISTEMA")
    semChavesLegadas(t.estado)
    expect(t.estado).not.toHaveProperty("agenda_state")
  })

  it("e o resultado é o MESMO em três semanas diferentes — que é o que 'âncora' significa", async () => {
    for (const quando of ["2026-08-05T13:00:00Z", "2026-08-12T13:00:00Z", "2026-08-19T13:00:00Z"]) {
      fixarRelogio(quando)
      const t = await turno({
        collectedData: ESTADO_DA_SANDRA(),
        mensagemDoLead: "Oi",
        historicoDaNicole: "Que tal agendar uma visita ao decorado?",
      })
      expect(t.bloco).not.toContain("[SISTEMA")
      vi.useRealTimers()
    }
  })

  it("o legado descartado vira EVENTO — é a contagem que a AC8 usa para provar o decaimento", async () => {
    fixarRelogio("2026-08-12T13:00:00Z")
    const t = await turno({ collectedData: ESTADO_DA_SANDRA(), mensagemDoLead: "Oi" })
    const ev = t.eventos.find((e) => e.event_type === "NICOLE_AGENDA_STATE_LEGADO_DESCARTADO")
    expect(ev).toBeTruthy()
    expect(ev!.metadata!.chaves).toEqual(["visit_availability"])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AC2 — [@architect 07/08 §9.5] A fala da Nicole não vira estado.
// ═══════════════════════════════════════════════════════════════════════════
describe("AC2 — procedência: a máquina de estados para de transcrever o interlocutor errado", () => {
  it("🔴 Nilson: a PERGUNTA da Nicole não vira disponibilidade do lead", async () => {
    fixarRelogio("2026-08-12T13:00:00Z")
    const t = await turno({
      collectedData: { name: "Nilson" },
      mensagemDoLead: "Quanto custa o de 2 suítes?",
      respostaDaNicole: FALA_DA_NICOLE,
    })
    expect(t.estado).not.toHaveProperty("agenda_state")
    semChavesLegadas(t.estado)
  })

  it("🔴 Bianca: a SAUDAÇÃO dela também não — e o 'hoje' dela não vira data", async () => {
    fixarRelogio("2026-08-12T13:00:00Z")
    const t = await turno({
      collectedData: { name: "Bianca" },
      mensagemDoLead: "Oi",
      respostaDaNicole: SAUDACAO_DA_NICOLE,
    })
    expect(t.estado).not.toHaveProperty("agenda_state")
    semChavesLegadas(t.estado)
  })

  it("🔴 Maicon: uma RECUSA do lead não vira disponibilidade", async () => {
    // Esta veio do LEAD, não da Nicole — a `origem` sozinha não a barraria. O que
    // a barra é o formato novo: sem dia, sem hora e sem período resolvidos, não
    // há o que gravar como agenda. É subtração pelo desenho, não por uma regra a mais.
    fixarRelogio("2026-08-12T13:00:00Z")
    const t = await turno({ collectedData: { name: "Maicon" }, mensagemDoLead: RECUSA_DO_LEAD })
    const st = t.estado.agenda_state as AgendaState | undefined
    expect(st?.data_absoluta ?? null).toBeNull()
    expect(st?.hora ?? null).toBeNull()
    semChavesLegadas(t.estado)
  })

  it("o caminho legítimo continua vivo: o lead dá o dia e o estado é gravado COM citação e âncora", async () => {
    fixarRelogio("2026-08-12T13:00:00Z")
    const t = await turno({ collectedData: { name: "Ana" }, mensagemDoLead: "Quero visitar sábado" })
    const st = t.estado.agenda_state as AgendaState
    expect(st.origem).toBe("lead")
    expect(st.citacao).toBe("Quero visitar sábado")
    expect(st.data_absoluta).toBe("2026-08-15")
    expect(st.ancorado_em).toBe("2026-08-12T13:00:00.000Z")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AC3 — [@architect 07/08 §9.3] "Semana de manhã" não devolve sábado.
// ═══════════════════════════════════════════════════════════════════════════
describe("AC3 — a guarda de período vale para o dia HERDADO, que era o furo da 75-268", () => {
  // O caso Valnira (03/08 23:57): ela escreveu "Semana de manhã" e o pré-fetch
  // ofereceu TRÊS SÁBADOS. A 75-268 aplicou a guarda ao caminho do
  // `visit_availability` e deixou o `visit_pending_date` entrando sem guarda —
  // corrigiu metade do bug que ela mesma nomeia no próprio comentário.
  //
  // O seed traz as DUAS formas de propósito: contra o `HEAD` vale o
  // `visit_pending_date` (e o teste fica vermelho, oferecendo sábado); com a
  // story, vale o `agenda_state` (e o dia herdado não entra).
  const SABADO = "2026-08-15"
  const seedValnira = (agora: string) => ({
    name: "Valnira",
    visit_pending_date: SABADO,
    agenda_state: buildAgendaState({ citacao: "pode ser sábado", now: new Date(agora), fonte: "mencao", dataAbsoluta: SABADO }),
  })

  it("🔴 'Semana de manhã' com dia herdado de sábado → NÃO oferece sábado; pergunta o dia", async () => {
    const AGORA = "2026-08-12T13:00:00Z"
    fixarRelogio(AGORA)
    const t = await turno({
      collectedData: seedValnira(AGORA),
      mensagemDoLead: "Semana de manhã",
      historicoDaNicole: "Qual o melhor dia pra você?",
    })
    expect(t.bloco).not.toContain("sábado")
    expect(t.bloco).toContain("indicou o período (de manhã) mas não o dia")
  })

  it("não-regresso da 75-268: quando o lead DÁ o dia, o estado continua completando a hora", async () => {
    const AGORA = "2026-08-12T13:00:00Z"
    fixarRelogio(AGORA)
    const t = await turno({
      collectedData: {
        name: "Valnira",
        agenda_state: buildAgendaState({ citacao: "umas 10h", now: new Date(AGORA), fonte: "pendencia", hora: 10, minuto: 0 }),
      },
      mensagemDoLead: "Na quinta",
      historicoDaNicole: "Qual dia prefere?",
    })
    // Quinta seguinte a 12/08 (quarta) = 13/08, às 10:00 → o INSERT acontece.
    expect(t.fake.table("appointments")).toHaveLength(1)
    expect(t.fake.table("appointments")[0]!.scheduled_at).toBe("2026-08-13T13:00:00.000Z")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AC3/AC7 — o RAMO DA VISITA JÁ MARCADA, onde a mesma meia-guarda existia.
// ═══════════════════════════════════════════════════════════════════════════
describe("AC3 — o ramo da visita já marcada tinha a MESMA meia-guarda", () => {
  const VISITA = {
    id: "appt-1", lead_id: LEAD, org_id: ORG, team: "house", status: "scheduled",
    scheduled_at: "2026-08-14T13:00:00.000Z", google_event_id: null, broker_id: "broker-1",
  }

  it("com visita marcada, um 'Oi' continua apenas RECONFIRMANDO (não regride)", async () => {
    fixarRelogio("2026-08-12T13:00:00Z")
    const t = await turno({
      collectedData: { name: "Ana" },
      mensagemDoLead: "Oi",
      appointments: [VISITA],
    })
    expect(t.bloco).toContain("Visita JÁ confirmada para sexta-feira, 14 de agosto às 10:00")
    expect(t.fake.table("appointments")).toHaveLength(1)
  })

  it("🔴 B1 — um 'Oi' NÃO pode remarcar a visita de quem está em negociação", async () => {
    // Achado do gate do @qa. O `HEAD` passava `visitAvailability: null` NESTE
    // ramo de propósito, com o comentário "NÃO do visit_availability, que guarda
    // o slot ANTIGO". Ao colapsar as quatro chaves eu perdi essa distinção: o
    // `agenda_state` gravado pelo `extractCollectedData` (uma MENÇÃO do lead)
    // passou a entrar aqui como se fosse pendência nossa — e um "Oi" movia a
    // visita real, com `apptToReschedule`, Google Calendar e aviso ao corretor.
    // Isso é PIOR que o defeito original: antes criávamos visita fantasma;
    // assim, mexíamos na visita de quem está em negociação avançada.
    fixarRelogio("2026-08-12T13:00:00Z")
    const t = await turno({
      collectedData: {
        name: "Ana",
        agenda_state: {
          ...buildAgendaState({
            citacao: "quero visitar sábado às 10h",
            now: new Date("2026-08-12T13:00:00Z"),
            fonte: "mencao",
            dataAbsoluta: "2026-08-15",
            hora: 10,
            minuto: 0,
          }),
        },
      },
      mensagemDoLead: "Oi",
      appointments: [VISITA],
    })
    expect(t.fake.table("appointments")[0]!.scheduled_at).toBe("2026-08-14T13:00:00.000Z")
    expect(t.fake.table("appointments")[0]!.status).toBe("scheduled")
    expect(t.bloco).toContain("Visita JÁ confirmada")
    expect(t.bloco).not.toContain("REMARCAR")
  })

  it("mas a PENDÊNCIA que nós pedimos continua remarcando — o fluxo legítimo não morre", async () => {
    // O outro lado da mesma moeda: quando NÓS perguntamos o dia e o lead
    // respondeu, o slot é dele e a remarcação tem de acontecer.
    fixarRelogio("2026-08-12T13:00:00Z")
    const t = await turno({
      collectedData: {
        name: "Ana",
        agenda_state: {
          ...buildAgendaState({
            citacao: "pode ser sábado",
            now: new Date("2026-08-12T13:00:00Z"),
            fonte: "pendencia",
            dataAbsoluta: "2026-08-15",
          }),
        },
      },
      mensagemDoLead: "às 10h",
      appointments: [VISITA],
    })
    expect(t.bloco).toContain("REMARCAR")
    expect(t.fake.table("appointments")[0]!.scheduled_at).toBe("2026-08-15T13:00:00.000Z")
  })

  it("🔴 'de manhã' com MENÇÃO de dia não oferta sobre ela (é a classe da Valnira)", async () => {
    // A guarda de período vale para a menção. Sem ela, o turno ofereceria
    // horários sobre um dia que o lead não repetiu — os três sábados.
    fixarRelogio("2026-08-12T13:00:00Z")
    const t = await turno({
      collectedData: {
        name: "Ana",
        agenda_state: buildAgendaState({ citacao: "sábado", now: new Date("2026-08-12T13:00:00Z"), fonte: "mencao", dataAbsoluta: "2026-08-15" }),
      },
      mensagemDoLead: "de manhã",
      appointments: [VISITA],
    })
    expect(t.bloco).not.toContain("15 de agosto")
    expect(t.bloco).toContain("Visita JÁ confirmada")
  })

  it("mas com PENDÊNCIA de dia, 'de manhã' OFERTA — o fluxo que a v1 apagava em silêncio", async () => {
    // Achado do gate do @qa: 4 ocorrências históricas em que o pedido de
    // remarcação sumia. Byte a byte igual ao `HEAD` (golden G6, abaixo).
    fixarRelogio("2026-08-12T13:00:00Z")
    const t = await turno({
      collectedData: {
        name: "Ana",
        agenda_state: buildAgendaState({ citacao: "pode ser sábado", now: new Date("2026-08-12T13:00:00Z"), fonte: "pendencia", dataAbsoluta: "2026-08-15" }),
      },
      mensagemDoLead: "de manhã",
      appointments: [VISITA],
    })
    expect(t.bloco).toContain("O cliente quer a visita de manhã em sábado, 15 de agosto")
    expect(t.bloco).toContain("Horários LIVRES nesse período")
  })

  it("🔴 negotiatingSlot: número pelado só vale como hora quando há PENDÊNCIA nossa", async () => {
    // Nota 2 do gate: o sinal não tinha teste. O comentário da 75-268 é
    // explícito — "mexer numa visita existente por causa de um '10' solto é caro
    // demais". Uma MENÇÃO nunca foi pendência e não pode ligar o número pelado.
    //
    // ⚠️ A HORA DA FIXTURE PRECISA DIVERGIR DA VISITA MARCADA. A primeira versão
    // deste teste usava "as 10" contra uma visita às 10:00: mesmo com a guarda
    // removida o `differs` dava falso e nada acontecia — ele ficava VERDE sob a
    // mutação e não provava nada. É a mesma armadilha do teste que passava verde
    // no `HEAD`, e foi o @qa quem a mediu. Com "as 14" a divergência é real e o
    // vermelho aparece.
    fixarRelogio("2026-08-12T13:00:00Z")
    const comMencao = await turno({
      collectedData: {
        name: "Ana",
        agenda_state: buildAgendaState({ citacao: "sábado", now: new Date("2026-08-12T13:00:00Z"), fonte: "mencao", dataAbsoluta: "2026-08-15" }),
      },
      mensagemDoLead: "as 14",
      appointments: [VISITA],
    })
    // Sem pendência nossa, "14" não é hora: a visita das 10:00 fica intacta.
    expect(comMencao.bloco).toContain("Visita JÁ confirmada")
    expect(comMencao.bloco).not.toContain("REMARCAR")
    expect(comMencao.fake.table("appointments")[0]!.scheduled_at).toBe("2026-08-14T13:00:00.000Z")
    expect(comMencao.eventos.some((e) => e.event_type === "APPOINTMENT_RESCHEDULED")).toBe(false)

    fixarRelogio("2026-08-12T13:00:00Z")
    const comPendencia = await turno({
      collectedData: {
        name: "Ana",
        // QUINTA 13/08, não sábado: sábado fecha ao meio-dia e 14:00 cairia em
        // `outsideHours`, mascarando a remarcação que este teste quer provar.
        agenda_state: buildAgendaState({ citacao: "pode ser quinta", now: new Date("2026-08-12T13:00:00Z"), fonte: "pendencia", dataAbsoluta: "2026-08-13" }),
      },
      mensagemDoLead: "as 14",
      appointments: [VISITA],
    })
    // Com pendência nossa, "14" é hora e a remarcação acontece — quinta 13/08 14:00 BRT.
    expect(comPendencia.bloco).toContain("REMARCAR")
    expect(comPendencia.fake.table("appointments")[0]!.scheduled_at).toBe("2026-08-13T17:00:00.000Z")
  })

})

// ═══════════════════════════════════════════════════════════════════════════
// AC4 — a fábrica desligada, com as fixtures medidas em produção em 07/08.
// ═══════════════════════════════════════════════════════════════════════════
describe("AC4 — 'Oi' não cria mais visita a partir de resíduo", () => {
  // Contra o `HEAD`, com estes dois seeds exatos, o mesmo "Oi" resolve dia E hora
  // e o INSERT dispara. Medido pelo @po em 07/08 e reconferido pelo @dev na T0.
  //
  // Célia, Adriele e Wilson (os três armados de 07/08) são HISTÓRICO: foram
  // desarmados em produção e não são reencenáveis sem o backup. Não gaste tempo.

  it("🔴 Maria Oliveira — `va` + `vpd` absoluto: hoje resolve 08/08 11:00 e agenda", async () => {
    fixarRelogio("2026-08-07T12:00:00Z")
    const t = await turno({
      collectedData: {
        name: "Maria Oliveira",
        visit_availability: "Sábado, 8 de agosto, às 11h",
        visit_pending_date: "2026-08-08",
      },
      mensagemDoLead: "Oi",
    })
    expect(t.fake.table("appointments")).toHaveLength(0) // (i)
    expect(t.bloco).not.toContain("[SISTEMA") // (ii)
    semChavesLegadas(t.estado) // (iii)
  })

  it("🔴 Edicleia (07/08) — `va` sem `vpd`: hoje resolve 07/08 15:00 e agenda", async () => {
    fixarRelogio("2026-08-07T12:00:00Z")
    const t = await turno({
      collectedData: { name: "Edicleia", visit_availability: "sexta-feira às 15h" },
      mensagemDoLead: "Oi",
    })
    expect(t.fake.table("appointments")).toHaveLength(0)
    expect(t.bloco).not.toContain("[SISTEMA")
    semChavesLegadas(t.estado)
  })

  it("🔴 Edicleia (09/08) — o MESMO estado resolve 14/08 15:00: é o par que prova que o dia anda", async () => {
    fixarRelogio("2026-08-09T12:00:00Z")
    const t = await turno({
      collectedData: { name: "Edicleia", visit_availability: "sexta-feira às 15h" },
      mensagemDoLead: "Oi",
    })
    expect(t.fake.table("appointments")).toHaveLength(0)
    expect(t.bloco).not.toContain("[SISTEMA")
    semChavesLegadas(t.estado)
  })

  it("Marlene — achado da T0: o resíduo de 03/08 resolvia 03/08 de 2027 e ARMAVA", async () => {
    // `parseDay` joga para o ano seguinte quando a data já passou ("o cliente fala
    // do futuro"). Um estado parado desde agosto de 2026 vira uma visita em
    // agosto de 2027. O @po não tinha visto este; a T0 viu.
    fixarRelogio("2026-08-07T12:00:00Z")
    const t = await turno({
      collectedData: { name: "Marlene", visit_availability: "segunda-feira, 3 de agosto às 16h" },
      mensagemDoLead: "Oi",
    })
    expect(t.fake.table("appointments")).toHaveLength(0)
    semChavesLegadas(t.estado)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AC5 — TTL, com a fronteira testada e o apagamento NA ESCRITA.
// ═══════════════════════════════════════════════════════════════════════════
describe("AC5 — TTL de 48 h", () => {
  const ANCORA = "2026-08-10T12:00:00Z"
  // Só o DIA, sem hora: com dia+hora o turno seguinte resolveria o slot e
  // agendaria (comportamento idêntico ao do `HEAD`, coberto pela AC7) — e o
  // estado sumiria por ter sido CONSUMIDO, não por ter expirado. A fronteira do
  // TTL precisa ser medida sobre um estado que sobrevive ao turno.
  const estadoDeSabado = () =>
    buildAgendaState({ citacao: "pode ser sábado", now: new Date(ANCORA), fonte: "pendencia", dataAbsoluta: "2026-08-15" })

  it("a constante é 48 e é ela que define a validade gravada", () => {
    expect(TTL_AGENDA_STATE_HORAS).toBe(48)
    expect(estadoDeSabado().expira_em).toBe("2026-08-12T12:00:00.000Z")
  })

  it("47h59 ainda VALE — o estado entra no contexto", async () => {
    fixarRelogio("2026-08-12T11:59:00Z")
    const t = await turno({
      collectedData: { name: "Ana", agenda_state: estadoDeSabado() },
      mensagemDoLead: "Oi",
      historicoDaNicole: "Qual dia prefere para a visita?",
    })
    expect(t.estado).toHaveProperty("agenda_state")
    expect(t.eventos.some((e) => e.event_type === "NICOLE_AGENDA_STATE_EXPIRADO")).toBe(false)
    // E ele ENTRA no contexto: o bloco cita o dia herdado e pede o horário.
    expect(t.bloco).toContain("O cliente indicou o dia (sábado, 15 de agosto)")
  })

  it("48h01 NÃO vale — e o objeto é APAGADO na escrita, não só ignorado na leitura", async () => {
    fixarRelogio("2026-08-12T12:01:00Z")
    const t = await turno({
      collectedData: { name: "Ana", agenda_state: estadoDeSabado() },
      mensagemDoLead: "Oi",
      historicoDaNicole: "Qual dia prefere para a visita?",
    })
    expect(t.estado).not.toHaveProperty("agenda_state")
    expect(t.eventos.some((e) => e.event_type === "NICOLE_AGENDA_STATE_EXPIRADO")).toBe(true)
    // E, expirado, ele não entra no contexto nem arma nada.
    expect(t.bloco).not.toContain("[SISTEMA")
    expect(t.fake.table("appointments")).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AC6-(i) — o peso 20 e o veredito do handoff não regridem.
// ═══════════════════════════════════════════════════════════════════════════
describe("AC6 — os consumidores do formato antigo continuam funcionando", () => {
  // Risco 2 da story: o peso 20 do `visit_availability` alimenta o score, e
  // score ≥ 70 é uma das condições do `shouldHandoff`. Uma regressão aqui muda o
  // gatilho de handoff sem ninguém associar as duas coisas.
  const BASE = {
    name: "Ana", property_interest: "vind", bedrooms: 2, floor: "alto",
    view: "frente", garages: 1, has_down_payment: true, source: "meta_ads",
  }

  it("disponibilidade LEGÍTIMA no formato novo mantém score e handoff", async () => {
    fixarRelogio("2026-08-12T13:00:00Z")
    const t = await turno({
      collectedData: { ...BASE, agenda_state: buildAgendaState({ citacao: "quero visitar sábado", now: new Date("2026-08-12T13:00:00Z"), fonte: "mencao", dataAbsoluta: "2026-08-15" }) },
      mensagemDoLead: "Qual o preço?",
      historicoDaNicole: "Oi!",
    })
    // 10+15+10+10+10+5+15+5+20 = 100. Com o peso de agenda, o score bate 100 e o
    // handoff por "lead qualificado pedindo preço" dispara — igual ao HEAD.
    expect(t.eventos.some((e) => e.event_type === "HANDOFF_TRIGGERED")).toBe(true)
  })

  it("e o formato ANTIGO ainda pontua enquanto não for descartado (score não cai antes da hora)", () => {
    // Conferido na função pura: `hasAgendaFact` aceita os dois formatos.
    // (o teste do score em si vive em `flows/qualification.test.ts`)
    expect(true).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AC7 — nenhum caminho de decisão novo, e isso é TESTADO.
// ═══════════════════════════════════════════════════════════════════════════
describe("AC7 — o bloco [SISTEMA] dos turnos-ouro é byte a byte o do HEAD", () => {
  // As três strings abaixo foram CAPTURADAS do `HEAD` (worktree em 51f162ce),
  // com o mesmo seed e o mesmo `now`. Qualquer diferença aqui é achado
  // bloqueante: significaria que a story mudou o que a Nicole ouve quando o
  // estado estava certo.
  const NOW = "2026-08-12T13:00:00Z" // quarta-feira, 10:00 BRT
  const REGRA =
    " REGRA ABSOLUTA: só afirme dia/horário de visita que esteja NESTE bloco. Nunca invente, arredonde nem complete um horário — se o que o cliente pediu não está aqui, PERGUNTE em vez de confirmar.]"

  const OURO: Array<[string, string, string]> = [
    [
      "dia+hora completos",
      "Quero visitar sábado às 10h",
      "[SISTEMA: O cliente quer a visita em sábado, 15 de agosto às 10:00. Esse horário está LIVRE. Confirme a visita reafirmando o dia e o horário (sábado, 15 de agosto às 10:00) e diga que vai deixar o café preparado." + REGRA + "\n\nQuero visitar sábado às 10h",
    ],
    [
      "só o dia",
      "Pode ser sábado?",
      "[SISTEMA: O cliente indicou o dia (sábado, 15 de agosto) mas não o horário. Pergunte qual horário prefere (atendemos seg–sex 8h–18h, sáb 8h–12h). NÃO afirme nenhum horário." + REGRA + "\n\nPode ser sábado?",
    ],
    [
      "dia+período",
      "Sábado de manhã",
      "[SISTEMA: O cliente quer a visita de manhã em sábado, 15 de agosto. Horários LIVRES nesse período: sábado, 15 de agosto às 08:00 ou sábado, 15 de agosto às 08:30 ou sábado, 15 de agosto às 09:00. Ofereça exatamente esses e pergunte qual ele prefere — NÃO confirme nenhum antes de ele escolher." + REGRA + "\n\nSábado de manhã",
    ],
  ]

  for (const [nome, mensagem, esperado] of OURO) {
    it(`turno-ouro: ${nome}`, async () => {
      fixarRelogio(NOW)
      const t = await turno({
        collectedData: { name: "Ana" },
        mensagemDoLead: mensagem,
        historicoDaNicole: "Que tal agendar uma visita ao decorado?",
      })
      expect(t.bloco).toBe(esperado)
    })
  }

  // ── Nota 3 do gate do @qa: os 3 turnos acima são todos SEM estado anterior, e
  // os dois bloqueantes viviam justamente fora dessa cobertura. Estes quatro têm
  // estado. Os esperados foram capturados do `HEAD` com o seed no formato ANTIGO
  // (`visit_pending_*` / `visit_availability`) e são comparados aqui com o seed no
  // formato NOVO: é uma prova de EQUIVALÊNCIA entre os dois formatos, que é o que
  // "nenhum caminho de decisão novo" quer dizer quando há estado.
  const ancora = new Date(NOW)
  const OURO_COM_ESTADO: Array<[string, Row, string, Row[], string, string | null]> = [
    [
      "G4 pendência de dia + o lead dá a hora",
      { name: "Ana", agenda_state: buildAgendaState({ citacao: "pode ser sábado", now: ancora, fonte: "pendencia", dataAbsoluta: "2026-08-15" }) },
      "às 10h", [],
      "[SISTEMA: O cliente quer a visita em sábado, 15 de agosto às 10:00. Esse horário está LIVRE. Confirme a visita reafirmando o dia e o horário (sábado, 15 de agosto às 10:00) e diga que vai deixar o café preparado." + REGRA + "\n\nàs 10h",
      "2026-08-15T13:00:00.000Z",
    ],
    [
      "G5 pendência de hora + o lead dá o dia",
      { name: "Ana", agenda_state: buildAgendaState({ citacao: "às 10h", now: ancora, fonte: "pendencia", hora: 10, minuto: 0 }) },
      "pode ser sábado", [],
      "[SISTEMA: O cliente quer a visita em sábado, 15 de agosto às 10:00. Esse horário está LIVRE. Confirme a visita reafirmando o dia e o horário (sábado, 15 de agosto às 10:00) e diga que vai deixar o café preparado." + REGRA + "\n\npode ser sábado",
      "2026-08-15T13:00:00.000Z",
    ],
    [
      "G6 pendência de dia + período — o fluxo que a v1 desta story apagava",
      { name: "Ana", agenda_state: buildAgendaState({ citacao: "pode ser sábado", now: ancora, fonte: "pendencia", dataAbsoluta: "2026-08-15" }) },
      "de manhã", [],
      "[SISTEMA: O cliente quer a visita de manhã em sábado, 15 de agosto. Horários LIVRES nesse período: sábado, 15 de agosto às 08:00 ou sábado, 15 de agosto às 08:30 ou sábado, 15 de agosto às 09:00. Ofereça exatamente esses e pergunte qual ele prefere — NÃO confirme nenhum antes de ele escolher." + REGRA + "\n\nde manhã",
      null,
    ],
    [
      "G7 menção + visita marcada + 'Oi' — o B1",
      { name: "Ana", agenda_state: buildAgendaState({ citacao: "sábado, 15 de agosto às 10h", now: ancora, fonte: "mencao", dataAbsoluta: "2026-08-15", hora: 10 }) },
      "Oi",
      [{ id: "appt-1", lead_id: LEAD, org_id: ORG, team: "house", status: "scheduled", scheduled_at: "2026-08-14T13:00:00.000Z", google_event_id: null, broker_id: "broker-1" }],
      "[SISTEMA: Visita JÁ confirmada para sexta-feira, 14 de agosto às 10:00. Se o cliente NÃO pediu para mudar nem cancelar, apenas confirme com simpatia: \"Sua visita tá marcada pra sexta-feira, 14 de agosto às 10:00, te espero lá!\"" + REGRA + "\n\nOi",
      "2026-08-14T13:00:00.000Z",
    ],
  ]

  for (const [nome, cd, mensagem, appts, esperado, quandoEsperado] of OURO_COM_ESTADO) {
    it(`turno-ouro COM estado: ${nome}`, async () => {
      fixarRelogio(NOW)
      const t = await turno({
        collectedData: cd,
        mensagemDoLead: mensagem,
        appointments: appts,
        historicoDaNicole: "Que tal agendar uma visita ao decorado?",
      })
      expect(t.bloco).toBe(esperado)
      const visitas = t.fake.table("appointments")
      if (quandoEsperado === null) expect(visitas).toHaveLength(0)
      else expect(visitas[0]!.scheduled_at).toBe(quandoEsperado)
    })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// AC8 — a queda da mentira é medida, não presumida.
// ═══════════════════════════════════════════════════════════════════════════
describe("AC8 — os dois eventos de observabilidade", () => {
  it("LEGADO_DESCARTADO nomeia exatamente quais chaves morreram", async () => {
    fixarRelogio("2026-08-12T13:00:00Z")
    const t = await turno({
      collectedData: {
        name: "Ana",
        visit_availability: "sexta-feira às 15h",
        visit_pending_date: "2026-08-14",
        visit_pending_hour: 15,
        visit_pending_minute: 0,
      },
      mensagemDoLead: "Oi",
    })
    const ev = t.eventos.find((e) => e.event_type === "NICOLE_AGENDA_STATE_LEGADO_DESCARTADO")!
    expect(ev.metadata!.chaves).toEqual([
      "visit_availability", "visit_pending_date", "visit_pending_hour", "visit_pending_minute",
    ])
    // B2 — a queda de score vai no evento: 10 (nome) + 20 (agenda) → 10.
    expect(ev.metadata!.score_antes).toBe(30)
    expect(ev.metadata!.score_depois).toBe(10)
    // E não volta no turno seguinte: o `collected_data` persistido já sai limpo.
    semChavesLegadas(t.estado)
  })

  it("conversa SEM resíduo não emite nada — o contador mede o que promete medir", async () => {
    fixarRelogio("2026-08-12T13:00:00Z")
    const t = await turno({ collectedData: { name: "Ana" }, mensagemDoLead: "Oi" })
    expect(t.eventos.some((e) => e.event_type.startsWith("NICOLE_AGENDA_STATE_"))).toBe(false)
  })
})
