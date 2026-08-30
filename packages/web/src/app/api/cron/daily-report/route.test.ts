/**
 * Story 75-345 — o cron das 07:59 envia para quem está escolhido no CRM.
 * Story 900-23 — e roda para TODAS as organizações ativas, não só para a Trifold.
 *
 * O teste cobre a FIAÇÃO, que é onde estas stories podem falhar em silêncio: a rota podia
 * continuar lendo só a env e ninguém notaria até o Joabe reclamar que não recebeu;
 * e podia continuar atendendo uma org só e ninguém notaria até a segunda empresa existir.
 * `mergeRecipients` já é testada à parte.
 *
 * ⚠️ **Mudança de FORMA declarada (R3 da 900-23), não de garantia:** o corpo da resposta passou a
 * ser por organização (`resultados: [...]`). O `skipped` que era lido na raiz agora é lido dentro
 * do item da org. A garantia — "zero destinatário é explícito, nunca silencioso" — é a mesma.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

vi.mock("server-only", () => ({}))

const TRIFOLD = "00000000-0000-0000-0000-000000000001"
const ORG_B = "00000000-0000-0000-0000-0000000000b2"

/** `organizations` ativas na fixture. Trocar isto é o que exercita o multi-org. */
let orgsAtivas: Array<{ id: string; name: string }> = []
/** `settings` por org — a lista da tela de Configurações. */
let settingsPorOrg: Record<string, Record<string, unknown>> = {}
let usuarios: Array<Record<string, unknown>> = []
/** Envios observados: `[orgId, telefones]`. É o que este teste existe para observar. */
let enviadoPara: Array<[string, string[]]> = []
/** Orgs cujo `buildDailyLeadsReport` deve lançar — para os cenários de falha (C6). */
let orgsQueFalham = new Set<string>()

/** Fake do client CRU: só `organizations` passa por ele (é o que o helper lê). */
vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
          resolve({ data: orgsAtivas, error: null }),
      }
      return api
    },
  }),
}))

/**
 * Fake do client ESCOPADO: devolve o dado da org pedida. O `orgId` chega por closure porque é
 * exatamente o que o helper injeta — se a rota passasse o client errado, o `settings` viria da
 * org errada e o teste de escopo de env acenderia.
 */
vi.mock("@web/lib/supabase/org-scoped-admin", () => ({
  createOrgScopedAdminClient: (orgId: string) => ({
    __org: orgId,
    from: (tabela: string) => {
      // O fake HONRA `.in("id", ids)`: sem isso, a query de `users` devolveria todos os usuários
      // da fixture e o teste de não-vazamento passaria por acidente (a org B "receberia" o
      // telefone da Trifold vindo do próprio fake, não da env).
      let filtroIds: string[] | null = null
      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        in: (_coluna: string, valores: string[]) => {
          filtroIds = valores
          return api
        },
        maybeSingle: () =>
          Promise.resolve({ data: { settings: settingsPorOrg[orgId] ?? {} }, error: null }),
        then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
          if (tabela !== "users") return resolve({ data: [], error: null })
          const ids: string[] | null = filtroIds
          const linhas = ids === null ? usuarios : usuarios.filter((u) => ids.includes(u.id as string))
          return resolve({ data: linhas, error: null })
        },
      }
      return api
    },
  }),
}))

vi.mock("@web/lib/logger", () => ({ logEvent: vi.fn(), logEventOnce: vi.fn() }))

vi.mock("@web/lib/reports/daily-leads-report", () => ({
  buildDailyLeadsReport: async (db: { __org?: string }) => {
    if (db.__org && orgsQueFalham.has(db.__org)) {
      throw new Error(`falha sintética em ${db.__org}`)
    }
    return {
      data: "19/08",
      entrada: "20",
      canais: "WhatsApp 12",
      manuais: "3",
      patrocinados: "1",
      corretores: "Robson 8",
      distribuidos: "15 de 20",
      tempo: "12min",
    }
  },
}))

