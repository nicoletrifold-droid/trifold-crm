import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
import { applyLeadFilters, parseAnalyticsFilters } from "@web/lib/analytics/filters"
import { fetchAllLeads, type RangeableQuery } from "@web/lib/analytics/fetch-all-leads"
import { buildReachedSets, type StageChangeRow } from "@web/lib/analytics/funnel-reached"

// Story 75-341 (pedido do Marcos, 18/08) — "ao clicar sobre o funil em cada etapa,
// abrir a listagem referente àqueles dados".
//
// O número no andar do funil e o número da régua do Pipeline saem de uma coorte
// (leads `segmento='principal'` criados no período, com os filtros da tela) cruzada
// com o histórico de `stage_change`. Esta rota RECALCULA a mesma coorte e devolve os
// leads — não uma consulta parecida.
//
// 🔴 Por que recalcular no servidor em vez de mandar os ids junto com a página:
// a coorte de 30 dias em prod tem ~380 leads e a de 90 passa de mil. Embutir os ids
// de cada etapa no HTML infla a página inteira para servir um clique que talvez não
// aconteça. E os dois números precisam vir da MESMA função (`buildReachedSets`) —
// é isso que impede a lista de discordar da contagem clicada.
//
// ⚠️ A janela do histórico vai de `from` até AGORA (não até `to`), idêntica à da
// página: lead que entrou no fim do período e avançou depois chegou à etapa do
// mesmo jeito. Divergir aqui produziria lista menor que o número clicado.

/** Teto de linhas devolvidas. Acima disso a lista deixa de ser útil e vira scroll. */
const MAX_LINHAS = 300

interface LeadRow {
  id: string
  name: string | null
  phone: string | null
  stage_id: string | null
  created_at: string
  assigned_broker_id: string | null
  source: string | null
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  // Mesma capability da Visão Executiva e do "leads por período": quem pode ler
  // os agregados do Analytics pode abrir a lista que os compõe. Corretor não tem
  // (seed em capabilities.ts) — a base não vaza para quem só vê a carteira dele.
  const capError = await requireCapability(appUser, "analytics.executivo")
  if (capError) return capError

  const sp = request.nextUrl.searchParams
  const from = sp.get("from")
  const to = sp.get("to")
  const stageId = sp.get("stage")?.trim()
  const modo = sp.get("modo") === "agora" ? "agora" : "chegaram"

  if (!from || !to) return NextResponse.json({ error: "from e to são obrigatórios." }, { status: 400 })
  if (!stageId) return NextResponse.json({ error: "stage é obrigatório." }, { status: 400 })

  const fromMs = new Date(from).getTime()
  const toMs = new Date(to).getTime()
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    return NextResponse.json({ error: "Período inválido." }, { status: 400 })
  }

  const filters = parseAnalyticsFilters(sp)

  // ─── A coorte: idêntica à da página (segmento, período, filtros, ordem) ────
  const cohort = await fetchAllLeads<LeadRow>(() =>
    applyLeadFilters(
      supabase
        .from("leads")
        .select("id, name, phone, stage_id, created_at, assigned_broker_id, source")
        .eq("org_id", appUser.org_id)
        .eq("segmento", "principal") // Story 75-98: analytics não conta IMOB
        .gte("created_at", from)
        .lt("created_at", to)
        .order("id", { ascending: true }), // `.range()` exige coluna ÚNICA
      filters
    ) as unknown as RangeableQuery<LeadRow>
  )

  const [{ data: stageDefs }, changes] = await Promise.all([
    supabase.from("kanban_stages").select("id, name, slug").eq("org_id", appUser.org_id),
    fetchAllLeads<StageChangeRow>(() =>
      supabase
        .from("activities")
        .select("lead_id, metadata")
        .eq("org_id", appUser.org_id)
        .eq("type", "stage_change")
        .gte("created_at", from)
        .order("id", { ascending: true }) as unknown as RangeableQuery<StageChangeRow>
    ),
  ])

  const defs = (stageDefs ?? []) as Array<{ id: string; name: string; slug: string | null }>
  const etapa = defs.find((d) => d.id === stageId)
  if (!etapa) return NextResponse.json({ error: "Etapa não encontrada." }, { status: 404 })

  // ─── Quem entra na lista ──────────────────────────────────────────────────
  const selecionados =
    modo === "agora"
      ? cohort.filter((l) => l.stage_id === stageId)
      : (() => {
          const doStage = buildReachedSets(cohort, changes).get(stageId) ?? new Set<string>()
          return cohort.filter((l) => doStage.has(l.id))
        })()

  // Mais recentes primeiro: a ordem por `id` acima existe só para a paginação.
  selecionados.sort((a, b) => b.created_at.localeCompare(a.created_at))
  const pagina = selecionados.slice(0, MAX_LINHAS)

  // ─── Nomes de etapa atual e de corretor (uma query cada, só do necessário) ─
  const nomeDaEtapa = new Map(defs.map((d) => [d.id, d.name]))
  const brokerIds = [...new Set(pagina.map((l) => l.assigned_broker_id).filter((v): v is string => !!v))]
  const nomeDoCorretor = new Map<string, string>()
  if (brokerIds.length > 0) {
    const { data: users } = await supabase.from("users").select("id, name").in("id", brokerIds)
    for (const u of users ?? []) {
      const nome = (u.name as string | null)?.trim()
      if (nome) nomeDoCorretor.set(u.id as string, nome)
    }
  }

  return NextResponse.json({
    stage: { id: etapa.id, name: etapa.name, slug: etapa.slug },
    modo,
    total: selecionados.length,
    truncado: selecionados.length > pagina.length,
    leads: pagina.map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      source: l.source,
      created_at: l.created_at,
      // No modo "chegaram" a etapa atual é a informação que explica a diferença
      // entre as duas leituras — é o caso do lead que passou por Fechamento e
      // hoje está em Represamento (o que o Marcos estranhou na tela em 18/08).
      etapa_atual: l.stage_id ? (nomeDaEtapa.get(l.stage_id) ?? null) : null,
      etapa_atual_id: l.stage_id,
      corretor: l.assigned_broker_id ? (nomeDoCorretor.get(l.assigned_broker_id) ?? null) : null,
    })),
  })
}
