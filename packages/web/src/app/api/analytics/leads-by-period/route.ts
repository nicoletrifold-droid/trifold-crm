import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireCapability } from "@web/lib/api-auth"
// Story 75-269 — paginação do PostgREST compartilhada com /analytics/executive.
import { fetchAllLeads } from "@web/lib/analytics/fetch-all-leads"
import { SEM_ORIGEM_KEY } from "@web/lib/analytics/sources-presentes"

type Granularity = "day" | "week" | "month"

interface PeriodEntry {
  period: string
  count: number
  byProperty: Record<string, number>
}

/** Story 75-269 — `source` entrou no select p/ derivar as origens da janela. */
interface LeadRow {
  created_at: string
  property_interest_id: string | null
  source: string | null
}

function getPeriodKey(isoDate: string, granularity: Granularity): string {
  const d = new Date(isoDate)
  // BRT = UTC-3
  const brtMs = d.getTime() - 3 * 60 * 60 * 1000
  const brt = new Date(brtMs)

  if (granularity === "day") {
    return `${brt.getUTCFullYear()}-${String(brt.getUTCMonth() + 1).padStart(2, "0")}-${String(brt.getUTCDate()).padStart(2, "0")}`
  }
  if (granularity === "week") {
    const day = brt.getUTCDay()
    const diff = day === 0 ? -6 : 1 - day
    brt.setUTCDate(brt.getUTCDate() + diff)
    return `${brt.getUTCFullYear()}-${String(brt.getUTCMonth() + 1).padStart(2, "0")}-${String(brt.getUTCDate()).padStart(2, "0")}`
  }
  return `${brt.getUTCFullYear()}-${String(brt.getUTCMonth() + 1).padStart(2, "0")}`
}

