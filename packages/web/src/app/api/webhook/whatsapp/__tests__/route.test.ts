/**
 * Webhook idempotency + dedup tests — Story 21.1
 *
 * Strategy: build an in-memory Supabase mock that supports the chain methods
 * the route uses (.from().select()/insert()/upsert()/update()/delete().eq()…).
 * The mock is NOT a Postgres replacement — it implements the minimum surface
 * needed by the route to run end-to-end.
 *
 * Tests cover:
 *   - AC2: same wamid twice → only 1 message inserted
 *   - AC8.4: 3 calls with same `from` in 3 different formats + 3 unique wamids
 *           → 1 lead, 1 conversation, 3 user messages (production bug repro)
 *   - find-or-create lead: 0 rows → creates; 1 row → returns existing
 *   - normalizePhoneBR null → 200 + phone_normalize_failed log
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

// ---- Mocks ----------------------------------------------------------------

/**
 * Mock de `after()` do next/server.
 *
 * ⚠️ Story 87-20 · gate `@qa` QA-87-20-1 — a promise do callback é GUARDADA, não descartada.
 * Enquanto era `void Promise.resolve().then(() => fn())`, o único jeito de o teste saber que o
 * callback terminou era esperar tempo de relógio. Isso mede FOLGA, não ORDEM: com o laço de 60 ms
 * do `entregar()`, uma escrita órfã (o `await` removido do `logEventOnce`) completava por acidente
 * dentro da folga e a suíte ficava 32/32 VERDE. Guardando a promise, `drenarAfter()` espera a
 * CONCLUSÃO do callback — com `await`, a escrita já aconteceu; com `void`, não aconteceu, e a
 * asserção imediata fica vermelha sem depender de nenhum relógio.
 */
let afterPromises: Array<Promise<unknown>> = []

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>(
    "next/server"
  )
  return {
    ...actual,
    after: (fn: () => Promise<unknown> | unknown) => {
      // Dispara no microtask seguinte (como antes) — mas a promise fica retida para
      // que o teste possa AGUARDÁ-LA em vez de cronometrar o callback.
      afterPromises.push(Promise.resolve().then(() => fn()))
    },
  }
})

/**
 * Mock the AI dynamic import so we don't actually load Anthropic.
 *
 * ⚠️ Story 87-20 — o call-site do webhook passou a ser `processMessageWithMetadata`.
 * Enquanto o mock só expunha `processMessage`, o símbolo novo era `undefined`, a
 * chamada estourava "is not a function" e o `catch (asyncErr)` da rota engolia tudo
 * em `WEBHOOK_ASYNC_ERROR` — a suíte inteira continuava VERDE com o caminho da IA
 * morto. `pipelineMock` é sobrescrevível por teste; o retorno padrão é o turno normal.
 */
const pipelineMock = vi.fn(async () => ({
  response: "Mocked Nicole reply",
  qualificationScore: 0,
}))
vi.mock("@trifold/ai", () => ({
  processMessage: vi.fn(async () => "Mocked Nicole reply"),
  processMessageWithMetadata: (...a: unknown[]) =>
    (pipelineMock as unknown as (...x: unknown[]) => unknown)(...a),
  createAnthropicClient: vi.fn(() => ({})),
}))

/**
 * Story 87-20 — o atraso "humano" (75-156) é `setTimeout` de até 3s no caminho real.
 * Zerá-lo é a única forma de a suíte alcançar o bloco de ENVIO sem esperar segundos —
 * e o que se mede aqui é SE o envio acontece, não quanto tempo depois.
 */
vi.mock("@web/lib/whatsapp/typing-delay", () => ({
  calculateTypingDelay: () => 0,
}))

// Mock fetch for outbound WhatsApp Cloud API + media download
const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
;(global as unknown as { fetch: typeof fetchMock }).fetch = fetchMock

// Mock the logger so tests can introspect events
const logEventMock = vi.fn()
// Story 900-24: `lib/tenancy/webhook-org.ts` também importa `logEventOnce` (o caminho AGUARDADO
// de "não resolveu"). Sem ele aqui, o módulo mockado devolveria `undefined` e o erro apareceria
// como "não é função" num branch distante do que o teste mede.
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
 * Story 900-24 · AC10, mutação #8 — divergência FORÇADA entre os dois caminhos.
 *
 * O resolver novo é espionável e sobrescrevível: por padrão delega ao módulo real (nenhum teste
 * existente muda de comportamento); os testes da mutação #8 o plantam devolvendo `org-B`, enquanto
 * o fake do banco continua tendo só `org-1` como config ativa (o que o LEGADO resolve). Assim a
 * divergência é real e a asserção "quem chegou ao processamento foi o legado" tem carrasco.
 */
const resolveOrgByWhatsAppPhoneMock =
  vi.fn<
    (...args: unknown[]) => Promise<unknown>
  >()
vi.mock("@web/lib/tenancy/webhook-org", async (importOriginal) => {
  const real = await importOriginal<typeof import("@web/lib/tenancy/webhook-org")>()
  return {
    ...real,
    logOrgUnresolved: async (...args: unknown[]) => {
      logOrgUnresolvedSpy(...args)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return real.logOrgUnresolved(...(args as [any]))
    },
    resolveOrgByWhatsAppPhone: (...args: unknown[]) =>
      resolveOrgByWhatsAppPhoneMock.getMockImplementation()
        ? resolveOrgByWhatsAppPhoneMock(...args)
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          real.resolveOrgByWhatsAppPhone(...(args as [any, any])),
  }
})

// Mock email automations
vi.mock("@web/lib/email-automations", () => ({
  triggerAutomations: vi.fn(),
}))

// Story 90-1 — Live Coach. Mockado aqui para que o `after()` do coach não
// dependa do Anthropic real; o teste de fail-open troca a implementação para
// rejeitar e prova que o webhook responde 200 do mesmo jeito.
const coachMock = vi.fn(async () => {})
vi.mock("@web/lib/coach/generate-suggestion", () => ({
  generateCoachSuggestion: (...args: unknown[]) => coachMock(...(args as [])),
}))

// ---- In-memory Supabase mock ---------------------------------------------

interface MessageRow {
  id: string
  conversation_id: string
  role: string
  content: string
  media_url: string | null
  media_type: string | null
  metadata: Record<string, unknown>
  /**
   * O mock não tinha esta coluna, embora o schema real a defina como
   * `NOT NULL DEFAULT now()` (001_base_schema.sql:180). Sem ela o
   * `inboundCreatedAt` da rota vinha sempre null nos testes — e nem a guarda
   * anti-rajada (75-359) nem o `after()` do Live Coach (90-1) eram exercidos.
   */
  created_at: string
}

interface LeadRow {
  id: string
  org_id: string
  phone: string
  phone_normalized: string | null
  channel?: string
  source?: string
  stage_id?: string | null
  metadata?: Record<string, unknown> | null
  created_at: string
}

interface ConversationRow {
  id: string
  org_id: string
  lead_id: string
  channel: string
  is_ai_active: boolean
  status: string
  created_at: string
  last_message_at?: string | null
  /** Story 87-20 (AC14) — a âncora e o MOTIVO do handoff. */
  handoff_at?: string | null
  handoff_reason?: string | null
}

