/**
 * Story 75-323 — testes da conta de "chegaram a cada etapa".
 *
 * Os casos cobrem exatamente os três jeitos de um lead ter passado por uma etapa,
 * porque cada um deles apareceu em prod: quem está lá agora, quem tem chegada
 * registrada e quem só tem SAÍDA registrada (lead criado direto na etapa — o
 * trigger de log só dispara no UPDATE).
 */
import { describe, it, expect } from "vitest"
import { buildReachedCounts } from "./funnel-reached"

const NOVO = "stage-novo"
const ATENDIMENTO = "stage-atendimento"
const VISITA = "stage-visita"
const VISITOU = "stage-visitou"

const change = (leadId: string, from: string | null, to: string | null) => ({
  lead_id: leadId,
  metadata: {
    ...(from ? { from_stage: { id: from, name: from } } : {}),
    ...(to ? { to_stage: { id: to, name: to } } : {}),
  },
})

describe("buildReachedCounts", () => {
  it("conta a etapa atual mesmo sem nenhum log", () => {
    const r = buildReachedCounts([{ id: "l1", stage_id: NOVO }], [])
    expect(r.get(NOVO)).toBe(1)
  })

  it("um lead que avançou conta em TODAS as etapas por onde passou", () => {
    const r = buildReachedCounts(
      [{ id: "l1", stage_id: VISITOU }],
      [change("l1", NOVO, ATENDIMENTO), change("l1", ATENDIMENTO, VISITA), change("l1", VISITA, VISITOU)]
    )
    expect(r.get(NOVO)).toBe(1)
    expect(r.get(ATENDIMENTO)).toBe(1)
    expect(r.get(VISITA)).toBe(1)
    expect(r.get(VISITOU)).toBe(1)
  })

  // O caso que motivou o `from_stage`: 3 leads em prod estavam em Atendimento com
  // zero stage_change — nasceram lá. Ao avançarem, só a SAÍDA fica registrada.
  it("etapa de origem entra pela saída (from_stage), não só pela chegada", () => {
    const r = buildReachedCounts(
      [{ id: "l1", stage_id: VISITA }],
      [change("l1", ATENDIMENTO, VISITA)]
    )
    expect(r.get(ATENDIMENTO)).toBe(1)
  })

  it("não conta o mesmo lead duas vezes na mesma etapa (ida e volta)", () => {
    const r = buildReachedCounts(
      [{ id: "l1", stage_id: ATENDIMENTO }],
      [change("l1", ATENDIMENTO, VISITA), change("l1", VISITA, ATENDIMENTO)]
    )
    expect(r.get(ATENDIMENTO)).toBe(1)
    expect(r.get(VISITA)).toBe(1)
  })

  // A query de activities é recortada por PERÍODO, não por lista de ids (`.in()` com
  // centenas de uuid estoura a URL do PostgREST), então chegam linhas de fora da coorte.
  it("descarta stage_change de lead fora da coorte", () => {
    const r = buildReachedCounts(
      [{ id: "l1", stage_id: NOVO }],
      [change("outro-lead", NOVO, VISITOU)]
    )
    expect(r.get(VISITOU)).toBeUndefined()
    expect(r.get(NOVO)).toBe(1)
  })

  it("sobrevive a metadata torta (sem stage, sem id, nula)", () => {
    const r = buildReachedCounts(
      [{ id: "l1", stage_id: null }],
      [
        { lead_id: "l1", metadata: null },
        { lead_id: "l1", metadata: { to_stage: null } },
        { lead_id: "l1", metadata: { to_stage: { name: "sem id" } } },
        { lead_id: null, metadata: { to_stage: { id: VISITA } } },
      ]
    )
    expect(r.size).toBe(0)
  })
})
