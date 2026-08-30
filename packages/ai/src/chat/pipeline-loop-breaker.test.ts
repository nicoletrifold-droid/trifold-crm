import { describe, it, expect, afterEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type Anthropic from "@anthropic-ai/sdk"
import { STAGE_IDS } from "@trifold/shared"
import {
  carregarMensagensRecentesDaNicole,
  processMessageWithMetadata,
} from "./pipeline"
import { LOOP_BOT_HANDOFF_REASON, LOOP_COUNT_MAX } from "../flows/loop-breaker"
import { createFakeSupabase, type FakeSupabase, type Row } from "./__fixtures__/fake-supabase"

/**
 * Story 87-20 — a trava DENTRO do `processMessage`, exercitada de ponta a ponta.
 *
 * O que este arquivo prova, e a suíte de funções puras não consegue provar:
 *
 *  1. **AC5 — nenhum efeito colateral do turno sobrevive.** A asserção é sobre o
 *     MECANISMO, não sobre uma lista: a única escrita do turno bloqueado é o
 *     `update:conversations` da contenção. Uma implementação de "marca a flag e pula
 *     depois" passaria numa lista de 8 nomes e vazaria as outras 7 escritas da janela.
 *  2. **O par bloqueado × não-bloqueado.** O MESMO turno, com a mesma fala do modelo,
 *     agenda visita de verdade quando o kill-switch está ligado (`appointments`,
 *     Google Calendar, `APPOINTMENT_CREATED`, avanço de estágio) — e não agenda nada
 *     quando a trava arma. Sem o controle, "nenhuma escrita aconteceu" poderia ser só
 *     um cenário que nunca escreveria nada.
 *  3. **AC4, segunda metade — a projeção do `.select()`.** O fake aplica as colunas
 *     de verdade: se `metadata` sair da lista, `isTransition` vira `false` para toda
 *     linha e a fala do corretor volta a ser contada como fala da Nicole.
 */

const ORG = "org-1"
const CONVERSATION = "conv-1"
const LEAD = "lead-1"
const BRT_OFFSET_MS = 3 * 3600_000

/** A fala que o modelo devolve nos dois lados do par — idêntica de propósito. */
const FALA = "Anotado, Maria! Te espero sábado às 11h."

function nextSaturdayIso(): string {
  const brtNow = new Date(Date.now() - BRT_OFFSET_MS)
  const d = new Date(Date.UTC(brtNow.getUTCFullYear(), brtNow.getUTCMonth(), brtNow.getUTCDate()))
  do {
    d.setUTCDate(d.getUTCDate() + 1)
  } while (d.getUTCDay() !== 6)
  return d.toISOString().slice(0, 10)
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

function minutosAtras(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString()
}

/**
 * O MESMO cenário de agendamento da `pipeline-scheduling.test.ts` (Story 75-279): a
 * Nicole já propôs o dia, o lead responde só com a hora, e o turno agenda a visita.
 * É um turno que escreve MUITO — appointments, activities, leads, conversation_state,
 * messages, calendário e push ao corretor. Exatamente por isso ele é o cenário certo
 * para medir "nenhum efeito colateral sobrevive".
 *
 * `anteriores` são as falas da Nicole já gravadas, que armam (ou não) os sinais.
 */
function seed(sabadoIso: string, anteriores: Row[]) {
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
    messages: anteriores,
    appointments: [],
    activities: [],
    lead_facts: [],
    properties: [],
  }
}

/** Duas falas IDÊNTICAS à que o modelo vai devolver — o Sinal A arma na 3ª. */
const DUAS_REPETICOES: Row[] = [
  { id: "m1", conversation_id: CONVERSATION, role: "assistant", content: FALA, created_at: minutosAtras(6), metadata: null },
  { id: "m2", conversation_id: CONVERSATION, role: "assistant", content: FALA, created_at: minutosAtras(3), metadata: null },
]

interface Turno {
  fake: FakeSupabase
  resultado: Awaited<ReturnType<typeof processMessageWithMetadata>>
  calendario: string[]
  eventos: string[]
}

async function rodarTurno(anteriores: Row[]): Promise<Turno> {
  const sabadoIso = nextSaturdayIso()
  const fake = createFakeSupabase(seed(sabadoIso, anteriores))
  const calendario: string[] = []
  const eventos: string[] = []
  const resultado = await processMessageWithMetadata({
    supabase: fake as unknown as SupabaseClient,
    anthropic: fakeAnthropic(FALA),
    conversationId: CONVERSATION,
    message: "As 11hrs",
    orgId: ORG,
    createCalendarEvent: async () => {
      calendario.push("create")
      return "google-event-1"
    },
    deleteCalendarEvent: async () => {
      calendario.push("delete")
    },
    onEvent: (e) => {
      eventos.push(e.event_type)
    },
  })
  return { fake, resultado, calendario, eventos }
}

/**
 * Toda operação do turno que NÃO é leitura. É aqui que o AC5 é medido.
 *
 * `rpc:match_knowledge` é a busca vetorial do RAG — leitura, e roda antes do ponto de
 * bloqueio. Excluída pelo NOME, não por prefixo `rpc:`: uma RPC nova que escreva não
 * pode entrar escondida nesta lista.
 */
function escritas(fake: FakeSupabase): string[] {
  return fake.calls.filter((c) => !c.startsWith("select:") && c !== "rpc:match_knowledge")
}

afterEach(() => {
  delete process.env.NICOLE_LOOP_BREAKER_OFF
})

// ---------------------------------------------------------------------------
// O par: o mesmo turno, com e sem a trava
// ---------------------------------------------------------------------------

describe("controle — com o kill-switch LIGADO, este turno escreve muito (AC12)", () => {
  it("agenda a visita, toca o Google Calendar, avisa o corretor e grava a mensagem", async () => {
    process.env.NICOLE_LOOP_BREAKER_OFF = "1"
    const { fake, resultado, calendario, eventos } = await rodarTurno(DUAS_REPETICOES)

    // O kill-switch pula os três sinais inteiramente: o turno segue normal.
    expect(resultado.bloqueadoPorLoop).toBeUndefined()
    expect(resultado.response).toBe(FALA)

    expect(fake.table("appointments")).toHaveLength(1)
    expect(calendario).toContain("create")
    expect(eventos).toContain("APPOINTMENT_CREATED")
    expect(fake.table("leads")[0]!.stage_id).toBe(STAGE_IDS.visita_agendada)
    expect(fake.table("activities").length).toBeGreaterThan(0)
    expect(fake.table("messages").filter((m) => m.role === "assistant")).toHaveLength(3)
    // E a conversa continua com a Nicole ativa — nada de handoff.
    expect(fake.table("conversations")[0]!.is_ai_active).toBeUndefined()
  })
})

describe("AC5 — ao disparar o Sinal A, NENHUM efeito colateral do turno sobrevive", () => {
  it("a ÚNICA escrita do turno é a contenção em `conversations`", async () => {
    const { fake } = await rodarTurno(DUAS_REPETICOES)
    // Mecanismo, não lista: qualquer escrita nova que alguém acrescente entre o
    // início da função e o ponto de bloqueio faz este teste reprovar.
    expect(escritas(fake)).toEqual(["update:conversations"])
  })

  it("nomeadamente: sem appointments, sem calendário, sem push ao corretor, sem patch de leads", async () => {
    const { fake, calendario, eventos } = await rodarTurno(DUAS_REPETICOES)

    expect(fake.table("appointments")).toHaveLength(0)
    expect(fake.table("activities")).toHaveLength(0)
    expect(calendario).toEqual([])
    expect(eventos).not.toContain("APPOINTMENT_CREATED")
    expect(eventos).not.toContain("APPOINTMENT_RESCHEDULED")
    expect(eventos).not.toContain("APPOINTMENT_CANCELLED")
    expect(fake.table("leads")[0]!.stage_id).toBe(STAGE_IDS.novo)
    expect(fake.table("leads")[0]!.visit_scheduled_at).toBeUndefined()
  })

  it("a mensagem bloqueada NÃO entra no histórico (sem saveMessages)", async () => {
    const { fake } = await rodarTurno(DUAS_REPETICOES)
    expect(fake.table("messages").filter((m) => m.role === "assistant")).toHaveLength(2)
  })

  it("o estado da conversa não é atualizado (sem updateConversationState/Timestamp)", async () => {
    const { fake } = await rodarTurno(DUAS_REPETICOES)
    // Pela CHAMADA, não pelo conteúdo da linha: o pipeline manipula `collected_data`
    // em memória durante o turno e o fake compartilha a referência da fixture, então
    // "o objeto mudou" não distingue escrita de mutação local. O que distingue é o
    // PostgREST ter sido chamado — e ele não foi.
    expect(fake.calls).not.toContain("update:conversation_state")
    expect(fake.calls).not.toContain("upsert:conversation_state")
    expect(fake.calls.filter((c) => c === "update:conversations")).toHaveLength(1)
  })
})

describe("AC6 — contenção reusa o mecanismo existente, aguardada", () => {
  it("grava os TRÊS campos do handoff em `conversations`", async () => {
    const { fake } = await rodarTurno(DUAS_REPETICOES)
    const conversa = fake.table("conversations")[0]!
    expect(conversa.is_ai_active).toBe(false)
    expect(conversa.handoff_reason).toBe(LOOP_BOT_HANDOFF_REASON)
    expect(typeof conversa.handoff_at).toBe("string")
    expect(new Date(String(conversa.handoff_at)).getTime()).toBeGreaterThan(Date.now() - 60_000)
  })

  /**
   * O carrasco do `await`. O fake resolve num macrotask; se a escrita não for
   * aguardada, `processMessageWithMetadata` retorna antes de `conversations` mudar e
   * a asserção acima vê a linha original. Aqui a asserção é feita IMEDIATAMENTE
   * depois do `await` da função, sem drenar fila nenhuma.
   */
  it("a escrita já COMPLETOU quando a função retorna — não é fire-and-forget", async () => {
    const sabadoIso = nextSaturdayIso()
    const fake = createFakeSupabase(seed(sabadoIso, DUAS_REPETICOES))
    const r = await processMessageWithMetadata({
      supabase: fake as unknown as SupabaseClient,
      anthropic: fakeAnthropic(FALA),
      conversationId: CONVERSATION,
      message: "As 11hrs",
      orgId: ORG,
    })
    expect(r.bloqueadoPorLoop).toBeDefined()
    expect(fake.table("conversations")[0]!.is_ai_active).toBe(false)
  })
})

describe("AC9 — o retorno carrega `bloqueadoPorLoop`, não uma string vazia sozinha", () => {
  it("Sinal A devolve tipo, ocorrências, conversa e lead", async () => {
    const { resultado } = await rodarTurno(DUAS_REPETICOES)
    expect(resultado.bloqueadoPorLoop).toEqual({
      tipo: "conteudo_repetido",
      ocorrencias: 2,
      conversationId: CONVERSATION,
      leadId: LEAD,
    })
    expect(resultado.response).toBe("")
  })

  it("o campo `handoff` (qualificação de lead) NÃO é sobrecarregado", async () => {
    const { resultado } = await rodarTurno(DUAS_REPETICOES)
    expect(resultado.handoff).toBeUndefined()
  })

  it("`pipeline.ts` não emite o evento pelo canal fire-and-forget — quem grava é o webhook", async () => {
    const { eventos } = await rodarTurno(DUAS_REPETICOES)
    expect(eventos).not.toContain("NICOLE_LOOP_DETECTADO")
  })
})

describe("AC3 — Sinal C dispara dentro do pipeline, com texto DIFERENTE a cada vez", () => {
  it("bloqueia a 3ª despedida e classifica como `encerramento`", async () => {
    const sabadoIso = nextSaturdayIso()
    const fake = createFakeSupabase(
      seed(sabadoIso, [
        { id: "m1", conversation_id: CONVERSATION, role: "assistant", content: "Tchau!", created_at: minutosAtras(6), metadata: null },
        { id: "m2", conversation_id: CONVERSATION, role: "assistant", content: "Fico à disposição.", created_at: minutosAtras(3), metadata: null },
      ])
    )
    const r = await processMessageWithMetadata({
      supabase: fake as unknown as SupabaseClient,
      anthropic: fakeAnthropic("Um abraço e até mais!"),
      conversationId: CONVERSATION,
      message: "ok",
      orgId: ORG,
    })
    expect(r.bloqueadoPorLoop?.tipo).toBe("encerramento")
    expect(r.bloqueadoPorLoop?.ocorrencias).toBe(2)
    expect(escritas(fake)).toEqual(["update:conversations"])
  })
})

describe("AC15 — Sinal B dispara ANTES de chamar a Anthropic", () => {
  it("a chamada ao modelo é pulada quando a contagem já está armada", async () => {
    const sabadoIso = nextSaturdayIso()
    const muitas: Row[] = Array.from({ length: LOOP_COUNT_MAX }, (_, i) => ({
      id: `m${i}`,
      conversation_id: CONVERSATION,
      role: "assistant",
      content: `fala distinta numero ${i}`,
      created_at: minutosAtras(9 - (i * 8) / LOOP_COUNT_MAX),
      metadata: null,
    }))
    const fake = createFakeSupabase(seed(sabadoIso, muitas))

    let chamouOModelo = false
    const anthropic = {
      messages: {
        create: async () => {
          chamouOModelo = true
          throw new Error("o modelo não deveria ter sido chamado")
        },
      },
    } as unknown as Anthropic

    const r = await processMessageWithMetadata({
      supabase: fake as unknown as SupabaseClient,
      anthropic,
      conversationId: CONVERSATION,
      message: "oi",
      orgId: ORG,
    })

    expect(chamouOModelo).toBe(false)
    expect(r.bloqueadoPorLoop).toEqual({
      tipo: "contagem_excessiva",
      ocorrencias: LOOP_COUNT_MAX,
      conversationId: CONVERSATION,
      leadId: LEAD,
    })
    expect(escritas(fake)).toEqual(["update:conversations"])
  })
})

describe("AC12 — kill-switch", () => {
  it("com NICOLE_LOOP_BREAKER_OFF=1 os três sinais são pulados e nada é consultado", async () => {
    process.env.NICOLE_LOOP_BREAKER_OFF = "1"
    const { fake, resultado } = await rodarTurno(DUAS_REPETICOES)
    expect(resultado.bloqueadoPorLoop).toBeUndefined()
    // A própria consulta da trava não roda: nenhuma leitura de `messages` filtrando
    // por `role='assistant'` com projeção de `metadata`.
    expect(
      fake.selects.filter((s) => s.table === "messages" && s.cols === "content, created_at, metadata")
    ).toHaveLength(0)
  })

  it("qualquer outro valor (inclusive vazio) mantém a trava LIGADA — fail-safe", async () => {
    process.env.NICOLE_LOOP_BREAKER_OFF = ""
    const { resultado } = await rodarTurno(DUAS_REPETICOES)
    expect(resultado.bloqueadoPorLoop).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// AC4, segunda metade — a projeção do `.select()` que alimenta os três sinais
// ---------------------------------------------------------------------------

describe("AC4 (2ª metade) — o carregador PROJETA `metadata`", () => {
  const AGORA = new Date("2020-01-01T01:00:00Z")

  function fakeComTransicao(): FakeSupabase {
    return createFakeSupabase({
      messages: [
        {
          id: "t1",
          conversation_id: CONVERSATION,
          role: "assistant",
          content: "Oi! Aqui é o corretor, assumi o atendimento.",
          created_at: "2020-01-01T00:59:31Z",
          metadata: { is_transition: true },
        },
        {
          id: "n1",
          conversation_id: CONVERSATION,
          role: "assistant",
          content: "Posso te ajudar em algo mais?",
          created_at: "2020-01-01T00:59:40Z",
          metadata: null,
        },
      ],
    })
  }

  it("a consulta nomeia `metadata` no `.select()` — asserção literal sobre a projeção", async () => {
    const fake = fakeComTransicao()
    await carregarMensagensRecentesDaNicole(fake as unknown as SupabaseClient, CONVERSATION, 30, AGORA)
    const consulta = fake.selects.find((s) => s.table === "messages")
    expect(consulta?.cols).toBeDefined()
    expect(consulta!.cols!.split(",").map((c) => c.trim())).toContain("metadata")
  })

  /**
   * A outra metade, e a que tem dente: o fake aplica a projeção de verdade. Tirar
   * `metadata` da lista de colunas faz `isTransition` virar `false` aqui — e a fala
   * do corretor volta a contar como fala da Nicole nos três sinais.
   */
  it("a linha com `is_transition: true` chega marcada — o filtro NÃO é no-op", async () => {
    const fake = fakeComTransicao()
    const recentes = await carregarMensagensRecentesDaNicole(
      fake as unknown as SupabaseClient,
      CONVERSATION,
      30,
      AGORA
    )
    expect(recentes).toHaveLength(2)
    expect(recentes[0]!.isTransition).toBe(true)
    expect(recentes[1]!.isTransition).toBe(false)
  })

  it("filtra por TEMPO (a janela), não por contagem — o que está fora não vem", async () => {
    const fake = createFakeSupabase({
      messages: [
        { id: "velha", conversation_id: CONVERSATION, role: "assistant", content: "antiga", created_at: "2020-01-01T00:00:00Z", metadata: null },
        { id: "nova", conversation_id: CONVERSATION, role: "assistant", content: "recente", created_at: "2020-01-01T00:59:40Z", metadata: null },
      ],
    })
    const recentes = await carregarMensagensRecentesDaNicole(
      fake as unknown as SupabaseClient,
      CONVERSATION,
      30,
      AGORA
    )
    expect(recentes.map((m) => m.content)).toEqual(["recente"])
  })

  it("só traz `role='assistant'` — a fala do lead não conta", async () => {
    const fake = createFakeSupabase({
      messages: [
        { id: "u", conversation_id: CONVERSATION, role: "user", content: "do lead", created_at: "2020-01-01T00:59:35Z", metadata: null },
        { id: "b", conversation_id: CONVERSATION, role: "broker", content: "do corretor", created_at: "2020-01-01T00:59:36Z", metadata: null },
        { id: "a", conversation_id: CONVERSATION, role: "assistant", content: "da nicole", created_at: "2020-01-01T00:59:40Z", metadata: null },
      ],
    })
    const recentes = await carregarMensagensRecentesDaNicole(
      fake as unknown as SupabaseClient,
      CONVERSATION,
      30,
      AGORA
    )
    expect(recentes.map((m) => m.content)).toEqual(["da nicole"])
  })

  it("erro de leitura devolve lista vazia — fail-open só aqui, e nunca bloqueia", async () => {
    const fake = createFakeSupabase(
      { messages: [] },
      { failOn: (p) => (p.table === "messages" ? { message: "boom" } : null) }
    )
    const recentes = await carregarMensagensRecentesDaNicole(
      fake as unknown as SupabaseClient,
      CONVERSATION,
      30,
      AGORA
    )
    expect(recentes).toEqual([])
  })
})