vi.mock("@web/lib/reports/send-daily-report", () => ({
  sendDailyReport: async (_db: unknown, orgId: string, recipients: string[]) => {
    enviadoPara.push([orgId, recipients])
    return { sent: recipients.length, errors: [] }
  },
}))

async function chamar() {
  const { GET } = await import("./route")
  const req = { headers: new Headers({ authorization: "Bearer segredo" }) }
  return GET(req as never)
}

type ItemOrg = {
  orgId: string
  org: string
  ok: boolean
  skipped?: string
  sent?: number
  erro?: string
}
type Corpo = { ok: boolean; total: number; sucesso: number; falha: number; resultados: ItemOrg[] }

const itemDa = (corpo: Corpo, orgId: string) => corpo.resultados.find((r) => r.orgId === orgId)!

beforeEach(() => {
  vi.resetModules()
  process.env.CRON_SECRET = "segredo"
  process.env.DAILY_REPORT_ORG_ID = TRIFOLD
  process.env.DAILY_REPORT_RECIPIENTS = "5544984070700" // Alexandre, como está hoje
  enviadoPara = []
  orgsQueFalham = new Set()
  orgsAtivas = [{ id: TRIFOLD, name: "Trifold" }]
  settingsPorOrg = { [TRIFOLD]: { relatorio_diario_destinatarios: ["u-alex", "u-joabe"] } }
  usuarios = [
    { id: "u-alex", name: "Alexandre", phone: "5544984070700", role: "admin", is_active: true },
    {
      id: "u-joabe",
      name: "Joabe",
      phone: "5544988441602",
      role: "gerente-comercial",
      is_active: true,
    },
  ]
})

describe("GET /api/cron/daily-report — comportamento com UMA org (produção hoje)", () => {
  it("envia para os escolhidos no CRM, sem duplicar quem também está na env", async () => {
    const res = await chamar()
    expect(res.status).toBe(200)
    // O telefone do Alexandre está nos dois lugares e sai UMA vez.
    expect(enviadoPara).toEqual([[TRIFOLD, ["5544984070700", "5544988441602"]]])
  })

  it("lista vazia no CRM = comportamento de antes da story (só a env)", async () => {
    settingsPorOrg = { [TRIFOLD]: {} }
    await chamar()
    expect(enviadoPara).toEqual([[TRIFOLD, ["5544984070700"]]])
  })

  it("usuário desativado para de receber sem ninguém editar a lista", async () => {
    usuarios = usuarios.map((u) => (u.id === "u-joabe" ? { ...u, is_active: false } : u))
    await chamar()
    expect(enviadoPara).toEqual([[TRIFOLD, ["5544984070700"]]])
  })

  it("sem env e sem lista, não envia nada e diz isso — no item da org (R3)", async () => {
    process.env.DAILY_REPORT_RECIPIENTS = ""
    settingsPorOrg = { [TRIFOLD]: {} }
    const res = await chamar()
    const json = (await res.json()) as Corpo
    // A garantia é a mesma de antes da 900-23; mudou o LUGAR onde ela é lida.
    expect(itemDa(json, TRIFOLD).skipped).toBeTruthy()
    expect(enviadoPara).toEqual([])
  })

  it("sem o CRON_SECRET correto, 401", async () => {
    const { GET } = await import("./route")
    const res = await GET({
      headers: new Headers({ authorization: "Bearer errado" }),
    } as never)
    expect(res.status).toBe(401)
  })
})