interface DbState {
  leads: LeadRow[]
  conversations: ConversationRow[]
  messages: MessageRow[]
  whatsapp_config: Array<{
    org_id: string
    phone_number_id: string
    access_token: string
    coexistence_enabled: boolean
    status: string
  }>
  kanban_stages: Array<{
    id: string
    org_id: string
    is_default: boolean
  }>
  campaign_entries: Array<Record<string, unknown>>
  campaign_events: Array<Record<string, unknown>>
  meta_ads: Array<Record<string, unknown>>
  meta_adsets: Array<Record<string, unknown>>
  meta_campaigns: Array<Record<string, unknown>>
  /** Story 900-24: `logOrgUnresolved` grava aqui com `org_id: null`. */
  webhook_logs: Array<Record<string, unknown>>
  /** Story 900-24: destino de `logEventOnce` quando o logger NÃO está mockado. */
  system_events: Array<Record<string, unknown>>
}

let db: DbState

function freshDb(): DbState {
  return {
    leads: [],
    conversations: [],
    messages: [],
    whatsapp_config: [
      {
        org_id: "org-1",
        phone_number_id: "PNID",
        access_token: "TOKEN",
        coexistence_enabled: false,
        status: "active",
      },
    ],
    kanban_stages: [{ id: "stage-1", org_id: "org-1", is_default: true }],
    campaign_entries: [],
    campaign_events: [],
    meta_ads: [],
    meta_adsets: [],
    meta_campaigns: [],
    webhook_logs: [],
    system_events: [],
  }
}

let nextId = 0
function newId(prefix: string): string {
  nextId += 1
  return `${prefix}-${nextId}`
}

import { normalizePhoneBR } from "@trifold/shared"

/** Story 87-20 — todo `.select()` executado, com a lista LITERAL de colunas. */
let selectsPorTabela: Array<{ table: string; cols: string | null }> = []

/** Colunas de uma projeção simples, ou `null` (`*`, embed, `->>`, agregados). */
function parseProjecao(cols: string | null): string[] | null {
  if (!cols) return null
  const partes = cols.split(",").map((c) => c.trim())
  if (partes.some((p) => !/^[a-z_][a-z0-9_]*$/i.test(p))) return null
  return partes
}

function projetar(
  rows: Record<string, unknown>[],
  cols: string[] | null
): Record<string, unknown>[] {
  if (cols === null) return rows
  return rows.map((r) => {
    const out: Record<string, unknown> = {}
    for (const c of cols) if (c in r) out[c] = r[c]
    return out
  })
}

// Build a minimal chainable Supabase-like client. Each query is built up via
// chained method calls; `await` triggers `then` which resolves the result.
function buildSupabaseMock() {
  function from(table: keyof DbState) {
    interface QueryState {
      filters: Array<{ col: string; op: string; val: unknown }>
      orderBy?: { col: string; ascending: boolean }
      limit?: number
      action: "select" | "insert" | "upsert" | "update" | "delete"
      /** Story 87-20 — colunas do `.select()`, ou `null` quando não é projeção simples. */
      cols?: string[] | null
      payload?: unknown
      onConflict?: string
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pendingResult?: any
    }

    const state: QueryState = { filters: [], action: "select" }

    function applyFilters(rows: Record<string, unknown>[]) {
      let result = rows.slice()
      for (const f of state.filters) {
        if (f.op === "eq") {
          // Special handling for `metadata->>whatsapp_message_id` style cols
          if (f.col.includes("->>")) {
            const [parent, child] = f.col.split("->>")
            result = result.filter((r) => {
              const meta = r[parent!] as Record<string, unknown> | undefined
              return meta?.[child!] === f.val
            })
          } else {
            result = result.filter((r) => r[f.col] === f.val)
          }
        } else if (f.op === "in") {
          const vals = f.val as unknown[]
          result = result.filter((r) => vals.includes(r[f.col]))
        } else if (f.op === "not.is") {
          result = result.filter((r) => r[f.col] !== f.val)
        }
      }
      if (state.orderBy) {
        result.sort((a, b) => {
          const av = a[state.orderBy!.col]
          const bv = b[state.orderBy!.col]
          if (av === bv) return 0
          if (av === undefined || av === null) return 1
          if (bv === undefined || bv === null) return -1
          return state.orderBy!.ascending
            ? av < bv
              ? -1
              : 1
            : av < bv
              ? 1
              : -1
        })
      }
      if (state.limit !== undefined) result = result.slice(0, state.limit)
      return result
    }

    const builder = {
      /**
       * Story 87-20 — **a lista de colunas é aplicada de verdade.**
       *
       * O fake devolvia a linha inteira e ignorava o `.select()`. Isso deixa passar
       * VERDE a classe de defeito mais cara desta família: um `select` que não projeta
       * a coluna que o código logo abaixo consulta. Foi exatamente o caso do bloco de
       * reativação de 24h — `select("handoff_at")`, e o AC14 lendo `handoff_reason`
       * seria `undefined` para sempre. A chamada existe; o argumento foi neutralizado.
       *
       * `selectsPorTabela` guarda o argumento LITERAL para a asserção explícita de
       * projeção; o narrowing abaixo é a metade que tem dente.
       */
      select(...args: unknown[]) {
        if (state.action !== "insert" && state.action !== "upsert") {
          state.action = "select"
        }
        const cols = typeof args[0] === "string" ? (args[0] as string) : null
        selectsPorTabela.push({ table: String(table), cols })
        state.cols = parseProjecao(cols)
        return builder
      },
      insert(payload: unknown) {
        state.action = "insert"
        state.payload = payload
        return builder
      },
      upsert(payload: unknown, opts?: { onConflict?: string }) {
        state.action = "upsert"
        state.payload = payload
        state.onConflict = opts?.onConflict
        return builder
      },
      update(payload: unknown) {
        state.action = "update"
        state.payload = payload
        return builder
      },
      delete() {
        state.action = "delete"
        return builder
      },
      eq(col: string, val: unknown) {
        state.filters.push({ col, op: "eq", val })
        return builder
      },
      in(col: string, vals: unknown[]) {
        state.filters.push({ col, op: "in", val: vals })
        return builder
      },
      not(col: string, _op: string, val: unknown) {
        state.filters.push({ col, op: "not.is", val })
        return builder
      },
      order(col: string, opts?: { ascending?: boolean }) {
        state.orderBy = { col, ascending: opts?.ascending ?? true }
        return builder
      },
      limit(n: number) {
        state.limit = n
        return builder
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      single(): Promise<any> {
        return execute().then((res) => {
          if (!res.data || (Array.isArray(res.data) && res.data.length === 0)) {
            return { data: null, error: { code: "PGRST116", message: "no rows" } }
          }
          return {
            data: Array.isArray(res.data) ? res.data[0] : res.data,
            error: null,
          }
        })
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      maybeSingle(): Promise<any> {
        return execute().then((res) => ({
          data: Array.isArray(res.data)
            ? res.data[0] ?? null
            : res.data ?? null,
          error: res.error ?? null,
        }))
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then(onFulfilled: (v: any) => unknown, onRejected?: (e: unknown) => unknown) {
        return execute().then(onFulfilled, onRejected)
      },
    }

    function execute(): Promise<{
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: any
      error: { message: string } | null
    }> {
      /**
       * Story 87-20 — tabela ausente vira lista VAZIA em vez de `undefined`.
       *
       * Sem isto, qualquer consulta a uma tabela que o `freshDb` não declara estoura
       * `Cannot read properties of undefined (reading 'slice')` dentro do caminho
       * assíncrono — e o `catch (asyncErr)` da rota converte isso em um
       * `WEBHOOK_ASYNC_ERROR` silencioso. Foi o que manteve o pipeline da Nicole
       * INTEIRO fora de alcance desta suíte: nenhum teste chegava a `processMessage`,
       * e a suíte ficava verde de qualquer jeito. Medido em 2026-08-30 —
       * `identifyClientByContact` (Story 76-2) consulta tabelas de relacionamento que
       * o fake nunca declarou.
       */
      if (!db[table]) {
        ;(db as unknown as Record<string, unknown[]>)[table as string] = []
      }
      const rows = db[table] as Record<string, unknown>[]

      if (state.action === "select") {
        const result = projetar(applyFilters(rows), state.cols ?? null)
        return Promise.resolve({ data: result, error: null })
      }

      if (state.action === "insert" || state.action === "upsert") {
        const items = Array.isArray(state.payload)
          ? state.payload
          : [state.payload]
        const inserted: Record<string, unknown>[] = []
        for (const raw of items as Array<Record<string, unknown>>) {
          if (table === "leads") {
            const phone = raw.phone as string | null
            const phone_normalized = phone ? normalizePhoneBR(phone) : null
            // upsert with onConflict on (org_id, phone_normalized)
            if (
              state.action === "upsert" &&
              state.onConflict?.includes("phone_normalized")
            ) {
              const existing = db.leads.find(
                (l) =>
                  l.org_id === (raw.org_id as string) &&
                  l.phone_normalized === phone_normalized
              )
              if (existing) {
                inserted.push(existing as unknown as Record<string, unknown>)
                continue
              }
            }
            const newRow: LeadRow = {
              id: newId("lead"),
              org_id: raw.org_id as string,
              phone: phone ?? "",
              phone_normalized,
              channel: raw.channel as string,
              source: raw.source as string,
              stage_id: (raw.stage_id as string) ?? null,
              metadata: (raw.metadata as Record<string, unknown> | null) ?? null,
              created_at: new Date().toISOString(),
            }
            db.leads.push(newRow)
            inserted.push(newRow as unknown as Record<string, unknown>)
          } else if (table === "conversations") {
            const newRow: ConversationRow = {
              id: newId("conv"),
              org_id: raw.org_id as string,
              lead_id: raw.lead_id as string,
              channel: (raw.channel as string) ?? "whatsapp",
              is_ai_active: (raw.is_ai_active as boolean) ?? true,
              status: "active",
              created_at: new Date().toISOString(),
            }
            db.conversations.push(newRow)
            inserted.push(newRow as unknown as Record<string, unknown>)
          } else if (table === "messages") {
            const newRow: MessageRow = {
              id: newId("msg"),
              conversation_id: raw.conversation_id as string,
              role: raw.role as string,
              content: raw.content as string,
              media_url: (raw.media_url as string | null) ?? null,
              media_type: (raw.media_type as string | null) ?? null,
              metadata: (raw.metadata as Record<string, unknown>) ?? {},
              // `DEFAULT now()` no schema real — o banco carimba, não a app.
              created_at: (raw.created_at as string | undefined) ?? new Date().toISOString(),
            }
            db.messages.push(newRow)
            inserted.push(newRow as unknown as Record<string, unknown>)
          } else {
            // generic: just push
            const dest = db[table] as Array<Record<string, unknown>>
            dest.push({ id: newId(String(table)), ...raw })
            inserted.push({ id: newId(String(table)), ...raw })
          }
        }

        return Promise.resolve({ data: inserted, error: null })
      }

      if (state.action === "update") {
        const matched = applyFilters(rows)
        const patch = state.payload as Record<string, unknown>
        for (const m of matched) {
          Object.assign(m, patch)
        }
        return Promise.resolve({ data: matched, error: null })
      }

      if (state.action === "delete") {
        const matched = applyFilters(rows)
        const ids = new Set(matched.map((r) => r.id as string))
        const dest = db[table] as Record<string, unknown>[]
        for (let i = dest.length - 1; i >= 0; i--) {
          if (ids.has(dest[i]!.id as string)) dest.splice(i, 1)
        }
        return Promise.resolve({ data: matched, error: null })
      }

      return Promise.resolve({ data: null, error: null })
    }

    return builder
  }

  // Storage mock (Story 75-222): persistInboundMedia sobe a mídia ao bucket e grava
  // media_url na mensagem — o mock devolve uma URL pública determinística.
  const storage = {
    from(bucket: string) {
      return {
        upload: async () => ({ error: null }),
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://storage.test/${bucket}/${path}` },
        }),
      }
    },
  }

  return {
    from,
    storage,
  }
}

// Mock @supabase/supabase-js so the route's createClient returns our mock
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => buildSupabaseMock(),
}))

