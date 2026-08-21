/**
 * Story 75-363 — rastro do push em `system_events`.
 *
 * O `sendPushToUser` era um buraco negro: VAPID quebrada, destinatário sem
 * subscription e entrega falhada terminavam todos no mesmo `return` mudo.
 * Estes testes fixam o contrato novo: EXATAMENTE 1 evento por chamada,
 * classificando o desfecho — e o contrato antigo que não pode quebrar:
 * a função NUNCA lança.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const sendNotification = vi.fn<(...a: unknown[]) => Promise<unknown>>()
const setVapidDetails = vi.fn()
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: (...a: unknown[]) => setVapidDetails(...a),
    sendNotification: (...a: unknown[]) => sendNotification(...a),
  },
}))

const logEvent = vi.fn()
vi.mock("@web/lib/logger", () => ({ logEvent: (...a: unknown[]) => logEvent(...a) }))

// --- fake supabase: select configurável + delete rastreável ---
type SubRow = { endpoint: string; p256dh: string; auth: string }
let selectResult: { data: SubRow[] | null; error: { message: string } | null } = {
  data: [],
  error: null,
}
const deleteEq = vi.fn(async () => ({ data: null, error: null }))
function fakeSupabase() {
  return {
    from: () => ({
      select: () => ({ eq: async () => selectResult }),
      delete: () => ({ eq: deleteEq }),
    }),
  } as unknown as import("@supabase/supabase-js").SupabaseClient
}

const PAYLOAD = { title: "Fulana quer saber o valor", body: "…", url: "/broker/leads/x" }
const sub = (endpoint: string): SubRow => ({ endpoint, p256dh: "p", auth: "a" })

function setVapidEnv() {
  process.env.VAPID_SUBJECT = "mailto:crm@trifold.eng.br"
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub"
  process.env.VAPID_PRIVATE_KEY = "priv"
}

/**
 * `vapidConfigured` é estado de módulo — cada teste importa uma instância
 * fresca para o cenário de env valer de verdade.
 */
async function freshSendPushToUser() {
  vi.resetModules()
  const mod = await import("./push-service")
  return mod.sendPushToUser
}

beforeEach(() => {
  sendNotification.mockReset()
  setVapidDetails.mockClear()
  logEvent.mockClear()
  deleteEq.mockClear()
  selectResult = { data: [], error: null }
  setVapidEnv()
})

describe("sendPushToUser — rastro (Story 75-363)", () => {
  it("AC2: VAPID ausente → PUSH_VAPID_AUSENTE (error) e nem consulta subscriptions", async () => {
    delete process.env.VAPID_PRIVATE_KEY
    const sendPushToUser = await freshSendPushToUser()

    await sendPushToUser(fakeSupabase(), "user-1", PAYLOAD)

    expect(logEvent).toHaveBeenCalledOnce()
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "error",
        event_type: "PUSH_VAPID_AUSENTE",
        metadata: expect.objectContaining({ user_id: "user-1", title: PAYLOAD.title }),
      })
    )
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it("AC1: destinatário sem subscription → PUSH_SEM_SUBSCRIPTION (warn) — o caso Thielly", async () => {
    selectResult = { data: [], error: null }
    const sendPushToUser = await freshSendPushToUser()

    await sendPushToUser(fakeSupabase(), "user-thielly", PAYLOAD)

    expect(logEvent).toHaveBeenCalledOnce()
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "warn",
        event_type: "PUSH_SEM_SUBSCRIPTION",
        metadata: expect.objectContaining({
          user_id: "user-thielly",
          title: PAYLOAD.title,
          query_error: null,
        }),
      })
    )
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it("AC1: erro na consulta NÃO se disfarça de 'sem subscription' — vai em query_error", async () => {
    selectResult = { data: null, error: { message: "permission denied" } }
    const sendPushToUser = await freshSendPushToUser()

    await sendPushToUser(fakeSupabase(), "user-1", PAYLOAD)

    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "PUSH_SEM_SUBSCRIPTION",
        metadata: expect.objectContaining({ query_error: "permission denied" }),
      })
    )
  })

  it("AC3: entrega a ≥1 → PUSH_ENVIADO (info) com contadores", async () => {
    selectResult = { data: [sub("e1"), sub("e2")], error: null }
    sendNotification.mockResolvedValue({})
    const sendPushToUser = await freshSendPushToUser()

    await sendPushToUser(fakeSupabase(), "user-1", PAYLOAD)

    expect(sendNotification).toHaveBeenCalledTimes(2)
    // o payload vai serializado — é o contrato com o service worker
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "e1" }),
      JSON.stringify(PAYLOAD)
    )
    expect(logEvent).toHaveBeenCalledOnce()
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "info",
        event_type: "PUSH_ENVIADO",
        metadata: expect.objectContaining({ enviados: 2, expiradas: 0, falhas: 0 }),
      })
    )
  })

  it("AC3+410: expirada limpa a subscription e ainda conta como ENVIADO se outra entregou", async () => {
    selectResult = { data: [sub("morta"), sub("viva")], error: null }
    sendNotification.mockImplementation(async (target) => {
      if ((target as { endpoint: string }).endpoint === "morta") {
        throw { statusCode: 410 }
      }
      return {}
    })
    const sendPushToUser = await freshSendPushToUser()

    await sendPushToUser(fakeSupabase(), "user-1", PAYLOAD)

    expect(deleteEq).toHaveBeenCalledWith("endpoint", "morta")
    expect(logEvent).toHaveBeenCalledOnce()
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "PUSH_ENVIADO",
        metadata: expect.objectContaining({ enviados: 1, expiradas: 1, falhas: 0 }),
      })
    )
  })

  it("AC3: zero entregas com subscriptions presentes → PUSH_SEM_ENTREGA (warn) com status codes", async () => {
    selectResult = { data: [sub("e1"), sub("e2")], error: null }
    sendNotification.mockRejectedValue({ statusCode: 500 })
    const sendPushToUser = await freshSendPushToUser()

    await sendPushToUser(fakeSupabase(), "user-1", PAYLOAD)

    expect(logEvent).toHaveBeenCalledOnce()
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "warn",
        event_type: "PUSH_SEM_ENTREGA",
        metadata: expect.objectContaining({
          subscriptions: 2,
          expiradas: 0,
          status_codes: [500, 500],
        }),
      })
    )
  })

  it("AC4: NUNCA lança — nem com supabase explodindo síncrono (há await sem catch em cron)", async () => {
    const explosivo = {
      from: () => {
        throw new Error("boom")
      },
    } as unknown as import("@supabase/supabase-js").SupabaseClient
    const sendPushToUser = await freshSendPushToUser()

    await expect(sendPushToUser(explosivo, "user-1", PAYLOAD)).resolves.toBeUndefined()
  })

  it("AC4: falha do webpush sem statusCode não derruba nada e conta como falha", async () => {
    selectResult = { data: [sub("e1")], error: null }
    sendNotification.mockRejectedValue(new Error("rede caiu"))
    const sendPushToUser = await freshSendPushToUser()

    await expect(sendPushToUser(fakeSupabase(), "user-1", PAYLOAD)).resolves.toBeUndefined()
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "PUSH_SEM_ENTREGA",
        metadata: expect.objectContaining({ status_codes: [null] }),
      })
    )
  })
})
