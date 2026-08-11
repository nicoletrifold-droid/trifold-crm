/**
 * Story 87-8 (item W1-1, `CR-1`) — o histórico passa a ser a CAUDA da conversa.
 *
 * O defeito, vivo desde o commit inicial da Nicole (`7194d9b2`, 31/03/2026):
 * `loadConversationHistory` ordena `ascending: true` e corta em 20, ou seja pega
 * as 20 mensagens MAIS ANTIGAS. Em conversa longa a Nicole enxerga o começo do
 * relacionamento e é cega para o presente.
 *
 * Todos os testes rodam pelo `processMessageWithMetadata` com o harness da
 * 75-279 (`createFakeSupabase` — usar, não recriar), pela mesma razão da 87-4:
 * função pura verde com pipeline nunca exercitado foi como as 75-245/75-268
 * passaram por QA com o INSERT em `appointments` nunca executado.
 *
 * `now` FIXO em todos (AC do @po, 07/08): sem isso a fixture "sábado" só resolve
 * quando a suíte roda num dia certo, e o próximo @dev acha que ela quebrou.
 *
 * Armadilha 3 da story: o `fakeSupabase` ordena por `String(...).localeCompare`.
 * As fixtures usam `created_at` em ISO e `id` ZERO-PADDED (`msg-01`), porque
 * `m1 < m10 < m2` lexicograficamente — com id não-padded o desempate ordenaria
 * errado e o teste passaria verde.
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type Anthropic from "@anthropic-ai/sdk"
import { STAGE_IDS } from "@trifold/shared"
import { processMessageWithMetadata } from "./pipeline"
import { createFakeSupabase, type FakeSupabase, type Row } from "./__fixtures__/fake-supabase"

const ORG = "org-1"
const CONVERSATION = "conv-1"
const LEAD = "lead-1"

/** Quarta-feira, 10:00 BRT. O "sábado" das fixtures resolve para 15/08/2026. */
const NOW = "2026-08-12T13:00:00Z"

/** Fala da Nicole que LIGA o modo agendamento (`NICOLE_TALKED_VISIT_RE`). */
const FALA_DE_VISITA =
  "Que tal agendar uma visita ao decorado? Qual o melhor dia pra você?"
/** Fala da Nicole que NÃO liga o modo agendamento — nenhum termo de agenda. */
const FALA_NEUTRA =
  "O condomínio tem área de lazer completa, com piscina e espaço gourmet."
/** Pergunta de nome — o que arma o `nameExpected` da 75-161. */
const PERGUNTA_DE_NOME = "Antes de continuar, como posso te chamar?"

interface Spec {
  role: "user" | "assistant"
  content: string
}

interface Turno {
  fake: FakeSupabase
  /** Conteúdos do `history` que foram para a Anthropic, em ordem. */
  historico: string[]
  /** O `messageWithContext` exato — inclui o bloco [SISTEMA] quando há. */
  bloco: string
  /** O `system` inteiro (blocos estáticos + dynamicSuffix) concatenado. */
  system: string
  eventos: Array<{ event_type: string; metadata?: Record<string, unknown> }>
  estado: Record<string, unknown>
  lead: Row | undefined
  /** Story 87-8 AC6 — o resumo de handoff entregue ao corretor. */
  handoffSummary: string | undefined
}

/**
 * Constrói `messages` com `created_at` ISO estritamente crescente (1 min de
 * passo) e `id` zero-padded. Nenhum empate de `created_at` aqui de propósito —
 * o empate tem teste próprio (Armadilha 1).
 */
function mensagens(specs: Spec[]): Row[] {
  return specs.map((s, i) => ({
    id: `msg-${String(i + 1).padStart(2, "0")}`,
    conversation_id: CONVERSATION,
    role: s.role,
    content: s.content,
    created_at: `2026-08-01T10:${String(i + 1).padStart(2, "0")}:00.000Z`,
  }))
}

/** `n` mensagens numeradas `m1`…`mn`, alternando user/assistant a partir de user. */
function numeradas(n: number): Spec[] {
  return Array.from({ length: n }, (_, i) => ({
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: `m${i + 1}`,
  }))
}

