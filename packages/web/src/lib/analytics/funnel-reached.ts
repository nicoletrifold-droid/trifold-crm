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
 * Quais leads da coorte chegaram a cada etapa — `stage_id → Set<lead_id>`.
 *
 * Story 75-341: era um detalhe interno de `buildReachedCounts`; virou exportada
 * porque o drill-down (clicar num andar do funil e ver a LISTA) precisa
 * exatamente do conjunto que produziu o número. Derivar os dois da mesma função
 * é o que impede a lista de discordar da contagem que a pessoa clicou — e essa
 * divergência seria invisível até alguém contar as linhas na mão.
 *
 * `changes` pode trazer linhas de leads fora da coorte (a query é recortada por
 * período, não por lista de ids — `.in()` com centenas de uuid estoura a URL do
 * PostgREST): elas são descartadas aqui pelo cruzamento com `leads`.
 */
export function buildReachedSets(
  leads: LeadStageRow[],
  changes: StageChangeRow[]
): Map<string, Set<string>> {
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

  return byStage
}

/** Conta, por etapa, quantos leads DISTINTOS da coorte chegaram até ela. */
export function buildReachedCounts(
  leads: LeadStageRow[],
  changes: StageChangeRow[]
): Map<string, number> {
  return new Map(
    [...buildReachedSets(leads, changes)].map(([stageId, set]) => [stageId, set.size])
  )
}

export interface StageDef {
  id: string
  name: string
  slug: string | null
  color: string | null
  position: number | null
  is_active: boolean
}

export interface PipelineRow {
  id: string
  name: string
  slug: string
  color: string
  position: number
  /** Leads da coorte cuja etapa ATUAL é esta. Cada lead conta uma vez só. */
  agora: number
  /** Leads da coorte que passaram por esta etapa. O mesmo lead entra em várias. */
  chegaram: number
}

/**
 * Story 75-326 — as duas leituras do período lado a lado, numa lista só.
 *
 * Marcos perguntou por que Pipeline e Funil mostravam números diferentes se a base
 * é a mesma. E é a mesma: 84 leads, uma query. O que muda é quantas VEZES cada lead
 * é contado — uma só (onde está agora) ou em toda etapa por onde passou. Colocar as
 * duas colunas no mesmo lugar torna isso auto-evidente e mata a comparação errada
 * entre dois cards distantes.
 *
 * `agora` cobre a coorte INTEIRA, sem filtrar ativo/perdido: é o que faz a coluna
 * somar exatamente as entradas do período. Por isso a lista precisa incluir etapas
 * inativas que ainda guardam lead (é o caso de "Perdido", `is_active = false`) —
 * sem ela, 11 dos 84 sumiam e a soma não fechava.
 *
 * Ficam de fora só as etapas inativas e vazias: entulho de pipeline antigo.
 */
export function buildPipelineRows(
  leads: LeadStageRow[],
  changes: StageChangeRow[],
  stageDefs: StageDef[]
): PipelineRow[] {
  const reached = buildReachedCounts(leads, changes)

  const agora = new Map<string, number>()
  for (const lead of leads) {
    if (!lead.stage_id) continue
    agora.set(lead.stage_id, (agora.get(lead.stage_id) ?? 0) + 1)
  }

  return stageDefs
    .filter(
      (def) => def.is_active || (agora.get(def.id) ?? 0) > 0 || (reached.get(def.id) ?? 0) > 0
    )
    .map((def) => ({
      id: def.id,
      name: def.name,
      slug: def.slug ?? "",
      color: def.color ?? "",
      position: def.position ?? 0,
      agora: agora.get(def.id) ?? 0,
      chegaram: reached.get(def.id) ?? 0,
    }))
    .sort((a, b) => a.position - b.position)
}
