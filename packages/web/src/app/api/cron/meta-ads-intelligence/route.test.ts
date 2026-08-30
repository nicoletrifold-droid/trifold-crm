/**
 * Story 900-23 · AC4 — o `meta-ads-intelligence` deixou de processar só a primeira organização.
 *
 * O defeito original: `const orgId = accounts[0]!.org_id` (`route.ts:231` em `e8ea5433`) alimentava
 * **9** usos — 7 `.eq("org_id", orgId)` e 2 escritas (`meta_sync_log` e o `org_id` das linhas de
 * `meta_alerts`). Com contas de anúncio de duas empresas, o cron lia, alertava e registrava
 * `status: "success"` **só para a primeira** — e devolvia 200.
 *
 * O fake abaixo é uma tabela em memória que HONRA `.eq()/.in()/.gte()/.lte()/.limit()`. Um fake
 * que ignorasse os filtros faria todo teste de escopo passar por acidente: cada org "veria" o dado
 * da outra vindo do próprio fake, não do código.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const ORG_A = "00000000-0000-0000-0000-0000000000a1"
const ORG_B = "00000000-0000-0000-0000-0000000000b2"

type Linha = Record<string, unknown>

let tabelas: Record<string, Linha[] | undefined> = {}
/** Acesso não-opcional às tabelas semeadas no `beforeEach`. */
const tab = (nome: string): Linha[] => (tabelas[nome] ??= [])
/** Escritas observadas — é o que o teste afirma sobre `meta_sync_log` e `meta_alerts`. */
let upserts: Array<{ tabela: string; linhas: Linha[] }> = []
/** `(tabela, orgId)` que devem lançar — para o cenário de "org B falha, org A não". */
let falhaEm: Array<{ tabela: string; orgId: string }> = []

let proximoId = 1

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

function combina(linha: Linha, filtros: Array<[string, string, unknown]>): boolean {
  return filtros.every(([op, col, val]) => {
    const v = linha[col]
    if (op === "eq") return v === val
    if (op === "in") return (val as unknown[]).includes(v)
    if (op === "gte") return String(v) >= String(val)
    if (op === "lte") return String(v) <= String(val)
    return true
  })
}

function criarBuilder(tabela: string) {
  const filtros: Array<[string, string, unknown]> = []
  let limite: number | null = null
  let colunas: string | undefined

  const resolver = () => {
    const org = filtros.find(([op, col]) => op === "eq" && col === "org_id")?.[2] as
      | string
      | undefined
    if (org && falhaEm.some((f) => f.tabela === tabela && f.orgId === org)) {
      throw new Error(`falha sintética em ${tabela} da org ${org}`)
    }
    let linhas = (tabelas[tabela] ?? []).filter((l) => combina(l, filtros))
    if (limite !== null) linhas = linhas.slice(0, limite)
    return { data: linhas.map((l) => projetar(l, colunas)), error: null }
  }

  const api: Record<string, unknown> = {
    select: (c?: string) => {
      colunas = c
      return api
    },
    eq: (c: string, v: unknown) => {
      filtros.push(["eq", c, v])
      return api
    },
    in: (c: string, v: unknown[]) => {
      filtros.push(["in", c, v])
      return api
    },
    gte: (c: string, v: unknown) => {
      filtros.push(["gte", c, v])
      return api
    },
    lte: (c: string, v: unknown) => {
      filtros.push(["lte", c, v])
      return api
    },
    limit: (n: number) => {
      limite = n
      return api
    },
    single: async () => {
      const { data } = resolver()
      return { data: data[0] ?? null, error: null }
    },
    maybeSingle: async () => {
      const { data } = resolver()
      return { data: data[0] ?? null, error: null }
    },
    then: (resolve: (v: unknown) => unknown) => resolve(resolver()),

    insert: (payload: Linha) => {
      const linha = { id: `id-${proximoId++}`, ...payload }
      tabelas[tabela] = [...(tabelas[tabela] ?? []), linha]
      return {
        select: () => ({ single: async () => ({ data: { id: linha.id }, error: null }) }),
      }
    },
    update: (patch: Linha) => ({
      eq: async (c: string, v: unknown) => {
        for (const linha of tabelas[tabela] ?? []) {
          if (linha[c] === v) Object.assign(linha, patch)
        }
        return { error: null }
      },
    }),
    upsert: async (linhas: Linha[]) => {
      upserts.push({ tabela, linhas })
      return { error: null }
    },
  }
  return api
}

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (tabela: string) => criarBuilder(tabela) }),
}))

const SECRET = "segredo"

function req(auth = `Bearer ${SECRET}`) {
  return new Request("https://x.test/api/cron/meta-ads-intelligence", {
    headers: { authorization: auth },
  })
}

const ontem = () => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().split("T")[0]!
}

/**
 * Fixture de uma org que produz **pelo menos um alerta** (`zero_leads_active`): campanha ACTIVE
 * com gasto de 3 dias acima do limiar e zero leads que responderam.
 */
