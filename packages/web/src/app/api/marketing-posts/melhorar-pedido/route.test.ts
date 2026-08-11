/**
 * Story 75-294 — POST /api/marketing-posts/melhorar-pedido.
 * Guard, validação e o contrato FAIL-OPEN (modelo falhou → 502, texto do
 * humano fica intocado no client).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

let guardError: Response | null = null
const fakeDb = () => ({
  from: () => {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data: [], error: null }),
    }
    return b
  },
})
vi.mock("@web/lib/marketing/guard", () => ({
  marketingGuard: async () =>
    guardError
      ? { error: guardError }
      : { admin: fakeDb(), supabase: fakeDb(), appUser: { id: "u-1", org_id: "org-1", role: "admin" } },
}))

let improved: string | null = "Briefing melhorado."
vi.mock("@trifold/ai", () => ({
  createAnthropicClient: () => ({}),
  improveMarketingRequest: async () => improved,
}))

import { POST } from "./route"

function call(body: Record<string, unknown>) {
  return POST(new Request("https://x", { method: "POST", body: JSON.stringify(body) }) as never)
}

beforeEach(() => {
  guardError = null
  improved = "Briefing melhorado."
})

describe("POST /api/marketing-posts/melhorar-pedido", () => {
  it("guard nega → repassa (403)", async () => {
    guardError = new Response("{}", { status: 403 })
    expect((await call({ pedido: "story pra investidor" })).status).toBe(403)
  })

  it("pedido curto demais → 400", async () => {
    expect((await call({ pedido: "oi" })).status).toBe(400)
  })

  it("sucesso → devolve o briefing", async () => {
    const res = await call({ pedido: "story pra investidor batendo na entrega" })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ pedido: "Briefing melhorado." })
  })

  it("modelo falhou → 502 (fail-open: o client mantém o texto original)", async () => {
    improved = null
    const res = await call({ pedido: "story pra investidor batendo na entrega" })
    expect(res.status).toBe(502)
  })
})
