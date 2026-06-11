/**
 * Cron de redistribuição da roleta — Story 46-3
 *
 * Cobre: auth fail-closed (401/503), filtro por stage default da org (exclui
 * stages históricos), filtro `assigned_broker_id IS NULL`, chamada de
 * `distributeLeadToNextBroker` por lead, best-effort por lead (falha não
 * interrompe), e limite de segurança (`limited`).
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

// ---- Mocks ----------------------------------------------------------------

const distributeMock = vi.fn<
  (leadId: string, orgId: string) => Promise<{ status: string }>
>()
vi.mock("@web/lib/roleta/distributor", () => ({
  distributeLeadToNextBroker: (leadId: string, orgId: string) =>
    distributeMock(leadId, orgId),
}))

interface LeadRow {
  id: string
  org_id: string
  is_active: boolean
  assigned_broker_id: string | null
  stage_id: string
}

interface DbState {
  roleta_config: Array<{ org_id: string; is_active: boolean }>
  kanban_stages: Array<{ id: string; org_id: string; is_default: boolean; position: number }>
  leads: LeadRow[]
}

let db: DbState

function freshDb(): DbState {
  return {
    roleta_config: [{ org_id: "org-1", is_active: true }],
    kanban_stages: [
      { id: "stage-default", org_id: "org-1", is_default: true, position: 0 },
      { id: "62075f72-old", org_id: "org-1", is_default: false, position: 5 },
      { id: "dab590c7-muffato", org_id: "org-1", is_default: false, position: 6 },
    ],
    leads: [],
  }
}

// Chainable Supabase-like mock supporting eq / is / order / limit / maybeSingle
// and terminal `await` (thenable) for list queries.
function buildSupabaseMock() {
  function from(table: keyof DbState) {
    const eqFilters: Array<{ col: string; val: unknown }> = []
    const isFilters: Array<{ col: string; val: unknown }> = []
    let orderCol: string | null = null
    let limitN: number | null = null

    const resolveRows = () => {
      let rows = (db[table] as unknown as Record<string, unknown>[]).filter(
        (r) =>
          eqFilters.every((f) => r[f.col] === f.val) &&
          isFilters.every((f) => r[f.col] === f.val)
      )
      if (orderCol) {
        rows = [...rows].sort((a, b) => (a[orderCol!] as number) - (b[orderCol!] as number))
      }
      if (limitN != null) rows = rows.slice(0, limitN)
      return rows
    }

    const builder = {
      select() {
        return builder
      },
      eq(col: string, val: unknown) {
        eqFilters.push({ col, val })
        return builder
      },
      is(col: string, val: unknown) {
        isFilters.push({ col, val })
        return builder
      },
      order(col: string) {
        orderCol = col
        return builder
      },
      limit(n: number) {
        limitN = n
        return builder
      },
      async maybeSingle() {
        const rows = resolveRows()
        return { data: rows[0] ?? null, error: null }
      },
      then(resolve: (v: { data: unknown[]; error: null }) => void) {
        resolve({ data: resolveRows(), error: null })
      },
    }
    return builder
  }
  return { from }
}

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => buildSupabaseMock(),
}))

// ---- Helpers --------------------------------------------------------------

function cronRequest(authHeader?: string) {
  const headers: Record<string, string> = {}
  if (authHeader) headers["authorization"] = authHeader
  const req = new Request("http://localhost/api/cron/roleta-redistribute", {
    method: "GET",
    headers,
  })
  return req as unknown as import("next/server").NextRequest
}

const SECRET = "test-cron-secret"

// ---- Tests ----------------------------------------------------------------

describe("Cron roleta-redistribute — Story 46-3", () => {
  beforeEach(() => {
    db = freshDb()
    distributeMock.mockClear()
    distributeMock.mockResolvedValue({ status: "distributed" })
    process.env.CRON_SECRET = SECRET
    vi.resetModules()
  })

  it("AC1 — sem CRON_SECRET configurado → 503 (fail-closed)", async () => {
    delete process.env.CRON_SECRET
    vi.resetModules()
    const { GET } = await import("../route")
    const res = await GET(cronRequest(`Bearer ${SECRET}`))
    expect(res.status).toBe(503)
    expect(distributeMock).not.toHaveBeenCalled()
  })

  it("AC1 — header inválido → 401", async () => {
    const { GET } = await import("../route")
    const res = await GET(cronRequest("Bearer wrong"))
    expect(res.status).toBe(401)
    expect(distributeMock).not.toHaveBeenCalled()
  })

  it("AC2 — lead elegível no stage default → distributeLeadToNextBroker chamado", async () => {
    db.leads.push({
      id: "lead-1",
      org_id: "org-1",
      is_active: true,
      assigned_broker_id: null,
      stage_id: "stage-default",
    })

    const { GET } = await import("../route")
    const res = await GET(cronRequest(`Bearer ${SECRET}`))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(distributeMock).toHaveBeenCalledTimes(1)
    expect(distributeMock).toHaveBeenCalledWith("lead-1", "org-1")
    expect(body).toMatchObject({ processed: 1, distributed: 1, failed: 0, limited: false })
  })

  it("AC3 — leads em stages históricos ('Corretores Antigos'/'Ação Muffato') → NÃO processados", async () => {
    db.leads.push(
      { id: "old-1", org_id: "org-1", is_active: true, assigned_broker_id: null, stage_id: "62075f72-old" },
      { id: "muffato-1", org_id: "org-1", is_active: true, assigned_broker_id: null, stage_id: "dab590c7-muffato" }
    )

    const { GET } = await import("../route")
    const res = await GET(cronRequest(`Bearer ${SECRET}`))
    const body = await res.json()

    expect(distributeMock).not.toHaveBeenCalled()
    expect(body).toMatchObject({ processed: 0, distributed: 0 })
  })

  it("AC4 — lead com corretor já atribuído → NÃO reprocessado (filtro IS NULL)", async () => {
    db.leads.push({
      id: "assigned-1",
      org_id: "org-1",
      is_active: true,
      assigned_broker_id: "broker-9",
      stage_id: "stage-default",
    })

    const { GET } = await import("../route")
    await GET(cronRequest(`Bearer ${SECRET}`))
    expect(distributeMock).not.toHaveBeenCalled()
  })

  it("AC5 — falha em um lead → logado, cron continua, retorna 200 com failed", async () => {
    db.leads.push(
      { id: "lead-ok", org_id: "org-1", is_active: true, assigned_broker_id: null, stage_id: "stage-default" },
      { id: "lead-boom", org_id: "org-1", is_active: true, assigned_broker_id: null, stage_id: "stage-default" }
    )
    distributeMock
      .mockResolvedValueOnce({ status: "distributed" })
      .mockRejectedValueOnce(new Error("RPC boom"))

    const { GET } = await import("../route")
    const res = await GET(cronRequest(`Bearer ${SECRET}`))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(distributeMock).toHaveBeenCalledTimes(2)
    expect(body).toMatchObject({ processed: 2, distributed: 1, failed: 1 })
  })

  it("AC6 — 50 leads elegíveis → processa 50 e retorna limited: true", async () => {
    for (let i = 0; i < 60; i++) {
      db.leads.push({
        id: `lead-${i}`,
        org_id: "org-1",
        is_active: true,
        assigned_broker_id: null,
        stage_id: "stage-default",
      })
    }

    const { GET } = await import("../route")
    const res = await GET(cronRequest(`Bearer ${SECRET}`))
    const body = await res.json()

    expect(distributeMock).toHaveBeenCalledTimes(50)
    expect(body).toMatchObject({ processed: 50, distributed: 50, limited: true })
  })

  it("sem leads elegíveis → { processed: 0, distributed: 0, failed: 0, limited: false }", async () => {
    const { GET } = await import("../route")
    const res = await GET(cronRequest(`Bearer ${SECRET}`))
    const body = await res.json()
    expect(body).toEqual({ processed: 0, distributed: 0, failed: 0, limited: false })
  })
})
