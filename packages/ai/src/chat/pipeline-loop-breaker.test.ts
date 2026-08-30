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

/**
 * As colunas de um `.select()` registrado, por NOME.
 *
 * Forma única do arquivo, de propósito — CR-87-20-1. A versão anterior do filtro do
 * kill-switch comparava `s.cols` com o LITERAL do `.select()`
 * (`"content, created_at, metadata"`). Reordenar as colunas ou mexer num espaço — um
 * refator inócuo — fazia o filtro não casar nada, e `toHaveLength(0)` passava **vazio**:
 * o carrasco ficava cego justamente para o defeito que ele mira. É a mesma classe do
 * `grep -f` com arquivo ausente: verde por vacuidade.
 */
function colunasDe(cols: string): string[] {
  return cols.split(",").map((c) => c.trim())
}

/** O conjunto que a consulta da trava projeta (`carregarMensagensRecentesDaNicole`). */
const COLUNAS_DA_TRAVA = ["content", "created_at", "metadata"]

/**
 * As consultas da trava dentro de `fake.selects`, reconhecidas pelo CONJUNTO de colunas.
 *
 * Conjunto e não `includes("metadata")` porque o turno faz OUTRA leitura de `messages`
 * que também projeta `metadata`: o histórico da 87-8 (`role, content, created_at,
 * metadata`). Um filtro que só procurasse a coluna casaria o histórico e daria
 * falso-vermelho com o kill-switch ligado.
 */
