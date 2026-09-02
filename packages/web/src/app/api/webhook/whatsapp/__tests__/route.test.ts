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

/**
 * Story 63-12 — push ao corretor. Mockado para que o teste possa AFIRMAR sobre a chamada:
 * o helper real decide sozinho (corretor assumiu? existe corretor?) e engole tudo, então
 * observar o efeito colateral não distinguiria "a rota não chamou" de "o helper desistiu".
 * O eixo aqui é a decisão da ROTA.
 */
const pushCorretorMock = vi.fn(async () => {})
vi.mock("@web/lib/broker/notify-on-reply", () => ({
  notifyBrokerOnReply: (...args: unknown[]) => pushCorretorMock(...(args as [])),
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

/**
 * Gate `@qa` M-1 — a ORDEM em que as tabelas recebem INSERT, na sequência real.
 *
 * O defeito que isto tranca não é observável por valor final: com o arquivo em `webhook_logs`
 * ANTES do INSERT em `messages`, um Supabase LENTO (não fora do ar) pendura o arquivo até a
 * lambda morrer no `maxDuration = 60` e a BOLHA nunca é escrita — `try/catch` e `if (error)`
 * não cobrem hang, e `lib/supabase/admin.ts` não tem `AbortSignal`. Um teste de estado final
 * fica verde nas duas ordens; só a sequência distingue.
 */
let insertsPorTabela: string[] = []

/**
 * CodeRabbit #556 — o `AbortSignal` que cada chamada recebeu, na ordem.
 *
 * O arquivamento em `webhook_logs` é o único `await` a Supabase no caminho síncrono depois da
 * bolha e antes do 200. Sem teto, um Supabase LENTO derruba com ele o push, o Live Coach, a
 * Nicole e a própria resposta — e a reentrega da Meta cai no early-return de 23505. O fake
 * precisava saber ao menos EXPRESSAR o teto para que um teste pudesse exigi-lo.
 */
let sinaisPorChamada: Array<{ table: string; signal: AbortSignal }> = []

/**
 * Story 87-20 · CR-87-20-3 — **injeção de ERRO DE LEITURA.**
 *
 * O fake só sabia produzir dois estados: "achei" e "não achei" (`data: []`). O
 * PostgREST tem um TERCEIRO — `{ data: null, error }` — e é nele que mora o
 * defeito que o carrasco abaixo mira: **não conseguir ler o motivo do handoff
 * não é o mesmo que ter lido "não foi contida por loop"**. Sem poder produzir
 * esse estado, nenhum teste desta suíte conseguia sequer EXPRESSAR o defeito.
 *
 * O predicado recebe tabela **e a lista literal de colunas** de propósito:
 * `conversations` é lida em vários pontos do mesmo turno (find-or-create,
 * `last_message_at`), e derrubar todas mediria outra coisa — a rota nem chegaria
 * ao bloco de reativação.
 */
let falharLeitura:
  | ((table: string, cols: string | null) => string | null)
  | null = null

/**
 * Injeção de falha de ESCRITA (INSERT), irmã de `falharLeitura`.
 *
 * Dois modos porque o cliente falha de duas formas distintas, e o código de produção precisa
 * sobreviver às DUAS: o PostgREST devolve `{data:null, error}` (violação de CHECK/RLS) sem
 * lançar, enquanto rede/cliente/timeout LANÇA. Um `try/catch` sozinho só cobre a segunda; um
 * `if (error)` sozinho só cobre a primeira. O fake sabia produzir nenhuma das duas.
 */
let falharInsert:
  | ((table: string) => { lanca: boolean; motivo: string } | null)
  | null = null

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
      /** Story 87-20 (CR-87-20-3) — o argumento LITERAL, para o predicado de falha. */
      colsLiteral?: string | null
      payload?: unknown
      onConflict?: string
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pendingResult?: any
      /** CodeRabbit #556 — teto de tempo da chamada (`.abortSignal()`). */
      signal?: AbortSignal
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
        state.colsLiteral = cols
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
      /** CodeRabbit #556 — `.abortSignal()` do postgrest-js: registra E é honrado em `execute`. */
      abortSignal(signal: AbortSignal) {
        state.signal = signal
        sinaisPorChamada.push({ table: String(table), signal })
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
      /**
       * CodeRabbit #556 — signal já abortado devolve ERRO, não exceção.
       *
       * É o que o postgrest-js faz (`{ data: null, error: { message: "FetchError: The user
       * aborted a request." } }`): quem trata timeout tem de tratar o ramo `if (error)`, não
       * o `catch`. O fake produzindo exceção aqui deixaria passar verde um código que só
       * cobre metade.
       */
      if (state.signal?.aborted) {
        return Promise.resolve({
          data: null,
          error: { message: "FetchError: The user aborted a request." },
        })
      }

      if (!db[table]) {
        ;(db as unknown as Record<string, unknown[]>)[table as string] = []
      }
      const rows = db[table] as Record<string, unknown>[]

      if (state.action === "select") {
        // CR-87-20-3 — o estado que o fake não sabia produzir: leitura que FALHA.
        const motivoDaFalha =
          falharLeitura?.(String(table), state.colsLiteral ?? null) ?? null
        if (motivoDaFalha) {
          return Promise.resolve({ data: null, error: { message: motivoDaFalha } })
        }
        const result = projetar(applyFilters(rows), state.cols ?? null)
        return Promise.resolve({ data: result, error: null })
      }

      if (state.action === "insert" || state.action === "upsert") {
        insertsPorTabela.push(String(table))
        const falha = falharInsert?.(String(table)) ?? null
        if (falha) {
          if (falha.lanca) throw new Error(falha.motivo)
          return Promise.resolve({ data: null, error: { message: falha.motivo } })
        }
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
    // CR-87-20-3 — a injeção de erro de leitura é opt-in por teste.
    falharLeitura = null
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
      // CR-87-20-2 — o caminho feliz agora AFIRMA que a contenção foi aplicada.
      contencao: "aplicada" as const,
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
  // CR-87-20-2 — a contenção FALHOU: o webhook precisa gritar, não repetir "contido"
  // -------------------------------------------------------------------------

  /**
   * O outro lado do achado do CodeRabbit. Quando o `UPDATE` de `conversations` falha, a
   * Nicole segue ATIVA: o guard de reativação do AC14 não tem `handoff_reason` para
   * casar e a próxima mensagem do bot reinicia o loop. É o único estado desta story em
   * que a máquina não resolveu o problema — e é por isso que ele precisa de um
   * `event_type` próprio, em nível de erro e com o motivo do banco: alguém tem de ir
   * pausar a conversa à mão.
   */
  describe("contenção FALHOU (CR-87-20-2)", () => {
    const ERRO_DO_BANCO = "permission denied for table conversations"
    const BLOQUEIO_SEM_CONTENCAO = {
      tipo: "encerramento" as const,
      ocorrencias: 2,
      conversationId: CONV,
      leadId: LEAD,
      contencao: "falhou" as const,
      erro: ERRO_DO_BANCO,
    }

    beforeEach(() => {
      semear({})
      pipelineMock.mockImplementation(async () => ({
        response: "",
        bloqueadoPorLoop: BLOQUEIO_SEM_CONTENCAO,
        qualificationScore: 0,
      }))
    })

    it("grava NICOLE_LOOP_CONTENCAO_FALHOU, aguardado, em nível de erro e com o motivo do banco", async () => {
      await entregar("wamid.FALHOU1")

      // Mesmo carrasco do recibo: `escritasCompletadas` só recebe o payload quando a
      // promise do `logEventOnce` RESOLVE (macrotask). Sem `await`, fica vazio.
      const grito = escritasCompletadas.find(
        (e) => (e as { event_type?: string }).event_type === "NICOLE_LOOP_CONTENCAO_FALHOU"
      ) as Record<string, unknown> | undefined

      expect(grito).toBeDefined()
      expect(grito!.level).toBe("error")
      expect(grito!.org_id).toBe("org-1")
      expect(grito!.metadata).toMatchObject({ contencao: "falhou", erro: ERRO_DO_BANCO })
    })

    /**
     * O recibo canônico continua saindo — é ele que o cron `nicole-health` varre para
     * alertar o admin com o link da conversa (AC10), e uma contenção que falhou é
     * MAIS urgente, não menos. O que não pode é ele dizer que a Nicole foi pausada.
     */
    it("o recibo canônico continua saindo, mas NÃO diz mais que a Nicole foi pausada", async () => {
      await entregar("wamid.FALHOU2")

      const recibo = escritasCompletadas.find(
        (e) => (e as { event_type?: string }).event_type === "NICOLE_LOOP_DETECTADO"
      ) as Record<string, unknown> | undefined

      expect(recibo).toBeDefined()
      expect(String(recibo!.message)).not.toContain("pausada")
      expect(String(recibo!.message)).toContain("CONTENCAO FALHOU")
      expect(recibo!.metadata).toMatchObject({ contencao: "falhou" })
    })

    /**
     * Controle NEGATIVO, e o que impede o grito de virar ruído constante: no caminho em
     * que a contenção funcionou, o evento de falha NÃO existe e o recibo volta a dizer
     * "pausada". Sem este par, `NICOLE_LOOP_CONTENCAO_FALHOU` poderia ser emitido
     * sempre e o teste acima continuaria verde.
     */
    it("controle — contenção APLICADA não emite o grito, e o recibo diz `pausada`", async () => {
      pipelineMock.mockImplementation(async () => ({
        response: "",
        bloqueadoPorLoop: { ...BLOQUEIO_SEM_CONTENCAO, contencao: "aplicada" as const, erro: undefined },
        qualificationScore: 0,
      }))
      await entregar("wamid.FALHOU3")

      expect(
        escritasCompletadas.filter(
          (e) => (e as { event_type?: string }).event_type === "NICOLE_LOOP_CONTENCAO_FALHOU"
        )
      ).toHaveLength(0)

      const recibo = escritasCompletadas.find(
        (e) => (e as { event_type?: string }).event_type === "NICOLE_LOOP_DETECTADO"
      ) as Record<string, unknown> | undefined
      expect(String(recibo!.message)).toContain("pausada")
    })

    it("o envio continua suprimido — falha de contenção não é permissão para falar", async () => {
      await entregar("wamid.FALHOU4")
      expect(enviosDeMensagem()).toHaveLength(0)
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

    /**
     * CR-87-20-3 — o MESMO pecado da contenção, do lado do LEITOR.
     *
     * `conterLoop` já foi consertado para não chamar de sucesso o `UPDATE` que
     * não conseguiu escrever. Aqui é a leitura cometendo o análogo: **não
     * conseguir ler o motivo do handoff não é o mesmo que ter lido "não foi
     * contida por loop"**. Com `{ data: null, error }`, `convRow` fica
     * `undefined`, `contidaPorLoop` vira `false` — e, pior, `handoff_at` também
     * some, `resolveTakeoverAnchor` devolve `null` e `shouldReactivateAi(null)`
     * é `true` POR CONTRATO (63-13: "nunca houve corretor → reassume"). Ou seja:
     * um erro de leitura reativava a Nicole **incondicionalmente**, desfazendo a
     * contenção do AC14 *e* a regra temporal de 63-13/63-15 na mesma linha.
     *
     * O par com o controle negativo é o que dá dente a estes testes: o primeiro
     * teste deste `describe` usa **exatamente esta fixture** (`broker_reply`,
     * 30h) e exige que a Nicole REATIVE. Aqui só uma coisa muda — a leitura
     * falha — e o resultado tem de se inverter. Fechar a porta para todo mundo
     * mata aquele controle; deixá-la aberta mata estes.
     */
    describe("leitura do handoff que FALHA (CR-87-20-3)", () => {
      const ERRO_DE_LEITURA = "permission denied for table conversations"

      /** Derruba SÓ a consulta de reativação — as outras leituras seguem vivas. */
      beforeEach(() => {
        falharLeitura = (table, cols) =>
          table === "conversations" && (cols ?? "").includes("handoff_at")
            ? ERRO_DE_LEITURA
            : null
      })

      it("erro de leitura NÃO reativa — a mesma fixture que reativa quando a leitura funciona", async () => {
        semear({
          is_ai_active: false,
          handoff_at: HANDOFF_ANTIGO,
          handoff_reason: "broker_reply",
        })
        await entregar("wamid.LEITURAFALHOU1")

        const conversa = db.conversations.find((c) => c.id === CONV)!
        expect(conversa.is_ai_active).toBe(false)
        // O handoff continua intacto: nem o `handoff_reason` foi limpo.
        expect(conversa.handoff_reason).toBe("broker_reply")
        expect(enviosDeMensagem()).toHaveLength(0)
      })

      it("erro de leitura não anula a regra temporal: handoff de 60s segue contido", async () => {
        semear({
          is_ai_active: false,
          handoff_at: new Date(Date.now() - 60_000).toISOString(),
          handoff_reason: "broker_reply",
        })
        await entregar("wamid.LEITURAFALHOU2")

        expect(db.conversations.find((c) => c.id === CONV)!.is_ai_active).toBe(false)
      })

      /**
       * Fail-closed que CALA é a troca de um defeito por outro: a conversa fica
       * parada e ninguém sabe por quê. O motivo do banco tem de aparecer, pelo
       * mesmo motivo que o grito da contenção que falhou teve de aparecer.
       */
      it("e GRITA: evento de erro com o motivo do banco", async () => {
        semear({
          is_ai_active: false,
          handoff_at: HANDOFF_ANTIGO,
          handoff_reason: "broker_reply",
        })
        await entregar("wamid.LEITURAFALHOU3")

        const grito = escritasCompletadas.find(
          (e) =>
            (e as { event_type?: string }).event_type ===
            "NICOLE_REATIVACAO_ESTADO_DESCONHECIDO"
        ) as Record<string, unknown> | undefined

        expect(grito).toBeDefined()
        expect(grito!.level).toBe("error")
        expect(JSON.stringify(grito!.metadata)).toContain(ERRO_DE_LEITURA)
      })
    })
  })
})


// ─────────────────────────────────────────────────────────────────────────────────────────────
// Cartão de contato (vCard) inbound — bug de produção de 01/09/2026
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// Medido na conversa `fd2f5f39-2d73-483a-b499-1ad35c3ddff9`: o lead mandou o telefone da
// namorada como cartão de contato (`type: "contacts"`) e a linha NUNCA existiu em `messages`.
// Não é bolha vazia — é ausência total: o `else` final do bloco de montagem devolvia
// `{status:"ok"}` antes de qualquer INSERT. O corretor teve de pedir o número por escrito.
//
// O carrasco destes testes é o próprio `else`: enquanto `contacts` não tiver branch,
// `db.messages` fica VAZIO e as três asserções abaixo ficam vermelhas.
describe("WhatsApp webhook — cartão de contato (vCard) inbound", () => {
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

  /** Payload real da Cloud API: `messages[0].contacts` é um ARRAY de cartões. */
  function buildContactsPayload(opts: {
    from: string
    wamid: string
    contacts: unknown
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
                    type: "contacts",
                    contacts: opts.contacts,
                  },
                ],
              },
            },
          ],
        },
      ],
    }
  }

  it("1 contato com 1 telefone: a mensagem EXISTE, com nome e número no texto", async () => {
    const { POST } = await import("../route")

    const res = await POST(
      signedRequest(
        buildContactsPayload({
          from: "+5544999689446",
          wamid: "wamid.VCARD-1",
          contacts: [
            {
              name: { formatted_name: "Maria Silva", first_name: "Maria" },
              phones: [{ phone: "+55 41 99999-9999", wa_id: "5541999999999" }],
            },
          ],
        }),
        APP_SECRET
      )
    )
    expect(res.status).toBe(200)

    // A AC é esta: a linha existe. Vem primeiro porque, sob o defeito, é ela que fica
    // vermelha — asserção de texto sobre `undefined` apontaria para outro sintoma.
    const userMsg = db.messages.find((m) => m.role === "user")
    expect(userMsg).toBeTruthy()
    expect(userMsg!.role).toBe("user")
    expect(userMsg!.content).toBe("[Contato recebido] Maria Silva — +55 41 99999-9999")

    // O número tem de sobreviver a uma edição do texto: fica estruturado no metadata.
    expect(userMsg!.metadata.contacts).toEqual([
      { nome: "Maria Silva", telefones: ["+55 41 99999-9999"] },
    ])
    expect(userMsg!.metadata.whatsapp_message_id).toBe("wamid.VCARD-1")
    // Não é mídia: as colunas de mídia continuam limpas.
    expect(userMsg!.media_type).toBeNull()
  })

  it("contato com múltiplos telefones: todos aparecem, separados por vírgula", async () => {
    const { POST } = await import("../route")

    const res = await POST(
      signedRequest(
        buildContactsPayload({
          from: "+5544999689446",
          wamid: "wamid.VCARD-2",
          contacts: [
            {
              name: { first_name: "João", last_name: "Souza" },
              phones: [
                { phone: "+55 41 98888-8888", type: "CELL" },
                // Sem `phone`: cai no `wa_id`, que é o que a Meta manda quando o
                // cartão veio de um contato já salvo no WhatsApp.
                { wa_id: "5541977777777", type: "WORK" },
              ],
            },
          ],
        }),
        APP_SECRET
      )
    )
    expect(res.status).toBe(200)

    const userMsg = db.messages.find((m) => m.role === "user")
    expect(userMsg).toBeTruthy()
    expect(userMsg!.content).toBe(
      "[Contato recebido] João Souza — +55 41 98888-8888, 5541977777777"
    )
    expect(userMsg!.metadata.contacts).toEqual([
      { nome: "João Souza", telefones: ["+55 41 98888-8888", "5541977777777"] },
    ])
  })

  it("`contacts: []` — a mensagem AINDA existe, com texto honesto, e o webhook GRITA", async () => {
    const { POST } = await import("../route")

    const res = await POST(
      signedRequest(
        buildContactsPayload({
          from: "+5544999689446",
          wamid: "wamid.VCARD-VAZIO",
          contacts: [],
        }),
        APP_SECRET
      )
    )
    expect(res.status).toBe(200)

    // Nunca sumir em silêncio: sem dado legível, a bolha diz o que houve.
    const userMsg = db.messages.find((m) => m.role === "user")
    expect(userMsg).toBeTruthy()
    expect(userMsg!.content).toBe(
      "[Contato recebido — não foi possível ler os dados]"
    )

    const grito = logEventMock.mock.calls.find(
      (c) => (c[0] as { event_type?: string })?.event_type === "contacts_payload_vazio"
    )
    expect(grito).toBeDefined()
    expect((grito![0] as { level: string }).level).toBe("warn")
  })
})


