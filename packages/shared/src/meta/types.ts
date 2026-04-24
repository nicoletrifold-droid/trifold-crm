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
