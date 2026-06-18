/**
 * Story 60-1 — Tests for roleta-retry cron fix (AC5, AC6).
 *
 * Covers:
 *  1. Leads without assigned_broker_id are fetched and distributed
 *  2. No stage_id filter is applied (bug fix verification)
 *  3. A 30-day age filter IS applied via gte("created_at", ...)
 *  4. distributeLeadToNextBroker is called once per lead
 *  5. Results are accumulated correctly
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))

vi.mock("@web/lib/roleta/distributor", () => ({
  distributeLeadToNextBroker: vi.fn(),
}))

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}))

vi.mock("@web/lib/roleta/classify-lead", () => ({
  classifyLeadFirstMessage: vi.fn(),
}))

import { createAdminClient } from "@web/lib/supabase/admin"
import { distributeLeadToNextBroker } from "@web/lib/roleta/distributor"
import { classifyLeadFirstMessage } from "@web/lib/roleta/classify-lead"
import { GET } from "./route"

const eqCalls: [string, unknown][] = []
const isCalls: [string, unknown][] = []
const gteCalls: [string, unknown][] = []
const updateCalls: unknown[] = []

function makeAdminClient(leads: { id: string; org_id: string; name: string }[]) {
  eqCalls.length = 0
  isCalls.length = 0
  gteCalls.length = 0
  updateCalls.length = 0

  // chain encadeável: limit (fetch principal) e maybeSingle (guard de
  // idempotência) resolvem promises próprias; await direto (update().eq())
  // resolve via `then`.
  const chain = {
    eq: vi.fn((col: string, val: unknown) => {
      eqCalls.push([col, val])
      return chain
    }),
    is: vi.fn((col: string, val: unknown) => {
      isCalls.push([col, val])
      return chain
    }),
    gte: vi.fn((col: string, val: unknown) => {
      gteCalls.push([col, val])
      return chain
    }),
    order: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve({ data: leads, error: null })),
    select: vi.fn(() => chain),
    update: vi.fn((patch: unknown) => {
      updateCalls.push(patch)
      return chain
    }),
    maybeSingle: vi.fn(() =>
      Promise.resolve({ data: { assigned_broker_id: null }, error: null })
    ),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve),
  }

  return { from: vi.fn(() => chain) }
}

function makeRequest() {
  return new NextRequest("http://localhost/api/cron/roleta-retry", {
    headers: { authorization: `Bearer test-secret` },
  })
}

describe("roleta-retry cron", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret"
    vi.mocked(distributeLeadToNextBroker).mockReset()
    // Default: todo lead é classificado como lead (preserva testes de distribuição)
    vi.mocked(classifyLeadFirstMessage).mockReset()
    vi.mocked(classifyLeadFirstMessage).mockResolvedValue({
      isLead: true,
      category: "lead",
      reason: "",
    } as never)
  })

  it("calls distributeLeadToNextBroker for each lead found", async () => {
    const leads = [
      { id: "lead-1", org_id: "org-1", name: "Arnaldo" },
      { id: "lead-2", org_id: "org-1", name: "Maria" },
    ]
    vi.mocked(createAdminClient).mockReturnValue(makeAdminClient(leads) as never)
    vi.mocked(distributeLeadToNextBroker).mockResolvedValue({ status: "distributed" } as never)

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(distributeLeadToNextBroker).toHaveBeenCalledTimes(2)
    expect(distributeLeadToNextBroker).toHaveBeenCalledWith("lead-1", "org-1")
    expect(distributeLeadToNextBroker).toHaveBeenCalledWith("lead-2", "org-1")
    expect(body.distributed).toBe(2)
    expect(body.processed).toBe(2)
  })

  it("does NOT apply a stage_id filter", async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeAdminClient([]) as never)

    await GET(makeRequest())

    const stageFilter = eqCalls.find(([col]) => col === "stage_id")
    expect(stageFilter).toBeUndefined()
  })

  it("applies assigned_broker_id IS NULL filter", async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeAdminClient([]) as never)

    await GET(makeRequest())

    const brokerFilter = isCalls.find(([col]) => col === "assigned_broker_id")
    expect(brokerFilter).toBeDefined()
    expect(brokerFilter![1]).toBeNull()
  })

  it("applies a 30-day created_at filter via gte", async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeAdminClient([]) as never)

    const before = Date.now() - 30 * 24 * 60 * 60 * 1000

    await GET(makeRequest())

    const ageFilter = gteCalls.find(([col]) => col === "created_at")
    expect(ageFilter).toBeDefined()
    const filterDate = new Date(ageFilter![1] as string).getTime()
    expect(filterDate).toBeGreaterThanOrEqual(before - 2000)
    expect(filterDate).toBeLessThanOrEqual(before + 2000)
  })

  it("accumulates fora_horario and sem_corretor results correctly", async () => {
    const leads = [
      { id: "lead-1", org_id: "org-1", name: "A" },
      { id: "lead-2", org_id: "org-1", name: "B" },
      { id: "lead-3", org_id: "org-1", name: "C" },
    ]
    vi.mocked(createAdminClient).mockReturnValue(makeAdminClient(leads) as never)
    vi.mocked(distributeLeadToNextBroker)
      .mockResolvedValueOnce({ status: "fora_horario" } as never)
      .mockResolvedValueOnce({ status: "sem_corretor_disponivel" } as never)
      .mockResolvedValueOnce({ status: "distributed" } as never)

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(body.fora_horario).toBe(1)
    expect(body.sem_corretor).toBe(1)
    expect(body.distributed).toBe(1)
    expect(body.processed).toBe(3)
  })

  it("não-lead: arquiva (is_active=false) e NÃO distribui", async () => {
    const leads = [
      { id: "lead-1", org_id: "org-1", name: "Candidato" },
      { id: "lead-2", org_id: "org-1", name: "Comprador" },
    ]
    vi.mocked(createAdminClient).mockReturnValue(makeAdminClient(leads) as never)
    vi.mocked(classifyLeadFirstMessage)
      .mockResolvedValueOnce({ isLead: false, category: "emprego", reason: "candidato" } as never)
      .mockResolvedValueOnce({ isLead: true, category: "lead", reason: "" } as never)
    vi.mocked(distributeLeadToNextBroker).mockResolvedValue({ status: "distributed" } as never)

    const res = await GET(makeRequest())
    const body = await res.json()

    // lead-1 (não-lead) não distribuído; lead-2 (lead) distribuído
    expect(distributeLeadToNextBroker).toHaveBeenCalledTimes(1)
    expect(distributeLeadToNextBroker).toHaveBeenCalledWith("lead-2", "org-1")
    expect(body.nao_lead).toBe(1)
    expect(body.distributed).toBe(1)
    // arquivamento: update({ is_active: false }) chamado para o não-lead
    expect(updateCalls).toContainEqual({ is_active: false })
  })
})
