import { createClient } from "@web/lib/supabase/server"
import { getServerUser } from "@web/lib/auth"
import { buildLeadSearchOrFilter } from "@web/lib/leads/search"
import { parseCalor } from "@web/lib/leads/calor"
import { parseQualificacao } from "@web/lib/leads/qualificacao"
import { commercialDayRangeForOrg } from "@web/lib/metrics/commercial-day"
import { can } from "@web/lib/permissions"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { ScrollableX } from "@web/components/ui/scrollable-x"
import { LeadFilters } from "@web/components/lead-filters"
import { LeadsBulkTable } from "@web/components/leads/leads-bulk-table"
import { PERDIDO_STAGE_IDS, ACERVO_STAGE_IDS, EM_ATENDIMENTO_EXCLUDED_IDS } from "@web/lib/leads/stage-filters"
import { staleCutoffMs } from "@web/lib/broker/stale-cutoff"
import { SOURCE_LABELS } from "@web/lib/constants"
import {
  TASK_FILTER_LABELS,
  bucketByTaskDue,
  parseTaskFilter,
  taskBucketBoundaries,
  taskFilterLeadIds,
  type PendingTask,
} from "@web/lib/leads/task-buckets"
import { fetchAllLeads } from "@web/lib/analytics/fetch-all-leads"

// Opções do filtro de Origem — ordem de exibição. Rótulos vêm de SOURCE_LABELS.
const SOURCE_FILTER_KEYS = [
  "meta_ads",
  "google_ads",
  "form_qualificacao", // Story 75-330 — sem esta linha o lead do formulário some do filtro

  "whatsapp_organic",
  "whatsapp_click_to_ad",
  "website",
  "referral",
  "broker_sponsored",
  "walk_in",
  "telegram",
  "other",
] as const

const PAGE_SIZE = 50

type LeadsSearchParams = {
  search?: string
  stage_id?: string
  property_id?: string
  days?: string
  page?: string
  view?: string
  broker_id?: string
  source?: string
  calor?: string
  qualificacao?: string
  criados?: string
  date_from?: string
  date_to?: string
  tasks?: string
}

