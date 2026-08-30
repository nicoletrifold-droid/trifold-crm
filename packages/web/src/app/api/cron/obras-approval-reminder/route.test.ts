/**
 * Story 900-23 · AC7 — isolamento de erro por organização no `obras-approval-reminder`.
 *
 * O laço já agrupava por org (`for (const [orgId, …] of byOrg.entries())`) e não tinha nenhum
 * `try/catch`: uma falha ao resolver os aprovadores da org A abortava o laço e a org B não recebia
 * lembrete nenhum.
 *
 * ⚠️ Campo de falha NOMEADO (C10): o retorno era `{ processed, notified_orgs }` — **nenhum**
 * contador de erro. Sem `orgs_com_erro`, o `catch … continue` devolveria 200 com corpo limpo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const ORG_A = "00000000-0000-0000-0000-0000000000a1"
const ORG_B = "00000000-0000-0000-0000-0000000000b2"

let pendentes: Array<Record<string, unknown>> = []
let orgsQueFalham = new Set<string>()
let emailsEnviados: string[] = []

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      let pendingUpdate: unknown = null
      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        or: () => api,
        lte: () => api,
        in: () => api,
        update: (p: unknown) => {
          pendingUpdate = p
          return api
        },
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
          if (pendingUpdate) return Promise.resolve({ data: null, error: null }).then(res, rej)
          return Promise.resolve({ data: pendentes, error: null }).then(res, rej)
        },
      }
      return api
    },
  }),
}))

vi.mock("@web/lib/obras/aprovacao-notifications", () => ({
  getAprovadoresParaEmail: async (_admin: unknown, orgId: string) => {
    if (orgsQueFalham.has(orgId)) throw new Error(`falha sintética na org ${orgId}`)
    return [{ name: `Admin ${orgId}`, email: `admin-${orgId}@example.com` }]
  },
}))

vi.mock("@web/lib/email", () => ({
  sendEmail: async ({ to }: { to: string }) => {
    emailsEnviados.push(to)
    return { id: "e1", error: null }
  },
}))

beforeEach(() => {
  vi.resetModules()
  process.env.CRON_SECRET = "segredo"
  emailsEnviados = []
  orgsQueFalham = new Set()
  pendentes = [
    { id: "p1", org_id: ORG_A, obra_id: "o1", tipo: "foto", created_at: "2026-08-01" },
    { id: "p2", org_id: ORG_B, obra_id: "o2", tipo: "foto", created_at: "2026-08-01" },
  ]
})

async function chamar() {
  const { GET } = await import("./route")
  return GET(
    new Request("https://x.test/api/cron/obras-approval-reminder", {
      headers: { authorization: "Bearer segredo" },
    }) as never,
  )
}

type Corpo = { processed: number; notified_orgs: number; orgs_com_erro: number }

describe("obras-approval-reminder — isolamento de erro por org (AC7)", () => {
  it("controle positivo: as duas orgs são notificadas, zero erro", async () => {
    const res = await chamar()
    const body = (await res.json()) as Corpo
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ processed: 2, notified_orgs: 2, orgs_com_erro: 0 })
    expect(emailsEnviados).toEqual([`admin-${ORG_A}@example.com`, `admin-${ORG_B}@example.com`])
  })

  it("🔴 erro na 1ª org NÃO impede a 2ª, e o corpo NOMEIA a falha (`orgs_com_erro >= 1`)", async () => {
    orgsQueFalham = new Set([ORG_A])

    const res = await chamar()
    const body = (await res.json()) as Corpo

    expect(res.status).toBe(200)
    expect(emailsEnviados).toEqual([`admin-${ORG_B}@example.com`])
    expect(body.notified_orgs).toBe(1)
    expect(body.orgs_com_erro).toBeGreaterThanOrEqual(1)
  })
})
