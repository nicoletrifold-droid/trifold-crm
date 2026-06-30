/**
 * Story 75-81 (Epic 64) — endpoint puxar lead do bolsão.
 * Cobre o mapeamento status da RPC → HTTP (ok/gone/teto/empreendimento/sem_corretor/erro).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

let authResult: { error?: Response; appUser?: { id: string } } = { appUser: { id: "broker-user-1" } }
vi.mock("@web/lib/api-auth", () => ({ requireAuth: async () => authResult }))

let rpcResult: { data: unknown; error: unknown } = { data: "ok", error: null }
const rpcSpy = vi.fn((fn: string, args: unknown) => { void fn; void args; return Promise.resolve(rpcResult) })
vi.mock("@web/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: rpcSpy }) }))

import { POST } from "./route"

function call(id = "lead-1") {
  return POST(new Request("https://x", { method: "POST" }) as never, { params: Promise.resolve({ id }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  authResult = { appUser: { id: "broker-user-1" } }
  rpcResult = { data: "ok", error: null }
})

describe("POST /api/bolsao/[id]/pegar", () => {
  it("ok → 200 e passa lead+broker pra RPC", async () => {
    const res = await call("lead-1")
    expect(res.status).toBe(200)
    expect(rpcSpy).toHaveBeenCalledWith("pegar_lead_bolsao", { p_lead_id: "lead-1", p_broker_user_id: "broker-user-1" })
  })

  it("gone → 409", async () => {
    rpcResult = { data: "gone", error: null }
    expect((await call()).status).toBe(409)
  })

  it("teto → 422", async () => {
    rpcResult = { data: "teto", error: null }
    expect((await call()).status).toBe(422)
  })

  it("empreendimento → 422", async () => {
    rpcResult = { data: "empreendimento", error: null }
    expect((await call()).status).toBe(422)
  })

  it("sem_corretor → 403", async () => {
    rpcResult = { data: "sem_corretor", error: null }
    expect((await call()).status).toBe(403)
  })

  it("erro de RPC → 500", async () => {
    rpcResult = { data: null, error: { message: "boom" } }
    expect((await call()).status).toBe(500)
  })

  it("não autenticado → propaga auth.error", async () => {
    authResult = { error: new Response("unauth", { status: 401 }) }
    expect((await call()).status).toBe(401)
  })
})
