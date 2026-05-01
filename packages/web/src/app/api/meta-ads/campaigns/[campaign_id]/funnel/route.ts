import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

interface CampaignFunnelResponse {
  stages: {
    leads_meta: number
    leads_crm: number
    responderam: number
    qualificados: number
    visita_agendada: number
    proposta: number
  }
  gargalo: "leads_crm" | "responderam" | "qualificados" | "visita_agendada" | "proposta" | null
  cpl_real: number | null
  taxa_qualificacao: number | null
  taxa_visita: number | null
}

const QUALIFIED_STATUSES = new Set([
  "contacted", "qualified", "visit_scheduled", "visited", "proposal", "closed",
])
const VISITA_STATUSES = new Set(["visit_scheduled", "visited", "proposal", "closed"])
const PROPOSTA_STATUSES = new Set(["proposal", "closed"])

function getPeriodDates(period: string): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30
  from.setDate(from.getDate() - days)
  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ campaign_id: string }> },
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const { campaign_id: metaCampaignId } = await params
  const period = request.nextUrl.searchParams.get("period") ?? "30d"

  // 1. Look up campaign (name needed for utm_campaign join)
  const { data: campaignRow } = await supabase
    .from("meta_campaigns")
    .select("name")
    .eq("meta_campaign_id", metaCampaignId)
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  if (!campaignRow) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
  }

  const campaignName = campaignRow.name ?? ""

  // 2. leads_meta + spend from insights for the period
  const { from, to } = getPeriodDates(period)
  const { data: insights } = await supabase
    .from("meta_insights_daily")
    .select("leads, spend")
    .eq("org_id", appUser.org_id)
    .eq("level", "campaign")
    .eq("entity_id", metaCampaignId)
    .gte("date", from)
    .lte("date", to)

  const leads_meta = (insights ?? []).reduce((sum, i) => sum + (i.leads ?? 0), 0)
  const totalSpend = (insights ?? []).reduce((sum, i) => sum + Number(i.spend ?? 0), 0)

  // 3. Leads from CRM — dual join (utm_campaign + metadata.campaign_id), dedup by id
  const [byNameResult, byMetaIdResult] = await Promise.all([
    campaignName
      ? supabase
          .from("leads")
          .select("id, last_response_at, status")
          .eq("org_id", appUser.org_id)
          .in("source", ["meta_ads", "whatsapp_click_to_ad"])
          .eq("utm_campaign", campaignName)
      : Promise.resolve({ data: [] as { id: string; last_response_at: string | null; status: string | null }[] }),
    supabase
      .from("leads")
      .select("id, last_response_at, status")
      .eq("org_id", appUser.org_id)
      .in("source", ["meta_ads", "whatsapp_click_to_ad"])
      .filter("metadata->>campaign_id", "eq", metaCampaignId),
  ])

  // 4. Dedup and build stage counts
  type LeadEntry = { last_response_at: string | null; status: string | null }
  const leadsMap = new Map<string, LeadEntry>()

  for (const lead of [...(byNameResult.data ?? []), ...(byMetaIdResult.data ?? [])]) {
    if (!leadsMap.has(lead.id)) {
      leadsMap.set(lead.id, {
        last_response_at: lead.last_response_at,
        status: lead.status,
      })
    }
  }

  const allLeads = Array.from(leadsMap.values())

  const leads_crm = allLeads.length
  const responderamLeads = allLeads.filter((l) => l.last_response_at != null)
  const responderam = responderamLeads.length
  const qualificados = responderamLeads.filter((l) =>
    QUALIFIED_STATUSES.has(l.status ?? ""),
  ).length
  const visita_agendada = allLeads.filter((l) =>
    VISITA_STATUSES.has(l.status ?? ""),
  ).length
  const proposta = allLeads.filter((l) =>
    PROPOSTA_STATUSES.has(l.status ?? ""),
  ).length

  const stages = { leads_meta, leads_crm, responderam, qualificados, visita_agendada, proposta }

  // 5. Gargalo: transition with the lowest conversion rate
  type GargaloKey = CampaignFunnelResponse["gargalo"]
  const transitions: Array<{ key: GargaloKey; from: number; to: number }> = [
    { key: "leads_crm",       from: stages.leads_meta,      to: stages.leads_crm },
    { key: "responderam",     from: stages.leads_crm,       to: stages.responderam },
    { key: "qualificados",    from: stages.responderam,     to: stages.qualificados },
    { key: "visita_agendada", from: stages.qualificados,    to: stages.visita_agendada },
    { key: "proposta",        from: stages.visita_agendada, to: stages.proposta },
  ]

  const gargalo =
    transitions
      .filter((t) => t.from > 0)
      .sort((a, b) => a.to / a.from - b.to / b.from)[0]?.key ?? null

  // 6. Derived metrics
  const cpl_real =
    responderam > 0
      ? Math.round((totalSpend / responderam) * 100) / 100
      : null
  const taxa_qualificacao =
    leads_meta > 0
      ? Math.round((qualificados / leads_meta) * 10000) / 100
      : null
  const taxa_visita =
    qualificados > 0
      ? Math.round((visita_agendada / qualificados) * 10000) / 100
      : null

  const response: CampaignFunnelResponse = {
    stages,
    gargalo,
    cpl_real,
    taxa_qualificacao,
    taxa_visita,
  }

  return NextResponse.json(response)
}
