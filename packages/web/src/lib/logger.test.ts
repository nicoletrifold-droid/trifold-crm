/**
 * Story 87-6 — testes do `logEventOnce`.
 *
 * O que este arquivo prova e o que NÃO prova:
 *
 * - Prova o CONTRATO: `23505` é dedupe (silêncio), qualquer outro erro é falha
 *   (vai para o `LOGGER_FALLBACK`), e a escrita é AGUARDADA.
 * - NÃO prova a atomicidade. Nenhum teste TypeScript prova — não há índice
 *   único aqui. A atomicidade é a prova `BEGIN…ROLLBACK` no banco real (AC1-b).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("server-only", () => ({}))

type InsertOutcome =
  | { kind: "ok" }
  | { kind: "error"; code?: string; message: string }
  | { kind: "throw"; err: unknown }

let outcome: InsertOutcome = { kind: "ok" }
/** Linhas entregues ao PostgREST — é aqui que se confere o `dedupe_key`. */
let linhas: Array<Record<string, unknown>> = []
/** Ticks: quando a escrita COMPLETOU, relativo ao retorno de `logEventOnce`. */
let completou = false
/** Se true, o insert só resolve num macrotask — simula a latência do banco. */
let insertLento = false

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (_t: string) => ({
      insert: async (row: Record<string, unknown>) => {
        if (insertLento) await new Promise((r) => setTimeout(r, 5))
        linhas.push(row)
        completou = true
        if (outcome.kind === "throw") throw outcome.err
        if (outcome.kind === "error") {
          return { data: null, error: { code: outcome.code, message: outcome.message } }
        }
        return { data: [{ id: "ev-1" }], error: null }
      },
    }),
  }),
}))

const { logEventOnce, logEvent } = await import("./logger")

const BASE = {
  level: "info" as const,
  category: "ai" as const,
  event_type: "NICOLE_LASTRO_DIARIO",
  message: "Lastro 12.5% (3/24) em 1d",
  org_id: "org-1",
  source: "api/cron/nicole-agenda-reconcile",
}

let errSpy: ReturnType<typeof vi.spyOn>
let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  outcome = { kind: "ok" }
  linhas = []
  completou = false
  insertLento = false
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
})

afterEach(() => {
  errSpy.mockRestore()
  logSpy.mockRestore()
})

function fallbacks() {
  return (errSpy.mock.calls as unknown[][]).filter((c) =>
    String(c[0]).includes("LOGGER_FALLBACK")
  )
}

describe("logEventOnce", () => {
  it("AC2 — gravou ⇒ { inserted: true }", async () => {
    const r = await logEventOnce({ ...BASE, dedupe_key: "lastro:org-1:2026-08-10:1d" })
    expect(r).toEqual({ inserted: true })
    expect(fallbacks()).toHaveLength(0)
  })

  it("AC2 — o `dedupe_key` vai DENTRO de `metadata`, ao lado do que já havia", async () => {
    await logEventOnce({
      ...BASE,
      metadata: { lastro_pct: 12.5 },
      dedupe_key: "lastro:org-1:2026-08-10:1d",
    })
    // O índice (B) indexa `metadata->>'dedupe_key'`. Se a chave fosse para uma
    // coluna de topo, o insert falharia (coluna inexistente) ou — pior — passaria
    // e o índice não pegaria nada.
    expect(linhas[0]!.metadata).toEqual({
      lastro_pct: 12.5,
      dedupe_key: "lastro:org-1:2026-08-10:1d",
    })
  })

  it("AC2 — sem `dedupe_key`, o metadata NÃO ganha a chave (o opt-in é explícito)", async () => {
    await logEventOnce({ ...BASE, metadata: { lastro_pct: 12.5 } })
    expect(linhas[0]!.metadata).toEqual({ lastro_pct: 12.5 })
    expect(linhas[0]!.metadata).not.toHaveProperty("dedupe_key")
  })

  it("AC2 — `23505` ⇒ { inserted: false } e SILÊNCIO (é o dedupe funcionando)", async () => {
    outcome = {
      kind: "error",
      code: "23505",
      message: 'duplicate key value violates unique constraint "ux_system_events_dedupe_key"',
    }
    const r = await logEventOnce({ ...BASE, dedupe_key: "lastro:org-1:2026-08-10:1d" })
    expect(r).toEqual({ inserted: false })
    expect(fallbacks()).toHaveLength(0)
  })

  it("AC2/Risco 3 — `42P01` ⇒ inserted:false MAS com LOGGER_FALLBACK", async () => {
    // Esta é a asserção que impede o `catch` que engole tudo: sem ela, "o banco
    // caiu" viraria "já estava lá" — e o instrumento que existe para detectar
    // mentira mentiria sobre si mesmo.
    outcome = { kind: "error", code: "42P01", message: 'relation "system_events" does not exist' }
    const r = await logEventOnce(BASE)
    expect(r).toEqual({ inserted: false })
    expect(fallbacks()).toHaveLength(1)
    expect(String(fallbacks()[0]![1])).toContain("does not exist")
  })

  it("AC2 — erro sem `code` (só a mensagem 'duplicate key') NÃO é tratado como dedupe", async () => {
    // Armadilha 1 da story: casar por `code`, não por texto. Um erro sem `code`
    // é erro desconhecido — tem de aparecer no fallback, não sumir.
    outcome = { kind: "error", message: "duplicate key value violates unique constraint" }
    const r = await logEventOnce(BASE)
    expect(r).toEqual({ inserted: false })
    expect(fallbacks()).toHaveLength(1)
  })

  it("AC2 — o client explodir NÃO derruba o chamador", async () => {
    outcome = { kind: "throw", err: new Error("socket hang up") }
    const r = await logEventOnce(BASE)
    expect(r).toEqual({ inserted: false })
    expect(fallbacks()).toHaveLength(1)
  })

  it("🔴 a escrita é AGUARDADA — a promise só resolve DEPOIS do insert completar", async () => {
    // O defeito de 10/08: o `logEvent` fire-and-forget era a última escrita antes
    // do `NextResponse.json`, a lambda congelou, e o recibo nunca chegou ao banco.
    insertLento = true
    const p = logEventOnce(BASE)
    expect(completou).toBe(false) // ainda não — o insert leva um macrotask
    await p
    expect(completou).toBe(true) // e o `await` esperou por ele
  })
})

describe("logEvent (não mudou)", () => {
  it("continua síncrono e fire-and-forget — a assinatura devolve void", async () => {
    // Armadilha 2: os ~200 outros pontos de chamada NÃO foram migrados. Migrar
    // todos seria mudança de latência no caminho quente.
    insertLento = true
    const r: void = logEvent(BASE)
    expect(r).toBeUndefined()
    expect(completou).toBe(false)
    await new Promise((res) => setTimeout(res, 20))
    expect(completou).toBe(true)
  })
})