// ---- Helpers --------------------------------------------------------------

function buildPayload(opts: { from: string; wamid: string; text: string }) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from: opts.from,
                  id: opts.wamid,
                  type: "text",
                  text: { body: opts.text },
                },
              ],
            },
          },
        ],
      },
    ],
  }
}

/** Story 900-24: payload com `value.metadata.phone_number_id` — o identificador do receptor. */
function buildPayloadComTelefone(opts: {
  from: string
  wamid: string
  text: string
  phoneNumberId: string
}) {
  const base = buildPayload(opts)
  const value = base.entry[0]!.changes[0]!.value as Record<string, unknown>
  value.metadata = { phone_number_id: opts.phoneNumberId }
  return base
}

function signedRequest(
  payload: unknown,
  appSecret: string
): import("next/server").NextRequest {
  const raw = JSON.stringify(payload)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("crypto")
  const sig =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(raw).digest("hex")

  const req = new Request("http://localhost/api/webhook/whatsapp", {
    method: "POST",
    headers: {
      "x-hub-signature-256": sig,
      "content-type": "application/json",
    },
    body: raw,
  })

  // NextRequest is a thin wrapper; for our purposes the bare Request works
  // because the route only uses headers + text() + nextUrl (not used in POST).
  return req as unknown as import("next/server").NextRequest
}

