/**
 * Story 75-331 — fluxo do POST da agenda pública.
 *
 * Este teste existe por recomendação explícita do gate @qa da 75-330: os dois
 * defeitos bloqueantes daquela story eram de JUNÇÃO entre peças corretas, e
 * teste de função pura não os pegaria. Aqui o alvo é a junção mesmo — a visita
 * chega a ser gravada? o lead troca de dono? o segundo POST duplica?
 *
 * O fake aplica `.eq()`/`.in()` DE VERDADE. Um fake que aceita filtro e devolve
 * tudo dá confiança falsa — já aconteceu neste projeto.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

// A matemática da grade (fuso, hora cheia, expediente) já tem cobertura própria
// em imob-slots.test.ts. Aqui ela é ruído: o alvo é o fluxo.
vi.mock("@web/lib/appointments/imob-slots", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@web/lib/appointments/imob-slots")>()),
  isValidImobSlot: () => true,
}))
vi.mock("@web/lib/roleta/business-time", () => ({
  getOrgSchedule: async () => ({ week: {}, timezone: "America/Sao_Paulo" }),
}))

const mirrored: unknown[] = []
vi.mock("@web/lib/appointments/google-mirror", () => ({
  mirrorCreate: async (...args: unknown[]) => {
    mirrored.push(args)
    return null
  },
}))

const avancados: string[] = []
vi.mock("@trifold/shared", () => ({
  advanceToVisitaAgendada: async (_c: unknown, leadId: string) => {
    avancados.push(leadId)
  },
}))

type Row = Record<string, unknown>
/** Tabelas fixas: o índice é sempre definido, o que mantém os asserts diretos. */
type Db = {
  lead_forms: Row[]
  lead_form_responses: Row[]
  leads: Row[]
  users: Row[]
  appointments: Row[]
  activities: Row[]
}
let db: Db

/** Query mínima do PostgREST com filtros REAIS. */
function query(table: keyof Db) {
  const preds: ((r: Row) => boolean)[] = []
  let payload: Row | null = null
  let mode: "select" | "insert" | "update" = "select"

  const api: Record<string, unknown> = {
    select: () => api,
    eq: (c: string, v: unknown) => {
      preds.push((r) => String(r[c]) === String(v))
      return api
    },
    in: (c: string, vs: unknown[]) => {
      preds.push((r) => vs.map(String).includes(String(r[c])))
      return api
    },
    gte: () => api,
    lte: () => api,
    limit: () => api,
    insert: (p: Row) => {
      mode = "insert"
      payload = p
      return api
    },
    update: (p: Row) => {
      mode = "update"
      payload = p
      return api
    },
    maybeSingle: async () => {
      const rows = (db[table] ?? []).filter((r) => preds.every((p) => p(r)))
      return { data: rows[0] ?? null, error: null }
    },
    single: async () => {
      if (mode === "insert") {
        const row = { id: `${table}-${(db[table]?.length ?? 0) + 1}`, ...(payload as Row) }
        db[table] = [...(db[table] ?? []), row]
        return { data: row, error: null }
      }
      const rows = (db[table] ?? []).filter((r) => preds.every((p) => p(r)))
      return { data: rows[0] ?? null, error: null }
    },
    then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
      if (mode === "insert") {
        const row = { id: `${table}-${(db[table]?.length ?? 0) + 1}`, ...(payload as Row) }
        db[table] = [...(db[table] ?? []), row]
        return resolve({ data: [row], error: null })
      }
      if (mode === "update") {
        db[table] = (db[table] ?? []).map((r) =>
          preds.every((p) => p(r)) ? { ...r, ...(payload as Row) } : r
        )
        return resolve({ data: null, error: null })
      }
      const rows = (db[table] ?? []).filter((r) => preds.every((p) => p(r)))
      return resolve({ data: rows, error: null })
    },
  }
  return api
}

vi.mock("@web/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (t: string) => query(t as keyof Db) }),
}))

const TOKEN = "11111111-1111-4111-8111-111111111111"
const SESSAO = "22222222-2222-4222-8222-222222222222"
const AMANHA = new Date(Date.now() + 24 * 3600_000)
AMANHA.setMinutes(0, 0, 0)

