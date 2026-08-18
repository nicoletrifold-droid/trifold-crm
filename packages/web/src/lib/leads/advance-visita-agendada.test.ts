/**
 * Story 75-340 — "agendou visita → etapa Visita Agendada", inclusive saindo de
 * Perdido.
 *
 * O fake abaixo aplica os filtros DE VERDADE, incluindo o
 * `or(stage_id.is.null,stage_id.not.in.(...))` que é o guard: um fake que
 * ignora o WHERE aprovaria justamente a regressão que a story impede (lead que
 * já visitou voltando para Visita Agendada).
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import { STAGE_IDS } from "@trifold/shared"
import { advanceVisitaAgendadaComTrilha } from "./advance-visita-agendada"

vi.mock("server-only", () => ({}))

type Row = Record<string, unknown>
type Db = { leads: Row[]; activities: Row[] }
let db: Db

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
    or: (filtros: string) => {
      // "stage_id.is.null,stage_id.not.in.(a,b,c)"
      const [, listaCrua] = filtros.split(",stage_id.not.in.(")
      const bloqueadas = (listaCrua ?? "").replace(/\)$/, "").split(",")
      preds.push((r) => r.stage_id == null || !bloqueadas.includes(String(r.stage_id)))
      return api
    },
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
      const rows = db[table].filter((r) => preds.every((p) => p(r)))
      return { data: rows[0] ?? null, error: null }
    },
    then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
      if (mode === "insert") {
        db[table] = [...db[table], { id: `${table}-${db[table].length + 1}`, ...(payload as Row) }]
        return resolve({ data: null, error: null })
      }
      if (mode === "update") {
        db[table] = db[table].map((r) =>
          preds.every((p) => p(r)) ? { ...r, ...(payload as Row) } : r
        )
        return resolve({ data: null, error: null })
      }
      return resolve({ data: db[table].filter((r) => preds.every((p) => p(r))), error: null })
    },
  }
  return api
}

const admin = { from: (t: string) => query(t as keyof Db) } as never

function lead(extra: Row = {}) {
  return { id: "lead-1", stage_id: STAGE_IDS.novo, lost_reason: null, lost_reason_grupo: null, ...extra }
}

beforeEach(() => {
  db = { leads: [lead()], activities: [] }
})

describe("advanceVisitaAgendadaComTrilha", () => {
  it("avança a etapa sem activity quando o lead não estava perdido", async () => {
    const r = await advanceVisitaAgendadaComTrilha(admin, {
      orgId: "org-1",
      leadId: "lead-1",
      origem: 'formulário "Campanha Vind"',
    })

    expect(r).toEqual({ error: null, reativado: false })
    expect(db.leads[0]!.stage_id).toBe(STAGE_IDS.visita_agendada)
    expect(db.activities).toHaveLength(0)
  })

  it("lead PERDIDO agendou: volta ao funil e a reativação fica na timeline", async () => {
    db.leads = [lead({ stage_id: STAGE_IDS.perdido, lost_reason: "teste", lost_reason_grupo: "outro" })]

    const r = await advanceVisitaAgendadaComTrilha(admin, {
      orgId: "org-1",
      leadId: "lead-1",
      origem: 'formulário "Campanha Vind"',
    })

    expect(r.reativado).toBe(true)
    expect(db.leads[0]!.stage_id).toBe(STAGE_IDS.visita_agendada)
    expect(db.leads[0]!.lost_reason).toBeNull() // senão continua fora do Pipeline
    expect(db.activities).toHaveLength(1)
    const act = db.activities[0]!
    expect(act.type).toBe("lead_reactivated")
    expect(act.lead_id).toBe("lead-1")
    expect((act.metadata as Row).previous_stage_id).toBe(STAGE_IDS.perdido)
    expect((act.metadata as Row).previous_lost_reason).toBe("teste")
    expect((act.metadata as Row).automatico).toBe(true)
  })

  it("lead com lost_reason residual em etapa ativa também conta como reativação", async () => {
    db.leads = [lead({ stage_id: STAGE_IDS.qualificado, lost_reason: "nao_qualificado" })]
    const r = await advanceVisitaAgendadaComTrilha(admin, {
      orgId: "org-1",
      leadId: "lead-1",
      origem: "agendamento no CRM",
      userId: "user-1",
    })
    expect(r.reativado).toBe(true)
    expect(db.activities[0]!.user_id).toBe("user-1")
  })

  it("NÃO regride quem já visitou — e não inventa activity", async () => {
    db.leads = [lead({ stage_id: STAGE_IDS.visitou })]
    const r = await advanceVisitaAgendadaComTrilha(admin, {
      orgId: "org-1",
      leadId: "lead-1",
      origem: "agendamento no CRM",
    })
    expect(r.reativado).toBe(false)
    expect(db.leads[0]!.stage_id).toBe(STAGE_IDS.visitou)
    expect(db.activities).toHaveLength(0)
  })

  it("lead PERDIDO em etapa posterior não é 'reativado' de mentira", async () => {
    // Caso de borda: lost_reason residual + etapa que não regride. O UPDATE não
    // pega a linha, então a activity NÃO pode aparecer dizendo que reativou.
    db.leads = [lead({ stage_id: STAGE_IDS.fechou, lost_reason: "algo" })]
    const r = await advanceVisitaAgendadaComTrilha(admin, {
      orgId: "org-1",
      leadId: "lead-1",
      origem: "agendamento no CRM",
    })
    expect(r.reativado).toBe(false)
    expect(db.leads[0]!.stage_id).toBe(STAGE_IDS.fechou)
    expect(db.activities).toHaveLength(0)
  })

  it("lead vindo de importar_crm avança (era o buraco da allowlist antiga)", async () => {
    db.leads = [lead({ stage_id: STAGE_IDS.importar_crm })]
    await advanceVisitaAgendadaComTrilha(admin, {
      orgId: "org-1",
      leadId: "lead-1",
      origem: "link da imobiliária Alfa",
    })
    expect(db.leads[0]!.stage_id).toBe(STAGE_IDS.visita_agendada)
  })
})
