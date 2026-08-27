/**
 * Story 90-1 (Epic 90) — testes do orquestrador do Live Coach.
 *
 * O que estes testes protegem, em ordem de importância:
 *  1. **Fail-open**: o helper NUNCA lança. É o que garante que o webhook da Meta
 *     responde 200 mesmo com o coach quebrado.
 *  2. **O gate corrigido pelo @po**: handoff SEM mensagem do corretor ainda
 *     precisa gerar (`deriveBrokerActive`), e conversa que a Nicole vai reassumir
 *     NÃO pode gerar (`resolveTakeoverAnchor` + `shouldReactivateAi`).
 *  3. **Nenhuma IA antes dos gates** — custo.
 *  4. **Uma sugestão ativa por conversa** (supersede, não empilha).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

// ---- mocks do @trifold/ai ---------------------------------------------------
const detectMock = vi.fn()
const draftMock = vi.fn()
const searchMock = vi.fn(async () => [] as unknown[])
vi.mock("@trifold/ai", () => ({
  createAnthropicClient: () => ({}),
  detectObjection: (...a: unknown[]) => detectMock(...a),
  draftCoachReply: (...a: unknown[]) => draftMock(...a),
  searchKnowledge: (...a: unknown[]) => searchMock(...(a as [])),
  buildContextFromRAG: () => "Entrega 03/2027.",
  loadMemoryContext: async () => ({
    l1Snapshot: "MEMORIA: investidor",
    l2TopicMemories: "",
    l3DeepSearch: "",
    totalTokenEstimate: 10,
  }),
  // `isCoachEligible` NÃO é mockado de propósito: queremos a régua real.
  isCoachEligible: (text: string) => {
    const semUrls = text.replace(/https?:\/\/\S+|www\.\S+/gi, " ").trim()
    if (semUrls.length < 8) return false
    return /[a-záéíóúâêôãõàçüA-ZÁÉÍÓÚÂÊÔÃÕÀÇÜ]{3,}/.test(semUrls)
  },
}))

const canMock = vi.fn(async () => true)
vi.mock("@web/lib/permissions", () => ({
  can: (...a: unknown[]) => canMock(...(a as [])),
}))

const logMock = vi.fn()
vi.mock("@web/lib/logger", () => ({ logEvent: (p: unknown) => logMock(p) }))

import { generateCoachSuggestion, formatRecentHistory } from "./generate-suggestion"

const AGORA = Date.now()
const iso = (msAtras: number) => new Date(AGORA - msAtras).toISOString()
const HORA = 60 * 60 * 1000

interface State {
  lead: Record<string, unknown> | null
  conversation: Record<string, unknown> | null
  /** msgs role='broker' dentro da janela de 24h (gate 3) */
  brokerRecentes: { role: string; created_at: string }[]
  /** última msg role='broker' de todas (âncora de reativação) */
  brokerAny: { created_at: string }[]
  /** msgs role='broker' posteriores ao inbound (gate 5) */
  brokerDepois: { id: string }[]
  historico: { role: string; content: string; created_at: string }[]
}

let state: State
const inserted: Record<string, unknown>[] = []
const superseded: { calls: number } = { calls: 0 }

function makeSupabase() {
  const api = {
    from(table: string) {
      if (table === "leads") {
        return {
          select: () => api.from("leads"),
          eq: () => api.from("leads"),
          maybeSingle: async () => ({ data: state.lead, error: null }),
        } as never
      }
      if (table === "conversations") {
        return {
          select: () => api.from("conversations"),
          eq: () => api.from("conversations"),
          maybeSingle: async () => ({ data: state.conversation, error: null }),
        } as never
      }
      if (table === "conversation_state") {
        return {
          select: () => api.from("conversation_state"),
          eq: () => api.from("conversation_state"),
          maybeSingle: async () => ({ data: { current_property_id: null }, error: null }),
        } as never
      }
      if (table === "coach_suggestions") {
        const b: Record<string, unknown> = {
          update: () => {
            superseded.calls++
            return b
          },
          eq: () => b,
          is: () => b,
          then: (res: (v: unknown) => unknown) => res({ data: null, error: null }),
          insert: async (row: Record<string, unknown>) => {
            inserted.push(row)
            return { error: null }
          },
        }
        return b as never
      }
      // messages — QUATRO consultas distintas neste helper. O mock distingue por
      // (colunas do select + filtro de data usado), senão o histórico cairia no
      // ramo da âncora e o teste daria falso verde:
      //   gate 3 → select("role, created_at") + .gte(24h)
      //   âncora → select("created_at")        + sem filtro de data
      //   gate 5 → select("id")               + .gt(inbound)
      //   histórico → select("role, content, created_at") + sem filtro de data
      let cols = ""
      let usouGte = false
      let usouGt = false
      const mb: Record<string, unknown> = {
        select: (c: string) => {
          cols = c
          return mb
        },
        eq: () => mb,
        order: () => mb,
        gte: () => {
          usouGte = true
          return mb
        },
        gt: () => {
          usouGt = true
          return mb
        },
        limit: async () => {
          if (usouGt) return { data: state.brokerDepois, error: null }
          if (usouGte) return { data: state.brokerRecentes, error: null }
          if (cols.includes("content")) return { data: state.historico, error: null }
          return { data: state.brokerAny, error: null }
        },
      }
      return mb as never
    },
  }
  return api as never
}

