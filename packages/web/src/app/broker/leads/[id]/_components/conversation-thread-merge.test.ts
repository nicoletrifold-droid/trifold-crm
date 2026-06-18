import { describe, it, expect } from "vitest"
import { mergeMessages, type ThreadMessage } from "./conversation-thread-merge"
import type { OptimisticMessage } from "./broker-message-input"

const srv = (id: string, role: string): ThreadMessage => ({
  id,
  role,
  content: `msg-${id}`,
  created_at: "2026-06-18T10:00:00.000Z",
})

const opt = (id: string): OptimisticMessage => ({
  id,
  role: "broker",
  content: `opt-${id}`,
  created_at: "2026-06-18T10:05:00.000Z",
})

describe("mergeMessages", () => {
  it("lista vazia (servidor e otimista) → []", () => {
    expect(mergeMessages([], [])).toEqual([])
  })

  it("sem otimistas → preserva mensagens do servidor com roles mistos", () => {
    const server = [srv("1", "user"), srv("2", "assistant"), srv("3", "broker")]
    const result = mergeMessages(server, [])
    expect(result.map((m) => m.id)).toEqual(["1", "2", "3"])
    expect(result.map((m) => m.role)).toEqual(["user", "assistant", "broker"])
  })

  it("otimista nova (id ausente no servidor) → anexada ao final", () => {
    const server = [srv("1", "user")]
    const result = mergeMessages(server, [opt("temp-99")])
    expect(result.map((m) => m.id)).toEqual(["1", "temp-99"])
    expect(result.find((m) => m.id === "temp-99")?.content).toBe("opt-temp-99")
  })

  it("otimista cujo id já voltou do servidor (pós-refresh) → descartada (sem duplicar)", () => {
    const server = [srv("1", "user"), srv("m-real", "broker")]
    const result = mergeMessages(server, [opt("m-real")])
    expect(result.map((m) => m.id)).toEqual(["1", "m-real"])
    // a versão do servidor prevalece (sem duplicata)
    expect(result.filter((m) => m.id === "m-real")).toHaveLength(1)
    expect(result.find((m) => m.id === "m-real")?.content).toBe("msg-m-real")
  })

  it("mistura: uma otimista já confirmada e outra ainda pendente", () => {
    const server = [srv("a", "user"), srv("confirmada", "broker")]
    const result = mergeMessages(server, [opt("confirmada"), opt("pendente")])
    expect(result.map((m) => m.id)).toEqual(["a", "confirmada", "pendente"])
  })
})