// ─────────────────────────────────────────────────────────────────────────────────────────────
// Tipos não suportados: nenhum some em silêncio
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// Mesma raiz do cartão de contato: o `else` final do bloco de montagem devolvia
// `{status:"ok"}` para TUDO que não fosse text/audio/voice/image/document. Localização,
// vídeo, figurinha, reação e qualquer tipo novo da Meta sumiam antes do INSERT.
//
// Carrascos aqui: (a) sob o defeito, `db.messages` fica vazio nos três primeiros testes;
// (b) sob o defeito, `db.webhook_logs` fica vazio no teste de arquivamento; (c) o teste de
// reação depende do par controle/reação — o controle prova que `pipelineMock` É chamado no
// caminho normal, então a ausência na reação não é asserção vazia.
describe("WhatsApp webhook — tipos não suportados nunca somem em silêncio", () => {
  const APP_SECRET = "test-secret"

  beforeEach(() => {
    db = freshDb()
    nextId = 0
    logEventMock.mockClear()
    fetchMock.mockClear()
    fetchMock.mockImplementation((async () => ({ ok: true, json: async () => ({}) })) as never)
    coachMock.mockClear()
    coachMock.mockResolvedValue(undefined)
    pipelineMock.mockClear()
    pipelineMock.mockImplementation(async () => ({
      response: "Mocked Nicole reply",
      qualificationScore: 0,
    }))
    // Callbacks retidos por describes anteriores não podem entrar na conta deste.
    afterPromises = []
    falharLeitura = null
    process.env.META_APP_SECRET = APP_SECRET
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key"
    process.env.META_WHATSAPP_VERIFY_TOKEN = "verify"
    // Mesma razão do bloco 87-20: a janela anti-rajada (75-359) é um `setTimeout` de ~1s
    // ANTES do pipeline. Zerá-la é o que permite ao teste de CONTROLE alcançar a Nicole.
    process.env.NICOLE_ANTI_RAJADA_MS = "0"
  })

  afterEach(() => {
    delete process.env.NICOLE_ANTI_RAJADA_MS
  })

  /** Monta um payload com um `msg` arbitrário (o tipo é o eixo do teste). */
  function buildTipoPayload(opts: {
    from: string
    wamid: string
    type: string
    extra?: Record<string, unknown>
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
                    type: opts.type,
                    ...(opts.extra ?? {}),
                  },
                ],
              },
            },
          ],
        },
      ],
    }
  }

  it("location: bolha com nome, endereço e link do Google Maps", async () => {
    const { POST } = await import("../route")

    const res = await POST(
      signedRequest(
        buildTipoPayload({
          from: "+5544999689446",
          wamid: "wamid.LOC-1",
          type: "location",
          extra: {
            location: {
              latitude: -25.4284,
              longitude: -49.2733,
              name: "Obra Torre Alfa",
              address: "Rua XV de Novembro, 100",
            },
          },
        }),
        APP_SECRET
      )
    )
    expect(res.status).toBe(200)

    const userMsg = db.messages.find((m) => m.role === "user")
    expect(userMsg).toBeTruthy()
    expect(userMsg!.content).toBe(
      "[Localização recebida] Obra Torre Alfa — Rua XV de Novembro, 100 https://maps.google.com/?q=-25.4284,-49.2733"
    )
    // O link é o que faz a bolha ser acionável: sem ele o corretor não abre mapa nenhum.
    expect(userMsg!.content).toContain("https://maps.google.com/?q=-25.4284,-49.2733")
    expect(userMsg!.metadata.location).toEqual({
      latitude: -25.4284,
      longitude: -49.2733,
      name: "Obra Torre Alfa",
      address: "Rua XV de Novembro, 100",
    })
  })

  it("CONTROLE — texto normal ACIONA a Nicole (senão a asserção da reação seria vazia)", async () => {
    const { POST } = await import("../route")

    await POST(
      signedRequest(
        buildPayload({ from: "+5544999689446", wamid: "wamid.CTRL-IA", text: "quanto custa?" }),
        APP_SECRET
      )
    )
    await drenarAfter()

    expect(pipelineMock).toHaveBeenCalled()
  })

  it("reaction: a bolha é gravada e a Nicole NÃO é acionada", async () => {
    const { POST } = await import("../route")

    const res = await POST(
      signedRequest(
        buildTipoPayload({
          from: "+5544999689446",
          wamid: "wamid.REACT-1",
          type: "reaction",
          extra: { reaction: { emoji: "❤️", message_id: "wamid.ORIGINAL" } },
        }),
        APP_SECRET
      )
    )
    expect(res.status).toBe(200)
    await drenarAfter()

    const userMsg = db.messages.find((m) => m.role === "user")
    expect(userMsg).toBeTruthy()
    expect(userMsg!.content).toBe("[O lead reagiu com ❤️]")
    expect(userMsg!.metadata.reaction).toEqual({
      emoji: "❤️",
      message_id: "wamid.ORIGINAL",
      removida: false,
    })

    // O que importa: responder a um ❤️ é pior que o silêncio.
    expect(pipelineMock).not.toHaveBeenCalled()
  })

  it("tipo desconhecido: bolha genérica nomeando o tipo, e a Nicole NÃO é acionada", async () => {
    const { POST } = await import("../route")

    const res = await POST(
      signedRequest(
        buildTipoPayload({
          from: "+5544999689446",
          wamid: "wamid.ORDER-1",
          type: "order",
          extra: { order: { catalog_id: "CAT-1" } },
        }),
        APP_SECRET
      )
    )
    expect(res.status).toBe(200)
    await drenarAfter()

    const userMsg = db.messages.find((m) => m.role === "user")
    expect(userMsg).toBeTruthy()
    expect(userMsg!.content).toBe(
      "[O lead enviou algo que o CRM ainda não exibe: order]"
    )
    expect(pipelineMock).not.toHaveBeenCalled()
  })

  it("sticker e video: bolha própria, sem colunas de mídia (não há download)", async () => {
    const { POST } = await import("../route")

    await POST(
      signedRequest(
        buildTipoPayload({ from: "+5544999689446", wamid: "wamid.STK", type: "sticker" }),
        APP_SECRET
      )
    )
    await POST(
      signedRequest(
        buildTipoPayload({ from: "+5544999689446", wamid: "wamid.VID", type: "video" }),
        APP_SECRET
      )
    )

    const conteudos = db.messages.filter((m) => m.role === "user").map((m) => m.content)
    expect(conteudos).toContain("[Figurinha recebida]")
    expect(conteudos).toContain("[Vídeo recebido — o CRM ainda não exibe vídeos]")
    expect(db.messages.filter((m) => m.role === "user").every((m) => m.media_type === null)).toBe(
      true
    )
  })

  it("o payload CRU já está em `webhook_logs` quando a rota RESPONDE (aguardado, não `after()`)", async () => {
    const { POST } = await import("../route")

    await POST(
      signedRequest(
        buildContatoSimples("+5544999689446", "wamid.LOG-1"),
        APP_SECRET
      )
    )

    // ⚠️ NENHUM `drenarAfter()` aqui, de propósito — é o que distingue "aguardado" de
    // "agendado". Com o dreno, mover o INSERT para dentro de `after()` continuaria verde e a
    // frase "AGUARDADO de propósito" no comentário da rota seria prosa, não invariante
    // (gate `@qa` M-2). Sem o dreno, essa mutação fica vermelha aqui.
    expect(db.webhook_logs).toHaveLength(1)

    const log = db.webhook_logs.find(
      (l) => (l as { event_type?: string }).event_type === "tipo_nao_suportado:contacts"
    ) as Record<string, unknown> | undefined

    expect(log).toBeDefined()
    expect(log!.source).toBe("whatsapp")
    expect(log!.org_id).toBe("org-1")
    // A bolha FOI gravada: não é falha de processamento.
    expect(log!.processed).toBe(true)
    // O objeto `msg` inteiro — é isto que teria salvado o telefone de 01/09.
    expect(JSON.stringify(log!.payload)).toContain("+55 41 99999-9999")
    expect((log!.payload as { id?: string }).id).toBe("wamid.LOG-1")
  })

  it("texto puro NÃO vai para `webhook_logs` (o arquivo é só dos tipos não suportados)", async () => {
    const { POST } = await import("../route")

    await POST(
      signedRequest(
        buildPayload({ from: "+5544999689446", wamid: "wamid.LOG-TXT", text: "oi" }),
        APP_SECRET
      )
    )
    await drenarAfter()

    expect(db.webhook_logs).toHaveLength(0)
  })
})