// Paginação preserva TODOS os filtros. Recebe o objeto de params (não uma fila de
// posicionais): filtro novo entra aqui sem risco de trocar a ordem dos argumentos.
function buildPageHref(targetPage: number, params: LeadsSearchParams, view: string): string {
  const p = new URLSearchParams()
  p.set("page", String(targetPage))
  if (params.search) p.set("search", params.search)
  if (params.stage_id) p.set("stage_id", params.stage_id)
  if (view === "perdidos") p.set("view", "perdidos")
  if (params.property_id) p.set("property_id", params.property_id)
  if (params.days) p.set("days", params.days)
  if (params.date_from) p.set("date_from", params.date_from)
  if (params.date_to) p.set("date_to", params.date_to)
  if (params.criados === "hoje") p.set("criados", "hoje")
  if (params.broker_id) p.set("broker_id", params.broker_id)
  if (params.source) p.set("source", params.source)
  const calorParam = parseCalor(params.calor)
  if (calorParam) p.set("calor", calorParam)
  const qualificacaoParam = parseQualificacao(params.qualificacao)
  if (qualificacaoParam) p.set("qualificacao", qualificacaoParam)
  // Story 75-298 — o filtro de tarefas sobrevive à troca de página. Em `view=perdidos`
  // ele é ignorado (critérios opostos), então também não entra no link.
  if (view !== "perdidos") {
    const tasksParam = parseTaskFilter(params.tasks)
    if (tasksParam) p.set("tasks", tasksParam)
  }
  return `?${p.toString()}`
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<LeadsSearchParams>
}) {
  const user = await getServerUser()
  const supabase = await createClient()
  const params = await searchParams

  // "Admin powers" intra-página (ex.: ações de gestão sobre leads):
  // capturado como acesso ao módulo "sistema" — somente admin tem por padrão.

  const view = params.view === "perdidos" ? "perdidos" : "ativos"
  // Story 75-151 — modo "Leads hoje" (clique no card do dashboard): lista TODOS os leads do dia
  // comercial, sem excluir perdidos/não qualificados/acervo, p/ o total bater com o card.
  const isCriadosHoje = params.criados === "hoje"
  // Story 75-298 — drill-down dos cards de tarefas do dashboard do gerente.
  // Valor fora da whitelist é ignorado (padrão de `calor`/`qualificacao`). Em
  // `view=perdidos` o filtro é IGNORADO: a RPC dos cards exclui perdidos por etapa,
  // então os dois critérios são opostos (nem filtro, nem chip).
  const taskFilter = view === "perdidos" ? null : parseTaskFilter(params.tasks)
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  let query = supabase
    .from("leads")
    .select(
      `
      id, name, phone, email, qualification_score, interest_level, qualificacao_comercial, updated_at, source, lost_reason, channel,
      stage:kanban_stages(id, name, color),
      property_interest:properties!property_interest_id(id, name),
      broker:users!assigned_broker_id(id, name)
    `
    )
    .eq("is_active", true)
    .eq("segmento", "principal") // Story 75-98: tela principal não mostra o mundo IMOB
    .order("updated_at", { ascending: false })

  let countQuery = supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .eq("segmento", "principal")

  // Filtro por view: ativos exclui stages de perdido, perdidos só inclui.
  // Story 75-151: no modo "criados=hoje" NÃO excluímos etapas (mostra tudo do dia → bate com o card).
  // Story 75-298: no modo `tasks=` a lista ESPELHA o critério da RPC dos cards
  // (`get_broker_dashboard_counts`, mig 209:313-359) — exclui só PERDIDO_STAGE_IDS
  // (o ACERVO conta, e está dentro do número do card) e exige `lost_reason IS NULL`.
  // Sem este ramo o número da lista fica MENOR que o do card. Precede `criados=hoje`
  // porque é o critério que tem de bater com um card.
  if (view === "perdidos") {
    query = query.in("stage_id", PERDIDO_STAGE_IDS)
    countQuery = countQuery.in("stage_id", PERDIDO_STAGE_IDS)
  } else if (taskFilter) {
    const excluded = `(${PERDIDO_STAGE_IDS.join(",")})`
    query = query.not("stage_id", "in", excluded).is("lost_reason", null)
    countQuery = countQuery.not("stage_id", "in", excluded).is("lost_reason", null)
  } else if (!isCriadosHoje) {
    const excluded = `(${EM_ATENDIMENTO_EXCLUDED_IDS.join(",")})`
    query = query.not("stage_id", "in", excluded)
    countQuery = countQuery.not("stage_id", "in", excluded)
  }

  if (params.search) {
    // Story 75-167 — busca sem acento (name_search) + fuzzy/typo (RPC). Preserva os
    // demais filtros/paginação abaixo (só o trecho de busca muda).
    const orFilter = await buildLeadSearchOrFilter(supabase, user.orgId, params.search)
    if (orFilter) {
      query = query.or(orFilter)
      countQuery = countQuery.or(orFilter)
    }
  }

  if (params.stage_id) {
    query = query.eq("stage_id", params.stage_id)
    countQuery = countQuery.eq("stage_id", params.stage_id)
  }

  if (params.property_id) {
    query = query.eq("property_interest_id", params.property_id)
    countQuery = countQuery.eq("property_interest_id", params.property_id)
  }

  if (params.broker_id) {
    query = query.eq("assigned_broker_id", params.broker_id)
    countQuery = countQuery.eq("assigned_broker_id", params.broker_id)
  }

  if (params.source) {
    query = query.eq("source", params.source)
    countQuery = countQuery.eq("source", params.source)
  }

  // Story 75-236 — Calor do Lead (leads.interest_level). Valor fora da whitelist
  // é ignorado (nunca vai cru ao filtro); "none" = ainda não definido (NULL).
  const calor = parseCalor(params.calor)
  if (calor === "none") {
    query = query.is("interest_level", null)
    countQuery = countQuery.is("interest_level", null)
  } else if (calor) {
    query = query.eq("interest_level", calor)
    countQuery = countQuery.eq("interest_level", calor)
  }

  // Story 84-2 (Epic 84) — Qualificação Comercial (leads.qualificacao_comercial). Mesmo padrão
  // do Calor acima: whitelist própria, combinável (independente) com o filtro de Calor.
  const qualificacao = parseQualificacao(params.qualificacao)
  if (qualificacao === "none") {
    query = query.is("qualificacao_comercial", null)
    countQuery = countQuery.is("qualificacao_comercial", null)
  } else if (qualificacao) {
    query = query.eq("qualificacao_comercial", qualificacao)
    countQuery = countQuery.eq("qualificacao_comercial", qualificacao)
  }

  if (params.days) {
    const cutoff = staleCutoffMs(Number(params.days))
    if (cutoff) {
      const daysAgo = new Date(cutoff).toISOString()
      query = query.lt("updated_at", daysAgo)
      countQuery = countQuery.lt("updated_at", daysAgo)
    }
  }

  // "criados=hoje" — usa o DIA COMERCIAL (vira no fechamento, não meia-noite),
  // mesma fonte do card "Leads hoje" do dashboard (Story 75-57).
  let commercialDayFromIso: string | null = null
  if (isCriadosHoje) {
    const { from } = await commercialDayRangeForOrg(user.orgId, supabase)
    commercialDayFromIso = from.toISOString()
    query = query.gte("created_at", commercialDayFromIso)
    countQuery = countQuery.gte("created_at", commercialDayFromIso)
  }

  // Story 75-94 — filtro de período de captura (created_at), fuso America/Sao_Paulo (UTC-3),
  // mesmo padrão do Pipeline. De inclui 00:00; Até inclui 23:59:59.
  if (params.date_from) {
    const from = `${params.date_from}T00:00:00-03:00`
    query = query.gte("created_at", from)
    countQuery = countQuery.gte("created_at", from)
  }
  if (params.date_to) {
    const to = `${params.date_to}T23:59:59-03:00`
    query = query.lte("created_at", to)
    countQuery = countQuery.lte("created_at", to)
  }

  // ── Story 75-298 — filtro por tarefas (drill-down dos cards) ─────────────────
  // Filtro SERVER-SIDE por ids: aplicado em `query` E `countQuery` para a paginação
  // e o `totalCount` continuarem coerentes.
  //
  // O fetch tem de vir ANTES do `.range()`/`Promise.all` (o filtro precisa estar na
  // query antes dela rodar), logo é um round-trip serial — só quando `tasks=` está
  // ativo. PAGINADO via `fetchAllLeads`: o PostgREST corta em 1000 linhas EM SILÊNCIO
  // e um corte aqui faria o número da lista divergir do card sem erro nenhum
  // (mesma armadilha das stories 75-269/75-273 e 75-278). `.order("id")` porque
  // `.range()` só é estável sobre coluna ÚNICA (`lead_tasks.id` é a PK).
  //
  // Espelho da bucketização de `/broker/leads/page.tsx` (mesmo helper). NÃO filtra
  // por `assigned_to`: tarefa criada pelo corretor grava `assigned_to = NULL`
  // (Story 75-42). RLS de `lead_tasks` é `org_id = user_org_id()` (mig 053), então o
  // client de sessão do gerente já lê a org inteira.
  if (taskFilter) {
    const pendingTasks = await fetchAllLeads<PendingTask>(() =>
      supabase
        .from("lead_tasks")
        .select("lead_id, due_at")
        .eq("org_id", user.orgId)
        .is("completed_at", null)
        .order("id")
    )

    const buckets = bucketByTaskDue(pendingTasks, taskBucketBoundaries())
    const includeIds = taskFilterLeadIds(buckets, taskFilter)

    if (includeIds) {
      // atrasadas / para-hoje / futuras → inclusão.
      if (includeIds.size === 0) {
        // Guarda de lista vazia: `.in("id", [])` gera `id=in.()`, que é SQL inválido.
        // `id IS NULL` é válido e nunca casa (a PK é NOT NULL) → lista vazia honesta.
        query = query.is("id", null)
        countQuery = countQuery.is("id", null)
      } else {
        const ids = [...includeIds]
        query = query.in("id", ids)
        countQuery = countQuery.in("id", ids)
      }
    } else if (buckets.comTarefa.size > 0) {
      // sem-tarefas → EXCLUSÃO de quem tem tarefa aberta (com ou sem `due_at`,
      // igual ao `NOT EXISTS` da RPC). Conjunto vazio = ninguém a excluir → sem filtro
      // (`.not("id","in","()")` seria SQL inválido).
      //
      // Tamanho de URL medido em prod em 12/08 (T0): 266 ids em escopo ≈ 9,9 KB, e o
      // gateway do Supabase aceitou até ~600 uuids (≈ 22 KB) devolvendo 200 — 700
      // (≈ 26 KB) já dá 400. Sobra ~2,3× de folga; acima disso a falha é RUIDOSA
      // (400 do PostgREST), não silenciosa. Se o volume dobrar, a saída é uma RPC
      // dedicada, nunca paginação client-side.
      const excludeIds = `(${[...buckets.comTarefa].join(",")})`
      query = query.not("id", "in", excludeIds)
      countQuery = countQuery.not("id", "in", excludeIds)
    }
  }

  query = query.range(offset, offset + PAGE_SIZE - 1)

  const [leadsResult, countResult, perdidosCountResult, ativosCountResult, stagesResult, propertiesResult, brokersResult, perdidosHojeResult, acervoHojeResult] = await Promise.all([
    query,
    countQuery,
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .in("stage_id", PERDIDO_STAGE_IDS),
    // Story 75-129 — total da aba "Em atendimento" (sem filtros), paridade com Perdidos
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("segmento", "principal")
      .not("stage_id", "in", `(${EM_ATENDIMENTO_EXCLUDED_IDS.join(",")})`),
    supabase.from("kanban_stages").select("id, name, color").eq("org_id", user.orgId).order("position"),
    supabase.from("properties").select("id, name").eq("is_active", true).order("name"),
    supabase.from("users").select("id, name").eq("org_id", user.orgId).eq("is_active", true).in("role", ["broker", "gerente-comercial", "sdr"]).order("name"),
    // Story 75-151 — quebra por situação DO DIA (só no modo "criados=hoje"): perdidos/não qualif. e acervo.
    isCriadosHoje && commercialDayFromIso
      ? supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("is_active", true).eq("segmento", "principal")
          .gte("created_at", commercialDayFromIso).in("stage_id", PERDIDO_STAGE_IDS)
      : Promise.resolve({ count: 0 }),
    isCriadosHoje && commercialDayFromIso
      ? supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("is_active", true).eq("segmento", "principal")
          .gte("created_at", commercialDayFromIso).in("stage_id", ACERVO_STAGE_IDS)
      : Promise.resolve({ count: 0 }),
  ])
  const leads = leadsResult.data

  // Story 75-160 — sinal robusto de WhatsApp: existe conversa com channel='whatsapp'?
  // Uma query batelada pelos ids da página (sem N+1) — o número cru/atípico não
  // deve esconder o balão de quem comprovadamente já conversou no WhatsApp.
  const pageLeadIds = (leads ?? []).map((l) => l.id)
  const waConversationLeadIds = new Set<string>()
  if (pageLeadIds.length > 0) {
    const { data: waConvs } = await supabase
      .from("conversations")
      .select("lead_id")
      .eq("channel", "whatsapp")
      .in("lead_id", pageLeadIds)
    for (const c of waConvs ?? []) {
      if (c.lead_id) waConversationLeadIds.add(c.lead_id as string)
    }
  }

  const totalCount = countResult.count ?? 0
  const perdidosCount = perdidosCountResult.count ?? 0
  const ativosCount = ativosCountResult.count ?? 0
  // Story 75-151 — baldes do dia p/ a linha-resumo. em-atendimento = total do dia − perdidos − acervo.
  const perdidosHojeCount = perdidosHojeResult.count ?? 0
  const acervoHojeCount = acervoHojeResult.count ?? 0
  const emAtendimentoHojeCount = Math.max(0, totalCount - perdidosHojeCount - acervoHojeCount)
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const allStages = stagesResult.data ?? []
  const allProperties = propertiesResult.data ?? []
  const allBrokers = brokersResult.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Leads</h1>
        <Link
          href="/dashboard/leads/new"
          className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          Novo lead
        </Link>
      </div>

      {/* Tabs Ativos / Perdidos */}
      <div className="flex gap-1 border-b border-stone-200 dark:border-stone-800">
        <Link
          href="/dashboard/leads"
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            view === "ativos"
              ? "border-b-2 border-orange-500 text-orange-600 dark:text-orange-400"
              : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
          }`}
        >
          Em atendimento ({ativosCount})
        </Link>
        <Link
          href="/dashboard/leads?view=perdidos"
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            view === "perdidos"
              ? "border-b-2 border-red-500 text-red-600 dark:text-red-400"
              : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
          }`}
        >
          Perdidos ({perdidosCount})
        </Link>
      </div>

      <div className="space-y-3">
        <form method="get" className="flex gap-2">
          {view === "perdidos" && <input type="hidden" name="view" value="perdidos" />}
          {/* QA 75-236: o form reescreve a query string inteira — sem estes hidden,
              buscar por nome DEPOIS de escolher um filtro apagava o filtro calado. */}
          {Object.entries({
            stage_id: params.stage_id,
            property_id: params.property_id,
            broker_id: params.broker_id,
            source: params.source,
            calor: parseCalor(params.calor) ?? undefined,
            qualificacao: parseQualificacao(params.qualificacao) ?? undefined,
            days: params.days,
            date_from: params.date_from,
            date_to: params.date_to,
            criados: isCriadosHoje ? "hoje" : undefined,
            // Story 75-298 — sem este hidden, buscar por nome DENTRO do filtro de
            // tarefas apagava o filtro calado (o mesmo bug do QA da 75-236).
            tasks: taskFilter ?? undefined,
          }).map(([name, value]) =>
            value ? <input key={name} type="hidden" name={name} value={value} /> : null
          )}
          <input
            type="text"
            name="search"
            placeholder="Buscar por nome ou telefone..."
            defaultValue={params.search ?? ""}
            className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500 dark:focus:border-orange-400"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
          >
            Buscar
          </button>
        </form>
        <LeadFilters
          stages={allStages.map(s => ({ id: s.id, name: s.name, color: s.color }))}
          properties={allProperties.map(p => ({ id: p.id, name: p.name }))}
          brokers={(await can(user.id, user.orgId, "leads.ver_equipe"))
            ? allBrokers.map(b => ({ id: b.id, name: b.name }))
            : undefined}
          sources={SOURCE_FILTER_KEYS.map(k => ({ value: k, label: SOURCE_LABELS[k] ?? k }))}
          stageParam="stage_id"
          propertyParam="property_id"
          daysParam="days"
          brokerParam="broker_id"
          sourceParam="source"
          showCalor
          calorParam="calor"
          showQualificacao
          qualificacaoParam="qualificacao"
          showDateRange
          dateFromParam="date_from"
          dateToParam="date_to"
        />
      </div>

      {/* Story 75-298 — chip do filtro de tarefas ativo, com × que remove SÓ o `tasks`
          (preservando os demais filtros). Par claro/escuro obrigatório em /dashboard:
          copiar o markup do /broker verbatim seria regressão no tema claro. */}
      {taskFilter && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-700 dark:bg-orange-500/20 dark:text-orange-400">
            {TASK_FILTER_LABELS[taskFilter]}
            <Link
              href={buildPageHref(1, { ...params, tasks: undefined }, view)}
              className="ml-1 text-orange-700/60 hover:text-orange-900 dark:text-orange-400/60 dark:hover:text-orange-300"
              aria-label="Remover filtro de tarefas"
            >
              ×
            </Link>
          </span>
        </div>
      )}

      {/* Story 75-129 — total de resultados do filtro (sempre visível) */}
      {/* Story 75-151 — no modo "Leads hoje", quebra por situação p/ explicar o total do card */}
      <p className="text-sm text-stone-500 dark:text-stone-400">
        <span className="font-semibold text-stone-900 dark:text-stone-100">{totalCount}</span>{" "}
        {isCriadosHoje ? (totalCount === 1 ? "lead hoje" : "leads hoje") : (totalCount === 1 ? "lead" : "leads")}
        {/* Story 75-298 — deixa explícito na linha-resumo QUAL filtro produziu o número
            (é este total que tem de bater com o card do dashboard). */}
        {taskFilter && <>{" · "}{TASK_FILTER_LABELS[taskFilter].toLowerCase()}</>}
        {isCriadosHoje && perdidosHojeCount + acervoHojeCount > 0 && (
          <>
            {" · "}{emAtendimentoHojeCount} em atendimento
            {perdidosHojeCount > 0 && <>{" · "}{perdidosHojeCount} perdidos/não qualificados</>}
            {acervoHojeCount > 0 && <>{" · "}{acervoHojeCount} em acervo</>}
          </>
        )}
      </p>

      <div className="rounded-lg bg-white shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <ScrollableX>
          <LeadsBulkTable
            leads={(leads ?? []).map((lead) => {
              type StageItem = { id: string; name: string; color: string | null }
              type PropItem = { id: string; name: string }
              type BrokerItem = { id: string; name: string }
              const stageRaw = lead.stage as unknown as StageItem[] | StageItem | null
              const propertyRaw = lead.property_interest as unknown as PropItem[] | PropItem | null
              const brokerRaw = lead.broker as unknown as BrokerItem[] | BrokerItem | null
              return {
                id: lead.id,
                name: lead.name ?? null,
                phone: lead.phone,
                qualification_score: lead.qualification_score ?? null,
                // Story 75-237 — calor na lista (o campo já vinha no SELECT).
                interest_level: (lead as unknown as Record<string, unknown>).interest_level as string | null,
                // Story 84-6 (Epic 84) — Qualificação Comercial na lista.
                qualificacao_comercial: (lead as unknown as Record<string, unknown>).qualificacao_comercial as string | null,
                updated_at: lead.updated_at ?? null,
                source: (lead as unknown as Record<string, unknown>).source as string | null,
                // Story 75-160 — WhatsApp comprovado por conversa OU canal de aquisição.
                hasWhatsappConversation:
                  waConversationLeadIds.has(lead.id) ||
                  ((lead as unknown as Record<string, unknown>).channel as string | null) === "whatsapp",
                stage: Array.isArray(stageRaw) ? stageRaw[0] ?? null : stageRaw ?? null,
                property_interest: Array.isArray(propertyRaw) ? propertyRaw[0] ?? null : propertyRaw ?? null,
                broker: Array.isArray(brokerRaw) ? brokerRaw[0] ?? null : brokerRaw ?? null,
              }
            })}
            brokers={allBrokers}
            view={view}
            canReactivate={await can(user.id, user.orgId, "leads.reativar")}
          />
        </ScrollableX>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-stone-800">
            {page > 1 ? (
              <Link
                href={buildPageHref(page - 1, params, view)}
                className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                <ChevronLeft className="h-4 w-4" /> Anterior
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-300 dark:border-stone-800 dark:text-stone-600"
              >
                <ChevronLeft className="h-4 w-4" /> Anterior
              </span>
            )}
            <span className="text-sm text-gray-500 dark:text-stone-400">
              Exibindo {leads?.length ?? 0} de {totalCount} leads — Página{" "}
              {page} de {totalPages}
            </span>
            {page < totalPages ? (
              <Link
                href={buildPageHref(page + 1, params, view)}
                className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                Próxima <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-300 dark:border-stone-800 dark:text-stone-600"
              >
                Próxima <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
