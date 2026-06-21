import { describe, it, expect } from "vitest"
import {
  dedupeById,
  pruneRealtime,
  hasStaleRealtime,
} from "./conversation-thread-realtime"
import type { ThreadMessage } from "./conversation-thread-merge"

const msg = (id: string, role = "user"): ThreadMessage => ({
  id,
  role,
  content: `msg-${id}`,
  created_at: "2026-06-21T10:00:00.000Z",
})

describe("dedupeById", () => {
  it("lista vazia → []", () => {
    expect(dedupeById([])).toEqual([])
  })

  it("sem duplicatas → preserva ordem", () => {
    const out = dedupeById([msg("1"), msg("2"), msg("3")])
    expect(out.map((m) => m.id)).toEqual(["1", "2", "3"])
  })

  it("duplicata por id → mantém a PRIMEIRA ocorrência (servidor prevalece)", () => {
    const server = msg("dup", "broker")
    server.content = "do-servidor"
    const realtime = msg("dup", "broker")
    realtime.content = "do-realtime"
    const out = dedupeById([server, realtime])
    expect(out).toHaveLength(1)
    expect(out[0]?.content).toBe("do-servidor")
  })

  it("combina server + realtime sem keys duplicadas", () => {
    const server = [msg("a"), msg("b")]
    const realtime = [msg("b"), msg("c")] // 'b' é o INSERT do corretor que voltou no refresh
    const out = dedupeById([...server, ...realtime])
    expect(out.map((m) => m.id)).toEqual(["a", "b", "c"])
  })
})

describe("pruneRealtime", () => {
  it("realtime vazio → mesma referência (sem alocação)", () => {
    const realtime: ThreadMessage[] = []
    expect(pruneRealtime(realtime, [msg("1")])).toBe(realtime)
  })

  it("remove de realtime os ids já presentes no servidor", () => {
    const realtime = [msg("x"), msg("y")]
    const server = [msg("x")]
    const out = pruneRealtime(realtime, server)
    expect(out.map((m) => m.id)).toEqual(["y"])
  })

  it("nenhum id em comum → mantém todos", () => {
    const realtime = [msg("y"), msg("z")]
    expect(pruneRealtime(realtime, [msg("x")]).map((m) => m.id)).toEqual([
      "y",
      "z",
    ])
  })
})

describe("hasStaleRealtime", () => {
  it("realtime vazio → false", () => {
    expect(hasStaleRealtime([], [msg("1")])).toBe(false)
  })

  it("há id de realtime já no servidor → true (precisa limpar)", () => {
    expect(hasStaleRealtime([msg("x"), msg("y")], [msg("x")])).toBe(true)
  })

  it("nenhum id em comum → false (nada a limpar)", () => {
    expect(hasStaleRealtime([msg("y"), msg("z")], [msg("x")])).toBe(false)
  })
})
