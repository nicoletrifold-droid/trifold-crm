/**
 * Story 86-11 — o endpoint COMPARTILHADO de leads de landing page.
 *
 * Este endpoint atende WordPress (WPForms, CF7, Elementor) e, desde esta story,
 * também a landing do Vind Residence. O alvo dos testes é exatamente essa
 * convivência: o campo novo é aditivo de verdade, ou o tráfego que já existe
 * mudou de comportamento sem ninguém perceber?
 *
 * O envio à CAPI é interceptado — o teste não fala com o Meta.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

/** Trabalho agendado por `after()`. Roda na hora, mas de forma aguardável. */
const pendentes: Promise<unknown>[] = []
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => unknown) => {
    pendentes.push(Promise.resolve().then(fn))
  },
}))

/** Batches que chegariam à Conversions API. Um item = uma chamada HTTP. */
const batches: Record<string, unknown>[][] = []
vi.mock("@trifold/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@trifold/shared")>()),
  sendCapiEvents: async (eventos: Record<string, unknown>[]) => {
    batches.push(eventos)
    return { success: true, eventsReceived: eventos.length }
  },
}))

vi.mock("@web/lib/email-automations", () => ({ triggerAutomations: vi.fn(async () => {}) }))
vi.mock("@web/lib/roleta/distributor", () => ({
  distributeLeadToNextBroker: vi.fn(async () => {}),
}))

// --- Supabase falso, com registro de tudo que foi escrito ------------------
interface Escrita {
  table: string
  op: "select" | "insert" | "update"
  payload: Record<string, unknown>
  filters: [string, unknown][]
}
let escritas: Escrita[] = []
let leadExistente: Record<string, unknown> | null = null
/** Story 900-24: resposta do caminho LEGADO (`whatsapp_config` com `status='active'`). */
let configAtivaLegado: Record<string, unknown> | null = { org_id: "org-1" }

// Story 900-24: a rota passou a logar em `system_events`.
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

/** Story 900-24 · AC10, mutação #8 — resolver novo plantável (delega ao real por padrão). */
const resolveSoleOrgMock = vi.fn<(...args: unknown[]) => Promise<unknown>>()
vi.mock("@web/lib/tenancy/webhook-org", async (importOriginal) => {
  const real = await importOriginal<typeof import("@web/lib/tenancy/webhook-org")>()
  return {
    ...real,
    logOrgUnresolved: async (...args: unknown[]) => {
      logOrgUnresolvedSpy(...args)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return real.logOrgUnresolved(...(args as [any]))
    },
    resolveSoleOrg: (...args: unknown[]) =>
      resolveSoleOrgMock.getMockImplementation()
        ? resolveSoleOrgMock(...args)
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          real.resolveSoleOrg(...(args as [any])),
  }
})

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      const estado: Escrita = { table, op: "select", payload: {}, filters: [] }
      const resolver = () => {
        if (estado.op === "insert") {
          if (table === "webhook_logs") return { data: { id: "log-1" }, error: null }
          if (table === "leads") return { data: { id: "lead-novo" }, error: null }
          return { data: null, error: null }
        }
        if (estado.op === "update") return { data: null, error: null }
        // Story 900-24: o LEGADO (`legacyResolveOrgId`) lê daqui. Mutável para que a Task 5.5
        // possa medir o cenário "config inativa/zero orgs" — que hoje devolve 5xx e PRECISA
        // continuar devolvendo 5xx em `legacy`/`both`.
        if (table === "whatsapp_config") return { data: configAtivaLegado, error: null }
        if (table === "kanban_stages") return { data: { id: "stage-1" }, error: null }
        if (table === "leads") return { data: leadExistente, error: null }
        return { data: null, error: null }
      }
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const api: any = {
        insert(p: Record<string, unknown>) {
          estado.op = "insert"
          estado.payload = p
          escritas.push(estado)
          return api
        },
        update(p: Record<string, unknown>) {
          estado.op = "update"
          estado.payload = p
          escritas.push(estado)
          return api
        },
        select: () => api,
        order: () => api,
        limit: () => api,
        eq: (c: string, v: unknown) => {
          estado.filters.push([c, v])
          return api
        },
        is: (c: string, v: unknown) => {
          estado.filters.push([c, v])
          return api
        },
        single: async () => resolver(),
        maybeSingle: async () => resolver(),
        then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
          Promise.resolve(resolver()).then(ok, err),
      }
      /* eslint-enable @typescript-eslint/no-explicit-any */
      return api
    },
  }),
}))

