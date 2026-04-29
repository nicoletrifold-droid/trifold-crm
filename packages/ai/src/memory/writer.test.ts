import { describe, it, expect, vi, beforeEach } from "vitest"
import { extractMemoryFragments, saveMemoryFragments, processConversationTurn } from "./writer"

// ============================================
// MOCKS
// ============================================

const mockAnthropicCreate = vi.fn()
const mockAnthropicClient = {
  messages: { create: mockAnthropicCreate },
} as unknown as import("@anthropic-ai/sdk").default

const mockSupabaseInsert = vi.fn().mockResolvedValue({ error: null })
const mockSupabaseFrom = vi.fn().mockReturnValue({ insert: mockSupabaseInsert })
const mockSupabaseClient = {
  from: mockSupabaseFrom,
} as unknown as import("@supabase/supabase-js").SupabaseClient

vi.mock("../rag/embeddings", () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockSupabaseFrom.mockReturnValue({ insert: mockSupabaseInsert })
  mockSupabaseInsert.mockResolvedValue({ error: null })
})

// ============================================
// extractMemoryFragments
// ============================================

describe("extractMemoryFragments — happy path", () => {
  it("returns parsed fragments from valid Haiku JSON", async () => {
    const fragments = [
      { room: "qualification", hall: "preferences", content: "Quer 3 quartos, andar alto", importance: 0.8 },
      { room: "negotiation", hall: "objections", content: "Achou o valor acima do orçamento", importance: 0.7 },
    ]
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(fragments) }],
    })

    const result = await extractMemoryFragments(
      mockAnthropicClient,
      "Quero 3 quartos num andar alto, mas tá caro",
      "Entendi! Vamos ver opções que cabem no seu orçamento.",
      "qualification"
    )

    expect(result).toHaveLength(2)
    expect(result[0].hall).toBe("preferences")
    expect(result[1].hall).toBe("objections")
  })

  it("limits to 3 fragments even if Haiku returns more", async () => {
    const fragments = Array.from({ length: 5 }, (_, i) => ({
      room: "general",
      hall: "facts",
      content: `Fato ${i}`,
      importance: 0.6,
    }))
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(fragments) }],
    })

    const result = await extractMemoryFragments(mockAnthropicClient, "msg", "resp", "general")
    expect(result).toHaveLength(3)
  })
})

describe("extractMemoryFragments — fallback on invalid JSON", () => {
  it("returns [] when Haiku returns non-JSON string", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "Não encontrei nada memorável nessa conversa." }],
    })

    const result = await extractMemoryFragments(mockAnthropicClient, "oi", "tudo bem?", "general")
    expect(result).toEqual([])
  })

  it("returns [] when Haiku returns JSON with invalid hall", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify([{ room: "general", hall: "invalid_hall", content: "x", importance: 0.8 }]) }],
    })

    const result = await extractMemoryFragments(mockAnthropicClient, "msg", "resp", "general")
    expect(result).toEqual([])
  })

  it("returns [] when Haiku call throws", async () => {
    mockAnthropicCreate.mockRejectedValue(new Error("timeout"))

    const result = await extractMemoryFragments(mockAnthropicClient, "msg", "resp", "general")
    expect(result).toEqual([])
  })
})

// ============================================
// saveMemoryFragments
// ============================================

describe("saveMemoryFragments — importance filter", () => {
  it("does NOT insert fragments with importance < 0.3", async () => {
    const { generateEmbedding } = await import("../rag/embeddings")

    await saveMemoryFragments(mockSupabaseClient, "lead-123", [
      { room: "general", hall: "facts", content: "Pouco relevante", importance: 0.2 },
    ])

    expect(generateEmbedding).not.toHaveBeenCalled()
    expect(mockSupabaseInsert).not.toHaveBeenCalled()
  })

  it("inserts fragments with importance >= 0.3", async () => {
    await saveMemoryFragments(mockSupabaseClient, "lead-123", [
      { room: "qualification", hall: "preferences", content: "Quer vista para frente", importance: 0.75 },
    ])

    expect(mockSupabaseInsert).toHaveBeenCalledOnce()
    expect(mockSupabaseInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        lead_id: "lead-123",
        room: "qualification",
        hall: "preferences",
        content: "Quer vista para frente",
      })
    )
  })

  it("skips only low-importance and inserts the rest", async () => {
    await saveMemoryFragments(mockSupabaseClient, "lead-123", [
      { room: "general", hall: "facts", content: "Irrelevante", importance: 0.1 },
      { room: "negotiation", hall: "objections", content: "Achou caro", importance: 0.8 },
    ])

    expect(mockSupabaseInsert).toHaveBeenCalledOnce()
  })
})

// ============================================
// processConversationTurn
// ============================================

describe("processConversationTurn — error resilience", () => {
  it("resolves without throwing when generateEmbedding fails", async () => {
    const { generateEmbedding } = await import("../rag/embeddings")
    vi.mocked(generateEmbedding).mockRejectedValueOnce(new Error("OpenAI down"))

    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify([
        { room: "qualification", hall: "preferences", content: "Quer 2 quartos", importance: 0.8 },
      ]) }],
    })

    await expect(
      processConversationTurn(mockSupabaseClient, mockAnthropicClient, "lead-123", "Quero 2 quartos", "Ótimo!")
    ).resolves.toBeUndefined()
  })

  it("resolves without throwing when Anthropic fails entirely", async () => {
    mockAnthropicCreate.mockRejectedValue(new Error("API unavailable"))

    await expect(
      processConversationTurn(mockSupabaseClient, mockAnthropicClient, "lead-123", "oi", "olá!")
    ).resolves.toBeUndefined()
  })
})

describe("processConversationTurn — null room fallback", () => {
  it("uses 'general' room when detectRoom returns null (generic message)", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "[]" }],
    })

    // Generic message that doesn't match any room keyword
    await expect(
      processConversationTurn(mockSupabaseClient, mockAnthropicClient, "lead-123", "oi tudo bem", "tudo bem sim!")
    ).resolves.toBeUndefined()

    // Haiku was called (room resolved to "general" without crashing)
    expect(mockAnthropicCreate).toHaveBeenCalledOnce()
    const callArg = mockAnthropicCreate.mock.calls[0][0]
    expect(callArg.messages[0].content).toContain("general")
  })
})