function semearOrg(orgId: string, sufixo: string) {
  const dia = ontem()
  tab("meta_ad_accounts").push({
    id: `acc-${sufixo}`,
    org_id: orgId,
    meta_account_id: `act_${sufixo}`,
    name: `Conta ${sufixo}`,
    status: "active",
  })
  tab("meta_campaigns").push({
    meta_campaign_id: `camp-${sufixo}`,
    name: `Campanha ${sufixo}`,
    status: "ACTIVE",
    org_id: orgId,
    daily_budget: 10000,
  })
  for (let i = 0; i < 3; i++) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - (i + 1))
    tab("meta_insights_daily").push({
      id: `ins-${sufixo}-${i}`,
      org_id: orgId,
      level: "campaign",
      entity_id: `camp-${sufixo}`,
      date: d.toISOString().split("T")[0]!,
      leads: 0,
      spend: 200,
      frequency: 1,
    })
  }
  // Garante que a checagem "existe dado de ontem" encontre a linha desta org.
  expect(tab("meta_insights_daily").some((l) => l.org_id === orgId && l.date === dia)).toBe(true)
}

beforeEach(() => {
  vi.resetModules()
  process.env.CRON_SECRET = SECRET
  proximoId = 1
  upserts = []
  falhaEm = []
  tabelas = {
    meta_ad_accounts: [],
    meta_campaigns: [],
    meta_insights_daily: [],
    meta_ads: [],
    leads: [],
    meta_sync_log: [],
    meta_alerts: [],
  }
})

async function chamar(auth?: string) {
  const { GET } = await import("./route")
  return GET(req(auth) as never)
}

type Corpo = {
  ok: boolean
  orgs: number
  campaigns_analyzed: number
  alerts_fired: number
  por_org: Array<Record<string, unknown>>
}

describe("meta-ads-intelligence — guardas", () => {
  it("authorization errado ⇒ 401", async () => {
    const res = await chamar("Bearer errado")
    expect(res.status).toBe(401)
  })

  it("nenhuma conta ativa ⇒ skipped, sem laço", async () => {
    const res = await chamar()
    const body = (await res.json()) as { skipped?: string }
    expect(body.skipped).toBe("no_active_accounts")
  })
})

describe("900-23 · AC4 — contas de DUAS orgs", () => {
  beforeEach(() => {
    semearOrg(ORG_A, "a")
    semearOrg(ORG_B, "b")
  })

  it("🔴 processa as DUAS orgs — reverter para `accounts[0].org_id` deixa isto vermelho", async () => {
    const res = await chamar()
    const body = (await res.json()) as Corpo
    expect(res.status).toBe(200)
    expect(body.orgs).toBe(2)
    expect(body.por_org.map((o) => o.orgId)).toEqual([ORG_A, ORG_B])
    // Cada org tem a própria campanha analisada — 1 + 1, nunca 1 só.
    expect(body.campaigns_analyzed).toBe(2)
  })

  it("🔴 `meta_sync_log` tem DUAS linhas, uma por org — nunca uma sobrescrita", async () => {
    await chamar()
    const logs = tabelas.meta_sync_log!
    expect(logs).toHaveLength(2)
    expect(logs.map((l) => l.org_id)).toEqual([ORG_A, ORG_B])
    expect(logs.every((l) => l.status === "success")).toBe(true)
  })

  it("🔴 R7 — `meta_alerts` recebe o org_id de CADA org, nunca as duas com o da primeira", async () => {
    await chamar()
    const alertas = upserts.filter((u) => u.tabela === "meta_alerts").flatMap((u) => u.linhas)
    expect(alertas.length).toBeGreaterThanOrEqual(2)
    const orgsDosAlertas = new Set(alertas.map((a) => a.org_id))
    expect([...orgsDosAlertas].sort()).toEqual([ORG_A, ORG_B])
    // E o alerta da campanha "b" carrega o org B, não o A.
    const doB = alertas.find((a) => String(a.entity_id).includes("camp-b"))!
    expect(doB.org_id).toBe(ORG_B)
  })

  it("sem dado de ontem só na 1ª org ⇒ ela fica `skipped` e a 2ª é processada normalmente", async () => {
    tabelas.meta_insights_daily = tabelas.meta_insights_daily!.filter(
      (l) => !(l.org_id === ORG_A && l.date === ontem()),
    )
    const res = await chamar()
    const body = (await res.json()) as Corpo
    expect(res.status).toBe(200)
    const a = body.por_org.find((o) => o.orgId === ORG_A)!
    const b = body.por_org.find((o) => o.orgId === ORG_B)!
    expect(a.skipped).toBe("no_yesterday_data")
    expect(b.campaigns_analyzed).toBe(1)
  })

  it("🔴 exceção só na 2ª org: a 1ª fica `success`, a 2ª fica `error` com mensagem", async () => {
    falhaEm = [{ tabela: "meta_campaigns", orgId: ORG_B }]
    const res = await chamar()
    const body = (await res.json()) as Corpo

    // Nunca 500 geral: a org saudável não pode ser derrubada pela vizinha.
    expect(res.status).toBe(200)
    expect(body.ok).toBe(false)

    const logs = tabelas.meta_sync_log!
    expect(logs).toHaveLength(2)
    const logA = logs.find((l) => l.org_id === ORG_A)!
    const logB = logs.find((l) => l.org_id === ORG_B)!
    expect(logA.status).toBe("success")
    expect(logB.status).toBe("error")
    expect(String(logB.error_message)).toContain("falha sintética")

    const b = body.por_org.find((o) => o.orgId === ORG_B)!
    expect(b.ok).toBe(false)
    expect(String(b.error)).toContain("falha sintética")
    expect(body.por_org.find((o) => o.orgId === ORG_A)!.campaigns_analyzed).toBe(1)
  })
})
