import { createClient } from "@web/lib/supabase/server"
import Link from "next/link"
import { getServerUser } from "@web/lib/auth"
import { getOrgSchedule, businessMinutesBetweenSchedule } from "@web/lib/roleta/business-time"
import { SOURCE_LABELS_SHORT } from "@web/lib/constants"
import { LeadsChart } from "@web/components/analytics/leads-chart"
import { ConversionFunnel } from "@web/components/analytics/conversion-funnel"
import { pickFunnelTiers } from "@web/lib/analytics/funnel-tiers"
import { ExecutiveCharts } from "@web/components/analytics/executive-charts"
import { AnalyticsPeriodSelector } from "@web/components/analytics/analytics-period-selector"
import { AnalyticsFilterSelect } from "@web/components/analytics/analytics-filter-select"
import { ScrollableX } from "@web/components/ui/scrollable-x"
import { resolvePeriod } from "@web/lib/analytics/period"
// Story 75-179: fonte única das métricas (tipo da RPC + derivação) — dedup tela/PDF.
// Story 75-266: idem p/ os grupos de motivo de perda (deriveLostReasonGroups).
import { type AnalyticsSummary, deriveAnalyticsMetrics, deriveLostReasonGroups, toCount } from "@web/lib/analytics/metrics"
import { aggregatePerfil, type PerfilRow } from "@web/lib/analytics/perfil"
// Story 75-272 — filtros do analytics (corretor, calor, perfil) num módulo só,
// compartilhado com o endpoint do PDF.
import {
  parseAnalyticsFilters,
  applyLeadFilters,
  hasAnyFilter,
  buildAnalyticsHref,
  buildClearFiltersHref,
  activeFilterKeys,
  PERFIL_FILTER_KEYS,
  type PeriodParams,
} from "@web/lib/analytics/filters"
import {
  facetOptions,
  facetCoverage,
  optionLabelComContagem,
  // Story 75-274 — opções de corretor com nome garantido + a frase de cobertura.
  brokerFilterOptions,
  coverageNote,
} from "@web/lib/analytics/filter-options"
// Story 75-271 — mesma soma que o PDF usa (QA-002: uma implementação, não duas).
import { aggregateFilteredLeads } from "@web/lib/analytics/aggregate-filtered"
// Story 75-323 — o Funil conta quem CHEGOU a cada etapa (não quem está nela agora).
import { buildReachedCounts, type LeadStageRow, type StageChangeRow } from "@web/lib/analytics/funnel-reached"
import { fetchAllLeads, type RangeableQuery } from "@web/lib/analytics/fetch-all-leads"

/**
 * Story 75-272 — nome de cada dimensão de perfil no seletor. Rótulo de TELA
 * (o do dado em si vem de labelDoValor / dos mapas canônicos).
 */
const PERFIL_FILTER_LABELS: Record<string, string> = {
  finalidade: "Finalidade",
  profissao: "Profissão",
  rendaFamiliar: "Renda",
  filhos: "Filhos",
  estadoCivil: "Estado civil",
  faixaEtaria: "Faixa etária",
  situacaoMoradia: "Moradia",
  temPet: "Pet",
  cidadeBairro: "Cidade/Bairro",
}

const HIDDEN_BROKER_NAMES = new Set(["corretor demo", "target editado"])

const RANGE_LABEL: Record<string, string> = {
  "7d": "últimos 7 dias",
  "30d": "últimos 30 dias",
  "90d": "últimos 90 dias",
  custom: "período selecionado",
}