const PARAMS = () => ({
  supabase: makeSupabase(),
  leadId: "lead-1",
  conversationId: "conv-1",
  orgId: "org-1",
  messageId: "msg-1",
  messageCreatedAt: iso(0),
  text: "achei caro, vi outro mais perto por menos",
})

const DETECCAO = { objecao: "achou caro", tipo: "preco", confianca: "alta" }
const DRAFT = {
  respostas: ["A diferença é a entrega em 03/2027."],
  ancoras: ["Entrega 03/2027"],
  ancorada: true,
  cuidado: null,
}

function eventTypes(): string[] {
  return logMock.mock.calls.map((c) => (c[0] as { event_type: string }).event_type)
}

beforeEach(() => {
  vi.clearAllMocks()
  inserted.length = 0
  superseded.calls = 0
  canMock.mockResolvedValue(true)
  detectMock.mockResolvedValue(DETECCAO)
  draftMock.mockResolvedValue(DRAFT)
  state = {
    lead: { id: "lead-1", assigned_broker_id: "user-broker", ai_summary: null },
    conversation: { id: "conv-1", is_ai_active: false, handoff_at: null },
    brokerRecentes: [{ role: "broker", created_at: iso(2 * HORA) }],
    brokerAny: [{ created_at: iso(2 * HORA) }],
    brokerDepois: [],
    // Ordem DESC (mais recente primeiro) — é o que o Supabase devolve com
    // `.order("created_at", { ascending: false })`. O helper aplica `.reverse()`
    // para chegar à ordem cronológica do prompt; o mock precisa entregar o mesmo
    // formato, senão o teste da ordem seria uma tautologia.
    historico: [
      { role: "broker", content: "bom dia! posso ajudar?", created_at: iso(2 * HORA) },
      { role: "user", content: "bom dia", created_at: iso(3 * HORA) },
    ],
  }
})

describe("generateCoachSuggestion — caminho felizardo", () => {
  it("gera e persiste a sugestão quando o corretor conduz", async () => {
    await generateCoachSuggestion(PARAMS())
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({
      conversation_id: "conv-1",
      message_id: "msg-1",
      tipo: "preco",
      confianca: "alta",
      ancorada: true,
    })
    expect(eventTypes()).toContain("LIVE_COACH_SUGGESTED")
  })

  it("passa o histórico recente (ordem cronológica) aos dois prompts", async () => {
    await generateCoachSuggestion(PARAMS())
    const [, detectArgs] = detectMock.mock.calls[0] as [unknown, { recentHistory: string }]
    expect(detectArgs.recentHistory).toContain("Lead: bom dia")
    expect(detectArgs.recentHistory).toContain("Corretor: bom dia! posso ajudar?")
    // mais antiga primeiro
    expect(detectArgs.recentHistory.indexOf("Lead: bom dia")).toBeLessThan(
      detectArgs.recentHistory.indexOf("Corretor:")
    )
    const [, draftArgs] = draftMock.mock.calls[0] as [unknown, { ragContext: string; leadProfile: string }]
    expect(draftArgs.ragContext).toContain("03/2027")
    expect(draftArgs.leadProfile).toContain("investidor")
  })

  it("supersede a sugestão ativa anterior antes de inserir a nova", async () => {
    await generateCoachSuggestion(PARAMS())
    expect(superseded.calls).toBe(1)
  })
})

