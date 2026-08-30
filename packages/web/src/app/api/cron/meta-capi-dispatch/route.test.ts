/**
 * Story 86-4 — cron que drena a meta_capi_outbox e envia o evento "Visitou" à CAPI.
 * Cobre: auth (401/500), lote vazio, sucesso total (marca sent), falha (incrementa
 * attempts → failed ao atingir MAX_ATTEMPTS), idempotência (update condicional em
 * status='pending'), ausência de token tratada graciosamente, e o enriquecimento
 * opcional de atribuição (metadata.meta_ad ausente antes da 86-6).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

// --- CAPI module (Story 86-3): só mockamos o envio de rede; os builders são reais.
type CapiResult = { success: boolean; eventsReceived?: number; error?: string }
const sendCapiEvents = vi.fn<(...args: unknown[]) => Promise<CapiResult>>(async () => ({
  success: true,
  eventsReceived: 1,
}))
vi.mock("@trifold/shared", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    sendCapiEvents: (...args: unknown[]) =>
      (sendCapiEvents as (...a: unknown[]) => unknown)(...args),
  }
})

// --- Admin client mock: roteia por tabela, captura updates (com o .eq condicional).
type Result = { data: unknown; error: unknown }
let outboxSelect: Result = { data: [], error: null }
let leadsSelect: Result = { data: [], error: null }
let updates: Array<{ table: string; payload: unknown; eqs: Record<string, unknown> }> = []
/**
 * Story 900-23 — `org_integrations` por org. `undefined` = linha inexistente;
 * `{ erro: … }` = a query falha (rede, ou a tabela ainda não existir em produção).
 */
let integracoes: Record<string, { config: unknown } | { erro: string } | undefined> = {}

/**
 * Projeta a linha nas colunas pedidas no `.select()` — como o PostgREST faz.
 *
 * Story 900-23 (achado do @qa, gate CONCERNS): sem isto, a mutação que a AC nomeia como a
 * correção ("o `select` passou a trazer `org_id`") fica **VERDE** — o campo chega pela
 * fixture, não pelo código, e a guarda não guarda. `*` e joins (`tabela(col)`) passam
 * inteiros: quem os pede quer o objeto todo.
 */
function projetar<T extends Record<string, unknown>>(linha: T, colunas?: string): T {
  if (!colunas || colunas.includes("*") || colunas.includes("(")) return linha
  const pedidas = colunas.split(",").map((c) => c.trim())
  return Object.fromEntries(Object.entries(linha).filter(([k]) => pedidas.includes(k))) as T
}

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {}
      let pendingUpdate: unknown = null
      const eqs: Record<string, unknown> = {}
      const ins: Record<string, unknown[]> = {}
      let colunas: string | undefined
      b.select = vi.fn((c?: string) => {
        colunas = c
        return b
      })
      for (const m of ["order", "limit"]) b[m] = vi.fn(() => b)
      b.in = vi.fn((col: string, vals: unknown[]) => {
        ins[col] = vals
        return b
      })
      b.eq = vi.fn((col: string, val: unknown) => {
        eqs[col] = val
        return b
      })
      b.update = vi.fn((payload: unknown) => {
        pendingUpdate = payload
        return b
      })
      // `org_integrations` — a única query desta rota que termina em `.maybeSingle()`.
      b.maybeSingle = vi.fn(async () => {
        const registro = integracoes[String(eqs.org_id)]
        if (registro && "erro" in registro) {
          return { data: null, error: { message: registro.erro } }
        }
        return { data: registro ?? null, error: null }
      })
      b.then = (res: (r: Result) => unknown, rej: (e: unknown) => unknown) => {
        if (pendingUpdate) {
          updates.push({ table, payload: pendingUpdate, eqs: { ...eqs } })
          return Promise.resolve({ data: null, error: null }).then(res, rej)
        }
        if (table === "leads") {
          // O fake HONRA `.eq("org_id", …)` E `.in("id", …)`: sem os DOIS, o teste de
          // não-vazamento entre organizações passaria por acidente.
          const base = (leadsSelect.data ?? []) as Array<Record<string, unknown>>
          const filtrados = base
            .filter(
              (l) =>
                (eqs.org_id === undefined || l.org_id === eqs.org_id) &&
                (ins.id === undefined || ins.id.includes(l.id)),
            )
            .map((l) => projetar(l, colunas))
          return Promise.resolve({ data: filtrados, error: leadsSelect.error }).then(res, rej)
        }
        const linhas = (outboxSelect.data ?? []) as Array<Record<string, unknown>>
        return Promise.resolve({
          data: linhas.map((l) => projetar(l, colunas)),
          error: outboxSelect.error,
        }).then(res, rej)
      }
      return b
    },
  }),
}))