function consultasDaTrava(fake: FakeSupabase): string[] {
  return fake.selects
    .filter((s) => s.table === "messages" && typeof s.cols === "string")
    .map((s) => s.cols!)
    .filter((cols) => {
      const nomes = colunasDe(cols)
      return (
        nomes.length === COLUNAS_DA_TRAVA.length &&
        COLUNAS_DA_TRAVA.every((c) => nomes.includes(c))
      )
    })
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

// ---------------------------------------------------------------------------
// CR-87-20-2 — a contenção pode FALHAR, e o chamador precisa saber
// ---------------------------------------------------------------------------

/**
 * O achado do CodeRabbit em `pipeline.ts:749`: o `UPDATE` da contenção tinha o `error`
 * IGNORADO. Se a escrita falhasse, `conterLoop` devolvia `bloqueadoPorLoop` do mesmo
 * jeito — e o resultado era o pior estado possível, escondido dentro da própria
 * correção que a story existe para entregar: o webhook grava o recibo e avisa o admin
 * de que a Nicole foi pausada, mas `is_ai_active` continua `true`, `handoff_reason`
 * continua vazio, o guard de reativação do AC14 não tem o que casar, e a próxima
 * mensagem do bot reinicia o loop.
 *
 * É a mesma família dos instrumentos cegos desta onda: **o mecanismo relata um estado
 * que ele não verificou ter alcançado.**
 *
 * O carrasco abaixo falha se o chamador for informado de contenção bem-sucedida.
 */
describe("CR-87-20-2 — UPDATE que falha NÃO pode ser reportado como contenção", () => {
  const ERRO_DO_BANCO = "permission denied for table conversations"

  /** Só o `UPDATE` em `conversations` falha — as leituras do turno seguem normais. */
  function fakeComContencaoQuebrada(): FakeSupabase {
    return createFakeSupabase(seed(nextSaturdayIso(), DUAS_REPETICOES), {
      failOn: (p) =>
        p.table === "conversations" && p.mode === "update" ? { message: ERRO_DO_BANCO } : null,
    })
  }

  async function turnoComContencaoQuebrada() {
    const fake = fakeComContencaoQuebrada()
    const resultado = await processMessageWithMetadata({
      supabase: fake as unknown as SupabaseClient,
      anthropic: fakeAnthropic(FALA),
      conversationId: CONVERSATION,
      message: "As 11hrs",
      orgId: ORG,
    })
    return { fake, resultado }
  }

  it("o retorno diz `contencao: \"falhou\"` e carrega o motivo do banco", async () => {
    const { resultado } = await turnoComContencaoQuebrada()
    expect(resultado.bloqueadoPorLoop).toEqual({
      tipo: "conteudo_repetido",
      ocorrencias: 2,
      conversationId: CONVERSATION,
      leadId: LEAD,
      contencao: "falhou",
      erro: ERRO_DO_BANCO,
    })
  })

  /**
   * A asserção que dói: o estado do banco NÃO mudou. É por isso que dizer "contido"
   * aqui é mentir — não existe pausa nenhuma para o guard do AC14 reconhecer.
   */
  it("`conversations` continua sem pausa — a contenção não aconteceu", async () => {
    const { fake } = await turnoComContencaoQuebrada()
    const conversa = fake.table("conversations")[0]!
    expect(conversa.is_ai_active).toBeUndefined()
    expect(conversa.handoff_reason).toBeUndefined()
    expect(conversa.handoff_at).toBeUndefined()
  })

  /**
   * Controle POSITIVO do par: o mesmo turno, com o `UPDATE` funcionando, diz
   * `"aplicada"`. Sem ele, `"falhou"` poderia ser uma constante — e o teste acima
   * concordaria com um `conterLoop` que reporta falha sempre.
   */
  it("controle — com o `UPDATE` normal, o mesmo turno diz `contencao: \"aplicada\"` e sem `erro`", async () => {
    const { resultado, fake } = await rodarTurno(DUAS_REPETICOES)
    expect(resultado.bloqueadoPorLoop).toEqual({
      tipo: "conteudo_repetido",
      ocorrencias: 2,
      conversationId: CONVERSATION,
      leadId: LEAD,
      contencao: "aplicada",
    })
    expect(fake.table("conversations")[0]!.is_ai_active).toBe(false)
  })

  /**
   * Falha de contenção NÃO vira permissão para falar: o turno segue suprimido (é um
   * loop — mandar a fala o alimentaria) e nenhuma outra escrita da janela vaza.
   */
  it("o envio continua suprimido e nenhuma outra escrita da janela vaza", async () => {
    const { fake, resultado } = await turnoComContencaoQuebrada()
    expect(resultado.response).toBe("")
    expect(escritas(fake)).toEqual(["update:conversations"])
    expect(fake.table("appointments")).toHaveLength(0)
    expect(fake.table("messages").filter((m) => m.role === "assistant")).toHaveLength(2)
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
      // CR-87-20-2 — `contencao` é obrigatório: "contido" deixou de ser implícito na
      // existência do campo e passou a ser afirmado, porque a escrita pode falhar.
      contencao: "aplicada",
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
      contencao: "aplicada",
    })
    expect(escritas(fake)).toEqual(["update:conversations"])
  })
})

describe("AC12 — kill-switch", () => {
  it("com NICOLE_LOOP_BREAKER_OFF=1 os três sinais são pulados e nada é consultado", async () => {
    process.env.NICOLE_LOOP_BREAKER_OFF = "1"
    const { fake, resultado } = await rodarTurno(DUAS_REPETICOES)
    expect(resultado.bloqueadoPorLoop).toBeUndefined()
    // A própria consulta da trava não roda. Reconhecida pelo CONJUNTO de colunas, não
    // pela string literal — ver `consultasDaTrava`.
    expect(consultasDaTrava(fake)).toHaveLength(0)
  })

  /**
   * CR-87-20-1 — o controle de VIVACIDADE do filtro acima, e o que impede o
   * `toHaveLength(0)` de passar por vacuidade. Com a trava LIGADA a mesma função de
   * filtro tem de ENCONTRAR a consulta; se ela deixar de casar (por ordem de coluna,
   * por espaço, por renome), este teste cai e o de cima não pode mais mentir sozinho.
   */
  it("controle de vivacidade — com a trava LIGADA, o MESMO filtro acha a consulta", async () => {
    const { fake } = await rodarTurno(DUAS_REPETICOES)
    expect(consultasDaTrava(fake)).toHaveLength(1)
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
    expect(colunasDe(consulta!.cols!)).toContain("metadata")
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