describe("generateCoachSuggestion — gates (nenhuma IA gasta)", () => {
  it("mensagem inelegível: não chama modelo nenhum", async () => {
    await generateCoachSuggestion({ ...PARAMS(), text: "ok" })
    expect(detectMock).not.toHaveBeenCalled()
    expect(draftMock).not.toHaveBeenCalled()
    expect(inserted).toHaveLength(0)
  })

  it("Nicole ativa e sem corretor recente: não chama modelo", async () => {
    state.conversation = { id: "conv-1", is_ai_active: true, handoff_at: null }
    state.brokerRecentes = []
    state.brokerAny = []
    await generateCoachSuggestion(PARAMS())
    expect(detectMock).not.toHaveBeenCalled()
    expect(inserted).toHaveLength(0)
  })

  it("lead sem corretor atribuído: não gera", async () => {
    state.lead = { id: "lead-1", assigned_broker_id: null, ai_summary: null }
    await generateCoachSuggestion(PARAMS())
    expect(detectMock).not.toHaveBeenCalled()
  })

  it("capability leads.live_coach desligada: não gera (kill switch)", async () => {
    canMock.mockResolvedValue(false)
    await generateCoachSuggestion(PARAMS())
    expect(detectMock).not.toHaveBeenCalled()
    expect(inserted).toHaveLength(0)
  })

  it("corretor já respondeu depois do inbound: não gera (anti-ruído tardio)", async () => {
    state.brokerDepois = [{ id: "msg-broker-2" }]
    await generateCoachSuggestion(PARAMS())
    expect(detectMock).not.toHaveBeenCalled()
  })

  it("sem objeção detectada: Sonnet NÃO é chamado", async () => {
    detectMock.mockResolvedValue(null)
    await generateCoachSuggestion(PARAMS())
    expect(draftMock).not.toHaveBeenCalled()
    expect(inserted).toHaveLength(0)
    expect(eventTypes()).toContain("LIVE_COACH_NO_OBJECTION")
  })
})

describe("generateCoachSuggestion — gate do @po (handoff sem msg do corretor)", () => {
  it("GERA em handoff manual sem nenhuma msg do corretor", async () => {
    // is_ai_active=false por handoff; lastBrokerAt=null; handoff recente.
    state.conversation = { id: "conv-1", is_ai_active: false, handoff_at: iso(HORA) }
    state.brokerRecentes = []
    state.brokerAny = []
    await generateCoachSuggestion(PARAMS())
    expect(inserted).toHaveLength(1)
  })

  it("NÃO gera quando a Nicole vai reassumir (corretor inativo >= 24h)", async () => {
    state.conversation = { id: "conv-1", is_ai_active: false, handoff_at: iso(30 * HORA) }
    state.brokerRecentes = []
    state.brokerAny = [{ created_at: iso(30 * HORA) }]
    await generateCoachSuggestion(PARAMS())
    expect(detectMock).not.toHaveBeenCalled()
    expect(inserted).toHaveLength(0)
  })
})

describe("generateCoachSuggestion — fail-open", () => {
  it("detector lançando: resolve sem lançar, nada persistido, FAILED logado", async () => {
    detectMock.mockRejectedValue(new Error("timeout do Haiku"))
    await expect(generateCoachSuggestion(PARAMS())).resolves.toBeUndefined()
    expect(inserted).toHaveLength(0)
    expect(eventTypes()).toContain("LIVE_COACH_FAILED")
  })

  it("redator devolvendo null (JSON inválido): nada persistido, sem lançar", async () => {
    draftMock.mockResolvedValue(null)
    await expect(generateCoachSuggestion(PARAMS())).resolves.toBeUndefined()
    expect(inserted).toHaveLength(0)
  })

  it("RAG falhando não impede a sugestão", async () => {
    searchMock.mockRejectedValueOnce(new Error("embeddings fora"))
    await generateCoachSuggestion(PARAMS())
    expect(inserted).toHaveLength(1)
  })
})

describe("formatRecentHistory", () => {
  it("rotula papéis e distingue a Nicole do corretor humano", () => {
    const out = formatRecentHistory([
      { role: "user", content: "bom dia", created_at: iso(0) },
      { role: "assistant", content: "oi! sou a Nicole", created_at: iso(0) },
      { role: "broker", content: "aqui é o Robson", created_at: iso(0) },
    ])
    expect(out).toContain("Lead: bom dia")
    expect(out).toContain("Nicole (IA): oi! sou a Nicole")
    expect(out).toContain("Corretor: aqui é o Robson")
  })

  it("descarta mensagens sem conteúdo (mídia sem legenda)", () => {
    const out = formatRecentHistory([
      { role: "user", content: "   ", created_at: iso(0) },
      { role: "user", content: "achei caro", created_at: iso(0) },
    ])
    expect(out).toBe("Lead: achei caro")
  })
})