const logEventMock = vi.fn()
vi.mock("@web/lib/logger", () => ({
  logEvent: (...a: unknown[]) => logEventMock(...a),
  logEventOnce: vi.fn(async () => ({ inserted: true })),
}))

process.env.CRON_SECRET = "test-secret"
const { GET } = await import("./route")

function call(auth: string | null = "Bearer test-secret") {
  return GET(
    new Request("https://x/api/cron/meta-capi-dispatch", {
      headers: auth ? { authorization: auth } : {},
    }) as never,
  )
}

const ORG_A = "00000000-0000-0000-0000-0000000000a1"
const ORG_B = "00000000-0000-0000-0000-0000000000b2"
const DATASET_A = "1337310707164669"
const DATASET_B = "9999999999999999"

function outboxRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ob-1",
    org_id: ORG_A,
    lead_id: "lead-1",
    event_id: "visit_lead-1_abc",
    event_name: "Schedule",
    attempts: 0,
    created_at: new Date("2026-08-04T12:00:00Z").toISOString(),
    ...overrides,
  }
}

function leadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "lead-1",
    org_id: ORG_A,
    name: "Maria Silva",
    email: "maria@example.com",
    phone: "44999114326",
    metadata: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  updates = []
  outboxSelect = { data: [], error: null }
  leadsSelect = { data: [], error: null }
  // Estado equivalente ao de produção depois do seed da Task 9.3: a org da Trifold tem dataset.
  integracoes = { [ORG_A]: { config: { dataset_id: DATASET_A } } }
  logEventMock.mockClear()
  sendCapiEvents.mockResolvedValue({ success: true, eventsReceived: 1 })
  delete process.env.META_CAPI_TEST_EVENT_CODE
})

