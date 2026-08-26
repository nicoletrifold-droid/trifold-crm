/**
 * Story 75-84 — endpoint de transferência de conversa.
 * Cobre: permissão (403), motivo obrigatório (400), roteamento corretor (is_relationship=false)
 * x chat (true), destino inválido (422), mesmo dono (400).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

let appUserRole = "admin"
vi.mock("@web/lib/api-auth", async () => {
  // 75-311: gate = requireCapability(leads.transferir) — decide pelo seed.
  const { CAPABILITY_SEED } = await vi.importActual<
    typeof import("@web/lib/capabilities")
  >("@web/lib/capabilities")
  return {
    requireAuth: async () => ({ appUser: { id: "admin-1", org_id: "org-1", role: appUserRole } }),
    requireCapability: async (appUser: { role: string }, capability: keyof typeof CAPABILITY_SEED) =>
      appUser.role === "admin" || (CAPABILITY_SEED[capability] as readonly string[]).includes(appUser.role)
        ? null
        : new Response("forbidden", { status: 403 }),
  }
})

const pushSpy = vi.fn(async (..._a: unknown[]) => { void _a })
vi.mock("@web/lib/server/push-service", () => ({ sendPushToUser: (...a: unknown[]) => pushSpy(...a) }))

let leadRow: Record<string, unknown> | null = { id: "L1", org_id: "org-1", assigned_broker_id: "old-broker", name: "João" }
let targetRow: Record<string, unknown> | null = { id: "T1", name: "Odair", role: "broker" }
const chatRows = [{ roles: { name: "gerente-relacionamento" } }, { roles: { name: "admin" } }, { roles: { name: "supervisor" } }]
const captures = { leadUpdate: null as unknown, convUpdate: null as unknown, activity: null as unknown }

vi.mock("@web/lib/supabase/org-scoped-admin", () => ({
  createOrgScopedAdminClient: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> & { _update?: unknown } = {
        select: () => b, eq: () => b,
        update: (p: unknown) => { b._update = p; return b },
        insert: async (rows: unknown) => { if (table === "activities") captures.activity = rows; return { data: null, error: null } },
        maybeSingle: async () => ({ data: table === "leads" ? leadRow : table === "users" ? targetRow : null, error: null }),
        then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
          if (b._update) {
            if (table === "leads") captures.leadUpdate = b._update
            if (table === "conversations") captures.convUpdate = b._update
            return resolve({ data: null, error: null })
          }
          return resolve({ data: table === "role_permissions" ? chatRows : null, error: null })
        },
      }
      return b
    },
  }),
}))

import { POST } from "./route"

function call(body: unknown) {
  return POST(
    new Request("https://x", { method: "POST", body: JSON.stringify(body) }) as never,
    { params: Promise.resolve({ id: "L1" }) }
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  appUserRole = "admin"
  leadRow = { id: "L1", org_id: "org-1", assigned_broker_id: "old-broker", name: "João" }
  targetRow = { id: "T1", name: "Odair", role: "broker" }
  captures.leadUpdate = null; captures.convUpdate = null; captures.activity = null
})

describe("POST /api/leads/[id]/transferir", () => {
  it("não-admin/supervisor → 403", async () => {
    appUserRole = "broker"
    expect((await call({ target_user_id: "T1", motivo: "x" })).status).toBe(403)
  })

  it("sem motivo → 400", async () => {
    expect((await call({ target_user_id: "T1", motivo: "  " })).status).toBe(400)
  })

  it("destino corretor → 200, is_relationship=false, reatribui + activity + push", async () => {
    const res = await call({ target_user_id: "T1", motivo: "cliente errado" })
    expect(res.status).toBe(200)
    expect(captures.leadUpdate).toMatchObject({ assigned_broker_id: "T1" })
    expect(captures.convUpdate).toMatchObject({ is_relationship: false, is_ai_active: false })
    expect(captures.activity).toMatchObject({ type: "transfer", metadata: { to_user_id: "T1", motivo: "cliente errado" } })
    expect(pushSpy).toHaveBeenCalled()
  })

  it("destino com módulo chat → 200, is_relationship=true", async () => {
    targetRow = { id: "T2", name: "Samara", role: "gerente-relacionamento" }
    const res = await call({ target_user_id: "T2", motivo: "é da base" })
    expect(res.status).toBe(200)
    expect(captures.convUpdate).toMatchObject({ is_relationship: true })
  })

  it("destino sem perfil de atendimento → 422", async () => {
    targetRow = { id: "T3", name: "Obras", role: "obras" }
    expect((await call({ target_user_id: "T3", motivo: "x" })).status).toBe(422)
    expect(captures.leadUpdate).toBeNull()
  })

  it("destino = dono atual → 400", async () => {
    targetRow = { id: "old-broker", name: "Mesmo", role: "broker" }
    expect((await call({ target_user_id: "old-broker", motivo: "x" })).status).toBe(400)
  })
})