function generatePeriods(from: string, to: string, granularity: Granularity): string[] {
  const periods: string[] = []
  const start = new Date(from)
  const end = new Date(to)

  if (granularity === "day") {
    const cur = new Date(
      `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}-${String(start.getUTCDate()).padStart(2, "0")}T03:00:00Z`
    )
    const endSnap = new Date(
      `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}-${String(end.getUTCDate()).padStart(2, "0")}T03:00:00Z`
    )
    while (cur <= endSnap) {
      periods.push(
        `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}-${String(cur.getUTCDate()).padStart(2, "0")}`
      )
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
  } else if (granularity === "week") {
    const cur = new Date(start)
    const day = cur.getUTCDay()
    cur.setUTCDate(cur.getUTCDate() - (day === 0 ? 6 : day - 1))
    cur.setUTCHours(3, 0, 0, 0)
    while (cur <= end) {
      periods.push(
        `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}-${String(cur.getUTCDate()).padStart(2, "0")}`
      )
      cur.setUTCDate(cur.getUTCDate() + 7)
    }
  } else {
    const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
    const endMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))
    while (cur <= endMonth) {
      periods.push(
        `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}`
      )
      cur.setUTCMonth(cur.getUTCMonth() + 1)
    }
  }

  return periods
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = await requireCapability(appUser, "analytics.executivo")
  if (roleError) return roleError

  const sp = request.nextUrl.searchParams
  const from = sp.get("from")
  const to = sp.get("to")
  const granularity = (sp.get("granularity") ?? "day") as Granularity
  const propertyId = sp.get("property") ?? ""
  const source = sp.get("source") ?? ""

  if (!from || !to) {
    return NextResponse.json({ error: "from and to are required" }, { status: 400 })
  }
  if (!["day", "week", "month"].includes(granularity)) {
    return NextResponse.json({ error: "Invalid granularity" }, { status: 400 })
  }

  // Story 75-269 — a janela inteira, paginada: o PostgREST corta em 1000 em
  // silêncio (não falha, devolve menos). Medido em prod 04/08: 612 leads em 90d
  // neste recorte — 61% do teto, ainda não corta, mas o dia em que passar o
  // gráfico simplesmente mostraria menos sem avisar. Mesmo helper do
  // /api/analytics/executive, que já paginava porque o recorte DELE (sem
  // is_active/lost_reason) passa de 1000 com folga (1.650 em 90d).
  //
  // O filtro de ORIGEM saiu da query e passou a ser aplicado em JS, ao lado do
  // de empreendimento (que já era assim, ver abaixo): é o que permite conhecer
  // TODAS as origens presentes na janela para montar o dropdown (Story 75-269),
  // em vez de oferecer uma lista fixa que escondia 41,5% dos leads.
  let rawLeads: LeadRow[]
  let rawProperties: Array<{ id: string; name: string }> | null
  try {
    const [leads, props] = await Promise.all([
      fetchAllLeads<LeadRow>(() =>
        supabase
          .from("leads")
          .select("created_at, property_interest_id, source")
          .eq("segmento", "principal") // Story 75-98: analytics não conta IMOB (fix: faltava aqui)
          .eq("is_active", true)
          .is("lost_reason", null)
          .gte("created_at", from)
          .lte("created_at", to)
          .order("created_at")
      ),
      supabase.from("properties").select("id, name").eq("is_active", true),
    ])
    rawLeads = leads
    rawProperties = props.data
  } catch (error) {
    console.error("[ANALYTICS/leads-by-period]", error)
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }

  const propNames = new Map((rawProperties ?? []).map((p) => [p.id, p.name]))

  // Fill all periods (including zeros)
  const allPeriods = generatePeriods(from, to, granularity)
  const periodMap = new Map<string, PeriodEntry>()
  for (const p of allPeriods) {
    periodMap.set(p, { period: p, count: 0, byProperty: {} })
  }

  // Story 75-269 — origens presentes na janela INTEIRA (antes de qualquer
  // filtro), para o dropdown oferecer só o que existe. Conta sempre a janela
  // toda, mesmo com uma origem selecionada: senão escolher uma origem colapsaria
  // o dropdown para ela só, e não haveria como voltar.
  const sources: Record<string, number> = {}

  // Aggregate
  for (const lead of rawLeads) {
    // Ressalva R3 do @po: lead sem origem entra em chave própria em vez de ser
    // descartado — assim a soma das origens fecha com o total da janela.
    const sourceKey = lead.source ?? SEM_ORIGEM_KEY
    sources[sourceKey] = (sources[sourceKey] ?? 0) + 1

    const period = getPeriodKey(lead.created_at, granularity)
    const entry = periodMap.get(period)
    if (!entry) continue

    // Filtro de origem: era `.eq("source", …)` na query (Story 75-269 moveu
    // para cá). Aplicado ANTES do byProperty para preservar o comportamento
    // anterior — com uma origem selecionada, o tooltip de empreendimento
    // também só considerava aquela origem.
    if (source && lead.source !== source) continue

    const propName = lead.property_interest_id ? (propNames.get(lead.property_interest_id) ?? "Outro") : "Outro"
    entry.byProperty[propName] = (entry.byProperty[propName] ?? 0) + 1

    // Apply property filter for bar height
    if (!propertyId || lead.property_interest_id === propertyId) {
      entry.count++
    }
  }

  const data = allPeriods.map((p) => periodMap.get(p)!)

  const total = data.reduce((sum, d) => sum + d.count, 0)
  const peakEntry = data.reduce(
    (max, d) => (d.count > max.count ? d : max),
    data[0] ?? { period: "", count: 0, byProperty: {} }
  )
  const days = Math.max(1, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)))

  return NextResponse.json({
    data,
    summary: {
      total,
      dailyAvg: Math.round((total / days) * 10) / 10,
      peakPeriod: peakEntry.period,
      peakCount: peakEntry.count,
      // Story 75-269 — origens presentes na janela (contagem da janela inteira,
      // independente dos filtros ativos): é a partir disto que o dropdown de
      // Origem se monta, em vez de uma lista fixa.
      sources,
    },
  })
}
