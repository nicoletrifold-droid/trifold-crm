/**
 * Story 900-24 · AC6 + AC10 (mutação #8) — receptor `telegram`.
 *
 * Este arquivo nasce com a story: o `telegram/webhook` não tinha suíte nenhuma, e era o pior dos 4
 * pontos de defeito — `organizations` SEM filtro, `.limit(1).single()`, "a primeira linha que
 * vier". Com duas empresas, metade das conversas cairia na org errada, sem aviso.
 *
 * O teste que importa é a asserção (1) da mutação #8: o `org_id` que chega ao PROCESSAMENTO (a
 * linha de `leads`/`conversations`/`messages` gravada) é o do LEGADO enquanto o modo for `both`.
 * A asserção (2) (`logOrgResolved` com `via:"legacy"`) permanece verde sob a mutação — o @po mediu
 * — então ela é a fábrica, não o objeto.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("server-only", () => ({}))

process.env.TELEGRAM_BOT_TOKEN = "bot-token-de-teste"
process.env.TELEGRAM_WEBHOOK_SECRET = "segredo-de-teste"

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

vi.mock("@trifold/bot", () => ({
  getTelegramFileUrl: vi.fn(async () => null),
  downloadFileAsBase64: vi.fn(async () => null),
}))
vi.mock("@web/lib/transcription/transcribe", () => ({ transcribeAudio: vi.fn(async () => null) }))
vi.mock("@web/lib/media/inbound-media", () => ({ uploadInboundMedia: vi.fn(async () => null) }))
vi.mock("@web/lib/broker/notify-appointment", () => ({
  notifyBrokerOfAppointment: vi.fn(async () => {}),
}))
/** A Nicole não fala com a Anthropic aqui — o alvo é o roteamento de org, não o pipeline de IA. */
vi.mock("@trifold/ai", () => ({
  createAnthropicClient: () => ({}),
  processMessage: vi.fn(async () => ({ response: "ok", blocks: [] })),
}))

/** Story 900-24 · mutação #8 — resolver novo plantável (delega ao real por padrão). */
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

// --- Fake supabase: registra tudo que foi escrito, com a tabela e o payload ------------------
interface Escrita {
  tabela: string
  operacao: "insert" | "update"
  payload: Record<string, unknown>
}
let escritas: Escrita[] = []
/** Linhas de `organizations` que o LEGADO (`.limit(1).single()`) enxerga. */
let orgsDoLegado: Array<Record<string, unknown>> = [{ id: "org-1" }]

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabela: string) {
      const estado = { operacao: "select" as "select" | "insert" | "update", payload: {} }
      let contador = 0
      const resolver = () => {
        if (estado.operacao === "insert") {
          escritas.push({
            tabela,
            operacao: "insert",
            payload: estado.payload as Record<string, unknown>,
          })
          const p = estado.payload as Record<string, unknown>
          contador += 1
          return { data: { id: `${tabela}-novo-${contador}`, ...p }, error: null }
        }
        if (estado.operacao === "update") {
          escritas.push({
            tabela,
            operacao: "update",
            payload: estado.payload as Record<string, unknown>,
          })
          return { data: null, error: null }
        }
        // SELECTs: nenhuma linha pré-existente, exceto `organizations` (o legado).
        if (tabela === "organizations") {
          return orgsDoLegado.length === 1
            ? { data: orgsDoLegado[0], error: null }
            : { data: null, error: { code: "PGRST116", message: "no rows" } }
        }
        return { data: null, error: { code: "PGRST116", message: "no rows" } }
      }
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const api: any = {
        select: () => api,
        insert(p: Record<string, unknown>) {
          estado.operacao = "insert"
          estado.payload = p
          return api
        },
        update(p: Record<string, unknown>) {
          estado.operacao = "update"
          estado.payload = p
          return api
        },
        eq: () => api,
        order: () => api,
        limit: () => api,
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

const { POST } = await import("./route")

function post(texto = "oi") {
  return new Request("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers: {
      "x-telegram-bot-api-secret-token": "segredo-de-teste",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message: {
        message_id: 1,
        chat: { id: 987654 },
        from: { first_name: "Maria" },
        text: texto,
      },
    }),
  }) as unknown as import("next/server").NextRequest
}

function escritasEm(tabela: string, operacao: "insert" | "update") {
  return escritas.filter((e) => e.tabela === tabela && e.operacao === operacao)
}

const ENV_ORIGINAL = process.env.WEBHOOK_ORG_ROUTING

beforeEach(() => {
  escritas = []
  orgsDoLegado = [{ id: "org-1" }]
  logEventMock.mockClear()
  logEventOnceMock.mockClear()
  logOrgUnresolvedSpy.mockClear()
  geracaoDoTeste++
  escritasCompletadas = []
  resolveSoleOrgMock.mockReset()
  global.fetch = vi.fn(async () => new Response("{}")) as unknown as typeof fetch
})

afterEach(() => {
  if (ENV_ORIGINAL === undefined) delete process.env.WEBHOOK_ORG_ROUTING
  else process.env.WEBHOOK_ORG_ROUTING = ENV_ORIGINAL
})

