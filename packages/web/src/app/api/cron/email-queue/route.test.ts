/**
 * Story 900-23 · AC7 — isolamento de erro por organização no `email-queue`.
 *
 * Este cron **já iterava** as orgs corretamente (`for (const orgId of orgIds)`); o que faltava era
 * o `try/catch`: um erro processando a fila da org A abortava o laço inteiro e deixava a org B sem
 * envio até a próxima execução — silenciosamente, com 500 no log da Vercel.
 *
 * ⚠️ O carrasco afirma **sobre o corpo da resposta** (`failed >= 1`), não só "o 2º item rodou".
 * Sem o campo nomeado, o padrão `catch { console.error; continue }` devolve 200 com corpo limpo —
 * troca "aborta tudo, ruidosamente" por "erra em silêncio", que é pior que o defeito original.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const ORG_A = "00000000-0000-0000-0000-0000000000a1"
const ORG_B = "00000000-0000-0000-0000-0000000000b2"

/** Orgs cuja leitura da fila deve lançar. */
let orgsQueFalham = new Set<string>()
/** Linhas pendentes: a 1ª query lê só `org_id`; a 2ª, o item completo. */
let pendentes: Array<{ org_id: string }> = []
let enviados: string[] = []

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

function builder(tabela: string) {
  const filtros: Array<[string, unknown]> = []
  let pendingUpdate: unknown = null
  let colunas: string | undefined

  const resolver = () => {
    const org = filtros.find(([c]) => c === "org_id")?.[1] as string | undefined
    if (org && orgsQueFalham.has(org)) {
      throw new Error(`falha sintética lendo a fila da org ${org}`)
    }
    if (tabela !== "email_sends_queue") return { data: [], error: null }
    if (org === undefined) return { data: pendentes.map((l) => projetar(l, colunas)), error: null }
    // Segunda query: os itens daquela org, já com o join achatado pela rota.
    const itens = pendentes
      .filter((p) => p.org_id === org)
      .map((_, i) => ({
        id: `q-${org}-${i}`,
        attempts: 0,
        max_attempts: 3,
        email_logs: [
          {
            id: `log-${org}-${i}`,
            to_email: `dest-${org}@example.com`,
            subject: "assunto",
            template_id: "t1",
            variables_used: {},
            triggered_by: null,
            email_templates: [{ slug: "s", html_body: "<p>oi</p>" }],
          },
        ],
      }))
    return { data: itens, error: null }
  }

  const api: Record<string, unknown> = {
    select: (c?: string) => {
      colunas = c
      return api
    },
    eq: (c: string, v: unknown) => {
      filtros.push([c, v])
      return api
    },
    lte: () => api,
    order: () => api,
    limit: () => api,
    in: () => api,
    update: (p: unknown) => {
      pendingUpdate = p
      return api
    },
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
      if (pendingUpdate) return Promise.resolve({ data: null, error: null }).then(res, rej)
      try {
        return Promise.resolve(resolver()).then(res, rej)
      } catch (e) {
        return Promise.reject(e).then(res, rej)
      }
    },
  }
  return api
}

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t) }),
}))

vi.mock("@web/lib/email", () => ({
  sendEmail: async ({ to }: { to: string }) => {
    enviados.push(to)
    return { id: "resend-1", error: null }
  },
  getEmailsSentToday: async () => 0,
  getEmailSettings: async () => ({ daily_quota: 100 }),
}))

beforeEach(() => {
  vi.resetModules()
  process.env.CRON_SECRET = "segredo"
  orgsQueFalham = new Set()
  enviados = []
  pendentes = [{ org_id: ORG_A }, { org_id: ORG_B }]
})

async function chamar() {
  const { GET } = await import("./route")
  return GET(
    new Request("https://x.test/api/cron/email-queue", {
      headers: { authorization: "Bearer segredo" },
    }) as never,
  )
}

describe("email-queue — isolamento de erro por org (AC7)", () => {
  it("controle positivo: sem erro, as duas orgs são processadas", async () => {
    const res = await chamar()
    const body = (await res.json()) as { processed: number; failed: number }
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ processed: 2, failed: 0 })
    expect(enviados).toEqual([`dest-${ORG_A}@example.com`, `dest-${ORG_B}@example.com`])
  })

  it("🔴 erro na 1ª org NÃO impede a 2ª, e o corpo NOMEIA a falha (`failed >= 1`)", async () => {
    orgsQueFalham = new Set([ORG_A])

    const res = await chamar()
    const body = (await res.json()) as { processed: number; failed: number }

    expect(res.status).toBe(200)
    // A 2ª org foi processada apesar do erro na 1ª…
    expect(enviados).toEqual([`dest-${ORG_B}@example.com`])
    expect(body.processed).toBe(1)
    // …e o erro NÃO ficou em silêncio.
    expect(body.failed).toBeGreaterThanOrEqual(1)
  })
})
