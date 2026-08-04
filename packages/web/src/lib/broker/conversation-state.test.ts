import { describe, it, expect } from "vitest"
import { neverHadConversation } from "./conversation-state"

// Story 75-267 — derivação do estado "nunca teve conversa" (copy de abertura
// no composer + menu no drawer) vs "janela de 24h fechada" (teve conversa).

describe("neverHadConversation", () => {
  it("sem mensagens e sem last_message_at → nunca teve conversa", () => {
    expect(neverHadConversation(0, null)).toBe(true)
  })

  it("sem mensagens na thread mas com last_message_at → teve conversa (janela fechada)", () => {
    expect(neverHadConversation(0, new Date("2026-08-01T12:00:00Z"))).toBe(false)
  })

  it("com mensagens → teve conversa, mesmo sem last_message_at", () => {
    expect(neverHadConversation(3, null)).toBe(false)
  })

  it("com mensagens e last_message_at → teve conversa", () => {
    expect(neverHadConversation(1, new Date("2026-08-01T12:00:00Z"))).toBe(false)
  })
})