function anthropicCapturando(
  box: { historico: string[]; bloco: string; system: string; capturou: boolean },
  resposta: string
): Anthropic {
  return {
    messages: {
      create: async (args: {
        messages: Array<{ role: string; content: unknown }>
        system?: Array<{ type: string; text?: string }> | string
      }) => {
        // SÓ a primeira chamada é a da resposta. A segunda é o `updateLeadMemory`
        // (Haiku do resumo, fire-and-forget, `content` string simples) — sem esta
        // guarda ela sobrescreveria a captura com lixo e o teste mediria o resumo
        // achando que media a resposta.
        if (!box.capturou) {
          box.capturou = true
          // O último elemento é a mensagem ATUAL do lead (com o bloco [SISTEMA]);
          // tudo antes dele é o `history` carregado — é o que a AC1 mede.
          box.historico = args.messages
            .slice(0, -1)
            .map((m) => (typeof m.content === "string" ? m.content : ""))
          const last = args.messages[args.messages.length - 1]!
          const blocks = last.content as Array<{ type: string; text?: string }>
          box.bloco = Array.isArray(blocks)
            ? blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("")
            : String(last.content)
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

function seed(input: {
  msgs: Row[]
  collectedData?: Row
  properties?: Row[]
  propertyInterestId?: string | null
  leadName?: string | null
}) {
  return {
    conversations: [{ id: CONVERSATION, lead_id: LEAD, org_id: ORG }],
    conversation_state: [
      {
        conversation_id: CONVERSATION,
        collected_data: input.collectedData ?? {},
        qualification_step: "floor",
        current_property_id: null,
        visit_proposed: false,
      },
    ],
    leads: [
      {
        id: LEAD,
        name: input.leadName ?? null,
        phone: "5544999999999",
        stage_id: STAGE_IDS.novo,
        assigned_broker_id: "broker-1",
        lost_reason: null,
        ai_summary: null,
        source: "whatsapp_organic",
        qualification_status: "in_progress",
        property_interest_id: input.propertyInterestId ?? null,
        interest_level_manual: null,
      },
    ],
    messages: input.msgs,
    appointments: [],
    activities: [],
    lead_facts: [],
    properties: input.properties ?? [],
  }
}

async function turno(input: {
  msgs: Row[]
  mensagemDoLead: string
  respostaDaNicole?: string
  collectedData?: Row
  properties?: Row[]
  propertyInterestId?: string | null
  leadName?: string | null
}): Promise<Turno> {
  const box = { historico: [] as string[], bloco: "", system: "", capturou: false }
  const eventos: Turno["eventos"] = []
  const fake = createFakeSupabase(seed(input))
  const resultado = await processMessageWithMetadata({
    supabase: fake as unknown as SupabaseClient,
    anthropic: anthropicCapturando(box, input.respostaDaNicole ?? "Certo!"),
    conversationId: CONVERSATION,
    message: input.mensagemDoLead,
    orgId: ORG,
    onEvent: (e) =>
      eventos.push({ event_type: e.event_type, metadata: e.metadata as Record<string, unknown> }),
  })
  return {
    fake,
    historico: box.historico,
    bloco: box.bloco,
    system: box.system,
    eventos,
    estado: (fake.table("conversation_state")[0]?.collected_data as Record<string, unknown>) ?? {},
    lead: fake.table("leads")[0],
    handoffSummary: resultado.handoff?.summary,
  }
}

function fixarRelogio(iso: string) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(iso))
}

afterEach(() => {
  vi.useRealTimers()
})

// ────────────────────────────────────────────────────────────────────────────
// AC1 — o histórico é a CAUDA, em ordem cronológica
// ────────────────────────────────────────────────────────────────────────────

describe("AC1 — o histórico carregado é a cauda, em ordem cronológica", () => {
  it("com 25 mensagens, a Anthropic recebe m6…m25 (não m1…m20)", async () => {
    fixarRelogio(NOW)
    const t = await turno({ msgs: mensagens(numeradas(25)), mensagemDoLead: "oi" })

    const esperado = Array.from({ length: 20 }, (_, i) => `m${i + 6}`)
    expect(t.historico).toEqual(esperado)
    // Complemento obrigatório da AC: um teste que só conta 20 elementos passa
    // verde nos dois mundos. As pontas são o que discrimina.
    expect(t.historico[0]).toBe("m6")
    expect(t.historico[t.historico.length - 1]).toBe("m25")
    expect(t.historico).toHaveLength(20)
  })

  it("conversa curta (15) entrega as 15, inteiras e em ordem", async () => {
    fixarRelogio(NOW)
    const t = await turno({ msgs: mensagens(numeradas(15)), mensagemDoLead: "oi" })
    expect(t.historico).toEqual(Array.from({ length: 15 }, (_, i) => `m${i + 1}`))
  })

  it("🔴 a janela sai de created_at, NÃO de id — com id descorrelacionado (como o UUID de produção)", async () => {
    fixarRelogio(NOW)
    // Achado do gate + da remedição pós-merge: todas as outras fixtures deste
    // arquivo usam `id` ZERO-PADDED, que é perfeitamente correlacionado com o
    // `created_at`. Com isso, ordenar por `id` dá o MESMO resultado que ordenar
    // por `created_at` — e a AC1 fica verde **sem que a ordenação por
    // `created_at` jamais tenha sido exercitada**. Foi assim que o fake do
    // `HEAD` (que guardava só o ÚLTIMO `.order()`) passava despercebido.
    //
    // Em produção `messages.id` é UUID: descorrelacionado do relógio. Esta
    // fixture reproduz o pior caso — `id` em ordem INVERSA ao `created_at` —
    // e é a única que distingue "ordenou por created_at" de "ordenou por id".
    const msgs = mensagens(numeradas(25)).map((m, i) => ({
      ...m,
      id: `msg-${String(25 - i).padStart(2, "0")}`,
    }))
    const t = await turno({ msgs, mensagemDoLead: "oi" })
    expect(t.historico).toEqual(Array.from({ length: 20 }, (_, i) => `m${i + 6}`))
  })

  it("empate de created_at: o desempate por id preserva a ORDEM do grupo empatado", async () => {
    fixarRelogio(NOW)
    // 22 mensagens; m10, m11 e m12 compartilham o MESMO created_at.
    const msgs = mensagens(numeradas(22))
    msgs[9]!.created_at = "2026-08-01T10:10:00.000Z"
    msgs[10]!.created_at = "2026-08-01T10:10:00.000Z"
    msgs[11]!.created_at = "2026-08-01T10:10:00.000Z"

    const primeiro = await turno({ msgs, mensagemDoLead: "oi" })
    const segundo = await turno({ msgs, mensagemDoLead: "oi" })

    // 🔴 A asserção que DISCRIMINA (achado do gate da 87-8). Comparar dois runs
    // entre si NÃO prova nada: a leitura é determinística nos dois mundos, e o
    // sort do fake é estável — dois runs idênticos sempre concordam, com ou sem
    // desempate. O que o desempate carrega é a ORDEM: a consulta é DESCENDENTE e
    // o array é revertido, então sem o `.order("id", {ascending:false})` o grupo
    // empatado volta INVERTIDO (…m9, m12, m11, m10, m13…).
    expect(primeiro.historico).toEqual(Array.from({ length: 20 }, (_, i) => `m${i + 3}`))
    expect(primeiro.historico).toEqual(segundo.historico)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AC2 — `lastAssistantMsg` muda de referente (exigência do @architect)
// ────────────────────────────────────────────────────────────────────────────

describe("AC2 — lastAssistantMsg muda de referente, medido nas DUAS direções", () => {
  /**
   * (i) fala de visita na posição 3, cauda com fala neutra.
   *     `HEAD` (m1…m20) → última fala dela é a de VISITA  → modo agendamento LIGA
   *     cauda (m6…m25)  → última fala dela é a NEUTRA     → modo NÃO liga
   */
  const fixtureVisitaNoComeco = (): Row[] =>
    mensagens([
      { role: "user", content: "m1 oi" },
      { role: "assistant", content: FALA_DE_VISITA }, // posição 2-3, dentro da cabeça
      ...Array.from({ length: 21 }, (_, i) => ({
        role: "user" as const,
        content: `m${i + 3} tudo bem`,
      })),
      { role: "assistant", content: FALA_NEUTRA }, // posição 24, só na cauda
      { role: "user", content: "m25 entendi" },
    ])

  /**
   * (ii) o caso SIMÉTRICO — o que o @architect mediu: fala de visita na cauda.
   *      `HEAD` (m1…m20) → última fala dela é a NEUTRA  → modo NÃO liga
   *      cauda (m6…m25)  → última fala dela é de VISITA → modo LIGA
   */
  const fixtureVisitaNaCauda = (): Row[] =>
    mensagens([
      { role: "assistant", content: FALA_NEUTRA }, // posição 1, só na cabeça
      ...Array.from({ length: 22 }, (_, i) => ({
        role: "user" as const,
        content: `m${i + 2} tudo bem`,
      })),
      { role: "assistant", content: FALA_DE_VISITA }, // posição 24, só na cauda
      { role: "user", content: "m25 entendi" },
    ])

  const ligou = (bloco: string) => bloco.startsWith("[SISTEMA:")

  it("(i) fala de visita no COMEÇO deixa de armar o modo agendamento", async () => {
    fixarRelogio(NOW)
    const t = await turno({
      msgs: fixtureVisitaNoComeco(),
      mensagemDoLead: "Pode ser sábado?",
      collectedData: { name: "Ana" },
    })
    expect(ligou(t.bloco)).toBe(false)
  })

  it("(ii) fala de visita na CAUDA passa a armar o modo agendamento", async () => {
    fixarRelogio(NOW)
    const t = await turno({
      msgs: fixtureVisitaNaCauda(),
      mensagemDoLead: "Pode ser sábado?",
      collectedData: { name: "Ana" },
    })
    expect(ligou(t.bloco)).toBe(true)
    expect(t.bloco).toContain("sábado, 15 de agosto")
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AC3 — `nameExpected` acompanha o mesmo referente
// ────────────────────────────────────────────────────────────────────────────

describe("AC3 — nameExpected acompanha o referente, sem surpresa", () => {
  it("pergunta de nome no COMEÇO deixa de aceitar 'maicon' como nome", async () => {
    fixarRelogio(NOW)
    const msgs = mensagens([
      { role: "user", content: "m1 oi" },
      { role: "assistant", content: PERGUNTA_DE_NOME },
      ...Array.from({ length: 21 }, (_, i) => ({
        role: "user" as const,
        content: `m${i + 3} tudo bem`,
      })),
      { role: "assistant", content: FALA_NEUTRA },
      { role: "user", content: "m25 entendi" },
    ])
    const t = await turno({ msgs, mensagemDoLead: "maicon" })
    // Falso positivo de hoje: ela perguntou o nome há 20 mensagens.
    expect(t.estado.name).toBeUndefined()
  })

  it("pergunta de nome na CAUDA passa a aceitar 'maicon' como nome", async () => {
    fixarRelogio(NOW)
    const msgs = mensagens([
      { role: "assistant", content: FALA_NEUTRA },
      ...Array.from({ length: 22 }, (_, i) => ({
        role: "user" as const,
        content: `m${i + 2} tudo bem`,
      })),
      { role: "assistant", content: PERGUNTA_DE_NOME },
      { role: "user", content: "m25 entendi" },
    ])
    const t = await turno({ msgs, mensagemDoLead: "maicon" })
    expect(t.estado.name).toBe("Maicon")
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AC4 — a Nicole NÃO se reapresenta por causa da janela
// ────────────────────────────────────────────────────────────────────────────

const MARCA_NAO_REINTRO = "Voce JA se apresentou a este lead anteriormente"

describe("AC4 — a janela não pode fazer a Nicole se reapresentar (regressão da 59-1)", () => {
  it("(i) cauda-20 toda do lead, fala dela na posição 2 → bloco continua emitido", async () => {
    fixarRelogio(NOW)
    const msgs = mensagens([
      { role: "user", content: "m1 oi" },
      { role: "assistant", content: FALA_NEUTRA }, // posição 2 — fora da cauda
      ...Array.from({ length: 28 }, (_, i) => ({
        role: "user" as const,
        content: `m${i + 3} tudo bem`,
      })),
    ])
    const t = await turno({ msgs, mensagemDoLead: "oi de novo" })
    // A cauda-20 é toda do lead: `history.some(role==='assistant')` é false.
    expect(t.historico.length).toBe(20)
    expect(t.system).toContain(MARCA_NAO_REINTRO)
  })

  it("(iii) conversa curta: mesma string e NENHUMA consulta a mais que a longa-1", async () => {
    fixarRelogio(NOW)
    const curta = mensagens([
      { role: "user", content: "m1 oi" },
      { role: "assistant", content: FALA_NEUTRA },
      { role: "user", content: "m3 legal" },
    ])
    const tCurta = await turno({ msgs: curta, mensagemDoLead: "e o preço?" })
    expect(tCurta.system).toContain(MARCA_NAO_REINTRO)

    // O número ABSOLUTO de consultas não é asserção — seria constante
    // decorativa: no `HEAD` já são 2 (`loadConversationHistory` + o `count` do
    // Haiku em `12.5b`), e um número chumbado aqui só registraria o baseline,
    // não a garantia. O que a AC afirma é a DIFERENÇA: a conversa que trunca
    // paga exatamente UMA consulta a mais que a que não trunca.
    const tLonga = await turno({ msgs: mensagens(numeradas(25)), mensagemDoLead: "e o preço?" })
    const consultas = (t: Turno) => t.fake.calls.filter((c) => c === "select:messages").length
    expect(consultas(tLonga) - consultas(tCurta)).toBe(1)
  })

  it("(iii-c) a consulta extra some quando a cauda já tem fala da Nicole", async () => {
    fixarRelogio(NOW)
    // 25 alternadas: a cauda TEM assistant, então a 2ª consulta (existência de
    // fala dela fora da janela) não pode acontecer — ela é o caso de 0 %.
    const tAlternada = await turno({ msgs: mensagens(numeradas(25)), mensagemDoLead: "oi" })
    // 30 mensagens com a fala dela só na posição 2 → a cauda é toda do lead.
    const soDoLead = mensagens([
      { role: "user", content: "m1 oi" },
      { role: "assistant", content: FALA_NEUTRA },
      ...Array.from({ length: 28 }, (_, i) => ({
        role: "user" as const,
        content: `m${i + 3} tudo bem`,
      })),
    ])
    const tSoDoLead = await turno({ msgs: soDoLead, mensagemDoLead: "oi" })
    const consultas = (t: Turno) => t.fake.calls.filter((c) => c === "select:messages").length
    expect(consultas(tSoDoLead) - consultas(tAlternada)).toBe(1)
  })

  it("(iii-b) conversa curta SEM fala da Nicole não emite o bloco", async () => {
    fixarRelogio(NOW)
    const msgs = mensagens([{ role: "user", content: "m1 oi" }])
    const t = await turno({ msgs, mensagemDoLead: "tem apartamento?" })
    expect(t.system).not.toContain(MARCA_NAO_REINTRO)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AC7 — NICOLE_HISTORY_TRUNCATED, e ele reporta a CAUDA (é a M3 do epic)
// ────────────────────────────────────────────────────────────────────────────

describe("AC7 — NICOLE_HISTORY_TRUNCATED reporta a cauda", () => {
  it("(i) conversa de 25 → evento com total 25 e a mais recente = m25", async () => {
    fixarRelogio(NOW)
    const t = await turno({ msgs: mensagens(numeradas(25)), mensagemDoLead: "oi" })
    const ev = t.eventos.find((e) => e.event_type === "NICOLE_HISTORY_TRUNCATED")
    expect(ev).toBeDefined()
    expect(ev!.metadata).toMatchObject({
      conversation_id: CONVERSATION,
      limite: 20,
      total_na_conversa: 25,
      ordem: "cauda",
      mais_antiga_carregada: "2026-08-01T10:06:00.000Z",
      mais_recente_carregada: "2026-08-01T10:25:00.000Z",
    })
  })

  it("(i-b) o evento não carrega conteúdo de mensagem nem PII (regra do W0-2)", async () => {
    fixarRelogio(NOW)
    const t = await turno({ msgs: mensagens(numeradas(25)), mensagemDoLead: "oi" })
    const ev = t.eventos.find((e) => e.event_type === "NICOLE_HISTORY_TRUNCATED")!
    const serializado = JSON.stringify(ev.metadata)
    expect(serializado).not.toContain("m25")
    expect(serializado).not.toContain("m1")
    expect(Object.keys(ev.metadata!).sort()).toEqual([
      "conversation_id",
      "lead_id",
      "limite",
      "mais_antiga_carregada",
      "mais_recente_carregada",
      "ordem",
      "total_na_conversa",
    ])
  })

  it("(ii) conversa de 15 → NENHUM evento", async () => {
    fixarRelogio(NOW)
    const t = await turno({ msgs: mensagens(numeradas(15)), mensagemDoLead: "oi" })
    expect(t.eventos.find((e) => e.event_type === "NICOLE_HISTORY_TRUNCATED")).toBeUndefined()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AC5 — identificação de imóvel por contexto muda de INSUMO
// ────────────────────────────────────────────────────────────────────────────

// `loadProperties` filtra por `org_id`, `is_active` e — desde a Story 87-13 —
// `nicole_enabled`. Sem os TRÊS campos o fake devolve [] e o teste passaria verde
// sem nunca ter identificado nada.
//
// Story 87-13 — `nicole_enabled: true` aqui não é ruído de fixture: `is_active` é
// o soft delete ("existe no CRM") e `nicole_enabled` é o switch ("a IA fala
// dele"). Este teste é sobre a Nicole IDENTIFICAR o empreendimento, então os dois
// precisam estar ligados para ela. Foi este teste que acusou o filtro novo — e é
// o comportamento correto.
const PROPRIEDADES: Row[] = [
  {
    id: "prop-vind",
    org_id: ORG,
    is_active: true,
    nicole_enabled: true,
    name: "Vind Residence",
    slug: "vind-residence",
    status: "lancamento",
    typologies: [],
    units: [],
  },
  {
    id: "prop-origem",
    org_id: ORG,
    is_active: true,
    nicole_enabled: true,
    name: "Origem Home Club",
    slug: "origem-home-club",
    status: "lancamento",
    typologies: [],
    units: [],
  },
]

describe("AC5 — o imóvel por contexto passa a vir do trecho recente", () => {
  it("começo cita Vind, cauda cita Origem, property_interest_id vazio → grava Origem", async () => {
    fixarRelogio(NOW)
    const msgs = mensagens([
      { role: "user", content: "m1 quero saber do Vind Residence" },
      ...Array.from({ length: 22 }, (_, i) => ({
        role: "user" as const,
        content: `m${i + 2} tudo bem`,
      })),
      { role: "user", content: "m24 na verdade é do Origem Home Club" },
      { role: "user", content: "m25 isso" },
    ])
    const t = await turno({
      msgs,
      mensagemDoLead: "pode me mandar mais informações?",
      properties: PROPRIEDADES,
      propertyInterestId: null,
    })
    expect(t.lead?.property_interest_id).toBe("prop-origem")
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AC6 — `generateHandoffSummary` não regride de formato
// ────────────────────────────────────────────────────────────────────────────

/** Casa `OUT_OF_SCOPE_PATTERNS` — dispara o handoff de forma determinística. */
const PEDE_CORRETOR = "quero falar com um corretor"

describe("AC6 — generateHandoffSummary não regride de formato", () => {
  it("conversa curta: o resumo é byte a byte o do HEAD", async () => {
    fixarRelogio(NOW)
    const t = await turno({
      msgs: mensagens([
        { role: "user", content: "oi" },
        { role: "assistant", content: "Oi! Sou a Nicole, da Trifold." },
        { role: "user", content: "quero um de 2 quartos" },
      ]),
      mensagemDoLead: PEDE_CORRETOR,
      collectedData: { name: "Ana" },
    })
    // Capturado do `HEAD` no mesmo worktree, mesmo seed, mesmo `now`.
    expect(t.handoffSummary).toBe(
      [
        "=== RESUMO DO LEAD (HANDOFF) ===",
        "",
        "DADOS DO CONTATO:",
        "- Nome: Ana",
        "- Como conheceu: nao informado",
        "",
        "INTERESSE:",
        "- Empreendimento: nao informado",
        "- Quartos: nao informado",
        "- Andar: nao informado",
        "- Vista: nao informado",
        "- Vagas: nao informado",
        "- Entrada disponivel: nao informado",
        "- Disponibilidade para visita: nao informado",
        "",
        "MENSAGENS DO LEAD:",
        '- "oi"',
        '- "quero um de 2 quartos"',
        `- "${PEDE_CORRETOR}"`,
        "",
        "TOTAL DE MENSAGENS: 5",
        "=== FIM DO RESUMO ===",
      ].join("\n")
    )
  })

  it("conversa longa: o corretor passa a receber o PRESENTE, e o total segue coerente", async () => {
    fixarRelogio(NOW)
    const msgs = mensagens([
      { role: "user", content: "no começo eu queria 1 quarto" },
      ...Array.from({ length: 22 }, (_, i) => ({
        role: (i % 2 === 0 ? "assistant" : "user") as "user" | "assistant",
        content: `m${i + 2} conversa`,
      })),
      { role: "user", content: "hoje eu quero 3 quartos e vaga dupla" },
      { role: "assistant", content: FALA_NEUTRA },
    ])
    const t = await turno({ msgs, mensagemDoLead: PEDE_CORRETOR, collectedData: { name: "Ana" } })

    // É o objetivo da story: o resumo do handoff deixa de citar o começo.
    expect(t.handoffSummary).toContain("hoje eu quero 3 quartos e vaga dupla")
    expect(t.handoffSummary).not.toContain("no começo eu queria 1 quarto")
    // `TOTAL DE MENSAGENS` continua coerente com o array recebido:
    // 20 do histórico + a msg do lead + a resposta da Nicole.
    expect(t.handoffSummary).toContain(`TOTAL DE MENSAGENS: ${t.historico.length + 2}`)
    expect(t.historico).toHaveLength(20)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AC10 — as conversas CURTAS não sentem nada (87,5% da população)
// ────────────────────────────────────────────────────────────────────────────

describe("AC10 — turnos-ouro: conversa curta é byte a byte a do HEAD", () => {
  /**
   * As três strings abaixo foram CAPTURADAS do `HEAD` (worktree próprio em
   * `4da198e4`), com o mesmo seed, o mesmo `now` e o mesmo harness — não por
   * relato (nota `N3` do gate da 87-4).
   *
   * Qualquer diferença aqui é achado bloqueante: significaria que a story trocou
   * um defeito raro (12,5% das conversas) por um defeito geral.
   */
  const REGRA =
    " REGRA ABSOLUTA: só afirme dia/horário de visita que esteja NESTE bloco. Nunca invente, arredonde nem complete um horário — se o que o cliente pediu não está aqui, PERGUNTE em vez de confirmar.]"

  const OURO: Array<{ nome: string; msgs: Spec[]; mensagem: string; bloco: string }> = [
    {
      nome: "1) 4 mensagens, lead pergunta preço — sem bloco [SISTEMA]",
      msgs: [
        { role: "user", content: "oi, vi o anúncio" },
        { role: "assistant", content: "Oi! Sou a Nicole, da Trifold. Como posso ajudar?" },
        { role: "user", content: "queria saber do apartamento" },
        { role: "assistant", content: FALA_NEUTRA },
      ],
      mensagem: "qual o preço?",
      bloco: "qual o preço?",
    },
    {
      nome: "2) 6 mensagens, Nicole convidou pra visita, lead diz o dia",
      msgs: [
        { role: "user", content: "oi" },
        { role: "assistant", content: "Oi! Sou a Nicole, da Trifold." },
        { role: "user", content: "quero conhecer" },
        { role: "assistant", content: FALA_NEUTRA },
        { role: "user", content: "gostei" },
        { role: "assistant", content: FALA_DE_VISITA },
      ],
      mensagem: "Pode ser sábado?",
      bloco:
        "[SISTEMA: O cliente indicou o dia (sábado, 15 de agosto) mas não o horário. Pergunte qual horário prefere (atendemos seg–sex 8h–18h, sáb 8h–12h). NÃO afirme nenhum horário." +
        REGRA +
        "\n\nPode ser sábado?",
    },
    {
      nome: "3) 19 mensagens (a borda de baixo do limit) — nada trunca",
      msgs: [
        ...numeradas(18),
        { role: "assistant", content: FALA_DE_VISITA },
      ],
      mensagem: "Quero visitar sábado às 10h",
      bloco:
        "[SISTEMA: O cliente quer a visita em sábado, 15 de agosto às 10:00. Esse horário está LIVRE. Confirme a visita reafirmando o dia e o horário (sábado, 15 de agosto às 10:00) e diga que vai deixar o café preparado." +
        REGRA +
        "\n\nQuero visitar sábado às 10h",
    },
  ]

  for (const ouro of OURO) {
    it(`turno-ouro: ${ouro.nome}`, async () => {
      fixarRelogio(NOW)
      const t = await turno({
        msgs: mensagens(ouro.msgs),
        mensagemDoLead: ouro.mensagem,
        collectedData: { name: "Ana" },
      })
      expect(t.bloco).toBe(ouro.bloco)
      // O histórico curto vai INTEIRO, na mesma ordem — nada trunca.
      expect(t.historico).toEqual(ouro.msgs.map((m) => m.content))
      expect(t.eventos.find((e) => e.event_type === "NICOLE_HISTORY_TRUNCATED")).toBeUndefined()
    })
  }
})