async function flushAsync() {
  // Drain microtask queue so the `after()` callback runs
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

/**
 * Story 87-20 · QA-87-20-1 — espera os callbacks de `after()` TERMINAREM.
 *
 * A rota agenda vários `after()` independentes (push ao corretor, coach, e o bloco assíncrono
 * da Nicole), e um callback pode agendar outro — daí o laço, que troca a lista por uma nova a
 * cada volta. `allSettled` preserva a semântica fire-and-forget do original: um callback que
 * rejeita não derruba o teste, só deixa de ser esperado.
 */
async function drenarAfter() {
  for (let volta = 0; volta < 10 && afterPromises.length > 0; volta++) {
    const pendentes = afterPromises
    afterPromises = []
    await Promise.allSettled(pendentes)
  }
}

// ---- Tests ----------------------------------------------------------------

describe("WhatsApp webhook — Story 21.1", () => {
  const APP_SECRET = "test-secret"

  beforeEach(() => {
    db = freshDb()
    nextId = 0
    logEventMock.mockClear()
    fetchMock.mockClear()
    coachMock.mockClear()
    coachMock.mockResolvedValue(undefined)
    process.env.META_APP_SECRET = APP_SECRET
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key"
    process.env.META_WHATSAPP_VERIFY_TOKEN = "verify"
  })

  it("AC2 — duplicate wamid: same id twice → only 1 message inserted", async () => {
    const { POST } = await import("../route")

    const payload = buildPayload({
      from: "+5544999689446",
      wamid: "wamid.AAA",
      text: "oi",
    })

    const res1 = await POST(signedRequest(payload, APP_SECRET))
    expect(res1.status).toBe(200)
    await flushAsync()

    const res2 = await POST(signedRequest(payload, APP_SECRET))
    expect(res2.status).toBe(200)
    await flushAsync()

    // Exactly one inbound message stored
    expect(db.messages.length).toBe(1)
    expect(db.leads.length).toBe(1)
    expect(db.conversations.length).toBe(1)

    // Audit log fired for the duplicate
    const dupLogs = logEventMock.mock.calls
      .map((c) => c[0])
      .filter((e) => e.event_type === "duplicate_wamid_skipped")
    expect(dupLogs.length).toBeGreaterThan(0)
    expect(dupLogs[0].metadata).toMatchObject({ wamid: "wamid.AAA" })
  })

  it("AC8.4 — 3 calls with same `from` in 3 formats + 3 unique wamids → 1 lead, 1 conv, 3 user messages", async () => {
    const { POST } = await import("../route")

    const calls = [
      { from: "+5544999689446", wamid: "wamid.001", text: "primeira" },
      { from: "554499689446", wamid: "wamid.002", text: "segunda" }, // 12 digits, no 9
      { from: "5544 99968-9446", wamid: "wamid.003", text: "terceira" },
    ]

    for (const c of calls) {
      const res = await POST(signedRequest(buildPayload(c), APP_SECRET))
      expect(res.status).toBe(200)
      await flushAsync()
    }

    expect(db.leads.length).toBe(1)
    expect(db.leads[0]!.phone_normalized).toBe("5544999689446")
    expect(db.conversations.length).toBe(1)

    const userMsgs = db.messages.filter((m) => m.role === "user")
    expect(userMsgs.length).toBe(3)
    expect(userMsgs.map((m) => m.content).sort()).toEqual([
      "primeira",
      "segunda",
      "terceira",
    ])
  })

  it("find-or-create lead — 0 rows existing → creates new", async () => {
    const { POST } = await import("../route")

    const res = await POST(
      signedRequest(
        buildPayload({ from: "+5544999689446", wamid: "wamid.NEW", text: "oi" }),
        APP_SECRET
      )
    )
    expect(res.status).toBe(200)
    await flushAsync()

    expect(db.leads.length).toBe(1)
    const createdLog = logEventMock.mock.calls
      .map((c) => c[0])
      .find((e) => e.event_type === "lead_created")
    expect(createdLog).toBeTruthy()
  })

  it("find-or-create lead — 1 row existing → returns existing (no new lead)", async () => {
    // Pre-seed an existing lead for the same normalized phone
    db.leads.push({
      id: "lead-pre",
      org_id: "org-1",
      phone: "44999689446",
      phone_normalized: "5544999689446",
      created_at: "2026-01-01T00:00:00.000Z",
      metadata: null,
    })

    const { POST } = await import("../route")

    const res = await POST(
      signedRequest(
        buildPayload({ from: "+5544999689446", wamid: "wamid.EXIST", text: "oi" }),
        APP_SECRET
      )
    )
    expect(res.status).toBe(200)
    await flushAsync()

    expect(db.leads.length).toBe(1)
    expect(db.leads[0]!.id).toBe("lead-pre")

    // Inbound message attached to that lead's new conversation
    expect(db.conversations.length).toBe(1)
    expect(db.conversations[0]!.lead_id).toBe("lead-pre")

    // No `lead_created` log this time
    const createdLog = logEventMock.mock.calls
      .map((c) => c[0])
      .find((e) => e.event_type === "lead_created")
    expect(createdLog).toBeFalsy()
  })

  it("phone_normalize_failed — invalid phone (< 10 digits) → 200 + log + no DB writes", async () => {
    const { POST } = await import("../route")

    const res = await POST(
      signedRequest(
        buildPayload({ from: "abc", wamid: "wamid.BAD", text: "x" }),
        APP_SECRET
      )
    )
    expect(res.status).toBe(200)

    expect(db.leads.length).toBe(0)
    expect(db.messages.length).toBe(0)

    const failLog = logEventMock.mock.calls
      .map((c) => c[0])
      .find((e) => e.event_type === "phone_normalize_failed")
    expect(failLog).toBeTruthy()
  })

  it("HMAC invalid signature → 403, no DB writes", async () => {
    const { POST } = await import("../route")
    const payload = buildPayload({
      from: "+5544999689446",
      wamid: "wamid.HMAC",
      text: "x",
    })
    const raw = JSON.stringify(payload)
    const req = new Request("http://localhost/api/webhook/whatsapp", {
      method: "POST",
      headers: {
        "x-hub-signature-256": "sha256=wrong",
        "content-type": "application/json",
      },
      body: raw,
    })
    const res = await POST(
      req as unknown as import("next/server").NextRequest
    )
    expect(res.status).toBe(403)
    expect(db.messages.length).toBe(0)
  })

  // ---- Story 75-222 — mídia inbound nas COLUNAS top-level -----------------
  // Bug: imagem enviada pelo cliente aparecia como bolha vazia no Chat porque
  // media_url/media_type só iam pro metadata; as colunas ficavam NULL.

  function buildImagePayload(opts: {
    from: string
    wamid: string
    imageId: string
    caption?: string
  }) {
    return {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: opts.from,
                    id: opts.wamid,
                    type: "image",
                    image: { id: opts.imageId, caption: opts.caption },
                  },
                ],
              },
            },
          ],
        },
      ],
    }
  }

  // fetch mock que resolve o download da mídia da Graph API (metadados + arquivo).
  function mockMediaFetch(imageId: string) {
    const impl = async (...args: unknown[]) => {
      const url = String(args[0])
      if (url.includes(`graph.facebook.com/v21.0/${imageId}`)) {
        return {
          ok: true,
          json: async () => ({
            url: "https://media.meta.test/file-1",
            mime_type: "image/jpeg",
          }),
        }
      }
      if (url.startsWith("https://media.meta.test/")) {
        return {
          ok: true,
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
          headers: { get: () => "image/jpeg" },
          json: async () => ({}),
        }
      }
      return { ok: true, json: async () => ({}) }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchMock.mockImplementation(impl as any)
  }

  it("75-222 — imagem inbound: media_type na coluna já no sync (bolha nunca nasce vazia)", async () => {
    const { POST } = await import("../route")
    mockMediaFetch("IMG-1")

    const res = await POST(
      signedRequest(
        buildImagePayload({
          from: "+5544999689446",
          wamid: "wamid.IMG-SYNC",
          imageId: "IMG-1",
          caption: "olha essa planta",
        }),
        APP_SECRET
      )
    )
    expect(res.status).toBe(200)

    // Coluna top-level preenchida no INSERT síncrono (antes do download da mídia).
    const userMsg = db.messages.find((m) => m.role === "user")
    expect(userMsg).toBeTruthy()
    expect(userMsg!.media_type).toBe("image")
    // metadata segue preenchido (compat com telas que leem metadata.media_*)
    expect(userMsg!.metadata.media_type).toBe("image")
  })

  it("75-222 — imagem inbound: async grava media_url na COLUNA (e no metadata)", async () => {
    const { POST } = await import("../route")
    mockMediaFetch("IMG-2")

    const res = await POST(
      signedRequest(
        buildImagePayload({
          from: "+5544999689446",
          wamid: "wamid.IMG-ASYNC",
          imageId: "IMG-2",
        }),
        APP_SECRET
      )
    )
    expect(res.status).toBe(200)
    await flushAsync()

    const userMsg = db.messages.find((m) => m.role === "user")
    expect(userMsg).toBeTruthy()
    // persistInboundMedia: mídia no bucket → URL pública nas colunas top-level.
    expect(userMsg!.media_url).toMatch(
      /^https:\/\/storage\.test\/nicole-media\/whatsapp-inbound\//
    )
    expect(userMsg!.media_type).toBe("image")
    // metadata mantido em sincronia (compat).
    expect(userMsg!.metadata.media_url).toBe(userMsg!.media_url)
    expect(userMsg!.metadata.media_type).toBe("image")
    expect(userMsg!.metadata.whatsapp_message_id).toBe("wamid.IMG-ASYNC")
  })

  // ---- Story 75-289 (AC4) — mídia recebida deixa de ser perdida ----------

  it("75-289 AC4 — media_id é PERSISTIDO no sync (sem ele a mídia é irrecuperável)", async () => {
    const { POST } = await import("../route")
    // Sem mockMediaFetch: o download não resolve, exatamente como em 10/08.
    fetchMock.mockImplementation((async () => ({ ok: false, status: 401, json: async () => ({}) })) as never)

    const res = await POST(
      signedRequest(
        buildImagePayload({ from: "+5544999689446", wamid: "wamid.MID", imageId: "IMG-MID" }),
        APP_SECRET
      )
    )
    expect(res.status).toBe(200)
    await flushAsync()

    const userMsg = db.messages.find((m) => m.role === "user")
    // É este id que permite pedir a mídia de volta (a Meta retém ~30 dias).
    expect(userMsg!.metadata.media_id).toBe("IMG-MID")
  })

  it("75-289 AC4 — download 401: marca media_download_failed em vez de sumir calado", async () => {
    const { POST } = await import("../route")
    fetchMock.mockImplementation((async () => ({ ok: false, status: 401, json: async () => ({}) })) as never)

    await POST(
      signedRequest(
        buildImagePayload({ from: "+5544999689446", wamid: "wamid.F401", imageId: "IMG-F401" }),
        APP_SECRET
      )
    )
    await flushAsync()

    const userMsg = db.messages.find((m) => m.role === "user")
    expect(userMsg!.media_url).toBeNull() // não baixou
    expect(userMsg!.metadata.media_download_failed).toBe(true)
    expect(String(userMsg!.metadata.media_download_error)).toContain("401")
    // e o id continua lá para a nova tentativa
    expect(userMsg!.metadata.media_id).toBe("IMG-F401")
  })

  it("75-289 AC4 — download OK: media_id sobrevive ao update de sucesso (metadata é MESCLADO)", async () => {
    const { POST } = await import("../route")
    mockMediaFetch("IMG-OK")

    await POST(
      signedRequest(
        buildImagePayload({ from: "+5544999689446", wamid: "wamid.MOK", imageId: "IMG-OK" }),
        APP_SECRET
      )
    )
    await flushAsync()

    const userMsg = db.messages.find((m) => m.role === "user")
    expect(userMsg!.media_url).toMatch(/^https:\/\/storage\.test\//)
    // Antes o update substituía o metadata inteiro e apagava o media_id.
    expect(userMsg!.metadata.media_id).toBe("IMG-OK")
    expect(userMsg!.metadata.media_download_failed).toBe(false)
  })

  it("90-1 — coach lançando exceção: webhook responde 200 e a mensagem do lead é gravada igual", async () => {
    coachMock.mockRejectedValueOnce(new Error("Anthropic fora do ar"))

    const { POST } = await import("../route")

    const res = await POST(
      signedRequest(
        buildPayload({ from: "+5544999689446", wamid: "wamid.COACH1", text: "achei caro demais" }),
        APP_SECRET
      )
    )

    // O contrato que importa: a Meta recebe 200 e a mensagem não se perde.
    expect(res.status).toBe(200)
    await flushAsync()

    expect(db.messages.filter((m) => m.role === "user").length).toBe(1)
    expect(db.messages[0]!.content).toBe("achei caro demais")
  })

  it("90-1 — coach recebe o id e o created_at da mensagem inbound (FK message_id)", async () => {
    const { POST } = await import("../route")

    const res = await POST(
      signedRequest(
        buildPayload({ from: "+5544999689446", wamid: "wamid.COACH2", text: "ta muito caro isso" }),
        APP_SECRET
      )
    )
    expect(res.status).toBe(200)
    await flushAsync()

    expect(coachMock).toHaveBeenCalled()
    const [args] = coachMock.mock.calls[0] as unknown as [
      { messageId: string; messageCreatedAt: string; text: string },
    ]
    // Sem o `.select("id, created_at")` do INSERT, messageId viria undefined e o
    // `after()` do coach nem seria agendado — é isto que este teste tranca.
    expect(args.messageId).toBe(db.messages[0]!.id)
    expect(args.messageCreatedAt).toBeTruthy()
    expect(args.text).toBe("ta muito caro isso")
  })

  it("75-222 — texto puro: colunas de mídia ficam NULL (não polui mensagens sem mídia)", async () => {
    const { POST } = await import("../route")

    const res = await POST(
      signedRequest(
        buildPayload({ from: "+5544999689446", wamid: "wamid.TXT", text: "oi" }),
        APP_SECRET
      )
    )
    expect(res.status).toBe(200)

    const userMsg = db.messages.find((m) => m.role === "user")
    expect(userMsg!.media_url).toBeNull()
    expect(userMsg!.media_type).toBeNull()
  })
})


