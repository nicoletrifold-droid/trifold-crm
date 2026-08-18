/**
 * Story 75-341 — o drill-down do funil.
 *
 * O risco que este teste cobre não é "a rota responde": é a rota responder uma
 * lista que NÃO é o conjunto do número clicado. Isso passaria despercebido para
 * sempre — ninguém conta 37 linhas na mão para conferir um card.
 *
 * Por isso o fake aplica os filtros de verdade e os casos comparam a lista contra
 * a contagem que a própria tela calcula (`buildPipelineRows`), com os MESMOS dados.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import { buildPipelineRows } from "@web/lib/analytics/funnel-reached"

vi.mock("server-only", () => ({}))

const APP_USER = { id: "user-1", org_id: "org-1", role: "admin", name: "Marcos" }
let capabilityNegada = false

vi.mock("@web/lib/api-auth", () => ({
  requireAuth: async () => ({ error: null, supabase: { from: (t: string) => query(t as keyof Db) }, appUser: APP_USER }),
  requireCapability: async () =>
    capabilityNegada ? new Response(JSON.stringify({ error: "sem permissão" }), { status: 403 }) : null,
}))

type Row = Record<string, unknown>
type Db = { leads: Row[]; activities: Row[]; kanban_stages: Row[]; users: Row[] }
let db: Db

/** Query mínima do PostgREST com filtros REAIS (eq/gte/lt/in/range). */
function query(table: keyof Db) {
  const preds: ((r: Row) => boolean)[] = []
  let faixa: [number, number] | null = null

  const api: Record<string, unknown> = {
    select: () => api,
    eq: (c: string, v: unknown) => {
      preds.push((r) => String(r[c]) === String(v))
      return api
    },
    ilike: (c: string, v: string) => {
      const alvo = v.replace(/%/g, "").toLowerCase()
      preds.push((r) => String(r[c] ?? "").toLowerCase().includes(alvo))
      return api
    },
    in: (c: string, vs: unknown[]) => {
      preds.push((r) => vs.map(String).includes(String(r[c])))
      return api
    },
    gte: (c: string, v: string) => {
      preds.push((r) => String(r[c]) >= v)
      return api
    },
    lt: (c: string, v: string) => {
      preds.push((r) => String(r[c]) < v)
      return api
    },
    order: () => api,
    range: (de: number, ate: number) => {
      faixa = [de, ate]
      return api
    },
    then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
      const rows = db[table].filter((r) => preds.every((p) => p(r)))
      const recorte = faixa ? rows.slice(faixa[0], faixa[1] + 1) : rows
      return resolve({ data: recorte, error: null })
    },
  }
  return api
}

const NOVO = "stage-novo"
const VISITA = "stage-visita"
const FECHOU = "stage-fechou"
const REPRESAMENTO = "stage-represamento"

const JANELA_DE = "2026-07-19T00:00:00.000Z"
const JANELA_ATE = "2026-08-18T00:00:00.000Z"

function lead(id: string, stage: string, extra: Row = {}): Row {
  return {
    id,
    org_id: "org-1",
    segmento: "principal",
    name: `Lead ${id}`,
    phone: `4499999${id.slice(-4)}`,
    stage_id: stage,
    created_at: "2026-07-27T12:00:00.000Z",
    assigned_broker_id: null,
    source: "website",
    ...extra,
  }
}

/** activity de mudança de etapa, no formato que o trigger 124 grava. */
function mudanca(leadId: string, de: string | null, para: string): Row {
  return {
    id: `act-${leadId}-${para}`,
    org_id: "org-1",
    lead_id: leadId,
    type: "stage_change",
    created_at: "2026-07-27T16:31:00.000Z",
    metadata: {
      from_stage: de ? { id: de, name: de } : null,
      to_stage: { id: para, name: para },
    },
  }
}

function estadoBase() {
  capabilityNegada = false
  db = {
    kanban_stages: [
      { id: NOVO, org_id: "org-1", name: "Novo", slug: "novo", color: "#111", position: 1, is_active: true },
      { id: VISITA, org_id: "org-1", name: "Visita Agendada", slug: "visita-agendada", color: "#222", position: 4, is_active: true },
      { id: FECHOU, org_id: "org-1", name: "Fechamento", slug: "fechou", color: "#333", position: 11, is_active: true },
      { id: REPRESAMENTO, org_id: "org-1", name: "Represamento", slug: "represamento", color: "#444", position: 12, is_active: true },
    ],
    // O caso real de 18/08: passou por Fechamento e hoje está em Represamento.
    leads: [
      lead("lead-simone", REPRESAMENTO, { name: "Simone Fogliato Flores", assigned_broker_id: "broker-1" }),
      lead("lead-ana", VISITA, { name: "Ana" }),
      lead("lead-bruno", NOVO, { name: "Bruno" }),
      // IMOB: não pode aparecer em NADA do analytics (Story 75-98).
      lead("lead-imob", FECHOU, { name: "Imob Fantasma", segmento: "imob" }),
      // Fora da janela: entrou antes do período.
      lead("lead-antigo", FECHOU, { name: "Antigo", created_at: "2026-01-05T12:00:00.000Z" }),
      // Outra org.
      lead("lead-outra-org", FECHOU, { name: "Outra Org", org_id: "org-2" }),
    ],
    activities: [
      mudanca("lead-simone", VISITA, FECHOU),
      mudanca("lead-simone", FECHOU, REPRESAMENTO),
      mudanca("lead-imob", VISITA, FECHOU), // IMOB no histórico: precisa ser descartado
      mudanca("lead-outra-org", VISITA, FECHOU),
    ],
    users: [{ id: "broker-1", name: "Corretor Um" }],
  }
}