/** Cartão de contato mínimo — reaproveitado pelo teste de `webhook_logs`. */
function buildContatoSimples(from: string, wamid: string) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from,
                  id: wamid,
                  type: "contacts",
                  contacts: [
                    {
                      name: { formatted_name: "Maria Silva" },
                      phones: [{ phone: "+55 41 99999-9999" }],
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  }
}


// ─────────────────────────────────────────────────────────────────────────────────────────────
// O arquivo de payload é AGUARDADO — e é inofensivo quando falha
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// O INSERT em `webhook_logs` saiu do `after()` porque a Vercel já provou descartar callbacks de
// `after()` em silêncio (documentado em `webhooks/landing-page/route.ts`) — arquivar a prova no
// caminho que perde prova esvazia a garantia. Aguardar tem um preço: o arquivo divide o caminho
// SÍNCRONO com o INSERT da mensagem (hoje depois dele, gate `@qa` M-1), e uma falha nele poderia
// derrubar a bolha. O preço do TEMPO é outro bloco — ver "teto do INSERT de arquivamento".
//
// Carrascos, um por metade da proteção (o gate `@qa` L-1 mediu que a frase única de antes era
// falsa: remover o `if (error)` não derrubava nada, porque o PostgREST não lança):
//   • tirar o `try/catch`  → o teste do modo "LANÇA" fica vermelho (sem bolha, sem 200);
//   • tirar o `if (error)` → o teste do modo "error do PostgREST" fica vermelho, porque ele
//     asserta o `console.error` COM a mensagem do banco. Sem essa asserção, a falha silenciosa
//     seria trocada por outra falha silenciosa e ninguém saberia.
describe("WhatsApp webhook — falha ao arquivar payload não derruba a mensagem", () => {
  const APP_SECRET = "test-secret"

  beforeEach(() => {
    db = freshDb()
    nextId = 0
    logEventMock.mockClear()
    fetchMock.mockClear()
    fetchMock.mockImplementation((async () => ({ ok: true, json: async () => ({}) })) as never)
    coachMock.mockClear()
    coachMock.mockResolvedValue(undefined)
    pushCorretorMock.mockClear()
    pipelineMock.mockClear()
    pipelineMock.mockImplementation(async () => ({
      response: "Mocked Nicole reply",
      qualificationScore: 0,
    }))
    afterPromises = []
    falharLeitura = null
    falharInsert = null
    process.env.META_APP_SECRET = APP_SECRET
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key"
    process.env.META_WHATSAPP_VERIFY_TOKEN = "verify"
    process.env.NICOLE_ANTI_RAJADA_MS = "0"
  })

  afterEach(() => {
    // Não pode vazar para nenhum outro bloco: derrubaria todo INSERT da suíte.
    falharInsert = null
    delete process.env.NICOLE_ANTI_RAJADA_MS
  })

  it("INSERT do arquivo LANÇA: a mensagem é gravada e a resposta é 200", async () => {
    const { POST } = await import("../route")
    // Só `webhook_logs` falha — se derrubasse `messages` também, o teste mediria outra coisa.
    falharInsert = (table) =>
      table === "webhook_logs" ? { lanca: true, motivo: "conexão caiu" } : null

    const res = await POST(
      signedRequest(buildContatoSimples("+5544999689446", "wamid.LOG-THROW"), APP_SECRET)
    )

    expect(res.status).toBe(200)
    expect(db.webhook_logs).toHaveLength(0) // o arquivo realmente não foi gravado
    const userMsg = db.messages.find((m) => m.role === "user")
    expect(userMsg).toBeTruthy()
    expect(userMsg!.content).toBe("[Contato recebido] Maria Silva — +55 41 99999-9999")
  })

  it("INSERT do arquivo devolve `error` do PostgREST: bolha intacta E o motivo do banco no console", async () => {
    const { POST } = await import("../route")
    const MOTIVO = 'new row violates check constraint "webhook_logs_source_check"'
    // O outro modo de falha: violação de CHECK/RLS não LANÇA, vem no objeto. É por isso que o
    // `try/catch` sozinho não basta — sem o `if (error)` da rota, este caminho é MUDO.
    falharInsert = (table) => (table === "webhook_logs" ? { lanca: false, motivo: MOTIVO } : null)
    const espiaoConsole = vi.spyOn(console, "error").mockImplementation(() => {})

    try {
      const res = await POST(
        signedRequest(buildContatoSimples("+5544999689446", "wamid.LOG-ERR"), APP_SECRET)
      )

      expect(res.status).toBe(200)
      expect(db.webhook_logs).toHaveLength(0)
      expect(db.messages.find((m) => m.role === "user")).toBeTruthy()

      // O carrasco do `if (erroArquivo)`: sem ele, nada é impresso e esta asserção reprova.
      const gritou = espiaoConsole.mock.calls.some((c) => c.map(String).join(" ").includes(MOTIVO))
      expect(gritou).toBe(true)
    } finally {
      espiaoConsole.mockRestore()
    }
  })
})