describe("Story 900-23 — duas organizações ativas", () => {
  beforeEach(() => {
    orgsAtivas = [
      { id: TRIFOLD, name: "Trifold" },
      { id: ORG_B, name: "Empresa B" },
    ]
  })

  it("cada org recebe o relatório dela — duas execuções, dois orgIds", async () => {
    settingsPorOrg = {
      [TRIFOLD]: { relatorio_diario_destinatarios: ["u-alex"] },
      [ORG_B]: { relatorio_diario_destinatarios: ["u-joabe"] },
    }
    const res = await chamar()
    expect(res.status).toBe(200)
    expect(enviadoPara.map(([org]) => org)).toEqual([TRIFOLD, ORG_B])
  })

  it("🔴 os telefones de DAILY_REPORT_RECIPIENTS NÃO vazam para a org B", async () => {
    // Este é o vazamento que a própria correção criaria: a env é um canal global sem destino por
    // org. Sem o escopo, `5544984070700` receberia as métricas de negócio da Empresa B.
    settingsPorOrg = {
      [TRIFOLD]: {},
      [ORG_B]: { relatorio_diario_destinatarios: ["u-joabe"] },
    }
    await chamar()

    const daTrifold = enviadoPara.find(([org]) => org === TRIFOLD)!
    const daOrgB = enviadoPara.find(([org]) => org === ORG_B)!
    expect(daTrifold[1]).toEqual(["5544984070700"]) // só a env, como hoje
    expect(daOrgB[1]).toEqual(["5544988441602"]) // só a tela dela
    expect(daOrgB[1]).not.toContain("5544984070700")
  })

  it("org B sem destinatário nenhum fica `skipped` e NÃO interrompe a Trifold", async () => {
    settingsPorOrg = { [TRIFOLD]: { relatorio_diario_destinatarios: ["u-alex"] }, [ORG_B]: {} }
    const res = await chamar()
    const json = (await res.json()) as Corpo
    expect(res.status).toBe(200)
    expect(itemDa(json, ORG_B).skipped).toBeTruthy()
    expect(enviadoPara.map(([org]) => org)).toEqual([TRIFOLD])
  })
})

describe("C6 — Propriedade 5 amarrada NA ROTA, não só na função pura", () => {
  it("2 orgs, 1 falha ⇒ 200, e o corpo identifica QUAL org falhou", async () => {
    orgsAtivas = [
      { id: TRIFOLD, name: "Trifold" },
      { id: ORG_B, name: "Empresa B" },
    ]
    settingsPorOrg = {
      [TRIFOLD]: { relatorio_diario_destinatarios: ["u-alex"] },
      [ORG_B]: { relatorio_diario_destinatarios: ["u-joabe"] },
    }
    orgsQueFalham = new Set([ORG_B])

    const res = await chamar()
    const json = (await res.json()) as Corpo
    expect(res.status).toBe(200)
    expect(json.sucesso).toBe(1)
    expect(json.falha).toBe(1)
    const b = itemDa(json, ORG_B)
    expect(b.ok).toBe(false)
    expect(b.org).toBe("Empresa B")
    expect(b.erro).toContain("falha sintética")
    // E a Trifold foi processada apesar da falha da vizinha.
    expect(itemDa(json, TRIFOLD).ok).toBe(true)
  })

  it("2 orgs, AMBAS falham ⇒ 500", async () => {
    orgsAtivas = [
      { id: TRIFOLD, name: "Trifold" },
      { id: ORG_B, name: "Empresa B" },
    ]
    settingsPorOrg = {
      [TRIFOLD]: { relatorio_diario_destinatarios: ["u-alex"] },
      [ORG_B]: { relatorio_diario_destinatarios: ["u-joabe"] },
    }
    orgsQueFalham = new Set([TRIFOLD, ORG_B])

    const res = await chamar()
    expect(res.status).toBe(500)
  })

  it("ZERO orgs ativas ⇒ 200 e zero envios (nada para fazer não é falha)", async () => {
    orgsAtivas = []
    const res = await chamar()
    const json = (await res.json()) as Corpo
    expect(res.status).toBe(200)
    expect(json.total).toBe(0)
    expect(json.resultados).toEqual([])
    expect(enviadoPara).toEqual([])
  })
})
