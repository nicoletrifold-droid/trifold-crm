/**
 * Story 63-12 (Epic 63) — Tests for notifyBrokerOnReply + buildReplyPushPayload.
 *
 * Cobre as decisões de produto resolvidas pelo @po:
 *  - Q1 (gatilho): só dispara push quando o corretor já assumiu (role='broker'
 *    nas últimas 24h na conversa). Nicole sozinha → nenhum push.
 *  - Q3 (sem corretor): assigned_broker_id null → nenhum push, sem fallback.
 *  - Q2 (sem debounce): cada inbound que satisfaz o gate gera 1 push.
 *  - Best-effort: erro interno não propaga.
 *  - Payload/deep-link corretos (buildReplyPushPayload puro).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// server-only é guard de build sem comportamento em runtime de teste.
vi.mock("server-only", () => ({}))

const sendPushMock =
  vi.fn<
    (
      supabase: unknown,
      userId: string,
      payload: { title: string; body: string; url: string }
    ) => Promise<void>
  >()
vi.mock("@web/lib/server/push-service", () => ({
  sendPushToUser: (
    supabase: unknown,
    userId: string,
    payload: { title: string; body: string; url: string }
  ) => sendPushMock(supabase, userId, payload),
}))

import {
  notifyBrokerOnReply,
  buildReplyPushPayload,
} from "./notify-on-reply"

interface BrokerMsg {
  role: string
  created_at: string
}
interface FakeState {
  lead: Record<string, unknown> | null
  brokerMsgs: BrokerMsg[]
}
const state: FakeState = { lead: null, brokerMsgs: [] }

/** Admin client em memória: `leads.maybeSingle()` e `messages` (gate Q1). */
function makeSupabase() {
  return {
    from(table: string) {
      if (table === "leads") {
        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          maybeSingle: async () => ({ data: state.lead, error: null }),
        }
      }
      // table === "messages" — query do gate Q1, resolve via thenable encadeado.
      const builder: Record<string, unknown> = {
        select() {
          return builder
        },
        eq() {
          return builder
        },
        gte() {
          return builder
        },
        limit: async () => ({ data: state.brokerMsgs, error: null }),
      }
      return builder
    },
  }
}

const BASE = {
  leadId: "lead-1",
  conversationId: "conv-1",
  orgId: "org-1",
  messageExcerpt: "Oi, ainda tem unidade disponível?",
}

const now = Date.now()
const recentBroker: BrokerMsg = {
  role: "broker",
  created_at: new Date(now - 60 * 60 * 1000).toISOString(), // 1h atrás
}

beforeEach(() => {
  sendPushMock.mockReset()
  sendPushMock.mockResolvedValue(undefined)
  state.lead = null
  state.brokerMsgs = []
})

describe("notifyBrokerOnReply", () => {
  it("Q1 atendido (corretor assumiu) → envia 1 push com title/body/url corretos", async () => {
    state.lead = { id: "lead-1", name: "Maria", assigned_broker_id: "broker-9" }
    state.brokerMsgs = [recentBroker]

    await notifyBrokerOnReply({
      ...BASE,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: makeSupabase() as any,
    })

    expect(sendPushMock).toHaveBeenCalledTimes(1)
    const [, userId, payload] = sendPushMock.mock.calls[0]!
    expect(userId).toBe("broker-9")
    expect(payload.title).toBe("Maria respondeu")
    expect(payload.body).toBe("Oi, ainda tem unidade disponível?")
    expect(payload.url).toMatch(/\/broker\/leads\/lead-1$/)
  })

  it("Q3 — assigned_broker_id null → nenhum push (sem fallback)", async () => {
    state.lead = { id: "lead-1", name: "Maria", assigned_broker_id: null }
    state.brokerMsgs = [recentBroker]

    await notifyBrokerOnReply({
      ...BASE,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: makeSupabase() as any,
    })

    expect(sendPushMock).not.toHaveBeenCalled()
  })

  it("Q1 — Nicole sozinha (sem broker recente) → nenhum push", async () => {
    state.lead = { id: "lead-1", name: "Maria", assigned_broker_id: "broker-9" }
    state.brokerMsgs = [] // nenhuma mensagem role='broker' recente

    await notifyBrokerOnReply({
      ...BASE,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: makeSupabase() as any,
    })

    expect(sendPushMock).not.toHaveBeenCalled()
  })

  it("lead inexistente → nenhum push (finaliza silenciosamente)", async () => {
    state.lead = null
    await notifyBrokerOnReply({
      ...BASE,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: makeSupabase() as any,
    })
    expect(sendPushMock).not.toHaveBeenCalled()
  })

  it("best-effort — sendPushToUser lança → não propaga erro", async () => {
    state.lead = { id: "lead-1", name: "Maria", assigned_broker_id: "broker-9" }
    state.brokerMsgs = [recentBroker]
    sendPushMock.mockRejectedValue(new Error("vapid down"))

    await expect(
      notifyBrokerOnReply({
        ...BASE,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: makeSupabase() as any,
      })
    ).resolves.toBeUndefined()
  })
})

describe("buildReplyPushPayload", () => {
  it("nome presente + texto → title e body normais; url com deep-link", () => {
    const p = buildReplyPushPayload({
      leadName: "João",
      messageExcerpt: "tudo certo",
      appUrl: "https://app.trifold.com.br",
      leadId: "abc",
    })
    expect(p).toEqual({
      title: "João respondeu",
      body: "tudo certo",
      url: "https://app.trifold.com.br/broker/leads/abc",
    })
  })

  it('nome null → "Lead respondeu"', () => {
    const p = buildReplyPushPayload({
      leadName: null,
      messageExcerpt: "oi",
      appUrl: "https://x",
      leadId: "1",
    })
    expect(p.title).toBe("Lead respondeu")
  })

  it("texto vazio (mídia sem legenda) → body fallback", () => {
    const p = buildReplyPushPayload({
      leadName: "Ana",
      messageExcerpt: "",
      appUrl: "https://x",
      leadId: "1",
    })
    expect(p.body).toBe("Nova mensagem recebida.")
  })

  it("texto longo → body truncado em 100 chars", () => {
    const long = "a".repeat(250)
    const p = buildReplyPushPayload({
      leadName: "Ana",
      messageExcerpt: long,
      appUrl: "https://x",
      leadId: "1",
    })
    expect(p.body).toHaveLength(100)
  })
})
