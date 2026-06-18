import { describe, it, expect } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { loadLeadInboundForClassification } from "./classify-lead"

/** Mock encadeável: conversations e messages resolvem via `then` (await direto). */
function makeSupabase(opts: {
  conversations: { data: Array<{ id: string }> | null }
  messages?: {
    data: Array<{ content: string | null; metadata: Record<string, unknown> | null; created_at: string }> | null
  }
}): SupabaseClient {
  return {
    from(table: string) {
      const result =
        table === "conversations" ? opts.conversations : (opts.messages ?? { data: [] })
      const builder: Record<string, unknown> = {}
      const chain = () => builder
      builder.select = chain
      builder.eq = chain
      builder.in = chain
      builder.order = chain
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
      return builder
    },
  } as unknown as SupabaseClient
}

describe("loadLeadInboundForClassification", () => {
  it("sem conversa → vazio", async () => {
    const r = await loadLeadInboundForClassification(makeSupabase({ conversations: { data: [] } }), "l1")
    expect(r).toEqual({ lastInboundAt: null, text: "", hasDocument: false })
  })

  it("concatena todas as mensagens do lead e pega a última data", async () => {
    const supabase = makeSupabase({
      conversations: { data: [{ id: "c1" }] },
      messages: {
        data: [
          { content: "Olá", metadata: null, created_at: "2026-06-18T13:00:00Z" },
          { content: "Sobre vaga de emprego", metadata: null, created_at: "2026-06-18T13:01:00Z" },
        ],
      },
    })
    const r = await loadLeadInboundForClassification(supabase, "l1")
    expect(r.text).toBe("Olá | Sobre vaga de emprego")
    expect(r.lastInboundAt).toBe("2026-06-18T13:01:00Z")
    expect(r.hasDocument).toBe(false)
  })

  it("detecta hasDocument quando alguma mensagem tem media_type=document", async () => {
    const supabase = makeSupabase({
      conversations: { data: [{ id: "c1" }] },
      messages: {
        data: [{ content: "segue anexo", metadata: { media_type: "document" }, created_at: "2026-06-18T13:00:00Z" }],
      },
    })
    const r = await loadLeadInboundForClassification(supabase, "l1")
    expect(r.hasDocument).toBe(true)
  })

  it("sem mensagens inbound → vazio", async () => {
    const supabase = makeSupabase({ conversations: { data: [{ id: "c1" }] }, messages: { data: [] } })
    const r = await loadLeadInboundForClassification(supabase, "l1")
    expect(r.lastInboundAt).toBeNull()
  })

  it("erro na query → vazio (nunca lança)", async () => {
    const broken = { from() { throw new Error("db down") } } as unknown as SupabaseClient
    const r = await loadLeadInboundForClassification(broken, "l1")
    expect(r).toEqual({ lastInboundAt: null, text: "", hasDocument: false })
  })
})
