/**
 * Story 75-342 — o gráfico "Leads por Período" conta ENTRADAS.
 *
 * Esta rota não tinha teste nenhum. Foi por isso que ela atravessou três stories
 * de auditoria de Analytics (75-269, 75-321..326, 75-341) sendo a única série
 * temporal recortada pelo DESFECHO do lead: `is_active` + `lost_reason` na query
 * faziam a barra de um dia encolher depois, quando alguém marcasse como perdido
 * um lead entrado naquele dia.
 *
 * O que os casos abaixo travam, nesta ordem de importância:
 *   1. lead perdido/inativo CONTA (é a mudança);
 *   2. lead IMOB NÃO conta (é o recorte que precisa sobreviver à mudança —
 *      "tirar filtro" não pode virar "tirar filtro demais");
 *   3. o total fecha com a soma das barras (a régua e o card comparam com ele);
 *   4. a paginação segura o recorte novo, que é maior que o antigo.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

vi.mock("server-only", () => ({}))

const APP_USER = { id: "user-1", org_id: "org-1", orgId: "org-1", role: "admin", name: "Marcos" }
let capabilityNegada = false

vi.mock("@web/lib/api-auth", () => ({
  requireAuth: async () => ({
    error: null,
    supabase: { from: (t: string) => query(t as keyof Db) },
    appUser: APP_USER,
  }),
  requireCapability: async () =>
    capabilityNegada ? new Response(JSON.stringify({ error: "sem permissão" }), { status: 403 }) : null,
}))

type Row = Record<string, unknown>
type Db = { leads: Row[]; properties: Row[] }
let db: Db

/**
 * Query mínima do PostgREST com filtros REAIS. O `.is()` está implementado de
 * propósito: se alguém devolver `.is("lost_reason", null)` para a rota, o fake
 * obedece e os casos de lead perdido caem — que é exatamente o alarme que falta
 * hoje.
 */
