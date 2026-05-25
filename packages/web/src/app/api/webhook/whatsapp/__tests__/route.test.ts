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
import { describe, it, expect, beforeEach, vi } from "vitest"

// ---- Mocks ----------------------------------------------------------------

// Mock next/server `after` to invoke synchronously so async-path side effects
// happen within the test. We'll await an explicit microtask drain when needed.
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>(
    "next/server"
  )
  return {
    ...actual,
    after: (fn: () => Promise<unknown> | unknown) => {
      // Fire-and-forget: kick the callback synchronously so the test can
      // observe its effects after awaiting a microtask queue drain.
      void Promise.resolve().then(() => fn())
    },
  }
})

// Mock the AI dynamic import so we don't actually load Anthropic.
vi.mock("@trifold/ai", () => ({
  processMessage: vi.fn(async () => "Mocked Nicole reply"),
  createAnthropicClient: vi.fn(() => ({})),
}))

// Mock fetch for outbound WhatsApp Cloud API + media download
const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
;(global as unknown as { fetch: typeof fetchMock }).fetch = fetchMock

// Mock the logger so tests can introspect events
const logEventMock = vi.fn()
vi.mock("@web/lib/logger", () => ({
  logEvent: (...args: unknown[]) => logEventMock(...args),
}))

// Mock email automations
vi.mock("@web/lib/email-automations", () => ({
  triggerAutomations: vi.fn(),
}))

// ---- In-memory Supabase mock ---------------------------------------------

interface MessageRow {
  id: string
  conversation_id: string
  role: string
  content: string
  metadata: Record<string, unknown>
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
  }
}

let nextId = 0
function newId(prefix: string): string {
  nextId += 1
  return `${prefix}-${nextId}`
}

import { normalizePhoneBR } from "@trifold/shared"

// Build a minimal chainable Supabase-like client. Each query is built up via
// chained method calls; `await` triggers `then` which resolves the result.
function buildSupabaseMock() {
  function from(table: keyof DbState) {
    interface QueryState {
      filters: Array<{ col: string; op: string; val: unknown }>
      orderBy?: { col: string; ascending: boolean }
      limit?: number
      action: "select" | "insert" | "upsert" | "update" | "delete"
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      select(...args: unknown[]) {
        if (state.action !== "insert" && state.action !== "upsert") {
          state.action = "select"
        }
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
      const rows = db[table] as Record<string, unknown>[]

      if (state.action === "select") {
        const result = applyFilters(rows)
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
              metadata: (raw.metadata as Record<string, unknown>) ?? {},
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

  return {
    from,
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

// ---- Tests ----------------------------------------------------------------

describe("WhatsApp webhook — Story 21.1", () => {
  const APP_SECRET = "test-secret"

  beforeEach(() => {
    db = freshDb()
    nextId = 0
    logEventMock.mockClear()
    fetchMock.mockClear()
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
})
