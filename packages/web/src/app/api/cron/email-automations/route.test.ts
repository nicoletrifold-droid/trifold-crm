/**
 * Story 900-23 · AC7 — isolamento de erro por item nos DOIS laços do `email-automations`
 * (`cron.daily`, linha ~61, e aniversário, linha ~116). Nenhum dos dois tinha `try/catch`.
 *
 * ⚠️ Campo de falha NOMEADO (C10): o retorno era `{ fired, skipped, birthdayFired, automations }`
 * — nenhum contador de erro. Um contador só, `erros`, cobre os dois laços.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const ORG_A = "00000000-0000-0000-0000-0000000000a1"
const ORG_B = "00000000-0000-0000-0000-0000000000b2"

let automacoesDiarias: Array<Record<string, unknown>> = []
let automacoesAniversario: Array<Record<string, unknown>> = []
let leadsPorOrg: Record<string, Array<Record<string, unknown>>> = {}
let orgsQueFalham = new Set<string>()
let disparos: string[] = []

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      const filtros: Array<[string, unknown]> = []
      const api: Record<string, unknown> = {
        select: () => api,
        eq: (c: string, v: unknown) => {
          filtros.push([c, v])
          return api
        },
        not: () => api,
        like: () => api,
        gte: () => api,
        limit: () => api,
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
          const org = filtros.find(([c]) => c === "org_id")?.[1] as string | undefined
          if (org && orgsQueFalham.has(org)) {
            return Promise.reject(new Error(`falha sintética na org ${org}`)).then(res, rej)
          }
          if (tabela === "email_automations") {
            const gatilho = filtros.find(([c]) => c === "trigger_event")?.[1]
            return Promise.resolve({
              data: gatilho === "cron.daily" ? automacoesDiarias : automacoesAniversario,
              error: null,
            }).then(res, rej)
          }
          if (tabela === "leads") {
            return Promise.resolve({ data: leadsPorOrg[org ?? ""] ?? [], error: null }).then(
              res,
              rej,
            )
          }
          if (tabela === "clientes") return Promise.resolve({ data: [], error: null }).then(res, rej)
          // `email_logs` com `head: true` — a checagem de reenvio recente.
          return Promise.resolve({ data: null, count: 0, error: null }).then(res, rej)
        },
      }
      return api
    },
  }),
}))

vi.mock("@web/lib/email", () => ({
  sendTemplateEmail: async ({ orgId, to }: { orgId: string; to: { email: string } }) => {
    disparos.push(`${orgId}:${to.email}`)
    return { ok: true }
  },
}))

beforeEach(() => {
  vi.resetModules()
  process.env.CRON_SECRET = "segredo"
  disparos = []
  orgsQueFalham = new Set()
  automacoesAniversario = []
  automacoesDiarias = [
    { id: "auto-a", org_id: ORG_A, delay_minutes: 0, email_templates: { slug: "boas-vindas" } },
    { id: "auto-b", org_id: ORG_B, delay_minutes: 0, email_templates: { slug: "boas-vindas" } },
  ]
  leadsPorOrg = {
    [ORG_A]: [{ id: "l-a", email: "a@example.com", name: "A", phone: null }],
    [ORG_B]: [{ id: "l-b", email: "b@example.com", name: "B", phone: null }],
  }
})

async function chamar() {
  const { GET } = await import("./route")
  return GET(
    new Request("https://x.test/api/cron/email-automations", {
      headers: { authorization: "Bearer segredo" },
    }) as never,
  )
}

type Corpo = { fired: number; skipped: number; erros: number; birthdayFired: number }

describe("email-automations — isolamento de erro por automação (AC7)", () => {
  it("controle positivo: as duas automações disparam, zero erro", async () => {
    const res = await chamar()
    const body = (await res.json()) as Corpo
    expect(res.status).toBe(200)
    expect(body.fired).toBe(2)
    expect(body.erros).toBe(0)
    expect(disparos).toEqual([`${ORG_A}:a@example.com`, `${ORG_B}:b@example.com`])
  })

  it("🔴 erro na 1ª automação NÃO impede a 2ª, e o corpo NOMEIA a falha (`erros >= 1`)", async () => {
    orgsQueFalham = new Set([ORG_A])

    const res = await chamar()
    const body = (await res.json()) as Corpo

    expect(res.status).toBe(200)
    expect(disparos).toEqual([`${ORG_B}:b@example.com`])
    expect(body.fired).toBe(1)
    expect(body.erros).toBeGreaterThanOrEqual(1)
  })

  it("🔴 o mesmo vale para o laço de ANIVERSÁRIO (o try/catch é nos dois)", async () => {
    automacoesDiarias = []
    automacoesAniversario = [
      { id: "bd-a", org_id: ORG_A, email_templates: { slug: "aniversario" } },
      { id: "bd-b", org_id: ORG_B, email_templates: { slug: "aniversario" } },
    ]
    orgsQueFalham = new Set([ORG_A])

    const res = await chamar()
    const body = (await res.json()) as Corpo

    expect(res.status).toBe(200)
    expect(body.erros).toBeGreaterThanOrEqual(1)
  })
})