// ─────────────────────────────────────────────────────────────────────────────────────────────
// Push ao corretor: reação cala, tipo desconhecido grita
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// `notificaCorretor` é uma flag SEPARADA de `acionaNicole`, e estes testes são o que impede
// alguém de "simplificar" unificando as duas: sob a unificação, o teste do tipo desconhecido
// fica vermelho (o corretor deixaria de ser avisado justo no caso em que o CRM não sabe exibir
// o conteúdo).
describe("WhatsApp webhook — push ao corretor por tipo de mensagem", () => {
  const APP_SECRET = "test-secret"

  beforeEach(() => {
    db = freshDb()
    nextId = 0
    logEventMock.mockClear()
    fetchMock.mockClear()
    fetchMock.mockImplementation((async () => ({ ok: true, json: async () => ({}) })) as never)
    coachMock.mockClear()
    coachMock.mockResolvedValue(undefined)
    pushCorretorMock.mockClear()
    pipelineMock.mockClear()
    pipelineMock.mockImplementation(async () => ({
      response: "Mocked Nicole reply",
      qualificationScore: 0,
    }))
    afterPromises = []
    falharLeitura = null
    falharInsert = null
    process.env.META_APP_SECRET = APP_SECRET
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key"
    process.env.META_WHATSAPP_VERIFY_TOKEN = "verify"
    process.env.NICOLE_ANTI_RAJADA_MS = "0"
  })

  afterEach(() => {
    delete process.env.NICOLE_ANTI_RAJADA_MS
  })

  /** Mesmo payload arbitrário por tipo usado no bloco de tipos não suportados. */
  function porTipo(wamid: string, type: string, extra?: Record<string, unknown>) {
    return {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { from: "+5544999689446", id: wamid, type, ...(extra ?? {}) },
                ],
              },
            },
          ],
        },
      ],
    }
  }

  it("CONTROLE — texto normal CHAMA o push (senão os `not.toHaveBeenCalled` abaixo seriam vazios)", async () => {
    const { POST } = await import("../route")

    await POST(
      signedRequest(
        buildPayload({ from: "+5544999689446", wamid: "wamid.PUSH-CTRL", text: "oi" }),
        APP_SECRET
      )
    )
    await drenarAfter()

    expect(pushCorretorMock).toHaveBeenCalled()
  })

  it("reaction: NÃO notifica o corretor — um ❤️ é ruído no celular dele", async () => {
    const { POST } = await import("../route")

    const res = await POST(
      signedRequest(
        porTipo("wamid.PUSH-REACT", "reaction", {
          reaction: { emoji: "❤️", message_id: "wamid.ORIGINAL" },
        }),
        APP_SECRET
      )
    )
    expect(res.status).toBe(200)
    await drenarAfter()

    // A bolha existe (a reação não some) — só o push é suprimido.
    expect(db.messages.find((m) => m.role === "user")).toBeTruthy()
    expect(pushCorretorMock).not.toHaveBeenCalled()
  })

  it("tipo desconhecido: NOTIFICA o corretor — é o caso em que só ele pode ir ver no WhatsApp", async () => {
    const { POST } = await import("../route")

    const res = await POST(
      signedRequest(
        porTipo("wamid.PUSH-ORDER", "order", { order: { catalog_id: "CAT-1" } }),
        APP_SECRET
      )
    )
    expect(res.status).toBe(200)
    await drenarAfter()

    // A divergência com `acionaNicole` mora aqui: sem IA, MAS com push.
    expect(pipelineMock).not.toHaveBeenCalled()
    expect(pushCorretorMock).toHaveBeenCalled()
  })
})


