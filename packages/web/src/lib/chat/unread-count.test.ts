import { describe, it, expect } from "vitest"
import { countUnreadRelationshipConversations } from "./unread-count"

const conv = (id: string, readAt: string | null) => ({ id, broker_last_read_at: readAt })
const msg = (conversationId: string, createdAt: string) => ({
  conversation_id: conversationId,
  created_at: createdAt,
})

describe("countUnreadRelationshipConversations", () => {
  it("conta conversa nunca lida com mensagem do cliente", () => {
    expect(
      countUnreadRelationshipConversations([conv("a", null)], [msg("a", "2026-07-28T12:00:00Z")]),
    ).toBe(1)
  })

  it("não conta conversa lida depois da última mensagem", () => {
    expect(
      countUnreadRelationshipConversations(
        [conv("a", "2026-07-28T13:53:52Z")],
        [msg("a", "2026-07-28T12:24:19Z")],
      ),
    ).toBe(0)
  })

  it("conta conversa com mensagem posterior à leitura", () => {
    expect(
      countUnreadRelationshipConversations(
        [conv("a", "2026-07-28T10:00:00Z")],
        [msg("a", "2026-07-28T12:00:00Z")],
      ),
    ).toBe(1)
  })

  it("conversa conta uma vez mesmo com várias mensagens não lidas", () => {
    expect(
      countUnreadRelationshipConversations(
        [conv("a", null)],
        [msg("a", "2026-07-28T12:00:00Z"), msg("a", "2026-07-28T12:05:00Z")],
      ),
    ).toBe(1)
  })

  it("soma conversas distintas e ignora as lidas", () => {
    expect(
      countUnreadRelationshipConversations(
        [conv("a", null), conv("b", "2026-07-28T13:00:00Z"), conv("c", "2026-07-01T00:00:00Z")],
        [
          msg("a", "2026-07-28T12:00:00Z"),
          msg("b", "2026-07-28T12:00:00Z"), // lida às 13h
          msg("c", "2026-07-20T00:00:00Z"), // posterior à leitura de 01/07
        ],
      ),
    ).toBe(2)
  })

  it("ignora mensagens de conversas fora da lista (não-relacionamento)", () => {
    expect(
      countUnreadRelationshipConversations([conv("a", null)], [msg("zz", "2026-07-28T12:00:00Z")]),
    ).toBe(0)
  })

  it("zero conversas ou zero mensagens → 0", () => {
    expect(countUnreadRelationshipConversations([], [])).toBe(0)
    expect(countUnreadRelationshipConversations([conv("a", null)], [])).toBe(0)
  })
})
