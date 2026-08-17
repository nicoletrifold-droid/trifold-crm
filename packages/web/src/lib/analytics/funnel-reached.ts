/**
 * Story 75-323 — quantos leads CHEGARAM a cada etapa (funil de verdade).
 *
 * O "Funil de Conversão" contava leads pela etapa ATUAL. Isso não é um funil: cada
 * andar perde quem avançou, então o topo encolhe conforme o time trabalha bem, e a
 * conversão entre andares fica sem sentido. Medido em prod na janela 09→16/08/2026,
 * para a mesma coorte de 84 entradas:
 *
 *   etapa            por etapa atual (antes)   chegaram a (agora)
 *   Atendimento                 30                     36
 *   Visita Agendada              4                      7
 *   Visitou                      1                      2
 *
 * A conversão Visita Agendada → Visitou lida na tela era 1/4 = 25%; a real é 2/7 = 29%.
 * E o topo do funil (30) não era o volume de entrada (84) — três etapas com gente
 * dentro (1º Contato 69, Represamento 6, SDR 2) não apareciam em lugar nenhum.
 *
 * A CONTA. Um lead chegou a uma etapa se:
 *   a) está nela AGORA, ou
 *   b) alguma activity `stage_change` dele aponta para ela (`to_stage`), ou
 *   c) alguma activity `stage_change` dele SAIU dela (`from_stage`).
 *
 * O item (c) não é firula: o trigger de log (migration 124) só dispara no UPDATE, então
 * lead CRIADO direto numa etapa nunca tem uma chegada registrada nela. Medido na mesma
 * janela: 3 dos 84 leads estavam em "Atendimento" com ZERO stage_change — nasceram lá.
 * Sem o `from_stage`, a etapa de origem de quem já avançou sumiria da conta.
 *
 * Tudo aqui é decisão pura (entra linha, sai contagem) para ser testável sem banco.
 */

export interface StageChangeRow {
  lead_id: string | null
  metadata: unknown
}

export interface LeadStageRow {
  id: string
  stage_id: string | null
}

/** Lê `metadata.{from_stage,to_stage}.id` sem confiar no formato (jsonb é jsonb). */
function stageIdsFromMetadata(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return []
  const meta = metadata as Record<string, unknown>
  const ids: string[] = []
  for (const key of ["from_stage", "to_stage"]) {
    const side = meta[key]
    if (side && typeof side === "object") {
      const id = (side as Record<string, unknown>).id
      if (typeof id === "string" && id) ids.push(id)
    }
  }
  return ids
}

/**
 * Conta, por etapa, quantos leads DISTINTOS da coorte chegaram até ela.
 *
 * `changes` pode trazer linhas de leads fora da coorte (a query é recortada por
 * período, não por lista de ids — `.in()` com centenas de uuid estoura a URL do
 * PostgREST): elas são descartadas aqui pelo cruzamento com `leads`.
 */
export function buildReachedCounts(
  leads: LeadStageRow[],
  changes: StageChangeRow[]
): Map<string, number> {
  const cohort = new Set(leads.map((l) => l.id))
  /** stage_id → leads distintos que passaram por ela. */
  const byStage = new Map<string, Set<string>>()

  const add = (stageId: string, leadId: string) => {
    let set = byStage.get(stageId)
    if (!set) {
      set = new Set<string>()
      byStage.set(stageId, set)
    }
    set.add(leadId)
  }

  for (const lead of leads) {
    if (lead.stage_id) add(lead.stage_id, lead.id)
  }

  for (const change of changes) {
    const leadId = change.lead_id
    if (!leadId || !cohort.has(leadId)) continue
    for (const stageId of stageIdsFromMetadata(change.metadata)) {
      add(stageId, leadId)
    }
  }

  return new Map([...byStage].map(([stageId, set]) => [stageId, set.size]))
}
