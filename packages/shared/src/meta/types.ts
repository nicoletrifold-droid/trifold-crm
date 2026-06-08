export interface MetaCampaign {
  id: string
  name: string
  objective: string
  status: string
  daily_budget?: string
  lifetime_budget?: string
  start_time?: string
  stop_time?: string
}

export interface MetaAdSet {
  id: string
  name: string
  campaign_id: string
  status: string
  optimization_goal: string
  daily_budget?: string
}

export interface MetaAd {
  id: string
  name: string
  adset_id: string
  status: string
  creative?: Record<string, unknown>
}

export interface MetaInsight {
  date_start: string
  date_stop: string
  spend: string
  impressions: string
  reach: string
  clicks: string
  ctr: string
  cpc: string
  cpm: string
  frequency: string
  actions?: Array<{ action_type: string; value: string }>
}

export interface MetaLeadData {
  id: string
  field_data: Array<{ name: string; values: string[] }>
}

export interface MetaLeadRecord {
  id: string
  field_data: Array<{ name: string; values: string[] }>
  created_time: string
  ad_id?: string
  adgroup_id?: string
  campaign_id?: string
}

export interface MetaPagination {
  cursors: { before: string; after: string }
  next?: string
}

export interface MetaPagedResponse<T> {
  data: T[]
  paging: MetaPagination
}

export interface MetaRateUsage {
  call_count: number
  total_cputime: number
  total_time: number
  type: string
  estimated_time_to_regain_access: number
}

export interface MetaBatchRequest {
  method: 'GET' | 'POST' | 'DELETE'
  relative_url: string
  body?: string
}

export interface MetaBatchResponse {
  code: number
  headers: Array<{ name: string; value: string }>
  body: string
}

// ─── Story 16.9 — Campaign Detail (drill-down) ─────────────────────────────

export interface MetaCampaignDetail {
  id: string
  meta_campaign_id: string
  name: string
  objective: string | null
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'DELETED'
  daily_budget: number | null
  lifetime_budget: number | null
  start_time: string | null
  stop_time: string | null
}

export interface MetaInsightTimeSeries {
  date: string
  spend: number
  leads_meta: number
  impressions: number
  clicks: number
  ctr: number
  frequency: number
  outbound_clicks: number
  landing_page_views: number
}

export interface MetaAdSetWithMetrics {
  id: string
  meta_adset_id: string
  name: string
  status: string
  optimization_goal: string | null
  daily_budget: number | null
  spend: number
  impressions: number
  clicks: number
  ctr: number
  leads_meta: number
  cpl: number | null
  quality_ranking: string | null
}

export interface ConversionFunnel {
  leads_meta: number
  leads_crm: number
  leads_qualified: number
  visits_scheduled: number
  sales: number
}

export interface RoasSummary {
  total_spend: number
  leads_in_crm: number
  sales_count: number
  total_revenue: number
  roas: number | null
  cpl_real: number | null
}

export interface AssociatedLead {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  status: string
  source: string
  utm_campaign: string | null
  created_at: string
}

export interface CampaignDetailApiResponse {
  campaign: MetaCampaignDetail
  timeseries: MetaInsightTimeSeries[]
  adsets: MetaAdSetWithMetrics[]
  funnel: ConversionFunnel
  leads: AssociatedLead[]
  roas_summary: RoasSummary | null
}
