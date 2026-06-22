import { describe, it, expect } from "vitest"
import { countUnreadForLead, type UnreadConv, type UnreadMsg } from "../unread-count"

const C1 = "conv-1"
const C2 = "conv-2"

describe("countUnreadForLead", () => {
  it("(a) broker_last_read_at=null → todas as mensagens role='user' contam", () => {
    const convs: UnreadConv[] = [{ id: C1, broker_last_read_at: null }]
    const msgs: UnreadMsg[] = [
      { conversation_id: C1, role: "user", created_at: "2026-06-20T10:00:00Z" },
      { conversation_id: C1, role: "user", created_at: "2026-06-21T10:00:00Z" },
    ]
    expect(countUnreadForLead(convs, msgs)).toBe(2)
  })

  it("(b) broker_last_read_at anterior às mensagens → contam", () => {
    const convs: UnreadConv[] = [{ id: C1, broker_last_read_at: "2026-06-20T00:00:00Z" }]
    const msgs: UnreadMsg[] = [
      { conversation_id: C1, role: "user", created_at: "2026-06-20T10:00:00Z" },
      { conversation_id: C1, role: "user", created_at: "2026-06-21T10:00:00Z" },
    ]
    expect(countUnreadForLead(convs, msgs)).toBe(2)
  })

  it("(c) broker_last_read_at posterior às mensagens → zero", () => {
    const convs: UnreadConv[] = [{ id: C1, broker_last_read_at: "2026-06-22T23:59:00Z" }]
    const msgs: UnreadMsg[] = [
      { conversation_id: C1, role: "user", created_at: "2026-06-20T10:00:00Z" },
      { conversation_id: C1, role: "user", created_at: "2026-06-21T10:00:00Z" },
    ]
    expect(countUnreadForLead(convs, msgs)).toBe(0)
  })

  it("(d) role='broker'/'assistant' nunca contam, mesmo após o cutoff", () => {
    const convs: UnreadConv[] = [{ id: C1, broker_last_read_at: null }]
    const msgs: UnreadMsg[] = [
      { conversation_id: C1, role: "broker", created_at: "2026-06-21T10:00:00Z" },
      { conversation_id: C1, role: "assistant", created_at: "2026-06-21T11:00:00Z" },
    ]
    expect(countUnreadForLead(convs, msgs)).toBe(0)
  })

  it("conta apenas as mensagens posteriores ao cutoff (mistura lida/não-lida)", () => {
    const convs: UnreadConv[] = [{ id: C1, broker_last_read_at: "2026-06-21T00:00:00Z" }]
    const msgs: UnreadMsg[] = [
      { conversation_id: C1, role: "user", created_at: "2026-06-20T10:00:00Z" }, // lida
      { conversation_id: C1, role: "user", created_at: "2026-06-21T10:00:00Z" }, // não-lida
      { conversation_id: C1, role: "user", created_at: "2026-06-22T10:00:00Z" }, // não-lida
    ]
    expect(countUnreadForLead(convs, msgs)).toBe(2)
  })

  it("ignora mensagens de conversas fora da lista `convs`", () => {
    const convs: UnreadConv[] = [{ id: C1, broker_last_read_at: null }]
    const msgs: UnreadMsg[] = [
      { conversation_id: C1, role: "user", created_at: "2026-06-21T10:00:00Z" },
      { conversation_id: C2, role: "user", created_at: "2026-06-21T10:00:00Z" }, // outra conv
    ]
    expect(countUnreadForLead(convs, msgs)).toBe(1)
  })

  it("agrega múltiplas conversas com cutoffs distintos", () => {
    const convs: UnreadConv[] = [
      { id: C1, broker_last_read_at: "2026-06-21T00:00:00Z" },
      { id: C2, broker_last_read_at: null },
    ]
    const msgs: UnreadMsg[] = [
      { conversation_id: C1, role: "user", created_at: "2026-06-20T10:00:00Z" }, // lida
      { conversation_id: C1, role: "user", created_at: "2026-06-22T10:00:00Z" }, // não-lida
      { conversation_id: C2, role: "user", created_at: "2026-06-19T10:00:00Z" }, // não-lida (conv null)
      { conversation_id: C2, role: "user", created_at: "2026-06-22T10:00:00Z" }, // não-lida
    ]
    expect(countUnreadForLead(convs, msgs)).toBe(3)
  })

  it("broker_last_read_at com data inválida → tratado como nunca lida (tudo conta)", () => {
    const convs: UnreadConv[] = [{ id: C1, broker_last_read_at: "data-invalida" }]
    const msgs: UnreadMsg[] = [
      { conversation_id: C1, role: "user", created_at: "2026-06-20T10:00:00Z" },
      { conversation_id: C1, role: "user", created_at: "2026-06-21T10:00:00Z" },
    ]
    expect(countUnreadForLead(convs, msgs)).toBe(2)
  })

  it("mensagem com created_at inválido é ignorada", () => {
    const convs: UnreadConv[] = [{ id: C1, broker_last_read_at: "2026-06-20T00:00:00Z" }]
    const msgs: UnreadMsg[] = [
      { conversation_id: C1, role: "user", created_at: "xx-invalida" },
      { conversation_id: C1, role: "user", created_at: "2026-06-21T10:00:00Z" },
    ]
    expect(countUnreadForLead(convs, msgs)).toBe(1)
  })

  it("listas vazias → zero", () => {
    expect(countUnreadForLead([], [])).toBe(0)
    expect(countUnreadForLead([{ id: C1, broker_last_read_at: null }], [])).toBe(0)
  })
})