// ─────────────────────────────────────────────────────────────────────────────────────────────
// Gate `@qa` H-1 — quem aciona a Nicole, tipo a tipo (nada por omissão)
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// H-1 nasceu de uma OMISSÃO, não de um erro de código: `video` e `sticker` herdavam
// `acionaNicole = true` e nenhum teste dizia nada sobre isso. O `text` desses branches DESCREVE
// UMA LIMITAÇÃO DO CRM ("o CRM ainda não exibe vídeos") e chegava ao pipeline como se fosse fala
// do lead — a Nicole respondia ao cliente sobre o nosso sistema.
//
// Por isso este bloco cobre os QUATRO tipos, inclusive os dois que não mudaram: a regra passa a
// ser afirmada, não presumida. Cada `it` tem um par (um SIM e um NÃO no mesmo eixo), então
// nenhum `not.toHaveBeenCalled()` aqui é asserção vazia.
describe("WhatsApp webhook — H-1: quais tipos acionam a Nicole", () => {
  const APP_SECRET = "test-secret"

  beforeEach(() => {
    db = freshDb()
    nextId = 0
    logEventMock.mockClear()
    fetchMock.mockClear()
    fetchMock.mockImplementation((async () => ({ ok: true, json: async () => ({}) })) as never)
    coachMock.mockClear()
    coachMock.mockResolvedValue(undefined)
    pushCorretorMock.mockClear()
    pipelineMock.mockClear()
    pipelineMock.mockImplementation(async () => ({
      response: "Mocked Nicole reply",
      qualificationScore: 0,
    }))
    afterPromises = []
    falharLeitura = null
    falharInsert = null
    process.env.META_APP_SECRET = APP_SECRET
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key"
    process.env.META_WHATSAPP_VERIFY_TOKEN = "verify"
    process.env.NICOLE_ANTI_RAJADA_MS = "0"
  })

  afterEach(() => {
    delete process.env.NICOLE_ANTI_RAJADA_MS
  })

  async function entregarTipo(wamid: string, type: string, extra?: Record<string, unknown>) {
    const { POST } = await import("../route")
    const res = await POST(signedRequest(buildTipoBruto(wamid, type, extra), APP_SECRET))
    await drenarAfter()
    return res
  }

  it("contacts ACIONA a Nicole — o cartão é dado útil, ela tem o que fazer", async () => {
    await entregarTipo("wamid.H1-CONTACTS", "contacts", {
      contacts: [
        { name: { formatted_name: "Maria Silva" }, phones: [{ phone: "+55 41 99999-9999" }] },
      ],
    })
    expect(pipelineMock).toHaveBeenCalled()
  })

  it("location ACIONA a Nicole — o lead mandou onde está, isso é conteúdo", async () => {
    await entregarTipo("wamid.H1-LOC", "location", {
      location: { latitude: -25.4284, longitude: -49.2733 },
    })
    expect(pipelineMock).toHaveBeenCalled()
  })

  it("video NÃO aciona a Nicole — o texto da bolha descreve uma limitação NOSSA", async () => {
    await entregarTipo("wamid.H1-VID", "video", { video: { id: "VID-1" } })

    // A bolha existe (o vídeo não some) e o corretor é avisado…
    const userMsg = db.messages.find((m) => m.role === "user")
    expect(userMsg!.content).toBe("[Vídeo recebido — o CRM ainda não exibe vídeos]")
    expect(pushCorretorMock).toHaveBeenCalled()

    // …mas esse texto NUNCA vai ao pipeline: senão a Nicole responde ao lead sobre o CRM.
    expect(pipelineMock).not.toHaveBeenCalled()
    const textosAoPipeline = (pipelineMock.mock.calls as unknown as unknown[][])
      .map((c) => JSON.stringify(c[0]))
      .join(" ")
    expect(textosAoPipeline).not.toContain("o CRM ainda não exibe")
  })

  it("sticker NÃO aciona a Nicole — 😂 é a mesma classe de ❤️", async () => {
    await entregarTipo("wamid.H1-STK", "sticker", { sticker: { id: "STK-1" } })

    expect(db.messages.find((m) => m.role === "user")!.content).toBe("[Figurinha recebida]")
    expect(pushCorretorMock).toHaveBeenCalled()
    expect(pipelineMock).not.toHaveBeenCalled()
  })

  it("L-3 — video e sticker gravam `tipo_nao_suportado` (contar vídeos não pode ser grep no texto)", async () => {
    await entregarTipo("wamid.L3-VID", "video", { video: { id: "VID-2" } })
    await entregarTipo("wamid.L3-STK", "sticker", { sticker: { id: "STK-2" } })

    const marcadores = db.messages
      .filter((m) => m.role === "user")
      .map((m) => m.metadata.tipo_nao_suportado)
    expect(marcadores).toContain("video")
    expect(marcadores).toContain("sticker")
  })

  it("CONTROLE — texto puro NÃO grava `tipo_nao_suportado` (o marcador discrimina de fato)", async () => {
    const { POST } = await import("../route")
    await POST(
      signedRequest(
        buildPayload({ from: "+5544999689446", wamid: "wamid.L3-TXT", text: "oi" }),
        APP_SECRET
      )
    )
    expect(db.messages.find((m) => m.role === "user")!.metadata.tipo_nao_suportado).toBeUndefined()
  })

  it("L-2 — reação REMOVIDA (`emoji: \"\"`) não mente dizendo que o lead reagiu", async () => {
    await entregarTipo("wamid.L2-UNDO", "reaction", {
      reaction: { emoji: "", message_id: "wamid.ORIGINAL" },
    })

    const userMsg = db.messages.find((m) => m.role === "user")
    expect(userMsg!.content).toBe("[O lead removeu a reação]")
    // O metadata também distingue: reagir e desfazer não podem ser a mesma linha.
    expect(userMsg!.metadata.reaction).toEqual({
      emoji: null,
      message_id: "wamid.ORIGINAL",
      removida: true,
    })
    expect(pipelineMock).not.toHaveBeenCalled()
    expect(pushCorretorMock).not.toHaveBeenCalled()
  })

  it("L-4 — `system` vira bolha, mas sem IA e SEM push (não é o lead falando)", async () => {
    await entregarTipo("wamid.L4-SYS", "system", {
      system: {
        body: "Maria mudou o número de telefone",
        type: "user_changed_number",
        new_wa_id: "5541988887777",
      },
    })

    const userMsg = db.messages.find((m) => m.role === "user")
    expect(userMsg).toBeTruthy()
    expect(userMsg!.content).toBe("[Aviso do WhatsApp] Maria mudou o número de telefone")
    expect(userMsg!.metadata.system).toEqual({
      body: "Maria mudou o número de telefone",
      type: "user_changed_number",
      new_wa_id: "5541988887777",
    })

    expect(pipelineMock).not.toHaveBeenCalled()
    // A divergência com o tipo desconhecido mora aqui: `order` notifica, `system` não.
    // Não há nada no WhatsApp para o corretor ir ver — o push seria falso alarme.
    expect(pushCorretorMock).not.toHaveBeenCalled()
  })

  it("PAR de contraste — `order` no MESMO cenário notifica o corretor, `system` não", async () => {
    await entregarTipo("wamid.PAR-ORDER", "order", { order: { catalog_id: "CAT-1" } })
    expect(pushCorretorMock).toHaveBeenCalledTimes(1)

    pushCorretorMock.mockClear()
    await entregarTipo("wamid.PAR-SYS", "system", { system: { type: "user_changed_number" } })
    expect(pushCorretorMock).not.toHaveBeenCalled()
  })
})

