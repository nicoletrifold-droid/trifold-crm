import { describe, it, expect } from "vitest"
import { STAGE_IDS } from "../constants/stages"
import {
  advanceToVisitaAgendada,
  VISITA_AGENDADA_ADVANCE_FROM,
  type StageAdvanceClient,
} from "./advance-to-visita-agendada"

type LeadRow = { id: string; stage_id: string | null; lost_reason: string | null }

/**
 * Fake client que aplica a semântica dos filtros PostgREST à linha dada —
 * valida que o guard vive no WHERE do UPDATE (não é read-then-write).
 */
function fakeClient(row: LeadRow) {
  const state = {
    table: "",
    payload: null as { stage_id: string } | null,
    matched: false,
  }

  const conditions: Array<(r: LeadRow) => boolean> = []

  const builder = {
    eq: (column: string, value: string) => {
      conditions.push((r) => r[column as keyof LeadRow] === value)
      return builder
    },
    is: (column: string, value: null) => {
      conditions.push((r) => r[column as keyof LeadRow] === value)
      return builder
    },
    or: (filters: string) => {
      const parts = filters.split(",stage_id.in.(")
      expect(parts).toHaveLength(2)
      expect(parts[0]).toBe("stage_id.is.null")
      const allowed = parts[1].replace(/\)$/, "").split(",")
      conditions.push((r) => r.stage_id === null || allowed.includes(r.stage_id))
      return builder
    },
    then: (resolve: (v: { error: null }) => unknown) => {
      state.matched = conditions.every((cond) => cond(row))
      if (state.matched && state.payload) row.stage_id = state.payload.stage_id
      return Promise.resolve(resolve({ error: null }))
    },
  }

  const client: StageAdvanceClient = {
    from: (table: string) => {
      state.table = table
      return {
        update: (values: { stage_id: string }) => {
          state.payload = values
          return builder as never
        },
      }
    },
  }

  return { client, state, row }
}

function lead(stage_id: string | null, lost_reason: string | null = null): LeadRow {
  return { id: "lead-1", stage_id, lost_reason }
}

describe("advanceToVisitaAgendada — guard só-avança (Story 75-196)", () => {
  it.each([
    ["stage NULL (lead do link imob)", null],
    ["novo", STAGE_IDS.novo],
    ["em_qualificacao", STAGE_IDS.em_qualificacao],
    ["qualificado", STAGE_IDS.qualificado],
    ["no_show (remarcou)", STAGE_IDS.no_show],
  ])("avança para visita_agendada quando etapa atual é %s", async (_label, stageId) => {
    const { client, row } = fakeClient(lead(stageId))
    const { error } = await advanceToVisitaAgendada(client, "lead-1")
    expect(error).toBeNull()
    expect(row.stage_id).toBe(STAGE_IDS.visita_agendada)
  })

  it.each([
    ["visitou", STAGE_IDS.visitou],
    ["proposta", STAGE_IDS.proposta],
    ["negociando", STAGE_IDS.negociando],
    ["fechou", STAGE_IDS.fechou],
    ["perdido (terminal, Story 75-118)", STAGE_IDS.perdido],
    ["acao_muffato (fora do allowlist)", STAGE_IDS.acao_muffato],
    ["importar_crm (fora do allowlist)", STAGE_IDS.importar_crm],
  ])("NÃO regride quando etapa atual é %s", async (_label, stageId) => {
    const { client, row } = fakeClient(lead(stageId))
    await advanceToVisitaAgendada(client, "lead-1")
    expect(row.stage_id).toBe(stageId)
  })

  it("NÃO move lead com lost_reason preenchido (Não Qualificado)", async () => {
    const { client, row } = fakeClient(lead(STAGE_IDS.novo, "nao_qualificado"))
    await advanceToVisitaAgendada(client, "lead-1")
    expect(row.stage_id).toBe(STAGE_IDS.novo)
  })

  it("NÃO move outro lead (filtro por id)", async () => {
    const { client, row } = fakeClient({ ...lead(STAGE_IDS.novo), id: "outro-lead" })
    await advanceToVisitaAgendada(client, "lead-1")
    expect(row.stage_id).toBe(STAGE_IDS.novo)
  })

  it("alvo do update é leads.stage_id = visita_agendada", async () => {
    const { client, state } = fakeClient(lead(null))
    await advanceToVisitaAgendada(client, "lead-1")
    expect(state.table).toBe("leads")
    expect(state.payload).toEqual({ stage_id: STAGE_IDS.visita_agendada })
  })

  it("allowlist é exatamente novo/em_qualificacao/qualificado/no_show", () => {
    expect(VISITA_AGENDADA_ADVANCE_FROM).toEqual([
      STAGE_IDS.novo,
      STAGE_IDS.em_qualificacao,
      STAGE_IDS.qualificado,
      STAGE_IDS.no_show,
    ])
  })
})