function estadoBase() {
  db = {
    lead_forms: [
      {
        id: "form-1",
        org_id: "org-1",
        nome: "Campanha Vind",
        is_active: true,
        token: TOKEN,
        schema: {
          perguntas: [{ id: "n", tipo: "texto", titulo: "Nome", campo_contato: "nome" }],
          agenda: { ativa: true, local: "Decorado Vind" },
        },
      },
    ],
    lead_form_responses: [
      { id: "resp-1", form_id: "form-1", session_token: SESSAO, status: "completa", lead_id: "lead-1" },
    ],
    leads: [{ id: "lead-1", name: "Ana", phone: "5544999990000", email: null, assigned_broker_id: null }],
    users: [{ id: "sdr-1", org_id: "org-1", role: "sdr", is_active: true }],
    appointments: [],
    activities: [],
  }
  mirrored.length = 0
  avancados.length = 0
}

async function post(body: Record<string, unknown>) {
  const { POST } = await import("./route")
  const req = new Request("http://x/api/formulario/x/agenda", {
    method: "POST",
    body: JSON.stringify(body),
  })
  return POST(req as never, { params: Promise.resolve({ token: TOKEN }) })
}

beforeEach(() => {
  estadoBase()
  vi.resetModules()
})

describe("POST /api/formulario/[token]/agenda", () => {
  const corpoOk = () => ({
    session_token: SESSAO,
    scheduled_at: AMANHA.toISOString(),
    location: "Decorado Vind",
  })

  it("agenda: grava a visita, avança a etapa e o lead vira do SDR", async () => {
    const res = await post(corpoOk())
    expect(res.status).toBe(201)

    // A visita foi MESMO gravada — é o trecho que a 75-279 mostrou que ninguém exercitava.
    expect(db.appointments).toHaveLength(1)
    const visita = db.appointments[0]!
    expect(visita.status).toBe("scheduled") // D1: pré-agendada já bloqueia
    expect(visita.team).toBe("house") // não é o fluxo da imobiliária
    expect(visita.duration_minutes).toBe(60)

    expect(avancados).toEqual(["lead-1"]) // etapa DEPOIS da visita gravada (AC4)
    expect(db.leads[0]!.assigned_broker_id).toBe("sdr-1") // AC5
    expect(mirrored).toHaveLength(1) // espelho no Google
  })

  it("AC8 — segundo POST da mesma sessão NÃO cria segunda visita", async () => {
    await post(corpoOk())
    expect(db.appointments).toHaveLength(1)

    const res2 = await post(corpoOk())
    const json = (await res2.json()) as { data?: { ja_existia?: boolean } }

    expect(db.appointments).toHaveLength(1) // o decorado não perde 2 horários
    expect(json.data?.ja_existia).toBe(true)
  })

  it("recusa quem não terminou o formulário", async () => {
    db.lead_form_responses[0]!.status = "parcial"
    const res = await post(corpoOk())
    expect(res.status).toBe(400)
    expect(db.appointments).toHaveLength(0)
  })

  it("recusa sessão de OUTRO formulário", async () => {
    db.lead_form_responses[0]!.form_id = "form-outro"
    const res = await post(corpoOk())
    expect(res.status).toBe(400)
    expect(db.appointments).toHaveLength(0)
  })

  it("horário já ocupado pela equipe HOUSE devolve 409", async () => {
    db.appointments = [
      {
        id: "ocupado",
        org_id: "org-1",
        lead_id: "outro-lead",
        team: "house",
        status: "scheduled",
        scheduled_at: AMANHA.toISOString(),
        duration_minutes: 60,
      },
    ]
    // Lead diferente, senão a idempotência do AC8 responderia antes.
    db.lead_form_responses[0]!.lead_id = "lead-1"
    const res = await post(corpoOk())
    expect(res.status).toBe(409)
    expect(db.appointments).toHaveLength(1) // nada de novo entrou
  })

  it("agenda DESLIGADA no schema responde como link inválido", async () => {
    ;(db.lead_forms[0]!.schema as { agenda: { ativa: boolean } }).agenda.ativa = false
    const res = await post(corpoOk())
    expect(res.status).toBe(404)
    expect(db.appointments).toHaveLength(0)
  })

  it("decorado fora do configurado na campanha é recusado", async () => {
    const res = await post({ ...corpoOk(), location: "Decorado Yarden" })
    expect(res.status).toBe(400)
    expect(db.appointments).toHaveLength(0)
  })

  it("sem SDR ativo, a visita ainda é criada (perder a visita é pior)", async () => {
    db.users = []
    const res = await post(corpoOk())
    expect(res.status).toBe(201)
    expect(db.appointments).toHaveLength(1)
    expect(db.leads[0]!.assigned_broker_id).toBeNull()
  })
})
