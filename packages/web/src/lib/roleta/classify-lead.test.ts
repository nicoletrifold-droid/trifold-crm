import { describe, it, expect, beforeAll } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { classifyLeadFirstMessage } from "./classify-lead"

// Chave dummy: o fast-path de keyword de classifyContactIntent não faz
// chamada real à API, então uma chave não-vazia basta para o teste rodar.
beforeAll(() => {
  process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "sk-test-dummy"
})

/** Mock encadeável do Supabase: conversations resolve via await, messages via maybeSingle(). */
function makeSupabase(opts: {
  conversations: { data: Array<{ id: string }> | null }
  message?: { data: { content: string; metadata: Record<string, unknown> | null } | null }
}): SupabaseClient {
  return {
    from(table: string) {
      const result =
        table === "conversations" ? opts.conversations : (opts.message ?? { data: null })
      const builder: Record<string, unknown> = {}
      const chain = () => builder
      builder.select = chain
      builder.eq = chain
      builder.in = chain
      builder.order = chain
      builder.limit = chain
      builder.maybeSingle = () => Promise.resolve(result)
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
      return builder
    },
  } as unknown as SupabaseClient
}

describe("classifyLeadFirstMessage", () => {
  it("AC3: sem conversa → default seguro isLead=true", async () => {
    const supabase = makeSupabase({ conversations: { data: [] } })
    const r = await classifyLeadFirstMessage(supabase, "lead-1")
    expect(r.isLead).toBe(true)
  })

  it("sem mensagem inbound → default seguro isLead=true", async () => {
    const supabase = makeSupabase({
      conversations: { data: [{ id: "c1" }] },
      message: { data: null },
    })
    const r = await classifyLeadFirstMessage(supabase, "lead-1")
    expect(r.isLead).toBe(true)
  })

  it("1ª mensagem com keyword de não-lead → isLead=false (fast-path, sem API)", async () => {
    const supabase = makeSupabase({
      conversations: { data: [{ id: "c1" }] },
      message: { data: { content: "quero enviar meu currículo para vaga de emprego", metadata: null } },
    })
    const r = await classifyLeadFirstMessage(supabase, "lead-1")
    expect(r.isLead).toBe(false)
  })

  it("AC5: erro na query → default seguro isLead=true (nunca lança)", async () => {
    const broken = {
      from() {
        throw new Error("db down")
      },
    } as unknown as SupabaseClient
    const r = await classifyLeadFirstMessage(broken, "lead-1")
    expect(r.isLead).toBe(true)
  })
})
