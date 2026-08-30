/**
 * Story 75-214 — processamento de leadgen do Meta extraído para lib.
 * Cobre: falha silenciosa eliminada (AC1), idempotência por leadgen_id (AC3),
 * política de side effects / backdate na recuperação tardia (AC4).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

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

// Story 900-24: `process-lead.ts` passou a logar em `system_events` (não fazia antes).
const logEventMock = vi.fn()
/**
 * Story 900-24 (gate `@qa`, concern 2) — a escrita só COMPLETA num macrotask, como o Postgres de
 * verdade. É isto que faz a suíte medir o `await logOrgUnresolved(...)` do CALL SITE, e não só a
 * chamada: sem o `await`, a rota responde antes e `escritasCompletadas` está vazio na asserção.
 * A mutação #5 original media o `await` INTERNO do helper — real, mas outra camada.
 *
 * O contador de `geracao` existe porque uma escrita ÓRFÃ (a que a falta de `await` deixa pendente)
 * completaria depois do fim do teste e cairia no array do teste SEGUINTE, que passaria por
 * acidente. Mesma forma de `for-each-org.test.ts` (900-23) e de `nicole-agenda-reconcile` (87-6).
 */
let escritasCompletadas: unknown[] = []
let geracaoDoTeste = 0
const logEventOnceMock = vi.fn<(...args: unknown[]) => Promise<{ inserted: boolean }>>(
  async (...args: unknown[]) => {
    const minhaGeracao = geracaoDoTeste
    await new Promise((r) => setTimeout(r, 5))
    if (minhaGeracao !== geracaoDoTeste) return { inserted: false } // órfã: o teste já acabou
    escritasCompletadas.push(args[0])
    return { inserted: true }
  },
)

/**
 * Espião de `logOrgUnresolved` que **delega ao real** — o `await` do call site continua exercitado.
 * Existe para a asserção de PII/shape olhar o objeto que a ROTA realmente passa, e não um literal
 * remontado no teste (a tautologia que o `@qa` mediu: 5 chaves de PII do lead entravam VERDE).
 */
const logOrgUnresolvedSpy = vi.fn()
vi.mock("@web/lib/logger", () => ({
  logEvent: (...args: unknown[]) => logEventMock(...args),
  logEventOnce: (...args: unknown[]) => logEventOnceMock(...args),
}))

/**
 * Story 900-24 · AC10, mutação #8 — o resolver novo é plantável. Por padrão delega ao real (os
 * testes que já existiam não mudam de comportamento); os testes da mutação #8 o forçam a `org-B`
 * enquanto a fila do fake mantém `org-1` como resposta do LEGADO.
 */
