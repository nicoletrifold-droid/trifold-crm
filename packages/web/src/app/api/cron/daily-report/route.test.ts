/**
 * Story 75-345 — o cron das 07:59 envia para quem está escolhido no CRM.
 *
 * O teste cobre a FIAÇÃO, que é onde esta story pode falhar em silêncio: a rota
 * podia continuar lendo só a env e ninguém notaria até o Joabe reclamar que não
 * recebeu. `mergeRecipients` já é testada à parte; aqui o que importa é que a rota
 * resolve a lista da org, junta com a env e não manda duplicado.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

vi.mock("server-only", () => ({}))

const ORG = "00000000-0000-0000-0000-000000000001"

let settings: Record<string, unknown>
let usuarios: Array<Record<string, unknown>>
/** Números que o envio recebeu — o que este teste existe para observar. */
let enviadoPara: string[]

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        in: () => api,
        maybeSingle: () => Promise.resolve({ data: { settings }, error: null }),
        then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
          resolve({ data: tabela === "users" ? usuarios : [], error: null }),
      }
      return api
    },
  }),
}))

vi.mock("@web/lib/reports/daily-leads-report", () => ({
  buildDailyLeadsReport: async () => ({
    data: "19/08",
    entrada: "20",
    canais: "WhatsApp 12",
    manuais: "3",
    patrocinados: "1",
    corretores: "Robson 8",
    distribuidos: "15 de 20",
    tempo: "12min",
  }),
}))

vi.mock("@web/lib/reports/send-daily-report", () => ({
  sendDailyReport: async (
    _admin: unknown,
    _orgId: string,
    recipients: string[]
  ) => {
    enviadoPara = recipients
    return { sent: recipients.length, errors: [] }
  },
}))

async function chamar() {
  const { GET } = await import("./route")
  const req = { headers: new Headers({ authorization: "Bearer segredo" }) }
  return GET(req as never)
}

beforeEach(() => {
  vi.resetModules()
  process.env.CRON_SECRET = "segredo"
  process.env.DAILY_REPORT_ORG_ID = ORG
  process.env.DAILY_REPORT_RECIPIENTS = "5544984070700" // Alexandre, como está hoje
  enviadoPara = []
  settings = { relatorio_diario_destinatarios: ["u-alex", "u-joabe"] }
  usuarios = [
    { id: "u-alex", name: "Alexandre", phone: "5544984070700", role: "admin", is_active: true },
    { id: "u-joabe", name: "Joabe", phone: "5544988441602", role: "gerente-comercial", is_active: true },
  ]
})

describe("GET /api/cron/daily-report", () => {
  it("envia para os escolhidos no CRM, sem duplicar quem também está na env", async () => {
    const res = await chamar()
    expect(res.status).toBe(200)
    // O telefone do Alexandre está nos dois lugares e sai UMA vez.
    expect(enviadoPara).toEqual(["5544984070700", "5544988441602"])
  })

  it("lista vazia no CRM = comportamento de antes da story (só a env)", async () => {
    settings = {}
    await chamar()
    expect(enviadoPara).toEqual(["5544984070700"])
  })

  it("usuário desativado para de receber sem ninguém editar a lista", async () => {
    usuarios = usuarios.map((u) => (u.id === "u-joabe" ? { ...u, is_active: false } : u))
    await chamar()
    expect(enviadoPara).toEqual(["5544984070700"])
  })

  it("sem env e sem lista, não envia nada e diz isso", async () => {
    process.env.DAILY_REPORT_RECIPIENTS = ""
    settings = {}
    const res = await chamar()
    const json = (await res.json()) as { skipped?: string }
    expect(json.skipped).toBeTruthy()
    expect(enviadoPara).toEqual([])
  })

  it("sem o CRON_SECRET correto, 401", async () => {
    const { GET } = await import("./route")
    const res = await GET({ headers: new Headers({ authorization: "Bearer errado" }) } as never)
    expect(res.status).toBe(401)
  })
})