/** Payload com um `msg` de tipo arbitrário — compartilhado pelos blocos de tipo. */
function buildTipoBruto(wamid: string, type: string, extra?: Record<string, unknown>) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                { from: "+5544999689446", id: wamid, type, ...(extra ?? {}) },
              ],
            },
          },
        ],
      },
    ],
  }
}


// ─────────────────────────────────────────────────────────────────────────────────────────────
// Gate `@qa` M-1 — a bolha é escrita ANTES do arquivo
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// O `try/catch` e o `if (error)` cobrem "o arquivo falhou". Nenhum dos dois cobre "o arquivo
// PENDUROU": sem `AbortSignal` em `lib/supabase/admin.ts`, um Supabase lento segura o INSERT até
// a lambda morrer aos 60s. Com o arquivo antes da bolha, isso significava mensagem perdida — o
// defeito de 01/09 reintroduzido pelo mecanismo criado para preveni-lo.
//
// A defesa é a ORDEM, e ordem não aparece em estado final: os dois arranjos terminam com as
// mesmas linhas no banco. Por isso o carrasco aqui é a SEQUÊNCIA de INSERTs.
describe("WhatsApp webhook — M-1: ordem entre a bolha e o arquivo", () => {
  const APP_SECRET = "test-secret"

  beforeEach(() => {
    db = freshDb()
    nextId = 0
    insertsPorTabela = []
    logEventMock.mockClear()
    fetchMock.mockClear()
    fetchMock.mockImplementation((async () => ({ ok: true, json: async () => ({}) })) as never)
    coachMock.mockClear()
    coachMock.mockResolvedValue(undefined)
    pushCorretorMock.mockClear()
    pipelineMock.mockClear()
    pipelineMock.mockImplementation(async () => ({
      response: "Mocked Nicole reply",
      qualificationScore: 0,
    }))
    afterPromises = []
    falharLeitura = null
    falharInsert = null
    process.env.META_APP_SECRET = APP_SECRET
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key"
    process.env.META_WHATSAPP_VERIFY_TOKEN = "verify"
    process.env.NICOLE_ANTI_RAJADA_MS = "0"
  })

  afterEach(() => {
    delete process.env.NICOLE_ANTI_RAJADA_MS
  })

  it("`messages` recebe INSERT ANTES de `webhook_logs` — um hang custa o arquivo, nunca a bolha", async () => {
    const { POST } = await import("../route")

    const res = await POST(
      signedRequest(buildContatoSimples("+5544999689446", "wamid.ORDEM-1"), APP_SECRET)
    )
    expect(res.status).toBe(200)

    const posBolha = insertsPorTabela.indexOf("messages")
    const posArquivo = insertsPorTabela.indexOf("webhook_logs")
    expect(posBolha).toBeGreaterThanOrEqual(0)
    expect(posArquivo).toBeGreaterThanOrEqual(0)
    expect(posBolha).toBeLessThan(posArquivo)
  })

  it("e o arquivo enxerga a bolha já gravada — não é só ordem de chamada, é de EFEITO", async () => {
    const { POST } = await import("../route")

    // Espia no momento exato do INSERT do arquivo: a linha da mensagem já tem de existir.
    let bolhasNoMomentoDoArquivo = -1
    falharInsert = (table) => {
      if (table === "webhook_logs") {
        bolhasNoMomentoDoArquivo = db.messages.filter((m) => m.role === "user").length
      }
      return null
    }

    await POST(signedRequest(buildContatoSimples("+5544999689446", "wamid.ORDEM-2"), APP_SECRET))

    expect(bolhasNoMomentoDoArquivo).toBe(1)
  })
})