// ─────────────────────────────────────────────────────────────────────────────────────────────
// Story 900-24 · AC10, mutação #8 — "o caminho novo NUNCA decide em `both`"
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// Esta é a invariante que traduz a restrição do dono do produto ("a Trifold não muda de
// comportamento") em código verificável ANTES do deploy. Sem ela, trocar
// `resolvido = { orgId: legado… }` por `{ orgId: novo… }` no branch `both` passaria verde do
// começo ao fim, e a única defesa seria a leitura humana do diff.
//
// A asserção que importa é a (1): o `org_id` que EFETIVAMENTE chegou ao processamento (a linha de
// `leads` gravada). A (2) — `logOrgResolved` com `via:"legacy"`/`divergiu:true` — é a fábrica, não
// o objeto: o @po mediu que ela permanece VERDE sob a mutação.
describe("Story 900-24 — dual-run: em `both`, quem decide é o legado", () => {
  const APP_SECRET = "test-secret"
  const ENV_ORIGINAL = process.env.WEBHOOK_ORG_ROUTING

  beforeEach(() => {
    db = freshDb()
    nextId = 0
    logEventMock.mockClear()
    logEventOnceMock.mockClear()
    logOrgUnresolvedSpy.mockClear()
    geracaoDoTeste++
    escritasCompletadas = []
    fetchMock.mockClear()
    coachMock.mockClear()
    coachMock.mockResolvedValue(undefined)
    resolveOrgByWhatsAppPhoneMock.mockReset()
    process.env.META_APP_SECRET = APP_SECRET
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key"
    process.env.META_WHATSAPP_VERIFY_TOKEN = "verify"
  })

  afterEach(() => {
    if (ENV_ORIGINAL === undefined) delete process.env.WEBHOOK_ORG_ROUTING
    else process.env.WEBHOOK_ORG_ROUTING = ENV_ORIGINAL
  })

  /** Planta identifier ⇒ `org-B`; o fake do banco mantém `org-1` como única config ativa. */
  function plantarDivergencia() {
    resolveOrgByWhatsAppPhoneMock.mockImplementation(async () => ({
      status: "resolvida",
      config: {
        org_id: "org-B",
        phone_number_id: "PNID-B",
        access_token: "TOKEN-B",
        coexistence_enabled: false,
      },
    }))
  }

  it("(1) o org_id que chega ao processamento é o do LEGADO (org-1), não o do identifier (org-B)", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "both"
    plantarDivergencia()
    const { POST } = await import("../route")

    const res = await POST(
      signedRequest(
        buildPayload({ from: "+5544999689446", wamid: "wamid.DUAL-1", text: "oi" }),
        APP_SECRET,
      ),
    )
    await flushAsync()

    expect(res.status).toBe(200)
    expect(db.leads).toHaveLength(1)
    expect(db.leads[0]!.org_id).toBe("org-1")
    expect(db.leads.map((l) => l.org_id)).not.toContain("org-B")
    expect(db.conversations[0]!.org_id).toBe("org-1")
  })

  it("(2) `logOrgResolved` registra via:'legacy' e divergiu:true — a fábrica, não o objeto", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "both"
    plantarDivergencia()
    const { POST } = await import("../route")

    await POST(
      signedRequest(
        buildPayload({ from: "+5544999689447", wamid: "wamid.DUAL-2", text: "oi" }),
        APP_SECRET,
      ),
    )
    await flushAsync()

    const resolvidos = logEventMock.mock.calls
      .map((c) => c[0] as { event_type?: string; org_id?: string; metadata?: Record<string, unknown> })
      .filter((e) => e.event_type === "WEBHOOK_ORG_RESOLVED")
    expect(resolvidos).toHaveLength(1)
    expect(resolvidos[0]!.org_id).toBe("org-1")
    expect(resolvidos[0]!.metadata).toMatchObject({
      via: "legacy",
      divergiu: true,
      receptor: "whatsapp",
    })
  })

  it("sem divergência (identifier concorda), `divergiu` é false — não é sempre true", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "both"
    resolveOrgByWhatsAppPhoneMock.mockImplementation(async () => ({
      status: "resolvida",
      config: {
        org_id: "org-1",
        phone_number_id: "PNID",
        access_token: "TOKEN",
        coexistence_enabled: false,
      },
    }))
    const { POST } = await import("../route")

    await POST(
      signedRequest(
        buildPayload({ from: "+5544999689448", wamid: "wamid.DUAL-3", text: "oi" }),
        APP_SECRET,
      ),
    )
    await flushAsync()

    const evento = logEventMock.mock.calls
      .map((c) => c[0] as { event_type?: string; metadata?: Record<string, unknown> })
      .find((e) => e.event_type === "WEBHOOK_ORG_RESOLVED")
    expect(evento!.metadata).toMatchObject({ via: "legacy", divergiu: false })
  })

  it("modo `identifier`: aí sim o caminho novo decide, e o lead nasce em org-B", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "identifier"
    plantarDivergencia()
    const { POST } = await import("../route")

    await POST(
      signedRequest(
        buildPayload({ from: "+5544999689449", wamid: "wamid.DUAL-4", text: "oi" }),
        APP_SECRET,
      ),
    )
    await flushAsync()

    expect(db.leads[0]!.org_id).toBe("org-B")
    const evento = logEventMock.mock.calls
      .map((c) => c[0] as { event_type?: string; metadata?: Record<string, unknown> })
      .find((e) => e.event_type === "WEBHOOK_ORG_RESOLVED")
    expect(evento!.metadata).toMatchObject({ via: "identifier", divergiu: null })
  })

  it("modo `identifier` sem correspondência: 200, nenhum lead, WEBHOOK_ORG_UNRESOLVED aguardado", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "identifier"
    resolveOrgByWhatsAppPhoneMock.mockImplementation(async () => ({
      status: "nao_resolvida",
      motivo: "nenhuma_correspondencia",
      quantidadeEncontrada: 0,
    }))
    const { POST } = await import("../route")

    const res = await POST(
      signedRequest(
        buildPayload({ from: "+5544999689450", wamid: "wamid.DUAL-5", text: "oi" }),
        APP_SECRET,
      ),
    )
    await flushAsync()

    expect(res.status).toBe(200)
    expect(db.leads).toHaveLength(0)
    expect(logEventOnceMock).toHaveBeenCalledTimes(1)
    expect(logEventOnceMock.mock.calls[0]![0]).toMatchObject({
      event_type: "WEBHOOK_ORG_UNRESOLVED",
      metadata: { receptor: "whatsapp", motivo: "nenhuma_correspondencia" },
    })
  })

  /**
   * Gate `@qa`, concerns 1/3/4 — a régua olha o objeto que a ROTA passa, não um literal remontado.
   * `toEqual` (não `toMatchObject`): chave a mais reprova, chave a menos reprova, valor errado
   * reprova. É o que torna "acrescentar PII de lead ao call site" um teste vermelho.
   */
  it("o que a rota passa a `logOrgUnresolved` é EXATAMENTE isto — sem PII, sem chave extra", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "identifier"
    resolveOrgByWhatsAppPhoneMock.mockImplementation(async () => ({
      status: "nao_resolvida",
      motivo: "ambigua",
      quantidadeEncontrada: 2,
    }))
    const { POST } = await import("../route")

    await POST(
      signedRequest(
        buildPayloadComTelefone({
          from: "+5544999689451",
          wamid: "wamid.PII-1",
          text: "meu telefone é 44999990000",
          phoneNumberId: "PNID-DESCONHECIDO",
        }),
        APP_SECRET,
      ),
    )
    await flushAsync()

    expect(logOrgUnresolvedSpy).toHaveBeenCalledTimes(1)
    expect(logOrgUnresolvedSpy.mock.calls[0]![0]).toEqual({
      receptor: "whatsapp",
      motivo: "ambigua",
      quantidadeEncontrada: 2,
      // Identificador da PRÓPRIA org (a WABA). Nada do lead: nem `from`, nem texto, nem wamid.
      identificador: { phone_number_id: "PNID-DESCONHECIDO" },
      webhookLogsSource: "whatsapp",
    })
    // E nada do lead vaza pelo evento gravado.
    const serializado = JSON.stringify(logEventOnceMock.mock.calls[0]![0])
    expect(serializado).not.toContain("5544999689451")
    expect(serializado).not.toContain("44999990000")
    expect(serializado).not.toContain("wamid.PII-1")
  })

  /**
   * Gate `@qa`, 11º instrumento cego — **o ARGUMENTO passado ao resolver nunca era afirmado**.
   *
   * O mesmo `vi.mock` que viabiliza a mutação #8 **substitui** o resolver, e isso apaga os
   * argumentos da observação; `webhook-org.test.ts` testa o resolver isolado e não sabe que existe
   * rota. A classe mora na costura entre as duas suítes: trocar `phoneNumberId` por `fromRaw`
   * (o telefone do LEAD) ficava **VERDE**, porque nenhuma asserção olhava o que a rota passou.
   *
   * Não é forward-gate. Em `identifier` — o modo do `trifold-crm-dev` desde o dia 1, e o modo onde
   * a prova das duas empresas vai rodar — a chave errada dá `nenhuma_correspondencia` e **toda
   * mensagem é descartada com 200**: o defeito desta story, uma camada acima, no ambiente onde a
   * fatia seguinte tentaria provar que multi-tenant funciona.
   */
  it("o resolver recebe o `phone_number_id` do payload — nunca o telefone do lead", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "identifier"
    plantarDivergencia()
    const { POST } = await import("../route")

    await POST(
      signedRequest(
        buildPayloadComTelefone({
          from: "+5544999689453",
          wamid: "wamid.ARG-1",
          text: "oi",
          phoneNumberId: "PNID-DO-WABA",
        }),
        APP_SECRET,
      ),
    )
    await flushAsync()

    expect(resolveOrgByWhatsAppPhoneMock).toHaveBeenCalledTimes(1)
    expect(resolveOrgByWhatsAppPhoneMock).toHaveBeenCalledWith(
      expect.anything(),
      "PNID-DO-WABA",
    )
  })

  it("em `both` o resolver TAMBÉM recebe o identificador certo (o dual-run audita o mesmo eixo)", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "both"
    plantarDivergencia()
    const { POST } = await import("../route")

    await POST(
      signedRequest(
        buildPayloadComTelefone({
          from: "+5544999689454",
          wamid: "wamid.ARG-2",
          text: "oi",
          phoneNumberId: "PNID-DO-WABA",
        }),
        APP_SECRET,
      ),
    )
    await flushAsync()

    expect(resolveOrgByWhatsAppPhoneMock).toHaveBeenCalledTimes(1)
    expect(resolveOrgByWhatsAppPhoneMock).toHaveBeenCalledWith(
      expect.anything(),
      "PNID-DO-WABA",
    )
  })

  /**
   * Gate `@qa`, concern 2 — carrasco do `await` no CALL SITE (a mutação #5 media o await INTERNO).
   * A escrita do duplo completa num macrotask; se a rota não aguardar, ela responde antes e
   * `escritasCompletadas` está vazio aqui — que é exatamente a lambda congelando no `return`.
   */
  it("a escrita de `WEBHOOK_ORG_UNRESOLVED` COMPLETA antes de a rota responder", async () => {
    process.env.WEBHOOK_ORG_ROUTING = "identifier"
    resolveOrgByWhatsAppPhoneMock.mockImplementation(async () => ({
      status: "nao_resolvida",
      motivo: "nenhuma_correspondencia",
      quantidadeEncontrada: 0,
    }))
    const { POST } = await import("../route")

    const res = await POST(
      signedRequest(
        buildPayload({ from: "+5544999689452", wamid: "wamid.AWAIT-1", text: "oi" }),
        APP_SECRET,
      ),
    )

    // Sem `flushAsync()`: a asserção roda no RETORNO da rota, não depois.
    expect(res.status).toBe(200)
    expect(escritasCompletadas).toHaveLength(1)
  })
})

