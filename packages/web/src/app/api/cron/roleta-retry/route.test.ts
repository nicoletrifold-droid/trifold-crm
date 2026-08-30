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

/**
 * Projeta a linha nas colunas pedidas no `.select()` — como o PostgREST faz.
 *
 * Story 900-23 (achado do @qa, gate CONCERNS): sem isto, tirar `org_id` do `select` de `leads`
 * (`roleta-retry/route.ts:48`) fica VERDE — o campo chega pela fixture, não pelo código.
 */
function projetar<T extends Record<string, unknown>>(linha: T, colunas?: string): T {
  if (!colunas || colunas.includes("*") || colunas.includes("(")) return linha
  const pedidas = colunas.split(",").map((c) => c.trim())
  return Object.fromEntries(Object.entries(linha).filter(([k]) => pedidas.includes(k))) as T
}

function makeAdminClient(
  leads: { id: string; org_id: string; name: string }[],
  current: Record<string, unknown> = { assigned_broker_id: null, bolsao_em: null, segmento: "principal", stage_id: STAGE_IDS.novo },
) {
  eqCalls.length = 0
  isCalls.length = 0
  neqCalls.length = 0
  gteCalls.length = 0
  updateCalls.length = 0
  let colunas: string | undefined

  const chain = {
    eq: vi.fn((c: string, v: unknown) => { eqCalls.push([c, v]); return chain }),
    is: vi.fn((c: string, v: unknown) => { isCalls.push([c, v]); return chain }),
    neq: vi.fn((c: string, v: unknown) => { neqCalls.push([c, v]); return chain }),
    gte: vi.fn((c: string, v: unknown) => { gteCalls.push([c, v]); return chain }),
    order: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve({ data: leads.map((l) => projetar(l, colunas)), error: null })),
    select: vi.fn((c?: string) => {
      colunas = c
      return chain
    }),
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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Story 900-23 · AC7 — isolamento de erro por lead
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("roleta-retry — isolamento de erro no laço (AC7 da 900-23)", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret"
    vi.mocked(distributeLeadToNextBroker).mockReset()
    vi.mocked(loadLeadInboundForClassification).mockReset()
    vi.mocked(classifyContactIntent).mockReset()
    vi.mocked(classifyContactIntent).mockResolvedValue({
      isLead: true,
      category: "lead",
      reason: "",
    } as never)
  })

  it("controle positivo: 2 leads, os 2 distribuídos, `erros: 0`", async () => {
    vi.mocked(loadLeadInboundForClassification).mockResolvedValue({
      lastInboundAt: OLD,
      text: "quero comprar",
      hasDocument: false,
    })
    vi.mocked(distributeLeadToNextBroker).mockResolvedValue({ status: "distributed" } as never)
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminClient([
        { id: "l1", org_id: "o1", name: "A" },
        { id: "l2", org_id: "o2", name: "B" },
      ]) as never,
    )

    const res = await GET(makeRequest())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ processed: 2, distributed: 2, erros: 0 })
  })

  it("🔴 o 1º lead lança e o 2º ainda é distribuído — e o corpo NOMEIA a falha (`erros >= 1`)", async () => {
    // Sem o try/catch, a exceção no 1º lead sobe e o cron devolve 500 sem tocar no 2º.
    vi.mocked(loadLeadInboundForClassification).mockImplementation(
      async (_admin: unknown, leadId: string) => {
        if (leadId === "l1") throw new Error("falha sintética no lead l1")
        return { lastInboundAt: OLD, text: "quero comprar", hasDocument: false }
      },
    )
    vi.mocked(distributeLeadToNextBroker).mockResolvedValue({ status: "distributed" } as never)
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminClient([
        { id: "l1", org_id: "o1", name: "A" },
        { id: "l2", org_id: "o2", name: "B" },
      ]) as never,
    )

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    // O 2º lead foi processado apesar da exceção no 1º…
    expect(vi.mocked(distributeLeadToNextBroker)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(distributeLeadToNextBroker).mock.calls[0]![0]).toBe("l2")
    expect(body.distributed).toBe(1)
    // …e o erro NÃO ficou em silêncio: sem este campo, o corpo sairia limpo com 200.
    expect(body.erros).toBeGreaterThanOrEqual(1)
  })
})

describe("roleta-retry — o `select` de leads precisa trazer `org_id` (achado do @qa, 900-23)", () => {
  it("🔴 a distribuição recebe o `org_id` REAL da linha — tirar a coluna do select fica vermelho", async () => {
    // Sem o fake projetando as colunas, esta asserção passaria com `org_id` vindo da fixture:
    // mediria o duplo, não o código. `distributeLeadToNextBroker(leadId, orgId)` é o consumidor.
    process.env.CRON_SECRET = "test-secret"
    vi.mocked(loadLeadInboundForClassification).mockResolvedValue({
      lastInboundAt: OLD,
      text: "quero comprar",
      hasDocument: false,
    })
    vi.mocked(classifyContactIntent).mockResolvedValue({
      isLead: true,
      category: "lead",
      reason: "",
    } as never)
    vi.mocked(distributeLeadToNextBroker).mockResolvedValue({ status: "distributed" } as never)
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminClient([{ id: "l1", org_id: "org-real", name: "A" }]) as never,
    )

    await GET(makeRequest())

    expect(vi.mocked(distributeLeadToNextBroker)).toHaveBeenCalledWith("l1", "org-real")
  })
})
