import { describe, it, expect } from "vitest"
import { STAGE_IDS } from "../constants/stages"
import {
  advanceToVisitaAgendada,
  VISITA_AGENDADA_NAO_REGRIDE,
  type StageAdvanceClient,
  type VisitaAgendadaUpdate,
} from "./advance-to-visita-agendada"

type LeadRow = {
  id: string
  stage_id: string | null
  lost_reason: string | null
  lost_reason_grupo: string | null
}

/**
 * Fake client que aplica a semântica dos filtros PostgREST à linha dada —
 * valida que o guard vive no WHERE do UPDATE (não é read-then-write).
 */
function fakeClient(row: LeadRow) {
  const state = {
    table: "",
    payload: null as VisitaAgendadaUpdate | null,
    matched: false,
  }

  const conditions: Array<(r: LeadRow) => boolean> = []

  const builder = {
    eq: (column: string, value: string) => {
      conditions.push((r) => r[column as keyof LeadRow] === value)
      return builder
    },
    or: (filters: string) => {
      // Story 75-340: a regra é blocklist — `stage_id.not.in.(...)`.
      const parts = filters.split(",stage_id.not.in.(")
      expect(parts).toHaveLength(2)
      expect(parts[0]).toBe("stage_id.is.null")
      const bloqueadas = parts[1].replace(/\)$/, "").split(",")
      conditions.push((r) => r.stage_id === null || !bloqueadas.includes(r.stage_id))
      return builder
    },
    then: (resolve: (v: { error: null }) => unknown) => {
      state.matched = conditions.every((cond) => cond(row))
      if (state.matched && state.payload) {
        row.stage_id = state.payload.stage_id
        row.lost_reason = state.payload.lost_reason
        row.lost_reason_grupo = state.payload.lost_reason_grupo
      }
      return Promise.resolve(resolve({ error: null }))
    },
  }

  const client: StageAdvanceClient = {
    from: (table: string) => {
      state.table = table
      return {
        update: (values: VisitaAgendadaUpdate) => {
          state.payload = values
          return builder as never
        },
      }
    },
  }

  return { client, state, row }
}

function lead(
  stage_id: string | null,
  lost_reason: string | null = null,
  lost_reason_grupo: string | null = null
): LeadRow {
  return { id: "lead-1", stage_id, lost_reason, lost_reason_grupo }
}

describe("advanceToVisitaAgendada — guard só-não-regride (Story 75-340)", () => {
  it.each([
    ["stage NULL (lead do link imob)", null],
    ["novo", STAGE_IDS.novo],
    ["em_qualificacao", STAGE_IDS.em_qualificacao],
    ["qualificado", STAGE_IDS.qualificado],
    ["no_show (remarcou)", STAGE_IDS.no_show],
    // Os quatro abaixo ficavam PARADOS na regra antiga (allowlist) — é o bug
    // que a 75-340 corrige: agendou visita, a etapa tem de acompanhar.
    ["perdido (agendou de novo → reativa)", STAGE_IDS.perdido],
    ["importar_crm (lead vindo do Supremo)", STAGE_IDS.importar_crm],
    ["acao_muffato", STAGE_IDS.acao_muffato],
    ["represamento", STAGE_IDS.represamento],
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
  ])("NÃO regride quando etapa atual é %s", async (_label, stageId) => {
    const { client, row } = fakeClient(lead(stageId))
    await advanceToVisitaAgendada(client, "lead-1")
    expect(row.stage_id).toBe(stageId)
  })

  it("limpa lost_reason e lost_reason_grupo ao reativar lead perdido", async () => {
    const { client, row } = fakeClient(lead(STAGE_IDS.perdido, "teste", "sem_interesse"))
    await advanceToVisitaAgendada(client, "lead-1")
    expect(row.stage_id).toBe(STAGE_IDS.visita_agendada)
    // Pipeline (inclusive o IMOB) filtra `lost_reason IS NULL` — sem limpar, o
    // lead entraria na etapa e continuaria fora do quadro.
    expect(row.lost_reason).toBeNull()
    expect(row.lost_reason_grupo).toBeNull()
  })

  it("move lead com lost_reason residual em etapa ativa (Não Qualificado)", async () => {
    const { client, row } = fakeClient(lead(STAGE_IDS.novo, "nao_qualificado"))
    await advanceToVisitaAgendada(client, "lead-1")
    expect(row.stage_id).toBe(STAGE_IDS.visita_agendada)
    expect(row.lost_reason).toBeNull()
  })

  it("NÃO move outro lead (filtro por id)", async () => {
    const { client, row } = fakeClient({ ...lead(STAGE_IDS.novo), id: "outro-lead" })
    await advanceToVisitaAgendada(client, "lead-1")
    expect(row.stage_id).toBe(STAGE_IDS.novo)
  })

  it("alvo do update é leads.stage_id = visita_agendada, com perda zerada", async () => {
    const { client, state } = fakeClient(lead(null))
    await advanceToVisitaAgendada(client, "lead-1")
    expect(state.table).toBe("leads")
    expect(state.payload).toEqual({
      stage_id: STAGE_IDS.visita_agendada,
      lost_reason: null,
      lost_reason_grupo: null,
    })
  })

  it("blocklist é exatamente visitou/proposta/negociando/fechou", () => {
    expect(VISITA_AGENDADA_NAO_REGRIDE).toEqual([
      STAGE_IDS.visitou,
      STAGE_IDS.proposta,
      STAGE_IDS.negociando,
      STAGE_IDS.fechou,
    ])
  })
})