/**
 * Story 87-20 — o webhook diante de um turno contido por loop bot-a-bot, e o guard
 * que impede a conversa contida de reativar sozinha em 24h.
 */
describe("Story 87-20 — trava de loop bot-a-bot no webhook", () => {
  const APP_SECRET = "test-secret"
  const TELEFONE = "+5544999689446"
  const CONV = "conv-87-20"
  const LEAD = "lead-87-20"

  /** URL de envio da Graph API — o que NÃO pode ser chamado no caminho bloqueado. */
  const URL_ENVIO = "https://graph.facebook.com/v21.0/PNID/messages"

  beforeEach(() => {
    db = freshDb()
    nextId = 0
    geracaoDoTeste += 1
    escritasCompletadas = []
    // Callbacks de `after()` retidos por testes anteriores (que drenam por tempo) não
    // podem entrar na conta de `drenarAfter()` deste bloco.
    afterPromises = []
    selectsPorTabela = []
    logEventMock.mockClear()
    logEventOnceMock.mockClear()
    fetchMock.mockClear()
    coachMock.mockClear()
    coachMock.mockResolvedValue(undefined)
    pipelineMock.mockClear()
    pipelineMock.mockImplementation(async () => ({
      response: "Mocked Nicole reply",
      qualificationScore: 0,
    }))
    process.env.META_APP_SECRET = APP_SECRET
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key"
    process.env.META_WHATSAPP_VERIFY_TOKEN = "verify"
    // A janela anti-rajada (75-359) é um `setTimeout` de ~1s ANTES do pipeline. Zerada
    // aqui de propósito: ela é um mecanismo distinto e desligá-la é o que permite a
    // esta suíte chegar, pela primeira vez, ao `processMessageWithMetadata`.
    process.env.NICOLE_ANTI_RAJADA_MS = "0"
  })

  afterEach(() => {
    delete process.env.NICOLE_ANTI_RAJADA_MS
  })

  /** Lead + conversa já existentes, com o estado de handoff que o teste pedir. */
  function semear(conversa: Partial<ConversationRow>) {
    db.leads.push({
      id: LEAD,
      org_id: "org-1",
      phone: TELEFONE,
      phone_normalized: normalizePhoneBR(TELEFONE),
      channel: "whatsapp",
      source: "whatsapp",
      stage_id: "stage-1",
      metadata: null,
      created_at: new Date().toISOString(),
    })
    db.conversations.push({
      id: CONV,
      org_id: "org-1",
      lead_id: LEAD,
      channel: "whatsapp",
      is_ai_active: true,
      status: "active",
      created_at: new Date(Date.now() - 72 * 3600_000).toISOString(),
      ...conversa,
    })
  }

  async function entregar(wamid: string, texto = "oi") {
    const { POST } = await import("../route")
    const res = await POST(
      signedRequest(buildPayload({ from: TELEFONE, wamid, text: texto }), APP_SECRET)
    )
    // QA-87-20-1: espera a CONCLUSÃO do callback de `after()`, não 60 ms de folga.
    // O laço antigo dava tempo de sobra para uma escrita órfã completar sozinha — era
    // por isso que remover só o `await` do recibo deixava a suíte inteira verde.
    await drenarAfter()
    return res
  }

  /**
   * Chamadas de `fetch` que ENVIAM texto ao lead.
   *
   * Filtrar só pela URL não serve: o indicador de "digitando…" (75-156) usa o MESMO
   * endpoint `/messages`, com `type: "typing_indicator"`. Um teste que contasse URLs
   * veria o typing como envio e o "não enviou nada" nunca poderia ficar verde.
   */
  function enviosDeMensagem(): Array<{ text?: { body?: string } }> {
    // `fetchMock` é declarado sem parâmetros (`vi.fn(async () => …)`), então o tipo
    // de `mock.calls` é `[]`. Os argumentos REAIS estão lá em runtime.
    const chamadas = fetchMock.mock.calls as unknown as unknown[][]
    return chamadas
      .filter((c) => String(c[0]) === URL_ENVIO)
      .map((c) => {
        const init = c[1] as { body?: string } | undefined
        try {
          return JSON.parse(String(init?.body ?? "{}")) as { type?: string; text?: { body?: string } }
        } catch {
          return {}
        }
      })
      .filter((corpo) => (corpo as { type?: string }).type === "text")
  }

  // -------------------------------------------------------------------------
  // T2.6 / AC9 — o recibo é AGUARDADO e o envio é pulado
  // -------------------------------------------------------------------------

  describe("turno contido (AC9)", () => {
    const BLOQUEIO = {
      tipo: "encerramento" as const,
      ocorrencias: 2,
      conversationId: CONV,
      leadId: LEAD,
    }

    beforeEach(() => {
      semear({})
      pipelineMock.mockImplementation(async () => ({
        response: "",
        bloqueadoPorLoop: BLOQUEIO,
        qualificationScore: 0,
      }))
    })

    it("grava NICOLE_LOOP_DETECTADO por `logEventOnce`, e a escrita COMPLETA antes do fim", async () => {
      await entregar("wamid.LOOP1")

      // A asserção é IMEDIATA depois de `drenarAfter()` — nenhum tempo de relógio entre
      // o fim do callback e a leitura. `escritasCompletadas` só recebe o payload depois
      // que a promise do `logEventOnce` resolve num MACROTASK (5 ms), e com o `await` no
      // lugar isso acontece DENTRO do callback. Trocar `await logEventOnce` por
      // `void logEventOnce` — ou por `logEvent` — deixa este array vazio.
      // É o carrasco do "aguardado", não só do "chamado".
      const recibo = escritasCompletadas.find(
        (e) => (e as { event_type?: string }).event_type === "NICOLE_LOOP_DETECTADO"
      ) as Record<string, unknown> | undefined

      expect(recibo).toBeDefined()
      expect(recibo!.level).toBe("error")
      expect(recibo!.category).toBe("ai")
      expect(recibo!.org_id).toBe("org-1")
      expect(recibo!.metadata).toMatchObject(BLOQUEIO)
    })

    it("NÃO usa o canal fire-and-forget (`logEvent`) para este evento", async () => {
      await entregar("wamid.LOOP2")
      const porLogEvent = logEventMock.mock.calls
        .map((c) => (c[0] as { event_type?: string }).event_type)
        .filter((t) => t === "NICOLE_LOOP_DETECTADO")
      expect(porLogEvent).toEqual([])
    })

    it("o bloco de envio NÃO roda — nada de `text.body: \"\"` para a Graph API", async () => {
      await entregar("wamid.LOOP3")
      expect(enviosDeMensagem()).toHaveLength(0)
    })

    it("o turno NORMAL continua enviando — o guard é do caminho bloqueado, não de todos", async () => {
      pipelineMock.mockImplementation(async () => ({
        response: "Olá! Como posso ajudar?",
        qualificationScore: 0,
      }))
      await entregar("wamid.NORMAL1")

      expect(enviosDeMensagem().length).toBeGreaterThan(0)
      expect(enviosDeMensagem()[0]!.text!.body).toBe("Olá! Como posso ajudar?")
      expect(
        escritasCompletadas.filter(
          (e) => (e as { event_type?: string }).event_type === "NICOLE_LOOP_DETECTADO"
        )
      ).toHaveLength(0)
    })

    /**
     * O call-site TEM de ser `processMessageWithMetadata`. O wrapper `processMessage`
     * devolve só a string e nunca poderia carregar `bloqueadoPorLoop` — com ele, este
     * webhook seria contido em silêncio, sem recibo e sem alerta (que é o que segue
     * acontecendo no Telegram, aceito e documentado no OUT da story).
     */
    it("o pipeline é chamado pela variante COM metadata", async () => {
      await entregar("wamid.LOOP4")
      expect(pipelineMock).toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // T5.1/T5.2 / AC14 — a conversa contida por loop não reativa sozinha
  // -------------------------------------------------------------------------

  describe("reativação de 24h (AC14)", () => {
    /** Handoff antigo o bastante para `shouldReactivateAi` dizer sim. */
    const HANDOFF_ANTIGO = new Date(Date.now() - 30 * 3600_000).toISOString()

    it("controle: `broker_reply` com 30h REATIVA a Nicole normalmente (sem regressão)", async () => {
      semear({
        is_ai_active: false,
        handoff_at: HANDOFF_ANTIGO,
        handoff_reason: "broker_reply",
      })
      await entregar("wamid.REATIVA1")

      const conversa = db.conversations.find((c) => c.id === CONV)!
      expect(conversa.is_ai_active).toBe(true)
      expect(conversa.handoff_reason).toBeNull()
    })

    it("`loop_bot_detectado` com 30h NÃO reativa — só ação humana traz a Nicole de volta", async () => {
      semear({
        is_ai_active: false,
        handoff_at: HANDOFF_ANTIGO,
        handoff_reason: "loop_bot_detectado",
      })
      await entregar("wamid.NAOREATIVA1")

      const conversa = db.conversations.find((c) => c.id === CONV)!
      expect(conversa.is_ai_active).toBe(false)
      expect(conversa.handoff_reason).toBe("loop_bot_detectado")
      // E a Nicole não respondeu: nenhum envio saiu.
      expect(enviosDeMensagem()).toHaveLength(0)
    })

    /**
     * A SEGUNDA metade — e a que faltava. O guard acima só funciona se a consulta que o
     * alimenta projetar `handoff_reason`. Ela era `select("handoff_at")`: o campo viria
     * `undefined` para sempre, a reativação nunca seria pulada, e a oscilação
     * permanente que o AC14 existe para matar voltaria inteira — com o teste VERDE, se
     * o fake devolvesse o campo independentemente da lista de colunas.
     *
     * O fake deste arquivo agora aplica a projeção de verdade, então o teste acima já
     * reprova sozinho. Esta asserção literal é a outra metade: ela diz QUAL consulta
     * perdeu a coluna, em vez de deixar a falha aparecer como "reativou e não devia".
     */
    it("a consulta de reativação NOMEIA `handoff_reason` no `.select()`", async () => {
      semear({
        is_ai_active: false,
        handoff_at: HANDOFF_ANTIGO,
        handoff_reason: "loop_bot_detectado",
      })
      await entregar("wamid.PROJECAO1")

      const projecoes = selectsPorTabela
        .filter((s) => s.table === "conversations" && typeof s.cols === "string")
        .map((s) => s.cols!)
      const daReativacao = projecoes.filter((c) => c.includes("handoff_at"))

      expect(daReativacao.length).toBeGreaterThan(0)
      for (const cols of daReativacao) {
        expect(cols.split(",").map((c) => c.trim())).toContain("handoff_reason")
      }
    })

    it("handoff RECENTE não reativa, com qualquer motivo — a regra temporal segue intocada", async () => {
      semear({
        is_ai_active: false,
        handoff_at: new Date(Date.now() - 60_000).toISOString(),
        handoff_reason: "broker_reply",
      })
      await entregar("wamid.RECENTE1")

      expect(db.conversations.find((c) => c.id === CONV)!.is_ai_active).toBe(false)
    })
  })
})