async function get(params: Record<string, string>) {
  const { GET } = await import("./route")
  const sp = new URLSearchParams({ from: JANELA_DE, to: JANELA_ATE, ...params })
  const req = { nextUrl: { searchParams: sp } }
  return GET(req as never)
}

beforeEach(() => {
  estadoBase()
  vi.resetModules()
})

describe("GET /api/analytics/funnel-leads", () => {
  it("modo chegaram: devolve quem PASSOU pela etapa, com a etapa de hoje", async () => {
    const res = await get({ stage: FECHOU, modo: "chegaram" })
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      total: number
      stage: { name: string }
      leads: Array<{ name: string; etapa_atual: string; corretor: string | null; phone: string }>
    }

    expect(json.stage.name).toBe("Fechamento")
    expect(json.total).toBe(1)
    expect(json.leads[0]!.name).toBe("Simone Fogliato Flores")
    // É o que explica a dúvida do Marcos: no funil ela conta em Fechamento, no
    // Pipeline ela está em Represamento.
    expect(json.leads[0]!.etapa_atual).toBe("Represamento")
    expect(json.leads[0]!.corretor).toBe("Corretor Um")
    expect(json.leads[0]!.phone).toBeTruthy()
  })

  it("modo agora: devolve só quem está na etapa hoje", async () => {
    const res = await get({ stage: FECHOU, modo: "agora" })
    const json = (await res.json()) as { total: number; leads: unknown[] }
    // A Simone chegou lá, mas não está — e o lead IMOB que ESTÁ não conta.
    expect(json.total).toBe(0)
    expect(json.leads).toEqual([])
  })

  it("a lista bate EXATAMENTE com a contagem que a tela mostra", async () => {
    // A mesma entrada que a página usa, pelo mesmo caminho.
    const cohort = db.leads
      .filter((l) => l.org_id === "org-1" && l.segmento === "principal")
      .filter((l) => String(l.created_at) >= JANELA_DE && String(l.created_at) < JANELA_ATE)
      .map((l) => ({ id: l.id as string, stage_id: l.stage_id as string }))
    const rows = buildPipelineRows(
      cohort,
      db.activities.map((a) => ({ lead_id: a.lead_id as string, metadata: a.metadata })),
      db.kanban_stages as never
    )

    for (const row of rows) {
      for (const modo of ["chegaram", "agora"] as const) {
        const res = await get({ stage: row.id, modo })
        const json = (await res.json()) as { total: number }
        expect(json.total, `${row.name}/${modo}`).toBe(modo === "chegaram" ? row.chegaram : row.agora)
      }
    }
  })

  it("IMOB não entra por nenhuma das duas portas (coorte nem histórico)", async () => {
    const chegaram = (await (await get({ stage: FECHOU, modo: "chegaram" })).json()) as {
      leads: Array<{ name: string }>
    }
    const agora = (await (await get({ stage: FECHOU, modo: "agora" })).json()) as {
      leads: Array<{ name: string }>
    }
    const nomes = [...chegaram.leads, ...agora.leads].map((l) => l.name)
    expect(nomes).not.toContain("Imob Fantasma")
  })

  it("respeita o filtro de corretor da tela", async () => {
    // `broker_id` é o nome do param na tela (FILTER_SPEC), não `broker`.
    const res = await get({ stage: FECHOU, modo: "chegaram", broker_id: "broker-2" })
    const json = (await res.json()) as { total: number }
    expect(json.total).toBe(0) // a Simone é do broker-1

    // E o contrário: com o corretor DELA, ela aparece — senão o teste acima
    // passaria também com o filtro simplesmente zerando tudo.
    const dela = (await (await get({ stage: FECHOU, modo: "chegaram", broker_id: "broker-1" })).json()) as {
      total: number
    }
    expect(dela.total).toBe(1)
  })

  it("etapa inexistente → 404; período inválido → 400; sem stage → 400", async () => {
    expect((await get({ stage: "stage-fantasma", modo: "chegaram" })).status).toBe(404)
    expect((await get({ stage: FECHOU, modo: "chegaram", to: JANELA_DE })).status).toBe(400)
    expect((await get({ modo: "chegaram" })).status).toBe(400)
  })

  it("sem a capability de analytics, não devolve lista de leads", async () => {
    capabilityNegada = true
    const res = await get({ stage: FECHOU, modo: "chegaram" })
    expect(res.status).toBe(403)
  })
})
