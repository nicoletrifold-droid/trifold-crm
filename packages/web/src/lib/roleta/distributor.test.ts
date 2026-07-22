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
const orCalls: string[] = []

function makeChain(returnValue: unknown = null) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.neq = vi.fn(() => chain)
  chain.not = vi.fn(() => chain)
  chain.is = vi.fn(() => chain)
  chain.or = vi.fn((filters: string) => {
    orCalls.push(filters)
    return chain
  })
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
  assigned_broker_id: null,
  bolsao_em: null,
  stage_id: "00000000-0000-0000-0001-000000000001", // novo (não-perdido)
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
  orCalls.length = 0

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

  // Story 75-89 — bolsão terminal: lead no bolsão NÃO é redistribuído pela roleta.
  it("returns em_bolsao and does NOT distribute a lead that is in the bolsão", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminClient({
        lead: { ...VALID_LEAD, bolsao_em: "2026-06-30T22:50:14.000Z" },
        // priorizar_lead_ativo ligado + telefone com dono em outro lead: mesmo assim NÃO pode roteá-lo.
        config: { ...VALID_CONFIG, priorizar_lead_ativo: true },
        existingLead: { assigned_broker_id: "outro-corretor" },
      }) as never
    )

    const result = await distributeLeadToNextBroker("lead-1", "org-1")

    expect(result.status).toBe("em_bolsao")
    // não atribui, não muda stage, não roteia por continuidade
    expect(updateCalls.find((u) => "assigned_broker_id" in u)).toBeUndefined()
    expect(updateCalls.find((u) => "stage_id" in u)).toBeUndefined()
  })

  // Story 75-118 — Perdido terminal: lead em Perdido NÃO é redistribuído pela roleta.
  it("returns perdido and does NOT distribute a lead in the Perdido stage", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminClient({
        lead: { ...VALID_LEAD, stage_id: "00000000-0000-0000-0001-000000000008" },
        // priorizar_lead_ativo ligado + telefone com dono em outro lead: mesmo assim NÃO pode roteá-lo.
        config: { ...VALID_CONFIG, priorizar_lead_ativo: true },
        existingLead: { assigned_broker_id: "outro-corretor" },
      }) as never
    )

    const result = await distributeLeadToNextBroker("lead-1", "org-1")

    expect(result.status).toBe("perdido")
    // não atribui, não muda stage, não roteia por continuidade
    expect(updateCalls.find((u) => "assigned_broker_id" in u)).toBeUndefined()
    expect(updateCalls.find((u) => "stage_id" in u)).toBeUndefined()
  })
})

// Story 75-197 — roleta preserva "Visita Agendada" (Nicole agendou antes da
// distribuição, 75-196): vincula corretor sem regredir a etapa.
const VISITA_AGENDADA = "00000000-0000-0000-0001-000000000004"

describe("distributor — preserva Visita Agendada (Story 75-197)", () => {
  beforeEach(() => {
    updateCalls.length = 0
    insertCalls.length = 0
    orCalls.length = 0
    vi.mocked(createAdminClient).mockReset()
  })

  it("caminho normal (RPC): update de stage filtra visita_agendada no WHERE (com is.null p/ stage NULL)", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminClient({ lead: { ...VALID_LEAD, stage_id: VISITA_AGENDADA } }) as never
    )

    const result = await distributeLeadToNextBroker("lead-1", "org-1")

    expect(result.status).toBe("distributed")
    // o payload segue sendo stage novo — quem protege é o filtro no WHERE
    expect(orCalls).toContain(`stage_id.is.null,stage_id.neq.${VISITA_AGENDADA}`)
  })

  // Factory dedicada: o caminho de continuidade consulta "leads" 3x (lead,
  // lead anterior do mesmo telefone, claim atômico) e "brokers" 1x.
  function makeContinuityClient(leadRow: Record<string, unknown>) {
    updateCalls.length = 0
    insertCalls.length = 0
    orCalls.length = 0

    const configChain = makeChain({ ...VALID_CONFIG, priorizar_lead_ativo: true })
    const leadFetchChain = makeChain(leadRow)
    const priorChain = makeChain({ assigned_broker_id: "user-uuid" })
    // .order().limit(1).maybeSingle() — limit precisa devolver a chain aqui
    priorChain.limit = vi.fn(() => priorChain)
    const claimChain = makeChain({ id: "lead-1" })
    const brokerChain = makeChain({
      id: "broker-uuid",
      users: { name: "Corretor", email: "corretor@test.com", phone: null },
    })
    const logChain = makeChain(null)

    let leadsCall = 0
    const leadsChains = [leadFetchChain, priorChain, claimChain]
    const fromMock = vi.fn((table: string) => {
      if (table === "roleta_config") return configChain
      if (table === "leads") return leadsChains[Math.min(leadsCall++, 2)]
      if (table === "brokers") return brokerChain
      if (table === "lead_distribution_log") return logChain
      return makeChain(null)
    })

    return {
      from: fromMock,
      rpc: vi.fn(() => Promise.resolve({ data: RPC_RESULT, error: null })),
    }
  }

  it("continuidade: lead em Visita Agendada ganha corretor SEM stage_id no update atômico", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeContinuityClient({ ...VALID_LEAD, stage_id: VISITA_AGENDADA }) as never
    )

    const result = await distributeLeadToNextBroker("lead-1", "org-1")

    expect(result.status).toBe("distributed")
    const claim = updateCalls.find((u) => "assigned_broker_id" in u)
    expect(claim).toBeDefined()
    expect(claim!.assigned_broker_id).toBe("user-uuid")
    expect("stage_id" in claim!).toBe(false)
    expect("distribuido_em" in claim!).toBe(true)
  })

  it("continuidade: lead em Aguardando atendimento segue recebendo stage novo (sem regressão de comportamento)", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeContinuityClient({ ...VALID_LEAD }) as never
    )

    const result = await distributeLeadToNextBroker("lead-1", "org-1")

    expect(result.status).toBe("distributed")
    const claim = updateCalls.find((u) => "assigned_broker_id" in u)
    expect(claim).toBeDefined()
    expect(claim!.stage_id).toBe("00000000-0000-0000-0001-000000000001")
  })
})
