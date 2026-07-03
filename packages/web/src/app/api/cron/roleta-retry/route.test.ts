/**
 * Story 71-1 — Cron roleta-retry como motor de distribuição pós-conversa idle.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))
vi.mock("@web/lib/roleta/distributor", () => ({ distributeLeadToNextBroker: vi.fn() }))
vi.mock("@web/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }))
vi.mock("@web/lib/roleta/classify-lead", () => ({
  loadLeadInboundForClassification: vi.fn(),
}))
vi.mock("@trifold/ai", () => ({
  classifyContactIntent: vi.fn(),
  createAnthropicClient: vi.fn(() => ({})),
}))

import { createAdminClient } from "@web/lib/supabase/admin"
import { distributeLeadToNextBroker } from "@web/lib/roleta/distributor"
import { loadLeadInboundForClassification } from "@web/lib/roleta/classify-lead"
import { classifyContactIntent } from "@trifold/ai"
import { STAGE_IDS } from "@trifold/shared"
import { GET } from "./route"

const eqCalls: [string, unknown][] = []
const isCalls: [string, unknown][] = []
const neqCalls: [string, unknown][] = []
const gteCalls: [string, unknown][] = []
const updateCalls: unknown[] = []

function makeAdminClient(
  leads: { id: string; org_id: string; name: string }[],
  current: Record<string, unknown> = { assigned_broker_id: null, bolsao_em: null, segmento: "principal", stage_id: STAGE_IDS.novo },
) {
  eqCalls.length = 0
  isCalls.length = 0
  neqCalls.length = 0
  gteCalls.length = 0
  updateCalls.length = 0

  const chain = {
    eq: vi.fn((c: string, v: unknown) => { eqCalls.push([c, v]); return chain }),
    is: vi.fn((c: string, v: unknown) => { isCalls.push([c, v]); return chain }),
    neq: vi.fn((c: string, v: unknown) => { neqCalls.push([c, v]); return chain }),
    gte: vi.fn((c: string, v: unknown) => { gteCalls.push([c, v]); return chain }),
    order: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve({ data: leads, error: null })),
    select: vi.fn(() => chain),
    update: vi.fn((p: unknown) => { updateCalls.push(p); return chain }),
    maybeSingle: vi.fn(() => Promise.resolve({ data: current, error: null })),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
  }
  return { from: vi.fn(() => chain) }
}

function makeRequest() {
  return new NextRequest("http://localhost/api/cron/roleta-retry", {
    headers: { authorization: `Bearer test-secret` },
  })
}

const OLD = new Date(Date.now() - 10 * 60 * 1000).toISOString() // 10 min atrás → frio
const RECENT = new Date(Date.now() - 60 * 1000).toISOString() // 1 min atrás → quente

describe("roleta-retry cron (Story 71-1)", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret"
    vi.mocked(distributeLeadToNextBroker).mockReset()
    vi.mocked(loadLeadInboundForClassification).mockReset()
    vi.mocked(classifyContactIntent).mockReset()
    // Default: conversa fria + lead real
    vi.mocked(loadLeadInboundForClassification).mockResolvedValue({
      lastInboundAt: OLD, text: "quero comprar apartamento", hasDocument: false,
    })
    vi.mocked(classifyContactIntent).mockResolvedValue({ isLead: true, category: "lead", reason: "" } as never)
  })

  it("distribui lead idle classificado como lead", async () => {
    const leads = [
      { id: "l1", org_id: "o1", name: "A" },
      { id: "l2", org_id: "o1", name: "B" },
    ]
    vi.mocked(createAdminClient).mockReturnValue(makeAdminClient(leads) as never)
    vi.mocked(distributeLeadToNextBroker).mockResolvedValue({ status: "distributed" } as never)

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(distributeLeadToNextBroker).toHaveBeenCalledTimes(2)
    expect(body.distributed).toBe(2)
  })

  it("NÃO restringe a uma etapa específica (sem eq stage_id)", async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeAdminClient([]) as never)
    await GET(makeRequest())
    expect(eqCalls.find(([c]) => c === "stage_id")).toBeUndefined()
  })

  // Story 75-118 — Perdido terminal: o cron exclui leads em Perdido dos candidatos.
  it("exclui Perdido dos candidatos (neq stage_id = perdido)", async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeAdminClient([]) as never)
    await GET(makeRequest())
    const f = neqCalls.find(([c]) => c === "stage_id")
    expect(f).toBeDefined()
    expect(f![1]).toBe(STAGE_IDS.perdido)
  })

  it("re-check: lead marcado Perdido no meio-tempo é pulado, NÃO distribui", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminClient(
        [{ id: "l1", org_id: "o1", name: "A" }],
        { assigned_broker_id: null, bolsao_em: null, segmento: "principal", stage_id: STAGE_IDS.perdido },
      ) as never,
    )

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(distributeLeadToNextBroker).not.toHaveBeenCalled()
    expect(body.skipped).toBe(1)
  })

  it("aplica assigned_broker_id IS NULL", async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeAdminClient([]) as never)
    await GET(makeRequest())
    const f = isCalls.find(([c]) => c === "assigned_broker_id")
    expect(f).toBeDefined()
    expect(f![1]).toBeNull()
  })

  // Story 75-89 — bolsão terminal: o cron NÃO redistribui leads do bolsão.
  it("aplica bolsao_em IS NULL na busca de candidatos", async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeAdminClient([]) as never)
    await GET(makeRequest())
    const f = isCalls.find(([c]) => c === "bolsao_em")
    expect(f).toBeDefined()
    expect(f![1]).toBeNull()
  })

  it("re-check: lead que entrou no bolsão no meio-tempo é pulado, NÃO distribui", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminClient(
        [{ id: "l1", org_id: "o1", name: "A" }],
        { assigned_broker_id: null, bolsao_em: "2026-06-30T22:50:14.000Z", segmento: "principal", stage_id: STAGE_IDS.novo },
      ) as never,
    )

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(distributeLeadToNextBroker).not.toHaveBeenCalled()
    expect(body.skipped).toBe(1)
  })

  it("aplica filtro created_at de 30 dias via gte", async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeAdminClient([]) as never)
    const before = Date.now() - 30 * 24 * 60 * 60 * 1000
    await GET(makeRequest())
    const f = gteCalls.find(([c]) => c === "created_at")
    expect(f).toBeDefined()
    expect(new Date(f![1] as string).getTime()).toBeGreaterThanOrEqual(before - 5000)
  })

  it("conversa quente (idle < 5min) → aguarda, NÃO distribui", async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeAdminClient([{ id: "l1", org_id: "o1", name: "A" }]) as never)
    vi.mocked(loadLeadInboundForClassification).mockResolvedValue({ lastInboundAt: RECENT, text: "oi", hasDocument: false })

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(distributeLeadToNextBroker).not.toHaveBeenCalled()
    expect(body.aguardando).toBe(1)
  })

  it("não-lead idle → arquiva (is_active=false), NÃO distribui", async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeAdminClient([{ id: "l1", org_id: "o1", name: "Candidato" }]) as never)
    vi.mocked(loadLeadInboundForClassification).mockResolvedValue({ lastInboundAt: OLD, text: "vaga de emprego", hasDocument: false })
    vi.mocked(classifyContactIntent).mockResolvedValue({ isLead: false, category: "emprego", reason: "x" } as never)

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(distributeLeadToNextBroker).not.toHaveBeenCalled()
    expect(body.nao_lead).toBe(1)
    expect(updateCalls).toContainEqual({ is_active: false })
  })

  it("lead sem mensagem inbound → distribui (default seguro, sem classificar)", async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeAdminClient([{ id: "l1", org_id: "o1", name: "Import" }]) as never)
    vi.mocked(loadLeadInboundForClassification).mockResolvedValue({ lastInboundAt: null, text: "", hasDocument: false })
    vi.mocked(distributeLeadToNextBroker).mockResolvedValue({ status: "distributed" } as never)

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(classifyContactIntent).not.toHaveBeenCalled()
    expect(distributeLeadToNextBroker).toHaveBeenCalledTimes(1)
    expect(body.distributed).toBe(1)
  })
})