const resolveOrgByMetaPageMock = vi.fn<(...args: unknown[]) => Promise<unknown>>()
vi.mock("@web/lib/tenancy/webhook-org", async (importOriginal) => {
  const real = await importOriginal<typeof import("@web/lib/tenancy/webhook-org")>()
  return {
    ...real,
    logOrgUnresolved: async (...args: unknown[]) => {
      logOrgUnresolvedSpy(...args)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return real.logOrgUnresolved(...(args as [any]))
    },
    resolveOrgByMetaPage: (...args: unknown[]) =>
      resolveOrgByMetaPageMock.getMockImplementation()
        ? resolveOrgByMetaPageMock(...args)
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          real.resolveOrgByMetaPage(...(args as [any, any])),
  }
})

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
  // `vi.clearAllMocks()` limpa histórico, não estado local: a geração e o array de escritas
  // completadas precisam de reset explícito, senão uma escrita órfã do teste anterior cai aqui.
  geracaoDoTeste++
  escritasCompletadas = []
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

  it("AC4 recuperação tardia (75-215): distribui via roleta, mas sem automations; created_at retrodatado", async () => {
    const result = await processMetaLead("111", value, entry, "log-1", {
      automations: false,
      distribute: true,
      backdateTo: "2026-07-01T12:00:00Z",
    })

    expect(result.ok).toBe(true)
    expect(triggerAutomations).not.toHaveBeenCalled()
    expect(distributeLeadToNextBroker).toHaveBeenCalledWith("lead-new", "org-1")

    const inserted = calls.find((c) => c.table === "leads" && c.insert)?.insert as Record<string, unknown>
    expect(inserted.created_at).toBe("2026-07-01T12:00:00Z")
    expect((inserted.metadata as Record<string, unknown>).recovered_at).toBeDefined()

    const activity = calls.find((c) => c.table === "activities" && c.insert)?.insert as Record<string, unknown>
    expect(activity.description).toContain("recuperado")
  })

  it("AC3 idempotência: leadgen_id já tem lead COM contato → não cria de novo, marca processed", async () => {
    // 75-289: a fixture ganha telefone. O critério de "já processado" passou a ser
    // "existe E tem contato" — lead sem contato é justamente o que precisa voltar.
    queues.leads = [{ data: { id: "lead-77", phone: "+5544999990000" }, error: null }]

    const result = await processMetaLead("111", value, entry, "log-1")

    expect(result).toMatchObject({ ok: true, leadId: "lead-77", deduped: true })
    expect(calls.filter((c) => c.table === "leads" && c.insert)).toHaveLength(0)
    expect(updatesTo("webhook_logs")).toContainEqual(expect.objectContaining({ processed: true }))
  })

  // ---- Story 75-289 (AC5) — lead do Meta incompleto volta a ser recuperável ----

  it("75-289 AC5: field_data vazio → NÃO marca processed e devolve ok:false (o cron conta tentativa)", async () => {
    // Assinatura exata do incidente de 10/08: a Graph API não devolveu os campos
    // porque o META_PAGE_ACCESS_TOKEN estava morto.
    const semCampos = { leadgen_id: "111", form_id: "form-1", field_data: [] }
    // sem telefone utilizável não há lookup por telefone: idem → insert direto
    queues.leads = [
      { data: null, error: null },
      { data: { id: "lead-new" }, error: null },
    ]

    const result = await processMetaLead("111", semCampos, entry, "log-1")

    // ok:false é intencional: é o que faz o cron incrementar `retry N/3` em vez de
    // reprocessar o mesmo evento a cada 15min para sempre.
    expect(result.ok).toBe(false)
    expect(result.error).toContain("empty_field_data")
    expect(result.leadId).toBe("lead-new") // o lead FOI criado, só está incompleto

    const logUpdates = updatesTo("webhook_logs")
    expect(logUpdates).not.toContainEqual(expect.objectContaining({ processed: true }))
    expect(logUpdates).toContainEqual(
      expect.objectContaining({ processing_error: expect.stringContaining("empty_field_data") }),
    )
  })

  it("75-289 AC5: lead existente SEM contato é enriquecido (UPDATE), nunca duplicado", async () => {
    queues.leads = [
      // idempotência por leadgen_id: existe, mas nasceu sem nome/telefone/e-mail
      { data: { id: "lead-orfao", name: null, phone: "", email: null }, error: null },
      { data: null, error: null }, // update
    ]

    const result = await processMetaLead("111", value, entry, "log-1")

    expect(result.ok).toBe(true)
    expect(result.deduped).toBeUndefined() // não encerrou como duplicado
    // A garantia que importa continua: nenhum INSERT em leads.
    expect(calls.filter((c) => c.table === "leads" && c.insert)).toHaveLength(0)

    const leadUpdate = updatesTo("leads")[0]
    expect(leadUpdate).toMatchObject({
      name: "João Teste",
      phone: "+5544999990000",
      email: "joao@x.com",
    })
    expect(updatesTo("webhook_logs")).toContainEqual(expect.objectContaining({ processed: true }))
  })

  it("75-289 AC5: enriquecimento NUNCA sobrescreve contato já preenchido", async () => {
    queues.leads = [
      { data: { id: "lead-x", name: "Nome Do Corretor", phone: "+5544911112222", email: null }, error: null },
      { data: null, error: null },
    ]

    // Lead tem contato → o guard de idempotência encerra antes de qualquer update
    // de contato. Garante que o caminho novo não toca em lead completo.
    const result = await processMetaLead("111", value, entry, "log-1")

    expect(result).toMatchObject({ ok: true, deduped: true })
    const leadUpdates = updatesTo("leads")
    expect(leadUpdates).toHaveLength(0)
  })

  it("75-289 AC5: telefone-lixo NÃO vira retry (field_data veio; a Graph devolveria o mesmo lixo)", async () => {
    const lixo = {
      leadgen_id: "111",
      form_id: "form-1",
      field_data: [{ name: "phone_number", values: ["não tenho whatsapp"] }],
    }
    // idem → insert direto (telefone-lixo não gera lookup por telefone)
    queues.leads = [
      { data: null, error: null },
      { data: { id: "lead-pobre" }, error: null },
    ]

    const result = await processMetaLead("111", lixo, entry, "log-1")

    // incomplete=true (sem telefone utilizável e sem e-mail), MAS field_data veio:
    // é uma submissão real e pobre, não falha de credencial. Encerra normalmente.
    expect(result.ok).toBe(true)
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

  it("dedup por telefone (75-215: via phone_normalized): atualiza lead existente sem criar novo nem redistribuir", async () => {
    queues.leads = [
      { data: null, error: null },
      { data: { id: "lead-55", utm_campaign: "camp", property_interest_id: null, finalidade: null }, error: null },
    ]

    const result = await processMetaLead("111", value, entry, "log-1")

    expect(result).toMatchObject({ ok: true, leadId: "lead-55" })
    expect(calls.filter((c) => c.table === "leads" && c.insert)).toHaveLength(0)
    expect(distributeLeadToNextBroker).not.toHaveBeenCalled()
  })

  it("75-215: telefone-lixo no form → phone null no insert (não estoura varchar)", async () => {
    const junkValue = {
      ...value,
      field_data: [
        { name: "full_name", values: ["Maria Teste"] },
        { name: "phone_number", values: ["quero apartamento de 3 quartos na zona 7"] },
      ],
    }
    // sem phoneNormalized não há lookup por telefone: idem → insert direto
    queues.leads = [
      { data: null, error: null },
      { data: { id: "lead-junk" }, error: null },
    ]

    const result = await processMetaLead("111", junkValue, entry, "log-1")

    expect(result.ok).toBe(true)
    const inserted = calls.find((c) => c.table === "leads" && c.insert)?.insert as Record<string, unknown>
    // 75-216: phone é NOT NULL — lixo textual é preservado clampado (≤50)
    expect(inserted.phone).toBe("quero apartamento de 3 quartos na zona 7")
    expect((inserted.phone as string).length).toBeLessThanOrEqual(50)
    expect((inserted.metadata as Record<string, unknown>).incomplete).toBe(true)
  })

  it("75-216: 20+ dígitos no campo → guarda só 20 dígitos (trigger nunca estoura varchar(20))", async () => {
    const junkValue = {
      ...value,
      field_data: [{ name: "phone_number", values: ["5544999990000 ou 5544888880000 (qualquer um)"] }],
    }
    queues.leads = [
      { data: null, error: null },
      { data: { id: "lead-digits" }, error: null },
    ]

    const result = await processMetaLead("111", junkValue, entry, "log-1")

    expect(result.ok).toBe(true)
    const inserted = calls.find((c) => c.table === "leads" && c.insert)?.insert as Record<string, unknown>
    expect(inserted.phone).toBe("55449999900005544888")
    expect((inserted.phone as string).replace(/\D/g, "").length).toBeLessThanOrEqual(20)
  })

  it("75-215: insert colide no unique (23505) → cai no caminho de update do lead dono do telefone", async () => {
    queues.leads = [
      { data: null, error: null }, // idempotência
      { data: null, error: null }, // findByPhone: não achou (formato antigo/corrida)
      { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } }, // insert
      { data: { id: "lead-dono", utm_campaign: null, property_interest_id: null, finalidade: null }, error: null }, // findByPhone pós-colisão
      { data: null, error: null }, // update
    ]

    const result = await processMetaLead("111", value, entry, "log-1")

    expect(result).toMatchObject({ ok: true, leadId: "lead-dono" })
    expect(distributeLeadToNextBroker).not.toHaveBeenCalled()
    expect(updatesTo("webhook_logs")).toContainEqual(expect.objectContaining({ processed: true }))
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


// ─────────────────────────────────────────────────────────────────────────────────────────────
// Story 900-24 · AC10, mutação #8 — em `both`, quem decide é o legado (receptor `meta_ads`)
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("Story 900-24 — dual-run em process-lead", () => {
  const ENV_ORIGINAL = process.env.WEBHOOK_ORG_ROUTING

  afterEach(() => {
    resolveOrgByMetaPageMock.mockReset()
    if (ENV_ORIGINAL === undefined) delete process.env.WEBHOOK_ORG_ROUTING
    else process.env.WEBHOOK_ORG_ROUTING = ENV_ORIGINAL
  })

  it("(1) o org_id do lead inserido é o do LEGADO (org-1), não o do identifier (org-B)", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "both"
    resolveOrgByMetaPageMock.mockImplementation(async () => ({
      status: "resolvida",
      orgId: "org-B",
    }))

    const result = await processMetaLead("111", value, entry, "log-1")

    expect(result.ok).toBe(true)
    const inserido = calls.find((c) => c.table === "leads" && c.insert)?.insert as Record<string, unknown>
    expect(inserido.org_id).toBe("org-1")
    expect(inserido.org_id).not.toBe("org-B")
    // O `webhook_logs` marcado como processado carrega a MESMA org do processamento.
    expect(updatesTo("webhook_logs")).toContainEqual(
      expect.objectContaining({ processed: true, org_id: "org-1" }),
    )
  })

  it("(2) `logOrgResolved` sai com via:'legacy' e divergiu:true", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "both"
    resolveOrgByMetaPageMock.mockImplementation(async () => ({
      status: "resolvida",
      orgId: "org-B",
    }))

    await processMetaLead("111", value, entry, "log-1")

    const evento = logEventMock.mock.calls
      .map((c) => c[0] as { event_type?: string; org_id?: string; metadata?: Record<string, unknown> })
      .find((e) => e.event_type === "WEBHOOK_ORG_RESOLVED")
    expect(evento!.org_id).toBe("org-1")
    expect(evento!.metadata).toMatchObject({ via: "legacy", divergiu: true, receptor: "meta_ads" })
  })

  it("modo `identifier`: o page_id decide, e o lead nasce em org-B", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "identifier"
    resolveOrgByMetaPageMock.mockImplementation(async () => ({
      status: "resolvida",
      orgId: "org-B",
    }))

    await processMetaLead("111", value, entry, "log-1")

    const inserido = calls.find((c) => c.table === "leads" && c.insert)?.insert as Record<string, unknown>
    expect(inserido.org_id).toBe("org-B")
  })

  it("não resolveu: `fail()` preserva o processing_error que o cron de retry lê, E loga em system_events", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "both"
    queues.whatsapp_config = [{ data: null, error: { code: "PGRST116" } }]
    resolveOrgByMetaPageMock.mockImplementation(async () => ({
      status: "nao_resolvida",
      motivo: "ambigua",
      quantidadeEncontrada: 2,
    }))

    const result = await processMetaLead("111", value, entry, "log-1")

    expect(result).toMatchObject({ ok: false })
    // A mensagem do `fail()` é a MESMA de antes desta story — `meta-leads-retry` a lê.
    expect(updatesTo("webhook_logs")).toContainEqual(
      expect.objectContaining({
        processing_error: "no_active_org: whatsapp_config sem linha status=active",
      }),
    )
    expect(logEventOnceMock.mock.calls[0]![0]).toMatchObject({
      event_type: "WEBHOOK_ORG_UNRESOLVED",
      metadata: { receptor: "meta_ads", motivo: "ambigua", quantidade_encontrada: 2 },
    })
    expect(calls.filter((c) => c.table === "leads" && c.insert)).toHaveLength(0)
  })

  /**
   * Gate `@qa`, concerns 1/3/4 — o objeto EXATO que o call site passa. Inclui o
   * `webhookLogsExistenteId` (concern 3: só o `landing-page` guardava isso) e o
   * `webhookLogsSource` (concern 4: só o `telegram` guardava).
   */
  it("o que `processMetaLead` passa a `logOrgUnresolved` é EXATAMENTE isto — sem PII do lead", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "both"
    queues.whatsapp_config = [{ data: null, error: { code: "PGRST116" } }]
    resolveOrgByMetaPageMock.mockImplementation(async () => ({
      status: "nao_resolvida",
      motivo: "nenhuma_correspondencia",
      quantidadeEncontrada: 0,
    }))

    await processMetaLead("111", value, entry, "log-1")

    expect(logOrgUnresolvedSpy).toHaveBeenCalledTimes(1)
    expect(logOrgUnresolvedSpy.mock.calls[0]![0]).toEqual({
      receptor: "meta_ads",
      motivo: "nenhuma_correspondencia",
      quantidadeEncontrada: 0,
      // `page_id` é a PÁGINA da org. Nada do lead: nem nome, nem telefone, nem e-mail, nem
      // leadgen_id (que é identificador do LEAD, não da org).
      identificador: { page_id: "page-1" },
      webhookLogsSource: "meta_ads",
      // Concern 3: reaproveita a linha do chamador em vez de inserir uma segunda.
      webhookLogsExistenteId: "log-1",
    })
    const serializado = JSON.stringify(logEventOnceMock.mock.calls[0]![0])
    for (const pii of ["João Teste", "+5544999990000", "joao@x.com", "111"]) {
      expect(serializado).not.toContain(pii)
    }
  })

  /** Gate `@qa`, concern 2 — carrasco do `await` no CALL SITE (escrita completa em macrotask). */
  it("a escrita de `WEBHOOK_ORG_UNRESOLVED` COMPLETA antes de `processMetaLead` resolver", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "both"
    queues.whatsapp_config = [{ data: null, error: { code: "PGRST116" } }]
    resolveOrgByMetaPageMock.mockImplementation(async () => ({
      status: "nao_resolvida",
      motivo: "ambigua",
      quantidadeEncontrada: 2,
    }))

    await processMetaLead("111", value, entry, "log-1")

    expect(escritasCompletadas).toHaveLength(1)
  })
})
