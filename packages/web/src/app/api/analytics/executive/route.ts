import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { SOURCE_LABELS_SHORT } from "@web/lib/constants"
import {
  buildComparison,
  buildHeatmap,
  buildOutcomeRows,
  buildSourceTrend,
  buildVisits,
  pickGranularity,
  type ExecutiveData,
} from "@web/lib/analytics/executive"
// Story 75-269 — paginação extraída daqui e compartilhada com o /leads-by-period.
import { fetchAllLeads, LEADS_PAGE_SIZE, type RangeableQuery } from "@web/lib/analytics/fetch-all-leads"
import { ANALYTICS_APPOINTMENT_TEAM } from "@web/lib/analytics/visits-rule"
// Story 75-324 — os MESMOS filtros da página, lidos e aplicados pelo mesmo módulo.
import { activeFilterKeys, applyLeadFilters, parseAnalyticsFilters } from "@web/lib/analytics/filters"

// Mesmos nomes ocultos da tela de Analytics (contas de demonstração).
const HIDDEN_BROKER_NAMES = new Set(["corretor demo", "target editado"])

interface LeadRow {
  id: string
  created_at: string
  source: string | null
  lost_reason: string | null
  is_active: boolean | null
  assigned_broker_id: string | null
}

/**
 * Dados da seção "Visão Executiva" do Analytics, em uma chamada só.
 * PostgREST corta em 1000 linhas → paginamos com .range() (janelas de 90d
 * passam de 1000 leads com folga).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = await requireCapability(appUser, "analytics.executivo")
  if (roleError) return roleError

  const sp = request.nextUrl.searchParams
  const from = sp.get("from")
  const to = sp.get("to")
  // Story 75-324 — a Visão Executiva lia SÓ `property` e ficava global enquanto o
  // resto da tela encolhia: com um corretor selecionado, o Funil e os KPIs mostravam
  // o recorte dele e estes gráficos mostravam a org inteira, um ao lado do outro.
  // Agora os filtros vêm pelos MESMOS parâmetros da página (`parseAnalyticsFilters`).
  // `property` (nome antigo) segue aceito para não quebrar link salvo.
  const filters = parseAnalyticsFilters(sp)
  if (!filters.propertyId) {
    const legado = sp.get("property")?.trim()
    if (legado) filters.propertyId = legado
  }
  const propertyId = filters.propertyId ?? ""
  if (!from || !to) {
    return NextResponse.json({ error: "from and to are required" }, { status: 400 })
  }

  const fromMs = new Date(from).getTime()
  const toMs = new Date(to).getTime()
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 })
  }
  // Janela anterior de MESMA duração, imediatamente antes (base do comparativo).
  const prevFrom = new Date(fromMs - (toMs - fromMs)).toISOString()
  const prevTo = from

  // Teto do PostgREST, usado no `.limit()` de appointments abaixo. Era um
  // `const PAGE = 1000` local; virou a constante compartilhada na Story 75-269
  // (mesmo valor, um lugar só).
  const PAGE = LEADS_PAGE_SIZE

  // Story 75-269 — o laço de paginação que vivia aqui virou
  // `lib/analytics/fetch-all-leads.ts`, compartilhado com o /leads-by-period.
  // Recorte, filtros e ordem seguem IDÊNTICOS: só o laço saiu daqui.
  function fetchLeads(sinceISO: string, untilISO: string, columns: string): Promise<LeadRow[]> {
    return fetchAllLeads<LeadRow>(() => {
      const q = supabase
        .from("leads")
        .select(columns)
        .eq("org_id", appUser.org_id)
        .eq("segmento", "principal") // Story 75-98: analytics não conta IMOB
        .gte("created_at", sinceISO)
        .lt("created_at", untilISO)
        .order("created_at", { ascending: true })
      // Story 75-324 — era um `.eq("property_interest_id", …)` solto; agora TODOS os
      // filtros da página valem aqui, pelo mesmo helper que a tela e o PDF usam.
      // O select com colunas dinâmicas (string) faz o PostgREST devolver
      // `ParserError`; o cast reconcilia com LeadRow, como já era antes.
      return applyLeadFilters(q, filters) as unknown as RangeableQuery<LeadRow>
    })
  }

  try {
    // Story 75-324 — `appointments` só tem duas das doze dimensões de filtro
    // (empreendimento e corretor); as outras (calor, perfil) vivem em `leads`.
    // Aplicamos as duas que existem e OMITIMOS o card quando alguma das outras está
    // ativa — é o mesmo princípio que o PDF já seguia (75-271): melhor não mostrar
    // do que mostrar um número que ignora o filtro ao lado de números que o respeitam.
    const filtrosNaoAplicaveis = activeFilterKeys(filters).filter(
      (k) => k !== "propertyId" && k !== "brokerId"
    )
    const visitsFiltravel = filtrosNaoAplicaveis.length === 0

    let apptsQuery = supabase
      .from("appointments")
      .select("scheduled_at, status")
      .eq("org_id", appUser.org_id)
      // agenda IMOB fora do analytics principal (Epic 81). Story 75-322: a equipe
      // virou constante compartilhada com o PDF, que não tinha esse recorte.
      .eq("team", ANALYTICS_APPOINTMENT_TEAM)
      .gte("scheduled_at", from)
      .lt("scheduled_at", to)
      .limit(PAGE)
    if (propertyId) apptsQuery = apptsQuery.eq("property_id", propertyId)
    if (filters.brokerId) apptsQuery = apptsQuery.eq("broker_id", filters.brokerId)

    // Story 75-276 — leads COM visita registrada, base da faixa "Agendou/fez visita".
    //
    // O recorte é POR LEAD, nunca por data: a visita pode ser marcada muito depois da
    // entrada do lead, então filtrar `appointments` por período perderia justamente as
    // visitas que a faixa existe para contar. Por isso esta query não repete o
    // `.gte/.lt(scheduled_at)` da `apptsQuery` acima — são perguntas diferentes.
    //
    // Traz o conjunto inteiro (paginado) em vez de lotes de `lead_id`: `.in()` com
    // centenas de uuid estoura o tamanho da URL, e a tabela toda tem 55 visitas house
    // (medido em prod, 05/08) — o cruzamento sai em memória, de graça. Se um dia passar
    // da ordem de 20k linhas, aí vale trocar por lotes de lead_id.
    //
    // NÃO filtra por `property_id` de propósito: a pergunta é "este lead chegou à
    // visita?", e o recorte de empreendimento já foi aplicado na lista de leads — um lead
    // interessado no Vind que visitou o Yarden chegou à visita do mesmo jeito.
    const visitLeadIdsQuery = () =>
      supabase
        .from("appointments")
        .select("lead_id")
        .eq("org_id", appUser.org_id)
        .eq("team", "house") // agenda IMOB fora do analytics principal (Epic 81)
        .not("lead_id", "is", null)
        // Ordena pela PK, NÃO por lead_id: `fetchAllLeads` pagina com `.range()`, e
        // ordem com empate não é determinística entre páginas — linha pulada ou
        // repetida. `lead_id` repete (8 leads têm 2+ visitas, um tem 5); `id` é único.
        // Hoje a tabela tem 59 linhas e nunca pagina, mas o dia em que paginar o erro
        // seria um número silenciosamente errado na tela — que é exatamente o defeito
        // que este projeto já pagou caro algumas vezes.
        .order("id", { ascending: true }) as unknown as RangeableQuery<{ lead_id: string | null }>

    const [leads, prevLeads, { data: activeBrokersData }, apptsRes, visitRows] = await Promise.all([
      fetchLeads(from, to, "id, created_at, source, lost_reason, is_active, assigned_broker_id"),
      fetchLeads(prevFrom, prevTo, "id, created_at, source, lost_reason, is_active, assigned_broker_id"),
      supabase.from("brokers").select("user_id").eq("org_id", appUser.org_id).eq("is_available", true),
      apptsQuery,
      fetchAllLeads<{ lead_id: string | null }>(visitLeadIdsQuery),
    ])
    if (apptsRes.error) throw apptsRes.error

    const visitLeadIds = new Set(
      visitRows.map((r) => r.lead_id).filter((id): id is string => !!id)
    )

    // Nomes dos corretores com lead na janela (uma query, sem embed por linha).
    const brokerIds = [...new Set(leads.map((l) => l.assigned_broker_id).filter((id): id is string => !!id))]
    const { data: brokerUsers } = brokerIds.length
      ? await supabase.from("users").select("id, name").in("id", brokerIds)
      : { data: [] as { id: string; name: string }[] }
    const brokerNames = new Map((brokerUsers ?? []).map((u) => [u.id as string, (u.name as string) ?? "Sem nome"]))
    const activeBrokerIds = new Set((activeBrokersData ?? []).map((b) => b.user_id as string))

    const granularity = pickGranularity(Math.max(1, Math.round((toMs - fromMs) / 86400000)))

    const data: ExecutiveData = {
      comparison: buildComparison(
        leads.map((l) => l.created_at),
        prevLeads.map((l) => l.created_at),
        from, to, prevFrom, prevTo
      ),
      sourceTrend: buildSourceTrend(leads, from, to, granularity, SOURCE_LABELS_SHORT),
      heatmap: buildHeatmap(leads),
      outcomeBySource: buildOutcomeRows(
        leads,
        visitLeadIds,
        (l) => l.source ?? "other",
        (k) => SOURCE_LABELS_SHORT[k] ?? k
      ),
      outcomeByBroker: buildOutcomeRows(
        leads,
        visitLeadIds,
        (l) => {
          const id = l.assigned_broker_id
          if (!id || !activeBrokerIds.has(id)) return null
          const name = brokerNames.get(id) ?? ""
          return HIDDEN_BROKER_NAMES.has(name.toLowerCase().trim()) ? null : id
        },
        (k) => brokerNames.get(k) ?? "Sem nome"
      ),
      visits: visitsFiltravel
        ? buildVisits((apptsRes.data ?? []) as { scheduled_at: string; status: string }[], from, to, granularity)
        : null,
      visitsIndisponivelPor: visitsFiltravel ? null : filtrosNaoAplicaveis,
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("[ANALYTICS/executive]", error)
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }
}