// ─────────────────────────────────────────────────────────────────────────────────────────────
// CodeRabbit #556 — o arquivo tem TETO, e é o teto que protege o resto do turno
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// A ordem (bolha → arquivo) salva a bolha, e só ela. O `await` do arquivo continua no caminho
// SÍNCRONO, antes dos `after()` de push/coach/Nicole e antes do 200 — e `after()` só executa
// depois que a resposta sai. Sem teto, um Supabase LENTO leva junto os três e a resposta; a
// Meta reentrega, a reentrega bate no early-return de 23505 e a mensagem fica sem Nicole PARA
// SEMPRE. Mover o bloco para baixo dos `after()` não mudaria nada — agendar não é executar.
//
// Carrascos:
//   • tirar o `.abortSignal(...)`      → os DOIS reprovam (nenhum signal chega ao fake, e o
//                                        arquivo passa a ser gravado no teste do abort);
//   • mexer no valor do teto           → os dois reprovam (o primeiro no
//                                        `toHaveBeenCalledWith(5000)`, o segundo porque o
//                                        mock só substitui o teto do arquivo);
//   • trocar o `if (error)` por nada   → o segundo reprova (o abort do postgrest-js vem em
//                                        `error`, não em exceção — é o mesmo ramo do L-1).
describe("WhatsApp webhook — teto do INSERT de arquivamento", () => {
  const APP_SECRET = "test-secret"

  beforeEach(() => {
    db = freshDb()
    nextId = 0
    insertsPorTabela = []
    sinaisPorChamada = []
    logEventMock.mockClear()
    fetchMock.mockClear()
    fetchMock.mockImplementation((async () => ({ ok: true, json: async () => ({}) })) as never)
    coachMock.mockClear()
    coachMock.mockResolvedValue(undefined)
    pushCorretorMock.mockClear()
    pipelineMock.mockClear()
    pipelineMock.mockImplementation(async () => ({
      response: "Mocked Nicole reply",
      qualificationScore: 0,
    }))
    afterPromises = []
    falharLeitura = null
    falharInsert = null
    process.env.META_APP_SECRET = APP_SECRET
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key"
    process.env.META_WHATSAPP_VERIFY_TOKEN = "verify"
    process.env.NICOLE_ANTI_RAJADA_MS = "0"
  })

  afterEach(() => {
    delete process.env.NICOLE_ANTI_RAJADA_MS
  })

  it("o INSERT em `webhook_logs` vai com `AbortSignal` de 5s — hang deixou de ser possível", async () => {
    const { POST } = await import("../route")
    const espiaoTimeout = vi.spyOn(AbortSignal, "timeout")

    try {
      const res = await POST(
        signedRequest(buildContatoSimples("+5544999689446", "wamid.TETO-1"), APP_SECRET)
      )
      expect(res.status).toBe(200)

      // O teto chegou ao cliente: é a chamada do arquivo que carrega o signal, não outra.
      const doArquivo = sinaisPorChamada.filter((s) => s.table === "webhook_logs")
      expect(doArquivo).toHaveLength(1)
      expect(doArquivo[0]!.signal).toBeInstanceOf(AbortSignal)

      // E o valor é o declarado — sem isto, "tem teto" passaria verde com teto de 10 minutos.
      expect(espiaoTimeout).toHaveBeenCalledWith(5000)
    } finally {
      espiaoTimeout.mockRestore()
    }
  })

  it("teto estourado custa o ARQUIVO e só ele — bolha, push, Nicole e o 200 seguem", async () => {
    const { POST } = await import("../route")

    // Substitui APENAS o teto do arquivo (5s) por um signal já abortado; os demais usos de
    // `AbortSignal.timeout` na rota (download de mídia, 10s) continuam reais, senão o teste
    // estaria medindo o efeito colateral do próprio mock.
    const timeoutReal = AbortSignal.timeout.bind(AbortSignal)
    const espiaoTimeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation((ms: number) => (ms === 5000 ? AbortSignal.abort() : timeoutReal(ms)))
    const espiaoConsole = vi.spyOn(console, "error").mockImplementation(() => {})

    try {
      const res = await POST(
        signedRequest(buildContatoSimples("+5544999689446", "wamid.TETO-2"), APP_SECRET)
      )
      await drenarAfter()

      // O preço declarado: o arquivo, e nada além dele.
      expect(res.status).toBe(200)
      expect(db.webhook_logs).toHaveLength(0)

      const userMsg = db.messages.find((m) => m.role === "user")
      expect(userMsg).toBeTruthy()
      expect(userMsg!.content).toBe("[Contato recebido] Maria Silva — +55 41 99999-9999")

      // Estes três são o que o hang levava junto e o teto devolve.
      expect(pushCorretorMock).toHaveBeenCalled()
      expect(pipelineMock).toHaveBeenCalled()
      const gritou = espiaoConsole.mock.calls.some((c) =>
        c.map(String).join(" ").includes("aborted")
      )
      expect(gritou).toBe(true)
    } finally {
      espiaoConsole.mockRestore()
      espiaoTimeout.mockRestore()
    }
  })
})