describe("Story 900-24 — telegram: dual-run", () => {
  it("mutação #8 (1): em `both` com divergência, o lead nasce na org do LEGADO", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "both"
    resolveSoleOrgMock.mockImplementation(async () => ({ status: "resolvida", orgId: "org-B" }))

    const res = await POST(post())

    expect(res.status).toBe(200)
    const lead = escritasEm("leads", "insert")[0]!.payload
    expect(lead.org_id).toBe("org-1")
    expect(lead.org_id).not.toBe("org-B")
    expect(escritasEm("conversations", "insert")[0]!.payload.org_id).toBe("org-1")
  })

  it("mutação #8 (2): `logOrgResolved` com via:'legacy', divergiu:true e receptor 'telegram'", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "both"
    resolveSoleOrgMock.mockImplementation(async () => ({ status: "resolvida", orgId: "org-B" }))

    await POST(post())

    const evento = logEventMock.mock.calls
      .map((c) => c[0] as { event_type?: string; org_id?: string; metadata?: Record<string, unknown> })
      .find((e) => e.event_type === "WEBHOOK_ORG_RESOLVED")
    expect(evento!.org_id).toBe("org-1")
    expect(evento!.metadata).toMatchObject({ via: "legacy", divergiu: true, receptor: "telegram" })
  })

  it("`legacy` puro: comportamento de hoje, sem nenhum log novo de roteamento", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "legacy"

    const res = await POST(post())

    expect(res.status).toBe(200)
    expect(escritasEm("leads", "insert")[0]!.payload.org_id).toBe("org-1")
    const resolvidos = logEventMock.mock.calls
      .map((c) => c[0] as { event_type?: string })
      .filter((e) => e.event_type === "WEBHOOK_ORG_RESOLVED")
    expect(resolvidos).toHaveLength(0)
  })

  it("modo `identifier`: o resolver novo decide, e o lead nasce em org-B", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "identifier"
    resolveSoleOrgMock.mockImplementation(async () => ({ status: "resolvida", orgId: "org-B" }))

    await POST(post())

    expect(escritasEm("leads", "insert")[0]!.payload.org_id).toBe("org-B")
  })

  /**
   * A diferença que o resolver novo faz neste receptor: com 2 orgs o legado escolheria UMA
   * arbitrariamente (`.limit(1)`), sem aviso. `resolveSoleOrg` recusa e nomeia.
   */
  it("modo `identifier` com 2 orgs: `ambigua` — não repete a arbitrariedade do `.limit(1)`", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "identifier"
    resolveSoleOrgMock.mockImplementation(async () => ({
      status: "nao_resolvida",
      motivo: "ambigua",
      quantidadeEncontrada: 2,
    }))

    const res = await POST(post())

    expect(res.status).toBe(200)
    expect(escritasEm("leads", "insert")).toHaveLength(0)
    expect(logEventOnceMock).toHaveBeenCalledTimes(1)
    expect(logEventOnceMock.mock.calls[0]![0]).toMatchObject({
      event_type: "WEBHOOK_ORG_UNRESOLVED",
      metadata: {
        motivo: "ambigua",
        quantidade_encontrada: 2,
        // Condição do AUTO-DECISÃO 1 (@po): `source: "other"` sozinho NÃO discrimina receptor.
        receptor: "telegram",
        identificador: { quantidade_organizacoes_ativas: 2 },
      },
    })
  })

  /**
   * Gate `@qa`, concerns 1/3/4 — o objeto EXATO que o call site passa. `chat_id` é identificador do
   * LEAD (a conversa dele), não da org: não pode entrar, e é uma das 5 chaves com que o `@qa`
   * mediu a tautologia da versão anterior.
   */
  it("o que a rota passa a `logOrgUnresolved` é EXATAMENTE isto — sem chat_id, sem texto", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "identifier"
    resolveSoleOrgMock.mockImplementation(async () => ({
      status: "nao_resolvida",
      motivo: "ambigua",
      quantidadeEncontrada: 2,
    }))

    await POST(post("meu telefone é 44999990000"))

    expect(logOrgUnresolvedSpy).toHaveBeenCalledTimes(1)
    expect(logOrgUnresolvedSpy.mock.calls[0]![0]).toEqual({
      receptor: "telegram",
      motivo: "ambigua",
      quantidadeEncontrada: 2,
      identificador: { quantidade_organizacoes_ativas: 2 },
      // Concern 4: `other` é decisão nomeada do AC6, não default acidental.
      webhookLogsSource: "other",
      // Este receptor NÃO tem linha própria de webhook_logs — a chave não pode aparecer.
    })
    const serializado = JSON.stringify(logEventOnceMock.mock.calls[0]![0])
    expect(serializado).not.toContain("987654")
    expect(serializado).not.toContain("44999990000")
    expect(serializado).not.toContain("Maria")
  })

  /** Gate `@qa`, concern 2 — carrasco do `await` no CALL SITE (escrita completa em macrotask). */
  it("a escrita de `WEBHOOK_ORG_UNRESOLVED` COMPLETA antes de a rota responder", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "identifier"
    resolveSoleOrgMock.mockImplementation(async () => ({
      status: "nao_resolvida",
      motivo: "nenhuma_correspondencia",
      quantidadeEncontrada: 0,
    }))

    const res = await POST(post())

    expect(res.status).toBe(200)
    expect(escritasCompletadas).toHaveLength(1)
  })

  it("AUTO-DECISÃO do AC6: `webhook_logs.source` é `other` (o CHECK não tem 'telegram')", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "identifier"
    resolveSoleOrgMock.mockImplementation(async () => ({
      status: "nao_resolvida",
      motivo: "nenhuma_correspondencia",
      quantidadeEncontrada: 0,
    }))

    await POST(post())

    const linha = escritasEm("webhook_logs", "insert")[0]!.payload
    expect(linha.source).toBe("other")
    expect(linha.org_id).toBeNull()
    expect(linha.event_type).toBe("org_unresolved")
  })
})
