/**
 * Story 62-1 — Tests for distributor stage assignment (AC1–3, AC5–6).
 *
 * Verifica que após distribuição bem-sucedida, stage_id é atualizado
 * para STAGE_IDS.novo ("Aguardando atendimento") em ambos os caminhos.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@web/lib/roleta/notify-broker", () => ({
  notifyBroker: vi.fn().mockResolvedValue({ push: false, email: false, whatsapp: false }),
  notifyImobiliaria: vi.fn().mockResolvedValue(undefined),
}))

const updateCalls: Record<string, unknown>[] = []
const insertCalls: unknown[] = []

function makeChain(returnValue: unknown = null) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.neq = vi.fn(() => chain)
  chain.not = vi.fn(() => chain)
  chain.is = vi.fn(() => chain)
  chain.order = vi.fn(() => chain)
  chain.limit = vi.fn(() => Promise.resolve({ data: returnValue, error: null }))
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: returnValue, error: null }))
  chain.insert = vi.fn((data: unknown) => {
    insertCalls.push(data)
    return Promise.resolve({ error: null })
  })
  chain.update = vi.fn((data: Record<string, unknown>) => {
    updateCalls.push(data)
    return chain
  })
  return chain
}

const VALID_CONFIG = {
  is_active: true,
  business_days: [0, 1, 2, 3, 4, 5, 6],
  business_hour_start: "00:00",
  business_hour_end: "23:59",
  weekend_hour_start: "00:00",
  weekend_hour_end: "23:59",
  timezone: "America/Sao_Paulo",
  notify_push: false,
  notify_email: false,
  notify_whatsapp: false,
  priorizar_lead_ativo: false,
  max_leads_per_day: 999,
  notify_user_on_distribution: null,
  notify_user_on_fora_horario: null,
}

const VALID_LEAD = {
  property_interest_id: null,
  name: "Cliente Teste",
  phone: "11999999999",
}

const RPC_RESULT = [
  {
    broker_id: "broker-uuid",
    broker_user_id: "user-uuid",
    broker_name: "Corretor",
    broker_email: "corretor@test.com",
    broker_phone: null,
  },
]

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}))

import { createAdminClient } from "@web/lib/supabase/admin"
import { distributeLeadToNextBroker } from "./distributor"

function makeAdminClient(overrides: {
  config?: unknown
  lead?: unknown
  rpcResult?: unknown
  existingLead?: unknown
}) {
  updateCalls.length = 0
  insertCalls.length = 0

  const configChain = makeChain(overrides.config ?? VALID_CONFIG)
  const leadChain = makeChain(overrides.lead ?? VALID_LEAD)
  const existingLeadChain = makeChain(overrides.existingLead ?? null)
  const logChain = makeChain(null)
  const rpcChain = {
    then: undefined as unknown,
  }

  const rpcMock = vi.fn(() =>
    Promise.resolve({ data: overrides.rpcResult ?? RPC_RESULT, error: null })
  )

  const fromMock = vi.fn((table: string) => {
    if (table === "roleta_config") return configChain
    if (table === "leads") return leadChain
    if (table === "lead_distribution_log") return logChain
    return makeChain(null)
  })

  // Patch the leads chain update to track calls
  leadChain.update = vi.fn((data: Record<string, unknown>) => {
    updateCalls.push(data)
    return leadChain
  })
  leadChain.eq = vi.fn(() => leadChain)

  return {
    from: fromMock,
    rpc: rpcMock,
  }
}

describe("distributor — stage assignment on distribution (Story 62-1)", () => {
  beforeEach(() => {
    updateCalls.length = 0
    insertCalls.length = 0
    vi.mocked(createAdminClient).mockReset()
  })

  it("includes stage_id in leads update when roleta distributes normally", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminClient({}) as never
    )

    const result = await distributeLeadToNextBroker("lead-1", "org-1")

    expect(result.status).toBe("distributed")

    const stageUpdate = updateCalls.find(
      (u) => "stage_id" in u && !("assigned_broker_id" in u)
    )
    expect(stageUpdate).toBeDefined()
    expect(stageUpdate!.stage_id).toBe("00000000-0000-0000-0001-000000000001")
  })

  it("does NOT update stage_id when roleta is inactive", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminClient({ config: { ...VALID_CONFIG, is_active: false } }) as never
    )

    const result = await distributeLeadToNextBroker("lead-1", "org-1")

    expect(result.status).toBe("roleta_inativa")
    const stageUpdate = updateCalls.find((u) => "stage_id" in u)
    expect(stageUpdate).toBeUndefined()
  })

  it("does NOT update stage_id when no broker is available", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminClient({ rpcResult: [] }) as never
    )

    const result = await distributeLeadToNextBroker("lead-1", "org-1")

    expect(result.status).toBe("sem_corretor_disponivel")
    const stageUpdate = updateCalls.find((u) => "stage_id" in u)
    expect(stageUpdate).toBeUndefined()
  })

  it("uses STAGE_IDS.novo UUID for the stage update", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminClient({}) as never
    )

    await distributeLeadToNextBroker("lead-1", "org-1")

    const stageUpdates = updateCalls.filter((u) => "stage_id" in u)
    expect(stageUpdates.length).toBeGreaterThan(0)
    stageUpdates.forEach((u) => {
      expect(u.stage_id).toBe("00000000-0000-0000-0001-000000000001")
    })
  })
})