describe("GET /api/cron/meta-capi-dispatch", () => {
  it("sem secret → 401", async () => {
    expect((await call(null)).status).toBe(401)
    expect((await call("Bearer errado")).status).toBe(401)
  })

  it("lote vazio → ok sem chamar a CAPI", async () => {
    const body = await (await call()).json()
    expect(body).toMatchObject({ ok: true, scanned: 0, sent: 0, failed: 0, skipped: 0 })
    expect(sendCapiEvents).not.toHaveBeenCalled()
  })

  it("sucesso total → marca sent com update condicional em status='pending'", async () => {
    outboxSelect = { data: [outboxRow()], error: null }
    leadsSelect = { data: [leadRow()], error: null }

    const body = await (await call()).json()

    expect(body).toMatchObject({ scanned: 1, sent: 1, failed: 0, skipped: 0 })
    expect(sendCapiEvents).toHaveBeenCalledTimes(1)
    // Evento montado a partir da linha da outbox (event_id + event_time da row).
    const [eventsArg] = sendCapiEvents.mock.calls[0] as unknown as [Array<Record<string, unknown>>]
    expect(eventsArg).toHaveLength(1)
    expect(eventsArg[0]).toMatchObject({
      event_name: "Schedule",
      event_id: "visit_lead-1_abc",
      event_time: Math.floor(new Date("2026-08-04T12:00:00Z").getTime() / 1000),
    })
    // AC5 + AC10: update de sent condicional em status pending.
    const sentUpdate = updates.find((u) => u.table === "meta_capi_outbox")
    expect(sentUpdate?.payload).toMatchObject({ status: "sent" })
    expect((sentUpdate?.payload as Record<string, unknown>).sent_at).toBeTruthy()
    expect(sentUpdate?.eqs).toMatchObject({ id: "ob-1", status: "pending" })
  })

  it("falha da CAPI → incrementa attempts e mantém pending (abaixo de MAX_ATTEMPTS)", async () => {
    sendCapiEvents.mockResolvedValueOnce({ success: false, error: "Graph 500" })
    outboxSelect = { data: [outboxRow({ attempts: 0 })], error: null }
    leadsSelect = { data: [leadRow()], error: null }

    const body = await (await call()).json()

    expect(body).toMatchObject({ sent: 0, failed: 1 })
    const upd = updates.find((u) => u.table === "meta_capi_outbox")
    expect(upd?.payload).toMatchObject({
      attempts: 1,
      status: "pending",
      last_error: "Graph 500",
    })
    expect(upd?.eqs).toMatchObject({ status: "pending" })
  })

  it("falha na última tentativa → marca failed ao atingir MAX_ATTEMPTS", async () => {
    sendCapiEvents.mockResolvedValueOnce({ success: false, error: "Graph 500" })
    outboxSelect = { data: [outboxRow({ attempts: 2 })], error: null }
    leadsSelect = { data: [leadRow()], error: null }

    await call()

    const upd = updates.find((u) => u.table === "meta_capi_outbox")
    expect(upd?.payload).toMatchObject({ attempts: 3, status: "failed" })
  })

  it("token ausente → sendCapiEvents retorna erro; trata como falha graciosa (sem throw)", async () => {
    // Simula o retorno real do módulo 86-3 quando META_CAPI_ACCESS_TOKEN falta.
    sendCapiEvents.mockResolvedValueOnce({
      success: false,
      error: "META_CAPI_ACCESS_TOKEN is not configured",
    })
    outboxSelect = { data: [outboxRow()], error: null }
    leadsSelect = { data: [leadRow()], error: null }

    const res = await call()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, sent: 0, failed: 1 })
    const upd = updates.find((u) => u.table === "meta_capi_outbox")
    expect(upd?.payload).toMatchObject({
      last_error: "META_CAPI_ACCESS_TOKEN is not configured",
      status: "pending",
    })
  })

  it("events_received divergente → tratado como falha (AC6)", async () => {
    sendCapiEvents.mockResolvedValueOnce({ success: true, eventsReceived: 0 })
    outboxSelect = { data: [outboxRow()], error: null }
    leadsSelect = { data: [leadRow()], error: null }

    const body = await (await call()).json()
    expect(body).toMatchObject({ sent: 0, failed: 1 })
  })

  it("lead sem metadata.meta_ad (pré-86-6) → envia mesmo assim, sem fbc/fbp", async () => {
    outboxSelect = { data: [outboxRow()], error: null }
    leadsSelect = { data: [leadRow({ metadata: null })], error: null }

    await call()

    const [eventsArg] = sendCapiEvents.mock.calls[0] as unknown as [Array<Record<string, unknown>>]
    const userData = eventsArg[0]!.user_data as Record<string, unknown>
    // external_id sempre presente; fbc/fbp/client ausentes (86-6 ainda não capturou).
    expect(userData.external_id).toBeTruthy()
    expect(userData.fbc).toBeUndefined()
    expect(userData.fbp).toBeUndefined()
    expect(userData.client_ip_address).toBeUndefined()
  })

  it("lead com metadata.meta_ad (pós-86-6) → propaga fbc/fbp/client_ip em plain text", async () => {
    outboxSelect = { data: [outboxRow()], error: null }
    leadsSelect = {
      data: [
        leadRow({
          metadata: {
            meta_ad: {
              fbc: "fb.1.123.abc",
              fbp: "fb.1.456.def",
              client_ip: "203.0.113.7",
              client_ua: "Mozilla/5.0",
            },
          },
        }),
      ],
      error: null,
    }

    await call()

    const [eventsArg] = sendCapiEvents.mock.calls[0] as unknown as [Array<Record<string, unknown>>]
    const userData = eventsArg[0]!.user_data as Record<string, unknown>
    expect(userData).toMatchObject({
      fbc: "fb.1.123.abc",
      fbp: "fb.1.456.def",
      client_ip_address: "203.0.113.7",
      client_user_agent: "Mozilla/5.0",
    })
  })

  it("lead não encontrado → skipped, sem enviar", async () => {
    outboxSelect = { data: [outboxRow({ lead_id: "ghost" })], error: null }
    leadsSelect = { data: [], error: null }

    const body = await (await call()).json()
    expect(body).toMatchObject({ scanned: 1, sent: 0, skipped: 1 })
    expect(sendCapiEvents).not.toHaveBeenCalled()
    const upd = updates.find((u) => u.table === "meta_capi_outbox")
    expect(upd?.payload).toMatchObject({ status: "skipped" })
    expect(upd?.eqs).toMatchObject({ status: "pending" })
  })

  it("passa test_event_code quando META_CAPI_TEST_EVENT_CODE está setado", async () => {
    process.env.META_CAPI_TEST_EVENT_CODE = "TEST123"
    outboxSelect = { data: [outboxRow()], error: null }
    leadsSelect = { data: [leadRow()], error: null }

    await call()

    expect(sendCapiEvents).toHaveBeenCalledWith(expect.any(Array), {
      datasetId: DATASET_A,
      testEventCode: "TEST123",
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Story 900-23 · AC5 — outbox por organização + dataset por organização
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("900-23 · AC5 — a fila é agrupada por organização", () => {
  it("🔴 org A envia com o dataset dela; org B sem dataset fica `skipped` e emite CAPI_ORG_SEM_DATASET", async () => {
    integracoes = { [ORG_A]: { config: { dataset_id: DATASET_A } } } // org B ausente
    outboxSelect = {
      data: [
        outboxRow({ id: "ob-a", org_id: ORG_A, lead_id: "lead-a", event_id: "ev-a" }),
        outboxRow({ id: "ob-b", org_id: ORG_B, lead_id: "lead-b", event_id: "ev-b" }),
      ],
      error: null,
    }
    leadsSelect = {
      data: [
        leadRow({ id: "lead-a", org_id: ORG_A }),
        leadRow({ id: "lead-b", org_id: ORG_B, email: "b@example.com" }),
      ],
      error: null,
    }

    const res = await call()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, orgs: 2, scanned: 2, sent: 1, skipped: 1 })

    // UMA chamada à CAPI, e com o dataset da org A — nunca o da B, nunca duas.
    expect(sendCapiEvents).toHaveBeenCalledTimes(1)
    const [, opts] = sendCapiEvents.mock.calls[0] as unknown as [unknown, { datasetId?: string }]
    expect(opts.datasetId).toBe(DATASET_A)

    // A linha da org B não mente que foi enviada, nem gasta as 3 tentativas.
    const updB = updates.find((u) => u.eqs.id === "ob-b")!
    expect(updB.payload).toMatchObject({ status: "skipped", last_error: "capi_nao_configurado" })
    const updA = updates.find((u) => u.eqs.id === "ob-a")!
    expect(updA.payload).toMatchObject({ status: "sent" })

    // C9 — o estado tem VOZ: uma vez por org por execução, com o org_id da B.
    const semDataset = logEventMock.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .filter((e) => e.event_type === "CAPI_ORG_SEM_DATASET")
    expect(semDataset).toHaveLength(1)
    expect(semDataset[0]!.org_id).toBe(ORG_B)
    expect((semDataset[0]!.metadata as { linhas_puladas: number }).linhas_puladas).toBe(1)
  })

  it("cada org envia com o PRÓPRIO dataset — duas chamadas, dois datasets", async () => {
    integracoes = {
      [ORG_A]: { config: { dataset_id: DATASET_A } },
      [ORG_B]: { config: { dataset_id: DATASET_B } },
    }
    outboxSelect = {
      data: [
        outboxRow({ id: "ob-a", org_id: ORG_A, lead_id: "lead-a", event_id: "ev-a" }),
        outboxRow({ id: "ob-b", org_id: ORG_B, lead_id: "lead-b", event_id: "ev-b" }),
      ],
      error: null,
    }
    leadsSelect = {
      data: [leadRow({ id: "lead-a", org_id: ORG_A }), leadRow({ id: "lead-b", org_id: ORG_B })],
      error: null,
    }

    await call()

    expect(sendCapiEvents).toHaveBeenCalledTimes(2)
    const datasets = sendCapiEvents.mock.calls.map(
      (c) => (c[1] as { datasetId?: string }).datasetId,
    )
    expect(datasets).toEqual([DATASET_A, DATASET_B])
  })

  it("🔴 o lead da org vizinha NÃO é resgatado pela query — `.eq(org_id)` + `.in(id)`", async () => {
    // `lead-b` pertence à org B. Sem o `.eq("org_id", …)`, ele entraria no `leadById` da org A
    // (a query só tinha `.in("id", leadIds)`) e a PII dele iria para o dataset da org A.
    integracoes = { [ORG_A]: { config: { dataset_id: DATASET_A } } }
    outboxSelect = {
      data: [outboxRow({ id: "ob-a", org_id: ORG_A, lead_id: "lead-b", event_id: "ev-a" })],
      error: null,
    }
    leadsSelect = {
      data: [leadRow({ id: "lead-b", org_id: ORG_B, email: "vizinho@example.com" })],
      error: null,
    }

    const body = await (await call()).json()

    // O lead não é encontrado NO ESCOPO DA ORG A ⇒ skipped, zero envio.
    expect(body).toMatchObject({ scanned: 1, sent: 0, skipped: 1 })
    expect(sendCapiEvents).not.toHaveBeenCalled()
    expect(updates.find((u) => u.eqs.id === "ob-a")!.payload).toMatchObject({
      status: "skipped",
      last_error: "lead not found",
    })
  })

  it("fail-safe: `org_integrations` devolvendo ERRO não derruba a rota — mesma trilha do C9", async () => {
    // É a janela entre este deploy e a migration 246 em produção: a tabela pode não existir.
    integracoes = { [ORG_A]: { erro: 'relation "org_integrations" does not exist' } }
    outboxSelect = { data: [outboxRow()], error: null }
    leadsSelect = { data: [leadRow()], error: null }

    const res = await call()
    const body = await res.json()

    expect(res.status).toBe(200) // nunca 500 geral
    expect(body).toMatchObject({ ok: true, sent: 0, skipped: 1 })
    expect(sendCapiEvents).not.toHaveBeenCalled()
    // Mesmo caminho do "sem dataset configurado" — não é um silêncio diferente.
    expect(
      logEventMock.mock.calls
        .map((c) => c[0] as Record<string, unknown>)
        .filter((e) => e.event_type === "CAPI_ORG_SEM_DATASET"),
    ).toHaveLength(1)
  })

  it("dataset_id null na config (backfill da migration 246, ainda sem seed) ⇒ skipped + evento", async () => {
    integracoes = { [ORG_A]: { config: { dataset_id: null } } }
    outboxSelect = { data: [outboxRow()], error: null }
    leadsSelect = { data: [leadRow()], error: null }

    const body = await (await call()).json()
    expect(body).toMatchObject({ sent: 0, skipped: 1 })
    expect(sendCapiEvents).not.toHaveBeenCalled()
  })

  it("erro na org B não impede o despacho da org A (isolamento por org)", async () => {
    integracoes = {
      [ORG_A]: { config: { dataset_id: DATASET_A } },
      [ORG_B]: { config: { dataset_id: DATASET_B } },
    }
    outboxSelect = {
      data: [
        outboxRow({ id: "ob-b", org_id: ORG_B, lead_id: "lead-b", event_id: "ev-b" }),
        outboxRow({ id: "ob-a", org_id: ORG_A, lead_id: "lead-a", event_id: "ev-a" }),
      ],
      error: null,
    }
    leadsSelect = {
      data: [leadRow({ id: "lead-a", org_id: ORG_A }), leadRow({ id: "lead-b", org_id: ORG_B })],
      error: null,
    }
    // A org B (processada PRIMEIRO) lança no envio; a org A vem depois e tem que rodar.
    sendCapiEvents.mockRejectedValueOnce(new Error("rede caiu na org B"))

    const res = await call()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(false)
    expect(body.erros).toHaveLength(1)
    expect(body.erros[0].orgId).toBe(ORG_B)
    expect(body.sent).toBe(1) // a org A foi despachada apesar da falha da vizinha
  })
})