const { NextRequest } = await import("next/server")
const { POST } = await import("./route")

const SECRET = "segredo-do-webhook"
const URL_BASE = "https://crm.trifold.eng.br/api/webhooks/landing-page"

/** Headers como o CRM os vê: o proxy Vercel fala servidor-a-servidor com ele. */
const HEADERS_DO_PROXY = {
  "x-forwarded-for": "76.76.21.21, 10.0.0.1",
  "user-agent": "node-fetch/1.0 (+https://vercel.com)",
}

function post(body: unknown, headers: Record<string, string> = {}, json = true) {
  return new NextRequest(`${URL_BASE}?token=${SECRET}`, {
    method: "POST",
    headers: {
      "Content-Type": json ? "application/json" : "application/x-www-form-urlencoded",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

const TRACKING_COMPLETO = {
  event_id: "11111111-1111-4111-8111-111111111111",
  complete_registration_event_id: "22222222-2222-4222-8222-222222222222",
  visitor_id: "33333333-3333-4333-8333-333333333333",
  fbc: "fb.1.1700000000000.IwAR1",
  fbp: "fb.1.1700000000000.9876543210",
  fbclid: "IwAR1",
  client_ip: "187.1.2.3",
  client_ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
  page_url: "https://trifold.eng.br/vindresidence/?fbclid=IwAR1",
}

const LEAD = { nome: "Maria Souza", whatsapp: "(44) 99734-4650", email: "maria@exemplo.com" }

async function flush() {
  await Promise.all(pendentes)
  pendentes.length = 0
}

function escritasEm(table: string, op: "insert" | "update") {
  return escritas.filter((e) => e.table === table && e.op === op)
}

beforeEach(() => {
  escritas = []
  leadExistente = null
  configAtivaLegado = { org_id: "org-1" }
  logEventMock.mockClear()
  logEventOnceMock.mockClear()
  logOrgUnresolvedSpy.mockClear()
  geracaoDoTeste++
  escritasCompletadas = []
  resolveSoleOrgMock.mockReset()
  delete process.env.WEBHOOK_ORG_ROUTING
  batches.length = 0
  pendentes.length = 0
  process.env.LANDING_PAGE_WEBHOOK_SECRET = SECRET
  delete process.env.META_CAPI_TEST_EVENT_CODE
})

describe("regressão — o tráfego que já existia não muda (AC6, AC10)", () => {
  it("payload SEM tracking cria o lead exatamente como antes: sem meta_ad, sem CAPI", async () => {
    const res = await POST(post({ ...LEAD, page: "vind-residence" }))
    await flush()

    expect(res.status).toBe(200)
    const insercao = escritasEm("leads", "insert")[0]
    expect(insercao?.payload.name).toBe("Maria Souza")
    expect(insercao?.payload.phone).toBe("+5544997344650")
    // O metadata é byte a byte o de antes desta story.
    expect(insercao?.payload.metadata).toEqual({
      landing_page: "vind-residence",
      message: null,
      raw_fields: expect.any(Object),
    })
    expect(batches).toHaveLength(0)
  })

  it("form-urlencoded (Elementor/CF7) segue funcionando e não dispara CAPI", async () => {
    const res = await POST(
      post("form_fields[name]=João&form_fields[phone]=44997344650", {}, false),
    )
    await flush()

    expect(res.status).toBe(200)
    expect(escritasEm("leads", "insert")[0]?.payload.name).toBe("João")
    expect(batches).toHaveLength(0)
  })

  it("token inválido continua devolvendo 401 sem tocar no banco", async () => {
    const req = new NextRequest(`${URL_BASE}?token=errado`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...LEAD, tracking: TRACKING_COMPLETO }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    expect(escritas).toHaveLength(0)
  })
})

describe("AC6 — tracking presente: meta_ad + Lead + CompleteRegistration", () => {
  it("grava metadata.meta_ad no formato exato da 86-9", async () => {
    await POST(post({ ...LEAD, tracking: TRACKING_COMPLETO }, HEADERS_DO_PROXY))
    await flush()

    const metadata = escritasEm("leads", "insert")[0]?.payload.metadata as Record<
      string,
      Record<string, unknown>
    >
    // É esse bloco que faz o evento "Visitou" (86-2/86-4) sair com atribuição
    // se este lead for movido para o stage `visitou` dias depois.
    expect(metadata.meta_ad).toMatchObject({
      fbc: TRACKING_COMPLETO.fbc,
      fbp: TRACKING_COMPLETO.fbp,
      fbclid: "IwAR1",
      client_ip: "187.1.2.3",
      client_ua: TRACKING_COMPLETO.client_ua,
      visitor_id: TRACKING_COMPLETO.visitor_id,
    })
    expect(metadata.meta_ad?.captured_at).toBeTypeOf("string")
    // O merge preserva o que já havia no JSONB.
    expect(metadata.landing_page).toBeDefined()
    expect(metadata.raw_fields).toBeDefined()
  })

  it("dispara os DOIS eventos num batch único, cada um com seu event_id", async () => {
    await POST(post({ ...LEAD, tracking: TRACKING_COMPLETO }, HEADERS_DO_PROXY))
    await flush()

    expect(batches).toHaveLength(1)
    // Length explícito: sem ele, uma regressão que descartasse um dos dois
    // eventos (ou acrescentasse um terceiro) passaria batido — a destruturação
    // abaixo só olha as duas primeiras posições.
    expect(batches[0]).toHaveLength(2)
    const [lead, cadastro] = batches[0]!
    expect(lead?.event_name).toBe("Lead")
    expect(lead?.event_id).toBe(TRACKING_COMPLETO.event_id)
    expect(cadastro?.event_name).toBe("CompleteRegistration")
    expect(cadastro?.event_id).toBe(TRACKING_COMPLETO.complete_registration_event_id)

    // action_source website + URL real: é isso que liga o evento à sessão.
    expect(lead?.action_source).toBe("website")
    expect(lead?.event_source_url).toBe(TRACKING_COMPLETO.page_url)
    // Categoria própria — separa das Custom Conversions do formulário (86-9).
    expect((lead?.custom_data as Record<string, unknown>).content_category).toBe(
      "landing_vind_residence",
    )
    // Os DOIS eventos, não só o primeiro: a categoria é o que separa este
    // empreendimento do Yarden no Meta, e ela vale por evento.
    expect((cadastro?.custom_data as Record<string, unknown>).content_category).toBe(
      "landing_vind_residence",
    )
    expect((lead?.custom_data as Record<string, unknown>).value).toBe(0)
  })

  // --- Story 86-12 (AC7) — discriminador multi-landing ---
  it("com tracking.landing:'yarden' os DOIS eventos saem na categoria do Yarden", async () => {
    await POST(
      post({ ...LEAD, tracking: { ...TRACKING_COMPLETO, landing: "yarden" } }, HEADERS_DO_PROXY),
    )
    await flush()

    expect(batches).toHaveLength(1)
    // Length antes do loop: um `for` sobre um array vazio (ou de um só evento)
    // não falha nenhuma assertion — o teste passaria justamente na regressão
    // que ele existe para pegar.
    expect(batches[0]).toHaveLength(2)
    for (const evento of batches[0]!) {
      const custom = evento.custom_data as Record<string, unknown>
      expect(custom.content_category).toBe("landing_yarden")
      expect(custom.content_name).toBe("Landing Yarden")
    }
  })

  it("landing desconhecido cai no Vind Residence em vez de derrubar o lead", async () => {
    const res = await POST(
      post({ ...LEAD, tracking: { ...TRACKING_COMPLETO, landing: "nao-existe" } }, HEADERS_DO_PROXY),
    )
    await flush()

    expect(res.status).toBe(200)
    expect(batches).toHaveLength(1)
    expect(batches[0]).toHaveLength(2)
    for (const evento of batches[0]!) {
      expect((evento.custom_data as Record<string, unknown>).content_category).toBe(
        "landing_vind_residence",
      )
    }
  })

  it("`landing` não vaza para webhook_logs nem para metadata.raw_fields", async () => {
    // Mesma propriedade do resto do bloco `tracking`: `flattenIntoFields`
    // descarta objetos aninhados, então o campo novo é invisível para o
    // tráfego WordPress que compartilha o endpoint.
    await POST(
      post({ ...LEAD, tracking: { ...TRACKING_COMPLETO, landing: "yarden" } }, HEADERS_DO_PROXY),
    )
    await flush()

    const log = escritasEm("webhook_logs", "insert")[0]?.payload
    expect(JSON.stringify(log?.payload)).not.toContain("landing")
    const metadata = escritasEm("leads", "insert")[0]?.payload.metadata as Record<string, unknown>
    expect(JSON.stringify(metadata.raw_fields)).not.toContain("landing")
  })

  it("external_id leva leadId e visitor_id; st fica de fora (escopo da story)", async () => {
    await POST(post({ ...LEAD, tracking: TRACKING_COMPLETO }, HEADERS_DO_PROXY))
    await flush()

    const userData = batches[0]![0]!.user_data as Record<string, unknown>
    expect(userData.external_id).toHaveLength(2)
    expect(userData.st).toBeUndefined()
    // Telefone e e-mail chegam hasheados apesar do `+55...` do normalizador local.
    expect(userData.ph).toBeDefined()
    expect(userData.em).toBeDefined()
  })

  it("grava meta_ad também quando o lead já existia (dedup por telefone)", async () => {
    leadExistente = { id: "lead-antigo", metadata: { landing_page: "wp", outra: 1 } }

    await POST(post({ ...LEAD, tracking: TRACKING_COMPLETO }, HEADERS_DO_PROXY))
    await flush()

    const updateMeta = escritasEm("leads", "update").find((e) => "metadata" in e.payload)
    const metadata = updateMeta?.payload.metadata as Record<string, unknown>
    expect(metadata.outra).toBe(1) // merge preserva o JSONB existente
    expect(metadata.meta_ad).toBeDefined()
    // O update de metadata é próprio — não pode herdar o `is(utm_campaign, null)`
    // do update de UTM, senão a atribuição do clique dependeria da campanha.
    expect(updateMeta?.filters).toEqual([["id", "lead-antigo"]])
    expect(batches).toHaveLength(1)
  })
})

describe("AC7 — IP/UA do visitante vencem os do proxy", () => {
  it("o evento sai com o IP do corpo, nunca com o do datacenter Vercel", async () => {
    await POST(post({ ...LEAD, tracking: TRACKING_COMPLETO }, HEADERS_DO_PROXY))
    await flush()

    const userData = batches[0]![0]!.user_data as Record<string, unknown>
    expect(userData.client_ip_address).toBe("187.1.2.3")
    expect(userData.client_user_agent).toBe(TRACKING_COMPLETO.client_ua)
    // O IP do proxy não pode aparecer em canto nenhum do payload nem do banco.
    const tudo = JSON.stringify({ batches, escritas })
    expect(tudo).not.toContain("76.76.21.21")
    expect(tudo).not.toContain("node-fetch")
  })

  it("cai no header só quando o corpo não trouxe os campos", async () => {
    const semIp = { ...TRACKING_COMPLETO } as Record<string, unknown>
    delete semIp.client_ip
    delete semIp.client_ua

    await POST(post({ ...LEAD, tracking: semIp }, HEADERS_DO_PROXY))
    await flush()

    const userData = batches[0]![0]!.user_data as Record<string, unknown>
    expect(userData.client_ip_address).toBe("76.76.21.21")
  })
})

describe("AC9 — PII e sinais de atribuição não vazam para onde não devem", () => {
  it("tracking NÃO entra em webhook_logs.payload nem em metadata.raw_fields", async () => {
    // `flattenIntoFields` descarta objetos aninhados de propósito. Se alguém
    // "consertar" esse flatten, IP e UA do visitante passam a ser persistidos em
    // duas tabelas que ninguém audita — e este teste quebra.
    await POST(post({ ...LEAD, tracking: TRACKING_COMPLETO }, HEADERS_DO_PROXY))
    await flush()

    const log = escritasEm("webhook_logs", "insert")[0]?.payload
    const rawFields = (
      escritasEm("leads", "insert")[0]?.payload.metadata as Record<string, unknown>
    ).raw_fields

    for (const alvo of [JSON.stringify(log), JSON.stringify(rawFields)]) {
      expect(alvo).not.toContain("187.1.2.3")
      expect(alvo).not.toContain(TRACKING_COMPLETO.fbp)
      expect(alvo).not.toContain(TRACKING_COMPLETO.event_id)
      expect(alvo).not.toContain("iPhone")
    }
  })

  it("não loga PII nem sinais de atribuição no caminho de sucesso", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const erro = vi.spyOn(console, "error").mockImplementation(() => {})

    await POST(post({ ...LEAD, tracking: TRACKING_COMPLETO }, HEADERS_DO_PROXY))
    await flush()

    const saida = [...log.mock.calls, ...warn.mock.calls, ...erro.mock.calls]
      .map((c) => JSON.stringify(c))
      .join(" ")
    for (const segredo of [
      "Maria",
      "exemplo.com",
      "997344650",
      "187.1.2.3",
      TRACKING_COMPLETO.fbp,
      TRACKING_COMPLETO.fbc,
    ]) {
      expect(saida).not.toContain(segredo)
    }
    log.mockRestore()
    warn.mockRestore()
    erro.mockRestore()
  })
})

describe("AC10 — degradação graciosa", () => {
  it("tracking malformado (string, array, vazio) não impede o lead de nascer", async () => {
    for (const invalido of ["texto solto", [], {}, null, 42]) {
      escritas = []
      batches.length = 0
      const res = await POST(post({ ...LEAD, tracking: invalido }))
      await flush()

      expect(res.status).toBe(200)
      expect(escritasEm("leads", "insert")).toHaveLength(1)
      expect(batches).toHaveLength(0)
    }
  })

  it("tracking sem event_id nenhum grava meta_ad mas não inventa evento", async () => {
    // Bloqueador de anúncios pode zerar os cookies, mas o `event_id` vem do
    // nosso próprio helper. Se ainda assim faltar, o sinal de atribuição é
    // salvo (serve ao "Visitou") e nenhum evento sai sem deduplicação.
    const semIds = { visitor_id: "v-1", fbp: "fb.1.1.p", client_ip: "187.1.2.3" }
    const res = await POST(post({ ...LEAD, tracking: semIds }, HEADERS_DO_PROXY))
    await flush()

    expect(res.status).toBe(200)
    const metadata = escritasEm("leads", "insert")[0]?.payload.metadata as Record<
      string,
      unknown
    >
    expect(metadata.meta_ad).toBeDefined()
    expect(batches).toHaveLength(0)
  })

  it("dispara só o Lead quando o event_id do CompleteRegistration falta", async () => {
    const parcial = { ...TRACKING_COMPLETO } as Record<string, unknown>
    delete parcial.complete_registration_event_id

    await POST(post({ ...LEAD, tracking: parcial }, HEADERS_DO_PROXY))
    await flush()

    expect(batches[0]).toHaveLength(1)
    expect(batches[0]![0]?.event_name).toBe("Lead")
  })

  it("submissão vazia com tracking não cria lead nem evento", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const res = await POST(post({ tracking: TRACKING_COMPLETO }, HEADERS_DO_PROXY))
    await flush()

    expect(res.status).toBe(200)
    expect(escritasEm("leads", "insert")).toHaveLength(0)
    expect(batches).toHaveLength(0)
    warn.mockRestore()
  })
})


// ─────────────────────────────────────────────────────────────────────────────────────────────
// Story 900-24 · AC5 + AC10 — dual-run com a EXCEÇÃO NOMEADA de resposta HTTP
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// Este é o receptor onde "não resolveu" NÃO devolve 200 hoje: devolve 5xx, e o proxy `api/lead.js`
// re-tenta. Trocar isso por 200 uniforme reabriria, no ponto exato, o incidente que o comentário
// de `route.ts:109-118` diz ter corrigido — lead pago perdido em silêncio. Por isso o 200+log só
// existe no modo `identifier`.
describe("Story 900-24 — landing-page: 5xx preservado em legacy/both (Task 5.5)", () => {
  it("`legacy` + legado null → 500 e corpo idênticos aos de hoje", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "legacy"
    configAtivaLegado = null

    const res = await POST(post({ ...LEAD, page: "vind-residence" }))
    await flush()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Lead processing failed" })
    // `processing_error` na MESMA linha de webhook_logs, com o MESMO texto de antes da story.
    expect(escritasEm("webhook_logs", "update")).toContainEqual(
      expect.objectContaining({ payload: { processing_error: "Nenhuma org ativa encontrada" } }),
    )
    // E nenhum log de "não resolvido pelo identificador" — o caminho nem consultou o identificador.
    expect(logEventOnceMock).not.toHaveBeenCalled()
    expect(escritasEm("leads", "insert")).toHaveLength(0)
  })

  it("`both` + legado null → 500 também (o modo de PRODUÇÃO não abre caminho de 200)", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "both"
    configAtivaLegado = null
    // Mesmo com o identifier resolvendo, `both` NÃO promove o caminho novo a operativo.
    resolveSoleOrgMock.mockImplementation(async () => ({ status: "resolvida", orgId: "org-B" }))

    const res = await POST(post({ ...LEAD, page: "vind-residence" }))
    await flush()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Lead processing failed" })
    expect(logEventOnceMock).not.toHaveBeenCalled()
    expect(escritasEm("leads", "insert")).toHaveLength(0)
  })

  it("`identifier` + não resolveu → 200 + log (a ÚNICA mudança de resposta desta story)", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "identifier"
    resolveSoleOrgMock.mockImplementation(async () => ({
      status: "nao_resolvida",
      motivo: "ambigua",
      quantidadeEncontrada: 2,
    }))

    const res = await POST(post({ ...LEAD, page: "vind-residence" }))
    await flush()

    expect(res.status).toBe(200)
    expect(logEventOnceMock.mock.calls[0]![0]).toMatchObject({
      event_type: "WEBHOOK_ORG_UNRESOLVED",
      metadata: {
        receptor: "landing_page",
        motivo: "ambigua",
        identificador: { quantidade_organizacoes_ativas: 2 },
      },
    })
    // Reaproveita a linha de webhook_logs já inserida — não cria uma segunda.
    expect(escritasEm("webhook_logs", "insert")).toHaveLength(1)
    expect(escritasEm("webhook_logs", "update")).toContainEqual(
      expect.objectContaining({ payload: { processing_error: "org_unresolved:ambigua" } }),
    )
    expect(escritasEm("leads", "insert")).toHaveLength(0)
  })

  /**
   * Gate `@qa`, concerns 1/3/4 — o objeto EXATO que o call site passa. Este receptor é o de maior
   * risco de PII: o corpo do formulário traz nome, e-mail e telefone do lead, e este log grava com
   * `org_id: null`.
   */
  it("o que a rota passa a `logOrgUnresolved` é EXATAMENTE isto — sem nada do formulário", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "identifier"
    resolveSoleOrgMock.mockImplementation(async () => ({
      status: "nao_resolvida",
      motivo: "ambigua",
      quantidadeEncontrada: 2,
    }))

    await POST(post({ ...LEAD, page: "vind-residence" }))
    await flush()

    expect(logOrgUnresolvedSpy).toHaveBeenCalledTimes(1)
    expect(logOrgUnresolvedSpy.mock.calls[0]![0]).toEqual({
      receptor: "landing_page",
      motivo: "ambigua",
      quantidadeEncontrada: 2,
      identificador: { quantidade_organizacoes_ativas: 2 },
      webhookLogsSource: "landing_page",
      webhookLogsExistenteId: "log-1",
    })
    const serializado = JSON.stringify(logEventOnceMock.mock.calls[0]![0])
    for (const pii of ["Maria Souza", "maria@exemplo.com", "99734-4650", "5544997344650"]) {
      expect(serializado).not.toContain(pii)
    }
  })

  /**
   * Gate `@qa`, 11º instrumento cego — aqui a CLASSE não se aplica do mesmo jeito: `resolveSoleOrg`
   * não recebe nenhum dado do payload (não há identificador de org numa submissão de landing page —
   * UTM colide entre tenants). O que sobra para afirmar é a ARIDADE e a IDENTIDADE do argumento:
   * exatamente 1, e é o client admin — não um segundo parâmetro que alguém acrescente sem AC.
   */
  it("`resolveSoleOrg` é chamado com exatamente 1 argumento (o client), sem dado de payload", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "identifier"
    resolveSoleOrgMock.mockImplementation(async () => ({ status: "resolvida", orgId: "org-B" }))

    await POST(post({ ...LEAD, page: "vind-residence" }))
    await flush()

    expect(resolveSoleOrgMock).toHaveBeenCalledTimes(1)
    expect(resolveSoleOrgMock.mock.calls[0]!).toHaveLength(1)
    expect(resolveSoleOrgMock.mock.calls[0]![0]).toEqual(expect.objectContaining({ from: expect.any(Function) }))
  })

  /** Gate `@qa`, concern 2 — carrasco do `await` no CALL SITE (escrita completa em macrotask). */
  it("a escrita de `WEBHOOK_ORG_UNRESOLVED` COMPLETA antes de a rota responder", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "identifier"
    resolveSoleOrgMock.mockImplementation(async () => ({
      status: "nao_resolvida",
      motivo: "nenhuma_correspondencia",
      quantidadeEncontrada: 0,
    }))

    const res = await POST(post({ ...LEAD, page: "vind-residence" }))

    // Sem `flush()`: a asserção roda no RETORNO do handler.
    expect(res.status).toBe(200)
    expect(escritasCompletadas).toHaveLength(1)
  })

  it("mutação #8 (1): em `both` com divergência, o lead nasce na org do LEGADO", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "both"
    resolveSoleOrgMock.mockImplementation(async () => ({ status: "resolvida", orgId: "org-B" }))

    const res = await POST(post({ ...LEAD, page: "vind-residence" }))
    await flush()

    expect(res.status).toBe(200)
    const inseridos = escritasEm("leads", "insert")
    expect(inseridos).toHaveLength(1)
    expect((inseridos[0]!.payload as Record<string, unknown>).org_id).toBe("org-1")
    expect((inseridos[0]!.payload as Record<string, unknown>).org_id).not.toBe("org-B")
  })

  it("mutação #8 (2): `logOrgResolved` com via:'legacy' e divergiu:true", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "both"
    resolveSoleOrgMock.mockImplementation(async () => ({ status: "resolvida", orgId: "org-B" }))

    await POST(post({ ...LEAD, page: "vind-residence" }))
    await flush()

    const evento = logEventMock.mock.calls
      .map((c) => c[0] as { event_type?: string; org_id?: string; metadata?: Record<string, unknown> })
      .find((e) => e.event_type === "WEBHOOK_ORG_RESOLVED")
    expect(evento!.org_id).toBe("org-1")
    expect(evento!.metadata).toMatchObject({
      via: "legacy",
      divergiu: true,
      receptor: "landing_page",
    })
  })

  it("`identifier` resolvendo: o lead nasce na org que o identificador escolheu", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "identifier"
    resolveSoleOrgMock.mockImplementation(async () => ({ status: "resolvida", orgId: "org-B" }))

    await POST(post({ ...LEAD, page: "vind-residence" }))
    await flush()

    const inseridos = escritasEm("leads", "insert")
    expect((inseridos[0]!.payload as Record<string, unknown>).org_id).toBe("org-B")
  })
})
