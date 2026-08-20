/**
 * Story 75-323 — testes da conta de "chegaram a cada etapa".
 *
 * Os casos cobrem exatamente os três jeitos de um lead ter passado por uma etapa,
 * porque cada um deles apareceu em prod: quem está lá agora, quem tem chegada
 * registrada e quem só tem SAÍDA registrada (lead criado direto na etapa — o
 * trigger de log só dispara no UPDATE).
 */
import { describe, it, expect } from "vitest"
import { buildPipelineRows, buildReachedCounts } from "./funnel-reached"

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

/**
 * Story 75-326 — as duas leituras na mesma lista.
 *
 * A pergunta do Marcos: "se a base é a mesma, por que os números diferem?". A
 * resposta que estes testes travam: `agora` conta cada lead UMA vez e fecha a base;
 * `chegaram` conta o mesmo lead em toda etapa por onde passou, e por isso não soma.
 */
describe("buildPipelineRows", () => {
  const DEFS = [
    { id: NOVO, name: "Aguardando", slug: "novo", color: "#111", position: 0, is_active: true },
    { id: ATENDIMENTO, name: "Atendimento", slug: "atendimento", color: "#222", position: 4, is_active: true },
    { id: VISITA, name: "Visita Agendada", slug: "visita-agendada", color: "#333", position: 6, is_active: true },
    { id: VISITOU, name: "Visitou", slug: "visitou", color: "#444", position: 7, is_active: true },
  ]

  it("`agora` soma exatamente a coorte; `chegaram` não soma (e não deve)", () => {
    const leads = [
      { id: "l1", stage_id: VISITOU },
      { id: "l2", stage_id: ATENDIMENTO },
      { id: "l3", stage_id: NOVO },
    ]
    const changes = [
      change("l1", NOVO, ATENDIMENTO),
      change("l1", ATENDIMENTO, VISITA),
      change("l1", VISITA, VISITOU),
      change("l2", NOVO, ATENDIMENTO),
    ]
    const rows = buildPipelineRows(leads, changes, DEFS)

    expect(rows.reduce((s, r) => s + r.agora, 0)).toBe(3)
    // l1 passou por 4 etapas, l2 por 2, l3 por 1 → 7 aparições de 3 leads.
    expect(rows.reduce((s, r) => s + r.chegaram, 0)).toBe(7)
  })

  it("o lead que mais avançou aparece uma vez na régua e em todos os andares do funil", () => {
    const rows = buildPipelineRows(
      [{ id: "l1", stage_id: VISITOU }],
      [change("l1", NOVO, ATENDIMENTO), change("l1", ATENDIMENTO, VISITA), change("l1", VISITA, VISITOU)],
      DEFS
    )
    const by = (slug: string) => rows.find((r) => r.slug === slug)!
    expect(by("visitou").agora).toBe(1)
    expect(by("visita-agendada").agora).toBe(0) // saiu de lá
    expect(by("visita-agendada").chegaram).toBe(1) // mas passou por lá
    expect(by("atendimento").chegaram).toBe(1)
  })

  // Em prod, "Perdido" é `is_active = false` e guardava 11 dos 84 leads da janela.
  // Sem ela na lista, a coluna `agora` não fechava a base — que é o ponto do card.
  it("inclui etapa INATIVA que ainda guarda lead (Perdido)", () => {
    const PERDIDO = "stage-perdido"
    const rows = buildPipelineRows(
      [{ id: "l1", stage_id: PERDIDO }],
      [],
      [...DEFS, { id: PERDIDO, name: "Perdido", slug: "perdido", color: "#555", position: 13, is_active: false }]
    )
    expect(rows.find((r) => r.slug === "perdido")?.agora).toBe(1)
    expect(rows.reduce((s, r) => s + r.agora, 0)).toBe(1)
  })

  it("descarta etapa inativa e vazia (entulho de pipeline antigo)", () => {
    const rows = buildPipelineRows(
      [{ id: "l1", stage_id: NOVO }],
      [],
      [...DEFS, { id: "stage-morta", name: "Etapa morta", slug: "morta", color: "", position: 20, is_active: false }]
    )
    expect(rows.some((r) => r.slug === "morta")).toBe(false)
  })

  it("mantém etapa ATIVA zerada (o funil não pode perder andar)", () => {
    const rows = buildPipelineRows([{ id: "l1", stage_id: NOVO }], [], DEFS)
    expect(rows.find((r) => r.slug === "visitou")).toMatchObject({ agora: 0, chegaram: 0 })
  })

  it("ordena por position", () => {
    const rows = buildPipelineRows([], [], [...DEFS].reverse())
    expect(rows.map((r) => r.position)).toEqual([0, 4, 6, 7])
  })
})