export default async function AnalyticsPage({
  searchParams,
}: {
  // Story 75-272 — os filtros viraram um conjunto (corretor, calor, perfil do
  // lead). O tipo aceita qualquer string p/ não precisar listar 12 params aqui;
  // quem conhece as chaves é o FILTER_SPEC em lib/analytics/filters.ts.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const appUser = await getServerUser()
  const supabase = await createClient()
  const params = await searchParams
  // Story 75-272 — todos os filtros da URL num objeto tipado, lido pela MESMA
  // função que o endpoint do PDF usa (é o que faz tela e PDF concordarem).
  const filters = parseAnalyticsFilters(params)
  const propertyId = filters.propertyId
  const filtrado = hasAnyFilter(filters)
  const periodParams: PeriodParams = {
    range: typeof params.range === "string" ? params.range : undefined,
    from: typeof params.from === "string" ? params.from : undefined,
    to: typeof params.to === "string" ? params.to : undefined,
  }

  // Período global (Story 75-31) — aplica à página inteira.
  const period = resolvePeriod(periodParams.range ?? undefined, periodParams.from ?? undefined, periodParams.to ?? undefined)
  const sinceISO = period.sinceISO
  const untilISO = period.untilISO
  const rangeLabel = RANGE_LABEL[period.range] ?? "período"

  // Properties (sempre carregar para o seletor)
  const { data: allProperties } = await supabase
    .from("properties")
    .select("id, name")
    .eq("is_active", true)
    .order("name")

  // IDs dos corretores ATIVOS (disponíveis na roleta) — Story 75-53. Antes a query
  // pegava todos, então corretores indisponíveis (ex.: desligados) apareciam nos cards.
  const { data: activeBrokersData } = await supabase
    .from("brokers")
    .select("user_id")
    .eq("org_id", appUser.orgId)
    .eq("is_available", true)
  const activeBrokerIds = new Set((activeBrokersData ?? []).map((b) => b.user_id as string))

  // Story 75-274 — NOME dos corretores ativos, direto de `users`. Antes o mapa
  // saía do array `brokers` (o card "Leads por Corretor"), que é derivado dos
  // leads JÁ filtrados: com um corretor selecionado o card tem uma linha só, e o
  // dropdown — facetado de propósito, para dar como trocar de corretor — listava
  // os outros seis como uuid cru. A fonte do nome não pode depender do recorte
  // que o próprio filtro aplica.
  const { data: brokerUsersData } =
    activeBrokerIds.size > 0
      ? await supabase.from("users").select("id, name").in("id", [...activeBrokerIds])
      : { data: [] }
  const brokerNameMap = new Map<string, string>(
    (brokerUsersData ?? []).flatMap((u) => {
      const name = (u.name as string | null)?.trim()
      return name ? ([[u.id as string, name]] as [string, string][]) : []
    })
  )

  // Landing Pages do período (extraídas do utm_campaign e subtraídas do "other")
  const lpYardenQ = supabase
    .from("leads").select("id", { count: "exact", head: true })
    .eq("segmento", "principal") // Story 75-98: analytics não conta IMOB
    .eq("is_active", true).is("lost_reason", null)
    .gte("created_at", sinceISO).lt("created_at", untilISO)
    .ilike("utm_campaign", "%LP Yarden%")
  const lpVindQ = supabase
    .from("leads").select("id", { count: "exact", head: true })
    .eq("segmento", "principal") // Story 75-98: analytics não conta IMOB
    .eq("is_active", true).is("lost_reason", null)
    .gte("created_at", sinceISO).lt("created_at", untilISO)
    .or("utm_campaign.ilike.%LP Vind%,utm_campaign.ilike.%Página Vind%")

  // Story 75-272 — aplica TODOS os filtros ativos (era só empreendimento).
  const [{ count: lpYardenCount }, { count: lpVindCount }] = await Promise.all([
    applyLeadFilters(lpYardenQ, filters),
    applyLeadFilters(lpVindQ, filters),
  ])

  let stages: { id: string; name: string; slug: string; color: string; position: number; count: number }[] = []
  let properties: { id: string; name: string; count: number }[] = []
  let brokers: { id: string; name: string; count: number; avgScore: number }[] = []
  const sourceCounts: Record<string, number> = {}
  // Story 75-266: o card "Motivos de Perda" agrega por GRUPO (mig 213), não por texto cru.
  // Mesmo universo do lost_reasons da RPC → a soma continua sendo o KPI Perdidos.
  const lostGroups: Record<string, number> = {}
  let lostEstruturados = 0
  // QA-002: KPI Perdidos pelo caminho antigo, usado só se os grupos vierem vazios
  // (janela em que o deploy chega antes da mig 213).
  let perdidosFallback = 0
  // Story 75-179: Entradas (todas do período) + Ativos (subconjunto ativo/não-perdido),
  // via helper único deriveAnalyticsMetrics (mesma fonte da tela e do PDF).
  let entradas = 0
  let ativos = 0

  // Story 75-272 — a bifurcação passou a ser "tem ALGUM filtro?" (era só
  // empreendimento): sem filtro, a RPC agregada no banco; com qualquer filtro,
  // queries diretas agregadas em JS, que é onde os filtros novos se aplicam.
  if (!filtrado) {
    // SEM filtro nenhum — usa o RPC período-aware
    const { data: analytics, error: analyticsError } = await supabase.rpc("get_analytics_summary_ranged", {
      p_org_id: appUser.orgId,
      p_since: sinceISO,
      p_until: untilISO,
    })
    if (analyticsError) console.error("[ANALYTICS] get_analytics_summary_ranged RPC failed", analyticsError)
    const summary = (analytics as AnalyticsSummary | null) ?? null

    stages = (summary?.funnel ?? []).map((s) => ({
      id: s.stage_id, name: s.name, slug: s.slug, color: s.color, position: s.position, count: toCount(s.count),
    }))
    properties = (summary?.by_property ?? []).map((p) => ({ id: p.property_id, name: p.name, count: toCount(p.count) }))
    brokers = (summary?.by_broker ?? [])
      .filter((b) => !HIDDEN_BROKER_NAMES.has((b.name ?? "").toLowerCase().trim()) && activeBrokerIds.has(b.user_id))
      .map((b) => ({ id: b.user_id, name: b.name, count: toCount(b.count), avgScore: b.avg_score ?? 0 }))
    for (const [k, v] of Object.entries(summary?.source_counts ?? {})) sourceCounts[k] = toCount(v)
    for (const [k, v] of Object.entries(summary?.lost_reason_groups ?? {})) lostGroups[k] = toCount(v)
    lostEstruturados = toCount(summary?.lost_reason_estruturados)
    const m = deriveAnalyticsMetrics(summary)
    entradas = m.entradas
    ativos = m.ativos
    perdidosFallback = m.perdidos
  } else {
    // COM filtro de empreendimento — queries diretas, limitadas ao período
    const [stagesData, leadsForAggData] = await Promise.all([
      supabase.from("kanban_stages").select("id, name, slug, color, position").order("position"),
      // Story 75-272 — colunas de perfil entram no select p/ facetar as opções
      // dos filtros novos sem query extra; applyLeadFilters substitui o
      // `.eq("property_interest_id", …)` fixo (que quebraria com propertyId null).
      applyLeadFilters(
        supabase
          .from("leads")
          .select("stage_id, assigned_broker_id, source, lost_reason, interest_level, finalidade, profissao, renda_familiar, filhos, estado_civil, faixa_etaria, situacao_moradia, tem_pet, cidade_bairro, property_interest_id, broker:users!assigned_broker_id(id, name)")
          .eq("org_id", appUser.orgId)
          .eq("segmento", "principal") // Story 75-98
          .eq("is_active", true)
          .is("lost_reason", null)
          .gte("created_at", sinceISO).lt("created_at", untilISO),
        filters
      ),
    ])

    const allLeads = (leadsForAggData.data ?? []) as Array<{
      stage_id: string | null
      assigned_broker_id: string | null
      source: string | null
      lost_reason: string | null
      broker: { id: string; name: string } | { id: string; name: string }[] | null
    }>

    // Story 75-271 (QA-002) — funil, corretores e origens saem do agregador
    // COMPARTILHADO com o PDF. Antes esta soma vivia aqui e o PDF tinha a sua
    // (ou pior: não tinha e usava a RPC sem filtro). Duas implementações do
    // mesmo cálculo divergem em silêncio, e PDF se confere menos que tela.
    const agg = aggregateFilteredLeads(allLeads, (stagesData.data ?? []) as Parameters<typeof aggregateFilteredLeads>[1], {
      hiddenBrokerNames: HIDDEN_BROKER_NAMES,
      activeBrokerIds,
    })
    stages = agg.stages.map((s) => ({
      id: s.id, name: s.name, slug: s.slug ?? "", color: s.color ?? "", position: s.position ?? 0, count: s.count,
    }))
    brokers = agg.brokers.map((b) => ({ ...b, avgScore: 0 }))
    for (const [k, v] of Object.entries(agg.sourceCounts)) sourceCounts[k] = v

    // Story 75-179: Ativos = criados na janela, ativos e não-perdidos (allLeads já filtra).
    ativos = agg.total
    // Entradas = TODOS os criados na janela p/ o empreendimento (inclui perdidos/inativos).
    const { count: entradasCount } = await applyLeadFilters(
      supabase
        .from("leads").select("id", { count: "exact", head: true })
        .eq("org_id", appUser.orgId).eq("segmento", "principal")
        .gte("created_at", sinceISO).lt("created_at", untilISO),
      filters
    )
    entradas = entradasCount ?? 0

    // Motivos de perda por GRUPO — Story 75-266. Mesmo universo do caminho sem
    // filtro (lost_reason IS NOT NULL + janela + segmento principal, Story 75-178:
    // sem filtro is_active), agregado no banco pela mesma f_lost_reason_grupo.
    const { data: lostGroupsData, error: lostGroupsError } = await supabase.rpc("get_lost_reason_groups", {
      p_org_id: appUser.orgId,
      p_since: sinceISO,
      p_until: untilISO,
      p_property_id: propertyId,
    })
    if (lostGroupsError) {
      console.error("[ANALYTICS] get_lost_reason_groups RPC failed", lostGroupsError)
      // QA-002: RPC ausente/quebrada → KPI pelo caminho antigo (head-count do cru).
      const { count: lostCount } = await applyLeadFilters(
        supabase
          .from("leads").select("id", { count: "exact", head: true })
          .eq("org_id", appUser.orgId).eq("segmento", "principal")
          .not("lost_reason", "is", null)
          .gte("created_at", sinceISO).lt("created_at", untilISO),
        filters
      )
      perdidosFallback = lostCount ?? 0
    }
    const lg = (lostGroupsData ?? null) as { groups?: Record<string, number | string> | null; estruturados?: number | string | null } | null
    for (const [k, v] of Object.entries(lg?.groups ?? {})) lostGroups[k] = toCount(v)
    lostEstruturados = toCount(lg?.estruturados)
  }

  // ── Funil: quantos leads CHEGARAM a cada etapa (Story 75-323) ──────────────
  // A régua do Pipeline acima responde "onde estão AGORA os leads que entraram no
  // período" e continua assim (decisão da 75-319). O Funil responde outra coisa —
  // "quantos chegaram até aqui" — e é por isso que os dois números diferem de
  // propósito: quem avançou sai da régua e PERMANECE no funil.
  //
  // Uma implementação só para os dois caminhos da página (com e sem filtro): a coorte
  // sai de `leads` com os mesmos filtros de sempre, e o histórico sai de `activities`
  // recortado por PERÍODO — não por lista de ids, que estouraria a URL do PostgREST
  // com centenas de uuid. O cruzamento acontece em memória, em `buildReachedCounts`.
  //
  // A janela do histórico vai de `sinceISO` até AGORA (e não até `untilISO`): lead que
  // entrou no fim do período e avançou depois chegou à etapa do mesmo jeito. É o mesmo
  // critério que a contagem por etapa atual já usava implicitamente.
  const cohortLeads = await fetchAllLeads<LeadStageRow>(() =>
    applyLeadFilters(
      supabase
        .from("leads")
        .select("id, stage_id")
        .eq("org_id", appUser.orgId)
        .eq("segmento", "principal") // Story 75-98: analytics não conta IMOB
        .gte("created_at", sinceISO).lt("created_at", untilISO)
        .order("id", { ascending: true }), // `.range()` exige coluna ÚNICA
      filters
    ) as unknown as RangeableQuery<LeadStageRow>
  )

  const stageChanges = await fetchAllLeads<StageChangeRow>(() =>
    supabase
      .from("activities")
      .select("lead_id, metadata")
      .eq("org_id", appUser.orgId)
      .eq("type", "stage_change")
      .gte("created_at", sinceISO)
      .order("id", { ascending: true }) as unknown as RangeableQuery<StageChangeRow>
  )

  const reached = buildReachedCounts(cohortLeads, stageChanges)
  const funnelStages = stages.map((s) => ({ ...s, count: reached.get(s.id) ?? 0 }))
  // Base do funil: TODAS as entradas do período, inclusive as perdidas. Um funil que
  // esconde quem se perdeu no caminho mede o próprio otimismo.
  const funnelBase = cohortLeads.length

  // "Leads por Empreendimento" — sempre ambos, limitado ao período
  // Story 75-272 — com QUALQUER filtro ativo, recalcula por empreendimento. Os
  // outros filtros valem; o de empreendimento é excluído de propósito (`except`),
  // porque o card mostra TODOS os empreendimentos — aplicá-lo zeraria os demais.
  if (filtrado) {
    const counts = await Promise.all((allProperties ?? []).map(async (p) => {
      const { count } = await applyLeadFilters(
        supabase
          .from("leads").select("id", { count: "exact", head: true })
          .eq("org_id", appUser.orgId).eq("segmento", "principal").eq("is_active", true).is("lost_reason", null)
          .eq("property_interest_id", p.id)
          .gte("created_at", sinceISO).lt("created_at", untilISO),
        filters,
        "propertyId"
      )
      return { id: p.id, name: p.name, count: count ?? 0 }
    }))
    properties = counts
  }

  // Landing Pages: extrai do utm_campaign e subtrai do "other"
  const lpYarden = lpYardenCount ?? 0
  const lpVind = lpVindCount ?? 0
  if (lpYarden > 0) {
    sourceCounts["lp_yarden"] = lpYarden
    sourceCounts.other = Math.max(0, (sourceCounts.other ?? 0) - lpYarden)
  }
  if (lpVind > 0) {
    sourceCounts["lp_vind"] = lpVind
    sourceCounts.other = Math.max(0, (sourceCounts.other ?? 0) - lpVind)
  }
  if (sourceCounts.other === 0) delete sourceCounts.other

  // ── Perfil dos Leads (Story 75-184) ────────────────────────────────────────
  // Base ENTRADAS (todos os criados na janela, inclusive perdidos — perfil
  // demográfico independe do desfecho). Agregação pura em aggregatePerfil.
  let perfilQuery = supabase
    .from("leads")
    .select("profissao, renda_familiar, filhos, estado_civil, faixa_etaria, situacao_moradia, tem_pet")
    .eq("org_id", appUser.orgId)
    .eq("segmento", "principal")
    .gte("created_at", sinceISO).lt("created_at", untilISO)
    .limit(5000)
  // Story 75-272 — o card de perfil respeita todos os filtros ativos.
  perfilQuery = applyLeadFilters(perfilQuery, filters)
  const { data: perfilRows } = await perfilQuery
  const perfil = aggregatePerfil((perfilRows ?? []) as PerfilRow[])

  // ── Métricas do período (cards de topo) ────────────────────────────────────
  // Story 75-179: Entradas = todas as entradas; Ativos = subconjunto ativo/não-perdido.
  // Média diária usa ENTRADAS (denominador honesto).
  // Story 75-277: o card "Conversão" saiu — era 100% baseado na etapa Fechamento e media
  // 0% (zero fechamentos em 7d e 30d, medido em 05/08). Espaço morto, decisão do Marcos.
  // A etapa Fechamento SEGUE no Funil de Conversão abaixo: ali ela pertence à lista.
  // Story 75-266: soma dos grupos ≡ soma do texto cru (mesmo universo no SQL) — o KPI não muda.
  // Fallback (QA-002): se a mig 213 ainda não estiver aplicada, o JSONB não tem a chave de
  // grupos — o KPI cai na soma do cru (comportamento antigo) em vez de zerar em silêncio.
  const somaGrupos = Object.values(lostGroups).reduce((sum, n) => sum + n, 0)
  const perdidos = somaGrupos > 0 ? somaGrupos : perdidosFallback
  const lostGroupEntries = deriveLostReasonGroups(lostGroups)
  const lostHeuristica = Math.max(0, perdidos - lostEstruturados)
  const mediaDiaria = period.days > 0 ? (entradas / period.days) : 0

  // ── Deltas vs período anterior de mesma duração (Visão Executiva) ──────────
  // Mesmo padrão dual da página: RPC sem filtro de empreendimento, head-counts com.
  const durationMs = new Date(untilISO).getTime() - new Date(sinceISO).getTime()
  const prevSinceISO = new Date(new Date(sinceISO).getTime() - durationMs).toISOString()
  let prevEntradas = 0
  let prevPerdidos = 0

  if (!propertyId) {
    const { data: prevAnalytics } = await supabase.rpc("get_analytics_summary_ranged", {
      p_org_id: appUser.orgId,
      p_since: prevSinceISO,
      p_until: sinceISO,
    })
    const prevSummary = (prevAnalytics as AnalyticsSummary | null) ?? null
    const pm = deriveAnalyticsMetrics(prevSummary)
    prevEntradas = pm.entradas
    prevPerdidos = pm.perdidos
  } else {
    // Story 75-272 — o comparativo do período anterior segue os MESMOS filtros.
    const prevBase = () =>
      applyLeadFilters(supabase
        .from("leads").select("id", { count: "exact", head: true })
        .eq("org_id", appUser.orgId).eq("segmento", "principal")
        .gte("created_at", prevSinceISO).lt("created_at", sinceISO), filters)
    const [{ count: pe }, { count: pp }] = await Promise.all([
      prevBase(),
      prevBase().not("lost_reason", "is", null),
    ])
    prevEntradas = pe ?? 0
    prevPerdidos = pp ?? 0
  }

  const deltaPct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null)

  /** Badge ▲/▼ vs período anterior. `invert` = subir é ruim (perdidos). */
  const deltaBadge = (delta: number | null, opts?: { invert?: boolean; suffix?: string }) => {
    if (delta == null) return null
    const good = opts?.invert ? delta < 0 : delta > 0
    const cls = delta === 0
      ? "text-stone-400 dark:text-stone-500"
      : good
        ? "text-green-600 dark:text-green-300"
        : "text-red-600 dark:text-red-300"
    return (
      <span className={`text-xs font-semibold ${cls}`}>
        {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {delta > 0 ? "+" : ""}{delta}{opts?.suffix ?? "%"} vs anterior
      </span>
    )
  }

  // ── Tempo médio de atendimento por corretor (Story 75-47) ──────────────────
  // DISTRIBUIÇÃO (corretor recebeu, lead_distribution_log) → ATENDIMENTO (saiu de
  // "Aguardando atendimento" = primeiro_atendimento_em, carimbado pelo trigger 75-45).
  // Antes media 1º broker_note − created_at (entrada→nota), que inflava com a espera
  // da roleta. Considera leads ATENDIDOS no período. Só mede desde 24/06/2026.
  const responseLeads = await supabase
    .from("leads")
    .select("id, primeiro_atendimento_em, assigned_broker_id, broker:users!assigned_broker_id(id, name)")
    .eq("org_id", appUser.orgId)
    .eq("segmento", "principal") // Story 75-98
    .not("assigned_broker_id", "is", null)
    .not("primeiro_atendimento_em", "is", null)
    .gte("primeiro_atendimento_em", sinceISO).lt("primeiro_atendimento_em", untilISO)
    .limit(1000)

  type ResponseLead = { id: string; primeiro_atendimento_em: string; assigned_broker_id: string; broker: { id: string; name: string } | { id: string; name: string }[] | null }
  const responseLeadList = (responseLeads.data ?? []) as ResponseLead[]
  const responseLeadIds = responseLeadList.map((l) => l.id)

  let brokerResponseTimes: { id: string; name: string; avgMinutes: number; count: number }[] = []

  if (responseLeadIds.length > 0) {
    const { data: distLog } = await supabase
      .from("lead_distribution_log")
      .select("lead_id, created_at")
      .eq("org_id", appUser.orgId)
      .eq("status", "distributed")
      .in("lead_id", responseLeadIds)

    const distByLead = new Map<string, number[]>()
    for (const d of (distLog ?? [])) {
      const arr = distByLead.get(d.lead_id as string) ?? []
      arr.push(new Date(d.created_at as string).getTime())
      distByLead.set(d.lead_id as string, arr)
    }

    // Story 75-60: tempo médio em HORÁRIO COMERCIAL (mesma agenda/fonte do SLA).
    const { week, timezone } = await getOrgSchedule(appUser.orgId, supabase)
    const brokerMap = new Map<string, { name: string; totalMinutes: number; count: number }>()
    for (const lead of responseLeadList) {
      const atendido = new Date(lead.primeiro_atendimento_em).getTime()
      // distribuição correspondente = a mais recente ANTES do atendimento
      const dists = (distByLead.get(lead.id) ?? []).filter((t) => t <= atendido)
      if (dists.length === 0) continue
      const bArr = Array.isArray(lead.broker) ? lead.broker[0] : lead.broker
      if (!bArr) continue
      if (HIDDEN_BROKER_NAMES.has(bArr.name.toLowerCase().trim())) continue
      const min = businessMinutesBetweenSchedule(new Date(Math.max(...dists)), new Date(atendido), week, timezone)
      const cur = brokerMap.get(bArr.id) ?? { name: bArr.name, totalMinutes: 0, count: 0 }
      cur.totalMinutes += min
      cur.count++
      brokerMap.set(bArr.id, cur)
    }

    brokerResponseTimes = [...brokerMap.entries()]
      .filter(([id, v]) => v.count >= 1 && activeBrokerIds.has(id))
      .map(([id, v]) => ({ id, name: v.name, avgMinutes: Math.round(v.totalMinutes / v.count), count: v.count }))
      .sort((a, b) => a.avgMinutes - b.avgMinutes)
  }

  const sourceLabels = SOURCE_LABELS_SHORT

  // Story 75-319 (decisão do Marcos 13/08): a régua SEGUE O PERÍODO — usa os
  // MESMOS counts do Funil (leads que entraram na janela, por etapa atual),
  // então régua e funil batem sempre; a foto "agora" continua no Dashboard.
  const stagesOrdenadas = [...stages].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  const selectedPropertyName = propertyId
    ? (allProperties ?? []).find((p) => p.id === propertyId)?.name ?? "Empreendimento"
    : null

  // PDF sob demanda segue o período (Story 75-31) E os filtros (Story 75-271).
  // O `buildAnalyticsReportData` ganhou a mesma bifurcação da tela: com filtro,
  // soma em JS pelo agregador compartilhado (`lib/analytics/aggregate-filtered.ts`)
  // em vez de usar a RPC, que só aceita org + datas. Foi o que destravou o AC6
  // que a 75-272 havia deixado aberto de propósito — meio-filtrado mentiria.
  const reportHref = buildAnalyticsHref("/api/analytics/report", filters, {
    range: period.range,
    from: period.from,
    to: period.to,
  })

  // ── Opções dos filtros, facetadas sobre as ENTRADAS da janela (Story 75-272) ──
  // `facetRows` é a base de facetamento: o caminho filtrado já tem os leads em
  // memória; o caminho sem filtro busca só as colunas dos filtros (query enxuta,
  // sem embed) — é o preço de oferecer opções sabendo o que existe.
  //
  // Sem nenhum filtro na QUERY, de propósito: o facetamento é feito em memória
  // por facetOptions, que precisa das linhas cruas para deixar UMA dimensão
  // livre por vez (`except`). Filtrar aqui colapsaria as opções.
  //
  // QA 75-272 (QA-002) — o recorte é o de ATIVOS (`is_active` + sem
  // `lost_reason`), o MESMO dos cards. Duas razões, e as duas importam:
  //   1. Consistência: a contagem do rótulo passa a ser a que o usuário vê ao
  //      aplicar o filtro. Com o recorte largo (entradas), "Casado (31)" contaria
  //      perdidos e inativos e o card mostraria menos — o rótulo mentiria.
  //   2. Teto do PostgREST: o recorte largo mede ~1.650 leads em 90d (medido em
  //      prod 04/08) e seria CORTADO em 1000 em silêncio, subestimando as
  //      contagens e podendo esconder uma opção rara. O recorte de ativos mede
  //      612 — bem abaixo do teto. (Quando encostar, usar `fetchAllLeads`.)
  const { data: facetData } = await supabase
    .from("leads")
    .select(
      "assigned_broker_id, interest_level, finalidade, profissao, renda_familiar, filhos, estado_civil, faixa_etaria, situacao_moradia, tem_pet, cidade_bairro, property_interest_id"
    )
    .eq("org_id", appUser.orgId)
    .eq("segmento", "principal")
    .eq("is_active", true)
    .is("lost_reason", null)
    .gte("created_at", sinceISO).lt("created_at", untilISO)
  const facetRows = (facetData ?? []) as Array<Record<string, unknown>>

  // Story 75-274 — a régua dos cards (corretor ATIVO na roleta, Story 75-53, e
  // fora "corretor demo") virou responsabilidade de brokerFilterOptions: quem
  // não tem nome no mapa não entra, e o mapa já é só dos ativos. Assim não
  // existe mais o caminho em que a opção aparece rotulada com uuid — e a peneira
  // por NOME, que o uuid furava, volta a valer.
  const brokerOptions = brokerFilterOptions(facetRows, filters, brokerNameMap, HIDDEN_BROKER_NAMES)
  const calorOptions = facetOptions(facetRows, filters, "interestLevel")
  const perfilFilterGroups = PERFIL_FILTER_KEYS.map((key) => ({
    key,
    label: PERFIL_FILTER_LABELS[key] ?? key,
    options: facetOptions(facetRows, filters, key),
    coverage: facetCoverage(facetRows, filters, key),
  })).filter((g) => g.options.length > 0)

  const filtrosAtivos = activeFilterKeys(filters)

  /**
   * Story 75-272 — monta as props do <select> no SERVER: cada opção já leva o
   * href pronto (o componente client não recebe função, ver comentário nele).
   */
  const filterSelectProps = (key: typeof PERFIL_FILTER_KEYS[number] | "brokerId" | "interestLevel", opts: ReturnType<typeof facetOptions>) => ({
    allHref: buildAnalyticsHref("/dashboard/analytics", filters, periodParams, { [key]: null }),
    hasSelection: filters[key] !== null,
    options: opts.map((o) => ({
      href: buildAnalyticsHref("/dashboard/analytics", filters, periodParams, { [key]: o.value }),
      label: optionLabelComContagem(o),
      selected: filters[key] === o.value,
    })),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">
            Analytics{selectedPropertyName && (
              <span className="ml-2 text-base font-normal text-orange-600 dark:text-orange-300">· {selectedPropertyName}</span>
            )}
          </h1>
          <div className="flex items-center gap-2">
            <a href={reportHref} target="_blank" rel="noopener noreferrer"
              className="rounded-md border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800">
              Relatório PDF
            </a>
            <a href={reportHref} download
              className="rounded-md bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600">
              Baixar PDF
            </a>
          </div>
        </div>
        <ScrollableX>
          <div className="flex items-center gap-1 rounded-md bg-stone-100 p-1 dark:bg-stone-800 min-w-max">
            {/* Story 75-272 — href montado por buildAnalyticsHref: trocar de
                empreendimento PRESERVA corretor/calor/perfil. Antes era string
                à mão e apagava tudo que não fosse property_id + range (AC2). */}
            <a href={buildAnalyticsHref("/dashboard/analytics", filters, periodParams, { propertyId: null })}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${!propertyId ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-stone-100" : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"}`}>
              Todos
            </a>
            {(allProperties ?? []).map((p) => (
              <a key={p.id} href={buildAnalyticsHref("/dashboard/analytics", filters, periodParams, { propertyId: p.id })}
                className={`rounded px-3 py-1 text-sm font-medium transition-colors ${propertyId === p.id ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-stone-100" : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"}`}>
                {p.name}
              </a>
            ))}
          </div>
        </ScrollableX>
      </div>

      {/* Seletor de período GLOBAL — aplica à página inteira (Story 75-31) */}
      <AnalyticsPeriodSelector />

      {/* ── Filtros (Story 75-272) ──────────────────────────────────────────
          Corretor (97,6% preenchido) e Calor (79,6%) primeiro, porque são os
          que respondem pergunta de gestão. Perfil do lead depois: os campos
          estão em 1-2% da base, e cada opção mostra a CONTAGEM justamente para
          a escassez ser vista antes do clique, em vez de o gráfico esvaziar e
          parecer defeito. Só aparece dimensão que tem valor no período. */}
      <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <div className="flex flex-wrap items-end gap-3">
          {/* Story 75-274 — Corretor e Calor também levam o aviso de cobertura.
              Sem ele, "Frio (28) + Morno (1)" num recorte de 50 parece contador
              quebrado; com ele, lê-se "21 leads sem calor". Some quando a
              cobertura é total, para não virar ruído. */}
          <AnalyticsFilterSelect
            title="Corretor"
            coverageNote={coverageNote(facetCoverage(facetRows, filters, "brokerId")) ?? undefined}
            {...filterSelectProps("brokerId", brokerOptions)}
          />
          <AnalyticsFilterSelect
            title="Calor"
            coverageNote={coverageNote(facetCoverage(facetRows, filters, "interestLevel")) ?? undefined}
            {...filterSelectProps("interestLevel", calorOptions)}
          />
          {perfilFilterGroups.map((g) => (
            <AnalyticsFilterSelect
              key={g.key}
              title={g.label}
              coverageNote={coverageNote(g.coverage) ?? undefined}
              {...filterSelectProps(g.key, g.options)}
            />
          ))}
          {filtrosAtivos.length > 0 && (
            <a
              href={buildClearFiltersHref("/dashboard/analytics", periodParams)}
              className="mb-0.5 rounded-md border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              Limpar {filtrosAtivos.length} {filtrosAtivos.length === 1 ? "filtro" : "filtros"}
            </a>
          )}
        </div>
      </div>

      {/* Cards do período (Story 75-277: Entradas + Ativos + Perdidos — Conversão saiu) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-sm text-gray-500 dark:text-stone-400">Entradas</p>
          <p className="mt-1 text-3xl font-bold dark:text-stone-100">{entradas}</p>
          <p className="mt-0.5 text-xs text-stone-400 dark:text-stone-500">{mediaDiaria.toFixed(1)}/dia · {rangeLabel}</p>
          {deltaBadge(deltaPct(entradas, prevEntradas))}
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-sm text-gray-500 dark:text-stone-400">Ativos</p>
          <p className="mt-1 text-3xl font-bold text-blue-600 dark:text-blue-300">{ativos}</p>
          <p className="mt-0.5 text-xs text-stone-400 dark:text-stone-500">em atendimento</p>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <p className="text-sm text-gray-500 dark:text-stone-400">Perdidos</p>
          <p className="mt-1 text-3xl font-bold text-red-600 dark:text-red-300">{perdidos}</p>
          {deltaBadge(deltaPct(perdidos, prevPerdidos), { invert: true })}
        </div>
      </div>

      {/* Story 75-318/319 — régua do Pipeline entre os cards e o Leads por Período.
          75-319: os counts SEGUEM O PERÍODO (mesma fonte do Funil) — decisão do
          Marcos após os prints de 7d×30d; a foto "agora" fica no Dashboard. */}
      <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-stone-100">
          Pipeline <span className="text-xs font-normal text-stone-400">· {rangeLabel} · leads que entraram no período, por etapa atual</span>
        </h2>
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-1.5">
            {stagesOrdenadas.map((stage) => (
              <Link
                key={stage.id}
                href={`/dashboard/pipeline?stage=${stage.slug}`}
                className="flex-1 cursor-pointer rounded-md px-2.5 py-2 text-center transition-[filter] hover:brightness-125"
                style={{ backgroundColor: `${stage.color}15` }}
              >
                <p className="whitespace-nowrap text-[11px] font-medium" style={{ color: stage.color }}>
                  {stage.name}
                </p>
                <p className="mt-0.5 text-base font-bold tabular-nums text-gray-900 dark:text-stone-100">
                  {stage.count}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Leads por Período — gráfico (granularidade local; período vem da URL) */}
      <LeadsChart
        properties={(allProperties ?? []).map((p) => ({ id: p.id, name: p.name }))}
        initialPropertyId={propertyId ?? undefined}
        from={sinceISO}
        to={untilISO}
      />

      {/* Visão Executiva — 6 gráficos de leitura rápida (cruzamentos) */}
      <div>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="text-lg font-semibold dark:text-stone-100">Visão Executiva</h2>
          <span className="text-sm text-stone-400 dark:text-stone-500">{rangeLabel}</span>
        </div>
        <ExecutiveCharts
          from={sinceISO}
          to={untilISO}
          propertyId={propertyId ?? undefined}
          rangeLabel={rangeLabel}
        />
      </div>

      {/* Funnel — Story 75-318: funil de verdade em 4 andares (Atendimento →
          Visita Agendada|Visitou → Proposta → Fechamento) com líquido animado.
          Story 75-323: os números passaram a ser "quantos CHEGARAM a cada etapa"
          (antes era "quantos estão nela agora", que fazia cada andar perder quem
          avançou e o topo do funil não ser o volume de entrada). */}
      <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <h2 className="mb-1 text-lg font-semibold dark:text-stone-100">Funil de Conversão <span className="text-sm font-normal text-stone-400">· {rangeLabel}</span></h2>
        <p className="mb-4 text-sm text-stone-500 dark:text-stone-400">
          {funnelBase} entradas no período · cada andar conta quem <strong className="font-semibold">chegou até ele</strong>,
          incluindo quem já avançou ou se perdeu depois. A régua do Pipeline acima mostra onde cada lead está agora.
        </p>
        <ConversionFunnel tiers={pickFunnelTiers(funnelStages)} base={funnelBase} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* By Property */}
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="mb-4 text-lg font-semibold dark:text-stone-100">Leads por Empreendimento</h2>
          <div className="space-y-3">
            {properties.map((p) => (
              <div key={p.id} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-stone-300">{p.name}</span>
                <span className="rounded-full bg-orange-100 px-3 py-0.5 text-sm font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">{p.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* By Source */}
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="mb-4 text-lg font-semibold dark:text-stone-100">Leads por Origem <span className="text-sm font-normal text-stone-400">· {rangeLabel}</span></h2>
          <div className="space-y-3">
            {Object.entries(sourceCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([source, count]) => (
                <div key={source} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-stone-300">{sourceLabels[source] ?? source}</span>
                  <span className="rounded-full bg-blue-100 px-3 py-0.5 text-sm font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">{count}</span>
                </div>
              ))}
            {Object.keys(sourceCounts).length === 0 && (
              <p className="text-sm text-gray-400 dark:text-stone-500">Nenhum lead no período.</p>
            )}
          </div>
        </div>

        {/* Broker Performance */}
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="mb-4 text-lg font-semibold dark:text-stone-100">Leads por Corretor</h2>
          <div className="space-y-3">
            {brokers.map((broker) => (
              <div key={broker.id} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-stone-300">{broker.name}</span>
                <span className="text-sm font-medium text-gray-900 dark:text-stone-100">{broker.count} leads</span>
              </div>
            ))}
            {brokers.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-stone-500">Nenhum corretor com leads no período.</p>
            )}
          </div>
        </div>

        {/* Tempo médio de 1º atendimento */}
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="mb-1 text-lg font-semibold dark:text-stone-100">Tempo Médio de Atendimento</h2>
          <p className="mb-4 text-xs text-gray-400 dark:text-stone-500">Da distribuição até o atendimento (saída de “Aguardando atendimento”) — {rangeLabel}</p>
          {brokerResponseTimes.length > 0 ? (
            <div className="space-y-3">
              {brokerResponseTimes.map((b) => {
                const h = Math.floor(b.avgMinutes / 60)
                const m = b.avgMinutes % 60
                const label = h > 0 ? `${h}h ${m}min` : `${m}min`
                // Meta de SLA = 60 min (dentro da meta = verde; até 2x = laranja; acima = vermelho)
                const color = b.avgMinutes <= 60 ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" : b.avgMinutes <= 120 ? "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                const dot = b.avgMinutes <= 60 ? "bg-green-500" : b.avgMinutes <= 120 ? "bg-orange-500" : "bg-red-500"
                return (
                  <div key={b.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-sm text-gray-600 dark:text-stone-300">{b.name}</span>
                      <span className="ml-2 text-xs text-gray-400 dark:text-stone-500">({b.count} leads)</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                      <span className={`rounded-full px-3 py-0.5 text-sm font-semibold ${color}`}>{label}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-stone-500">Nenhum atendimento registrado no período. (A medição começou em 24/06/2026.)</p>
          )}
        </div>

        {/* Lost Reasons — Story 75-266: grupos estruturados (75-264), não texto cru */}
        <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <h2 className="mb-4 text-lg font-semibold dark:text-stone-100">Motivos de Perda <span className="text-sm font-normal text-stone-400">· {rangeLabel}</span></h2>
          <div className="space-y-3">
            {lostGroupEntries.map(({ grupo, label, count }) => (
              <div key={grupo} className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-600 dark:text-stone-300">{label}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-stone-400 dark:text-stone-500">{perdidos > 0 ? `${Math.round((count / perdidos) * 100)}%` : ""}</span>
                  <span className="rounded-full bg-red-100 px-3 py-0.5 text-sm font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">{count}</span>
                </span>
              </div>
            ))}
            {lostGroupEntries.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-stone-500">Nenhum lead perdido no período.</p>
            )}
          </div>
          {perdidos > 0 && (
            <p className="mt-4 border-t border-stone-100 pt-3 text-xs text-stone-400 dark:border-stone-800 dark:text-stone-500">
              {lostEstruturados} {lostEstruturados === 1 ? "motivo escolhido" : "motivos escolhidos"} na hora da perda
              {lostHeuristica > 0 && <> · {lostHeuristica} {lostHeuristica === 1 ? "classificado" : "classificados"} por heurística do texto antigo</>}
            </p>
          )}
        </div>
      </div>

      {/* Perfil dos Leads — Story 75-184 (insights p/ marketing) */}
      <div>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="text-lg font-semibold dark:text-stone-100">Perfil dos Leads</h2>
          <span className="text-sm text-stone-400 dark:text-stone-500">
            {perfil.comPerfil} de {perfil.total} leads com perfil · {rangeLabel}
          </span>
        </div>
        {perfil.comPerfil === 0 ? (
          <div className="rounded-lg bg-white p-5 text-sm text-gray-400 shadow-sm dark:bg-stone-900 dark:text-stone-500 dark:ring-1 dark:ring-stone-800">
            Nenhum lead com perfil preenchido no período. Os campos são preenchidos no cadastro/edição do lead — e pela Nicole, automaticamente, quando o lead menciona na conversa.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {([
              { title: "Profissão", items: perfil.profissao, badge: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300" },
              { title: "Renda familiar", items: perfil.renda, badge: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" },
              { title: "Faixa etária", items: perfil.faixaEtaria, badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
              { title: "Filhos", items: perfil.filhos, badge: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" },
              { title: "Estado civil", items: perfil.estadoCivil, badge: "bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300" },
              { title: "Moradia & Pet", items: [...perfil.moradia, ...perfil.pet.map((p) => ({ ...p, label: `Pet: ${p.label}` }))], badge: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300" },
            ] as { title: string; items: { label: string; count: number }[]; badge: string }[]).map((card) => (
              <div key={card.title} className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
                <h3 className="mb-3 text-base font-semibold dark:text-stone-100">{card.title}</h3>
                <div className="space-y-2.5">
                  {card.items.map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-stone-300">{item.label}</span>
                      <span className={`rounded-full px-3 py-0.5 text-sm font-medium ${card.badge}`}>{item.count}</span>
                    </div>
                  ))}
                  {card.items.length === 0 && (
                    <p className="text-sm text-gray-400 dark:text-stone-500">Sem dados no período.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