function query(table: keyof Db) {
  const preds: ((r: Row) => boolean)[] = []
  let faixa: [number, number] | null = null

  const api: Record<string, unknown> = {
    select: () => api,
    eq: (c: string, v: unknown) => {
      preds.push((r) => String(r[c]) === String(v))
      return api
    },
    is: (c: string, v: null) => {
      preds.push((r) => (r[c] ?? null) === v)
      return api
    },
    gte: (c: string, v: string) => {
      preds.push((r) => String(r[c]) >= v)
      return api
    },
    lte: (c: string, v: string) => {
      preds.push((r) => String(r[c]) <= v)
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

const JANELA_DE = "2026-08-11T00:00:00.000Z"
const JANELA_ATE = "2026-08-18T23:59:59.999Z"
const CASA_VERDE = "prop-1"
const YARDEN = "prop-2"

function lead(id: string, extra: Row = {}): Row {
  return {
    id,
    org_id: "org-1",
    segmento: "principal",
    created_at: "2026-08-12T12:00:00.000Z",
    property_interest_id: CASA_VERDE,
    source: "meta_ads",
    is_active: true,
    lost_reason: null,
    ...extra,
  }
}

function estadoBase() {
  capabilityNegada = false
  db = {
    properties: [
      { id: CASA_VERDE, name: "Casa Verde", is_active: true },
      { id: YARDEN, name: "Yarden", is_active: true },
    ],
    leads: [
      lead("vivo-1"),
      lead("vivo-2", { created_at: "2026-08-13T12:00:00.000Z", property_interest_id: YARDEN }),
      // A diferença que o Marcos viu: 62 na régua × 52 no gráfico.
      lead("perdido", { lost_reason: "Sem interesse", source: "indicacao" }),
      lead("inativo", { is_active: false }),
      // IMOB nunca entra no analytics principal (Story 75-98).
      lead("imob", { segmento: "imob" }),
      // Fora da janela.
      lead("antigo", { created_at: "2026-07-02T12:00:00.000Z" }),
      // Outra org (o RLS já separa em produção; aqui é cinto de segurança).
      lead("outra-org", { org_id: "org-2" }),
    ],
  }
}

interface Resposta {
  data: Array<{ period: string; count: number; byProperty: Record<string, number> }>
  summary: {
    total: number
    dailyAvg: number
    peakPeriod: string
    peakCount: number
    sources: Record<string, number>
  }
}

async function get(params: Record<string, string> = {}) {
  const { GET } = await import("./route")
  const sp = new URLSearchParams({ from: JANELA_DE, to: JANELA_ATE, granularity: "day", ...params })
  const res = await GET({ nextUrl: { searchParams: sp } } as never)
  return { status: res.status, json: (await res.json()) as Resposta }
}

beforeEach(() => {
  estadoBase()
  vi.resetModules()
})

describe("GET /api/analytics/leads-by-period", () => {
  it("conta o lead PERDIDO na barra do dia dele e no total", async () => {
    const { status, json } = await get()
    expect(status).toBe(200)

    // vivo-1, perdido e inativo entraram em 12/08; vivo-2 em 13/08.
    const dia12 = json.data.find((d) => d.period === "2026-08-12")!
    expect(dia12.count).toBe(3)
    expect(json.summary.total).toBe(4)
  })

  it("o lead INATIVO também conta (desfecho não decide volume de entrada)", async () => {
    db.leads = db.leads.filter((l) => l.id !== "perdido")
    const { json } = await get()
    const dia12 = json.data.find((d) => d.period === "2026-08-12")!
    expect(dia12.count).toBe(2) // vivo-1 + inativo
    expect(json.summary.total).toBe(3)
  })

  it("IMOB continua fora — tirar o filtro de desfecho não abriu essa porta", async () => {
    const { json } = await get()
    // 5 leads da org-1 na janela, menos o IMOB.
    expect(json.summary.total).toBe(4)

    db.leads.push(lead("imob-2", { segmento: "imob", created_at: "2026-08-14T12:00:00.000Z" }))
    const depois = await get()
    expect(depois.json.summary.total).toBe(4)
    expect(depois.json.data.find((d) => d.period === "2026-08-14")!.count).toBe(0)
  })

  it("o total fecha com a soma das barras", async () => {
    const { json } = await get()
    const soma = json.data.reduce((s, d) => s + d.count, 0)
    expect(json.summary.total).toBe(soma)
    // E a janela inteira aparece, com os dias vazios zerados.
    expect(json.data).toHaveLength(8)
    expect(json.data[0]!.period).toBe("2026-08-11")
    expect(json.data.at(-1)!.period).toBe("2026-08-18")
  })

  it("o dropdown de Origem enxerga a origem que só o lead perdido tinha", async () => {
    const { json } = await get()
    // "indicacao" só existe no lead perdido: com o filtro antigo, a origem
    // sumia do dropdown e não havia como selecioná-la.
    expect(json.summary.sources.indicacao).toBe(1)
    expect(json.summary.sources.meta_ads).toBe(3)
  })

  it("filtro de origem e de empreendimento seguem valendo sobre a base nova", async () => {
    const porOrigem = await get({ source: "indicacao" })
    expect(porOrigem.json.summary.total).toBe(1) // o perdido

    const porEmpreendimento = await get({ property: YARDEN })
    expect(porEmpreendimento.json.summary.total).toBe(1) // vivo-2
    // O tooltip continua mostrando TODOS os empreendimentos do dia.
    const dia12 = porEmpreendimento.json.data.find((d) => d.period === "2026-08-12")!
    expect(dia12.byProperty["Casa Verde"]).toBe(3)
    expect(dia12.count).toBe(0)
  })

  it("pagina acima de 1000 — o recorte novo é maior que o antigo", async () => {
    // Sem o laço de `fetchAllLeads`, o PostgREST cortaria em 1000 sem avisar e o
    // gráfico de 90 dias mostraria menos. Com o filtro de desfecho fora, o
    // recorte desta rota virou o mesmo do /executive (1.650 leads em 90d em
    // prod), então o teto deixou de ser hipotético.
    db.leads = Array.from({ length: 1001 }, (_, i) =>
      lead(`bulk-${i}`, { created_at: "2026-08-15T12:00:00.000Z" })
    )
    const { json } = await get()
    expect(json.summary.total).toBe(1001)
    expect(json.data.find((d) => d.period === "2026-08-15")!.count).toBe(1001)
  })

  it("média diária e pico saem da mesma base", async () => {
    const { json } = await get()
    expect(json.summary.peakPeriod).toBe("2026-08-12")
    expect(json.summary.peakCount).toBe(3) // inclui perdido e inativo
    expect(json.summary.dailyAvg).toBe(0.5) // 4 leads / 8 dias
  })

  it("sem capability, 403", async () => {
    capabilityNegada = true
    const { GET } = await import("./route")
    const sp = new URLSearchParams({ from: JANELA_DE, to: JANELA_ATE })
    const res = await GET({ nextUrl: { searchParams: sp } } as never)
    expect(res.status).toBe(403)
  })

  it("from/to obrigatórios e granularidade validada", async () => {
    const { GET } = await import("./route")
    const semJanela = await GET({ nextUrl: { searchParams: new URLSearchParams() } } as never)
    expect(semJanela.status).toBe(400)

    const ruim = await get({ granularity: "decada" })
    expect(ruim.status).toBe(400)
  })
})
