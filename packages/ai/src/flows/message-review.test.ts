import { describe, it, expect, vi } from "vitest"
import type Anthropic from "@anthropic-ai/sdk"
import {
  isReviewEligible,
  parseMessageReview,
  reviewOutgoingMessage,
} from "./message-review"

describe("isReviewEligible", () => {
  it("pula triviais: curtas, emoji-only, sem letras", () => {
    expect(isReviewEligible("ok")).toBe(false)
    expect(isReviewEligible("👍👍👍👍👍👍👍👍")).toBe(false)
    expect(isReviewEligible("44 9999-8888")).toBe(false)
    expect(isReviewEligible("   ")).toBe(false)
  })
  it("aceita mensagens reais", () => {
    expect(isReviewEligible("boa tarde, tudo bem?")).toBe(true)
    expect(isReviewEligible("segue o valor da unidade 702")).toBe(true)
  })
})

describe("parseMessageReview", () => {
  const ORIGINAL = "vou verificar o apartamemto e te retorno"

  it("aceita correção válida", () => {
    const r = parseMessageReview(
      JSON.stringify({ has_errors: true, corrected: "vou verificar o apartamento e te retorno" }),
      ORIGINAL
    )
    expect(r).toEqual({ has_errors: true, corrected: "vou verificar o apartamento e te retorno" })
  })

  it("normaliza has_errors=true com corrected igual ao original → false (AC2)", () => {
    const r = parseMessageReview(
      JSON.stringify({ has_errors: true, corrected: ORIGINAL }),
      ORIGINAL
    )
    expect(r).toEqual({ has_errors: false, corrected: ORIGINAL })
  })

  it("normaliza corrected vazio → false (AC2)", () => {
    const r = parseMessageReview(JSON.stringify({ has_errors: true, corrected: " " }), ORIGINAL)
    expect(r!.has_errors).toBe(false)
  })

  it("sem erro → false com original preservado", () => {
    const r = parseMessageReview(
      JSON.stringify({ has_errors: false, corrected: ORIGINAL }),
      ORIGINAL
    )
    expect(r).toEqual({ has_errors: false, corrected: ORIGINAL })
  })

  it("JSON inválido/prosa sem JSON → null (fail-open no chamador)", () => {
    expect(parseMessageReview("não achei erros!", ORIGINAL)).toBeNull()
  })

  it("recorta JSON cercado de prosa", () => {
    const r = parseMessageReview(
      `Aqui está: {"has_errors": false, "corrected": "${ORIGINAL}"} :)`,
      ORIGINAL
    )
    expect(r!.has_errors).toBe(false)
  })
})

describe("reviewOutgoingMessage — blocos do modelo (lição 82-4)", () => {
  function mockClient(content: unknown[]): Anthropic {
    return { messages: { create: vi.fn().mockResolvedValue({ content }) } } as unknown as Anthropic
  }

  it("lê texto mesmo com bloco de thinking antes", async () => {
    const client = mockClient([
      { type: "thinking", thinking: "" },
      { type: "text", text: JSON.stringify({ has_errors: true, corrected: "olá, tudo bem?" }) },
    ])
    const r = await reviewOutgoingMessage(client, "ola, tudo bem?")
    expect(r).toEqual({ has_errors: true, corrected: "olá, tudo bem?" })
  })

  it("só thinking sem texto → null", async () => {
    const client = mockClient([{ type: "thinking", thinking: "" }])
    expect(await reviewOutgoingMessage(client, "mensagem qualquer aqui")).toBeNull()
  })
})
