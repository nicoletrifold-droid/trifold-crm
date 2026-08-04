// Story 75-271 — agrega em JS o que a RPC agrega no banco.
//
// POR QUE ISTO EXISTE. `get_analytics_summary_ranged` devolve funil, por
// empreendimento, por corretor e origens já somados — mas aceita só org +
// datas. Assim que existe filtro (corretor, calor, perfil…), ela não serve, e o
// número tem de sair de uma query filtrada somada aqui.
//
// A TELA JÁ FAZIA ISSO no ramo "com filtro" (`analytics/page.tsx`), e o PDF não
// fazia — era por isso que o relatório ignorava até o filtro de empreendimento.
// Este módulo é a versão única dessa soma, consumida pelos dois: sem ele, seriam
// duas implementações do MESMO cálculo, e o dia em que divergissem ninguém
// perceberia (o PDF é conferido bem menos que a tela).
//
// Só soma: não busca nada. Quem chama já tem as linhas, e é isso que torna o
// módulo testável sem banco.

export interface AggregableLead {
  stage_id?: string | null
  assigned_broker_id?: string | null
  source?: string | null
  property_interest_id?: string | null
  /** Embed `broker:users!assigned_broker_id(id, name)` — objeto ou array. */
  broker?: { id: string; name: string } | { id: string; name: string }[] | null
}

export interface StageDef {
  id: string
  name: string
  slug?: string | null
  color?: string | null
  position?: number | null
}

export interface AggregatedCounts {
  /** Contagem por `stage_id`, na ordem das etapas recebidas. */
  stages: Array<StageDef & { count: number }>
  /** Por corretor, já sem os ocultos/inativos, do maior para o menor. */
  brokers: Array<{ id: string; name: string; count: number }>
  /** Por empreendimento (id → contagem); o nome é resolvido por quem chama. */
  byProperty: Record<string, number>
  /** Por origem, chave crua (`meta_ads`, `other`…). */
  sourceCounts: Record<string, number>
  /** Total de linhas agregadas. */
  total: number
}

/** Normaliza o embed do PostgREST, que vem objeto OU array de um item. */
export function brokerDoLead(
  lead: AggregableLead
): { id: string; name: string } | null {
  const b = Array.isArray(lead.broker) ? lead.broker[0] : lead.broker
  return b ?? null
}

/**
 * Soma as linhas nas mesmas dimensões que a RPC devolveria.
 *
 * @param stageDefs etapas do kanban, na ordem em que devem aparecer. Etapa sem
 *   nenhum lead entra com 0 — o funil não pode ter degrau faltando.
 * @param opts.hiddenBrokerNames nomes a esconder (contas de demonstração), na
 *   mesma régua da tela e do PDF.
 * @param opts.activeBrokerIds se informado, só corretores desta lista entram —
 *   é como a tela evita corretor desligado aparecendo no card (Story 75-53).
 */
export function aggregateFilteredLeads(
  leads: AggregableLead[],
  stageDefs: StageDef[],
  opts: {
    hiddenBrokerNames?: Set<string>
    activeBrokerIds?: Set<string>
  } = {}
): AggregatedCounts {
  const hidden = opts.hiddenBrokerNames ?? new Set<string>()
  const ativos = opts.activeBrokerIds

  const porEtapa = new Map<string, number>()
  const porCorretor = new Map<string, { name: string; count: number }>()
  const byProperty: Record<string, number> = {}
  const sourceCounts: Record<string, number> = {}

  for (const lead of leads) {
    if (lead.stage_id) porEtapa.set(lead.stage_id, (porEtapa.get(lead.stage_id) ?? 0) + 1)

    if (lead.property_interest_id) {
      byProperty[lead.property_interest_id] = (byProperty[lead.property_interest_id] ?? 0) + 1
    }

    // Origem nula cai em "other", igual ao que a RPC faz — assim o total de
    // origens fecha com o total de leads e ninguém caça a diferença.
    const src = lead.source ?? "other"
    sourceCounts[src] = (sourceCounts[src] ?? 0) + 1

    const brokerId = lead.assigned_broker_id
    if (!brokerId) continue
    const b = brokerDoLead(lead)
    if (!b?.name) continue
    if (hidden.has(b.name.toLowerCase().trim())) continue
    if (ativos && !ativos.has(brokerId)) continue
    const cur = porCorretor.get(brokerId) ?? { name: b.name, count: 0 }
    cur.count++
    porCorretor.set(brokerId, cur)
  }

  return {
    stages: stageDefs.map((s) => ({ ...s, count: porEtapa.get(s.id) ?? 0 })),
    brokers: [...porCorretor.entries()]
      .map(([id, v]) => ({ id, name: v.name, count: v.count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR")),
    byProperty,
    sourceCounts,
    total: leads.length,
  }
}

/**
 * Etapas de fechamento pela MESMA régua da tela e do PDF: slug canônico ou
 * regex no nome. Duplicar esse critério faria a conversão divergir entre as
 * duas superfícies.
 */
export function isStageFechamento(stage: { name?: string | null; slug?: string | null }): boolean {
  if (stage.slug === "fechou") return true
  return /fechamento|ganho|fechado/i.test(stage.name ?? "")
}
