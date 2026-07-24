/**
 * Story 75-214 — processamento de leadgen do Meta extraído para lib.
 * Cobre: falha silenciosa eliminada (AC1), idempotência por leadgen_id (AC3),
 * política de side effects / backdate na recuperação tardia (AC4).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const triggerAutomations = vi.fn()
vi.mock("@web/lib/email-automations", () => ({
  triggerAutomations: (...args: unknown[]) => triggerAutomations(...args),
}))

const distributeLeadToNextBroker = vi.fn()
vi.mock("@web/lib/roleta/distributor", () => ({
  distributeLeadToNextBroker: (...args: unknown[]) => distributeLeadToNextBroker(...args),
}))

vi.mock("@web/lib/roleta/detect-property", () => ({
  detectPropertyInterestId: vi.fn(async () => null),
}))

// Fake supabase: fila de resultados por tabela + registro de chamadas p/ asserção
type Result = { data: unknown; error: unknown }
let queues: Record<string, Result[]> = {}
type BuilderCall = { table: string; insert?: unknown; update?: unknown }
let calls: BuilderCall[] = []

function makeBuilder(table: string) {
  const result = queues[table]?.shift() ?? { data: null, error: null }
  const call: BuilderCall = { table }
  calls.push(call)
  const b: Record<string, unknown> = {}
  for (const m of ["select", "eq", "lt", "gt", "order", "limit", "upsert"]) {
    b[m] = vi.fn(() => b)
  }
  b.insert = vi.fn((payload: unknown) => {
    call.insert = payload
    return b
  })
  b.update = vi.fn((payload: unknown) => {
    call.update = payload
    return b
  })
  b.single = () => Promise.resolve(result)
  b.maybeSingle = () => Promise.resolve(result)
  b.then = (res: (r: Result) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej)
  return b
}

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => makeBuilder(table) }),
}))

import { processMetaLead, deriveFinalidade } from "./process-lead"

const fieldData = [
  { name: "full_name", values: ["João Teste"] },
  { name: "phone_number", values: ["+5544999990000"] },
  { name: "email", values: ["joao@x.com"] },
]

// field_data inline no payload → não bate na Graph API
const value = { leadgen_id: "111", form_id: "form-1", field_data: fieldData }
const entry = { id: "page-1" }

function updatesTo(table: string) {
  return calls.filter((c) => c.table === table && c.update).map((c) => c.update as Record<string, unknown>)
}

beforeEach(() => {
  vi.clearAllMocks()
  calls = []
  queues = {
    whatsapp_config: [{ data: { org_id: "org-1" }, error: null }],
    leads: [
      { data: null, error: null }, // idempotência por leadgen_id
      { data: null, error: { code: "PGRST116" } }, // dedup por phone: não existe
      { data: { id: "lead-new" }, error: null }, // insert
    ],
    kanban_stages: [{ data: { id: "stage-1" }, error: null }],
  }
})

describe("processMetaLead", () => {
  it("caminho feliz: cria lead, dispara side effects e marca processed", async () => {
    const result = await processMetaLead("111", value, entry, "log-1")

    expect(result).toMatchObject({ ok: true, leadId: "lead-new" })
    expect(triggerAutomations).toHaveBeenCalledWith("lead.created", expect.objectContaining({ id: "lead-new" }))
    expect(distributeLeadToNextBroker).toHaveBeenCalledWith("lead-new", "org-1")

    const logUpdates = updatesTo("webhook_logs")
    expect(logUpdates).toContainEqual(expect.objectContaining({ processed: true, org_id: "org-1" }))

    const inserted = calls.find((c) => c.table === "leads" && c.insert)?.insert as Record<string, unknown>
    expect(inserted).toMatchObject({ org_id: "org-1", source: "meta_ads", phone: "+5544999990000" })
    expect(inserted.created_at).toBeUndefined() // sem backdate no fluxo normal
  })

  it("AC4 recuperação tardia: sem side effects, created_at retrodatado, activity marcada", async () => {
    const result = await processMetaLead("111", value, entry, "log-1", {
      sideEffects: false,
      backdateTo: "2026-07-01T12:00:00Z",
    })

    expect(result.ok).toBe(true)
    expect(triggerAutomations).not.toHaveBeenCalled()
    expect(distributeLeadToNextBroker).not.toHaveBeenCalled()

    const inserted = calls.find((c) => c.table === "leads" && c.insert)?.insert as Record<string, unknown>
    expect(inserted.created_at).toBe("2026-07-01T12:00:00Z")
    expect((inserted.metadata as Record<string, unknown>).recovered_at).toBeDefined()

    const activity = calls.find((c) => c.table === "activities" && c.insert)?.insert as Record<string, unknown>
    expect(activity.description).toContain("recuperado")
  })

  it("AC3 idempotência: leadgen_id já tem lead → não cria de novo, marca processed", async () => {
    queues.leads = [{ data: { id: "lead-77" }, error: null }]

    const result = await processMetaLead("111", value, entry, "log-1")

    expect(result).toMatchObject({ ok: true, leadId: "lead-77", deduped: true })
    expect(calls.filter((c) => c.table === "leads" && c.insert)).toHaveLength(0)
    expect(updatesTo("webhook_logs")).toContainEqual(expect.objectContaining({ processed: true }))
  })

  it("AC1 sem org ativa: grava processing_error em vez de morrer em silêncio", async () => {
    queues.whatsapp_config = [{ data: null, error: null }]

    const result = await processMetaLead("111", value, entry, "log-1")

    expect(result.ok).toBe(false)
    expect(result.error).toContain("no_active_org")
    expect(updatesTo("webhook_logs")).toContainEqual(
      expect.objectContaining({ processing_error: expect.stringContaining("no_active_org") }),
    )
  })

  it("AC1 insert falha: grava o erro real do PostgREST no webhook_logs", async () => {
    queues.leads = [
      { data: null, error: null },
      { data: null, error: { code: "PGRST116" } },
      { data: null, error: { message: "duplicate key value violates unique constraint" } },
    ]

    const result = await processMetaLead("111", value, entry, "log-1")

    expect(result.ok).toBe(false)
    expect(result.error).toContain("lead_insert_failed")
    expect(updatesTo("webhook_logs")).toContainEqual(
      expect.objectContaining({ processing_error: expect.stringContaining("duplicate key") }),
    )
    expect(triggerAutomations).not.toHaveBeenCalled()
  })

  it("dedup por telefone: atualiza lead existente sem criar novo nem redistribuir", async () => {
    queues.leads = [
      { data: null, error: null },
      { data: { id: "lead-55", utm_campaign: "camp", property_interest_id: null, finalidade: null }, error: null },
    ]

    const result = await processMetaLead("111", value, entry, "log-1")

    expect(result).toMatchObject({ ok: true, leadId: "lead-55" })
    expect(calls.filter((c) => c.table === "leads" && c.insert)).toHaveLength(0)
    expect(distributeLeadToNextBroker).not.toHaveBeenCalled()
  })
})

describe("deriveFinalidade", () => {
  it("detecta moradia/investimento/ambos e devolve null sem sinal", () => {
    expect(deriveFinalidade([{ name: "objetivo", values: ["Para morar"] }])).toBe("moradia")
    expect(deriveFinalidade([{ name: "objetivo", values: ["Investimento e renda"] }])).toBe("investimento")
    expect(deriveFinalidade([{ name: "objetivo", values: ["Ambos"] }])).toBe("ambos")
    expect(deriveFinalidade([{ name: "cidade", values: ["Maringá"] }])).toBe(null)
  })
})
