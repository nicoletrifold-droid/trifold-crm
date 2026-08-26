/**
 * Story 75-290 — GET /api/leads/[id]/visit-feedback (leitura).
 * Cobre: anônimo 401, lead de outra org 404, corretor não-dono 403, dono 200,
 * autor casado pela activity, fallback "Sistema", e lead sem feedback.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

// 75-307: o gate "gestor" virou can("agenda.feedback_visita") — o mock decide
// pelo SEED do registro (fonte da verdade), variando pelo role do requireAuth.
vi.mock("@web/lib/permissions", async () => {
  const { CAPABILITY_SEED } = await vi.importActual<
    typeof import("@web/lib/capabilities")
  >("@web/lib/capabilities")
  return {
    can: async (_userId: string, _orgId: string, capability: keyof typeof CAPABILITY_SEED) => {
      const role = appUser?.role ?? ""
      return role === "admin" || (CAPABILITY_SEED[capability] as readonly string[]).includes(role)
    },
  }
})

let appUser: { id: string; org_id: string; role: string } | null = {
  id: "admin-1",
  org_id: "org-1",
  role: "admin",
}
vi.mock("@web/lib/api-auth", () => ({
  requireAuth: async () =>
    appUser
      ? { appUser }
      : { error: new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }) },
}))

vi.mock("@web/lib/appointments/google-mirror", () => ({ mirrorCreate: async () => null }))
vi.mock("@web/lib/appointments/visit-feedback-core", () => ({ applyVisitFeedback: async () => ({ feedback: {} }) }))

interface Tables {
  leads: Record<string, unknown> | null
  visit_feedback: Record<string, unknown>[]
  activities: Record<string, unknown>[]
  users: Record<string, unknown>[]
}
let tables: Tables
/** Tabelas realmente consultadas — o fake ignora `.eq()`, então o teste de
 *  "não consulta activities" precisa observar o acesso, não o resultado. */
const touched: string[] = []

vi.mock("@web/lib/supabase/org-scoped-admin", () => ({
  createOrgScopedAdminClient: () => ({
    from: (table: keyof Tables) => {
      touched.push(table)
      const rows = () => (table === "leads" ? [] : (tables[table] as Record<string, unknown>[]))
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        in: () => b,
        limit: () => b,
        maybeSingle: async () => ({ data: table === "leads" ? tables.leads : null, error: null }),
        then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
          resolve({ data: rows(), error: null }),
      }
      return b
    },
  }),
}))

import { GET } from "./route"

function call(id = "L1") {
  return GET(new Request("https://x") as never, { params: Promise.resolve({ id }) })
}

beforeEach(() => {
  touched.length = 0
  appUser = { id: "admin-1", org_id: "org-1", role: "admin" }
  tables = {
    leads: { id: "L1", assigned_broker_id: "odair", segmento: "principal" },
    visit_feedback: [
      {
        id: "F1",
        visited_at: "2026-08-07T15:00:00Z",
        created_at: "2026-08-07T15:28:00Z",
        feedback: "Visitou o decorado",
        interest_after: "cold",
        next_steps: "Represamento",
      },
    ],
    activities: [{ user_id: "u-odair", metadata: { feedback_id: "F1" } }],
    users: [{ id: "u-odair", name: "Odair Ferreira dos Santos" }],
  }
})

describe("GET /api/leads/[id]/visit-feedback", () => {
  it("anônimo → 401", async () => {
    appUser = null
    expect((await call()).status).toBe(401)
  })

  it("lead fora da org (ou inexistente) → 404", async () => {
    tables.leads = null
    expect((await call()).status).toBe(404)
  })

  it("corretor que NÃO é dono do lead → 403", async () => {
    appUser = { id: "outro-broker", org_id: "org-1", role: "broker" }
    expect((await call()).status).toBe(403)
  })

  it("corretor DONO do lead → 200", async () => {
    appUser = { id: "odair", org_id: "org-1", role: "broker" }
    expect((await call()).status).toBe(200)
  })

  it("perfil imob só entra em lead do mundo IMOB", async () => {
    appUser = { id: "imob-1", org_id: "org-1", role: "imob" }
    expect((await call()).status).toBe(403)
    tables.leads = { id: "L1", assigned_broker_id: "odair", segmento: "imob" }
    expect((await call()).status).toBe(200)
  })

  it("devolve a visita com o autor vindo da activity", async () => {
    const json = await (await call()).json()
    expect(json.feedbacks).toHaveLength(1)
    expect(json.feedbacks[0]).toMatchObject({
      id: "F1",
      feedback: "Visitou o decorado",
      interest_after: "cold",
      next_steps: "Represamento",
      author: "Odair Ferreira dos Santos",
    })
  })

  it("feedback antigo sem activity casada → author null (a tela mostra Sistema)", async () => {
    tables.activities = []
    const json = await (await call()).json()
    expect(json.feedbacks[0].author).toBeNull()
  })

  it("lead sem feedback → lista vazia e nem toca em activities/users", async () => {
    tables.visit_feedback = []
    const json = await (await call()).json()
    expect(json.feedbacks).toEqual([])
    expect(touched).not.toContain("activities")
    expect(touched).not.toContain("users")
  })

  it("sem autor conhecido não consulta users", async () => {
    tables.activities = [{ user_id: null, metadata: { feedback_id: "F1" } }]
    await call()
    expect(touched).toContain("activities")
    expect(touched).not.toContain("users")
  })
})
