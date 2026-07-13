// Story 78-7 — Coletor de USO TÉCNICO Supabase (Epic 78, camada FRACA).
// Adapta o contrato `BillingCollector` da Story 78-3 (types.ts) e REUSA o runner
// genérico (run-collector.ts) sem modificá-los. IDS: ADAPT (não recria contrato).
//
// INVARIANTE CENTRAL (AC4): este coletor grava USO TÉCNICO, nunca CUSTO em $.
// Por isso TODA linha produzida aqui tem `currency: null` — garantindo que a
// query de "gasto do mês" da Story 78-9 (`WHERE currency IS NOT NULL`) NUNCA
// inclua estas linhas. Supabase não tem endpoint de fatura (CON-3 do épico) —
// valor/vencimento é 100% manual (Story 78-8). NÃO inventar custo aqui.
//
// Contrato de API confirmado na OpenAPI oficial da Supabase Management API
// (https://api.supabase.com/api/v1-json) — ver Completion Notes da story:
//   - GET /v1/organizations/{slug}
//       → { id, name, plan: "free"|"pro"|"team"|"enterprise"|"platform", ... }
//   - GET /v1/projects/{ref}/analytics/endpoints/usage.api-requests-count
//       → { result: [{ count: number }], error: ... }
//     (janela ROLANTE fixa do provedor — NÃO aceita from/to arbitrários; por isso
//      o snapshot é alocado em window.to como leitura pontual de uso — ver Dev Notes.)
//   Auth: Authorization: Bearer ${SUPABASE_MANAGEMENT_PAT}.
//
// NOTA (T1.3 / Article IV): a Management API NÃO expõe endpoint de "egress bytes"
// (a OpenAPI só tem usage.api-counts / usage.api-requests-count / functions.*).
// Por isso este coletor NÃO grava `supabase_egress_bytes` — não inventamos uma
// métrica sem fonte. Ver Completion Notes.

import { logEvent } from "@web/lib/logger"
import type {
  BillingCollector,
  CollectWindow,
  CostSnapshotRow,
} from "@web/lib/billing-collectors/types"

const SUPABASE_MGMT_BASE = "https://api.supabase.com"
const REQUEST_TIMEOUT_MS = 20_000

/**
 * Erro tipado para ausência do SUPABASE_MANAGEMENT_PAT. A rota de cron trata
 * este caso ANTES de chamar o runner (AC5: 503 sem gravar snapshot). Aqui serve
 * como rede de segurança caso o coletor seja usado fora da rota.
 */
export class MissingSupabaseManagementPatError extends Error {
  constructor() {
    super("SUPABASE_MANAGEMENT_PAT not set")
    this.name = "MissingSupabaseManagementPatError"
  }
}

/** Resposta relevante de GET /v1/organizations/{slug} (campos usados). */
interface SupabaseOrgResponse {
  id?: string
  name?: string
  plan?: string
}

/** Resposta de GET /v1/projects/{ref}/analytics/endpoints/usage.api-requests-count. */
interface SupabaseApiRequestsCountResponse {
  result?: Array<{ count?: number }>
  error?: unknown
}

function requireManagementPat(): string {
  const pat = (process.env.SUPABASE_MANAGEMENT_PAT ?? "").trim()
  if (!pat) throw new MissingSupabaseManagementPatError()
  return pat
}

/**
 * Deriva o project ref do subdomínio de NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL
 * (ex.: https://dsopqkqjkmhytudaaolv.supabase.co → "dsopqkqjkmhytudaaolv") — sem
 * criar env var nova (T1.4). Retorna null se a URL não estiver disponível/for inválida.
 */
export function deriveSupabaseProjectRef(): string | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim()
  if (!url) return null
  try {
    const host = new URL(url).hostname
    const ref = host.split(".")[0]
    return ref && ref.length > 0 ? ref : null
  } catch {
    return null
  }
}

async function mgmtFetch<T>(path: string, pat: string): Promise<T> {
  const res = await fetch(`${SUPABASE_MGMT_BASE}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${pat}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Supabase Management API ${res.status} on ${path}: ${body.slice(0, 300)}`)
  }
  return (await res.json()) as T
}

/**
 * Sub-chamada de PLANO (AC2a). Grava `supabase_plan_info` com `value=1` (marcador
 * de presença — a coluna `value` é numeric NOT NULL e não existe coluna de texto;
 * o nome do plano vive em `raw_response`, NUNCA inventado como número). Requer
 * SUPABASE_ORG_SLUG; se ausente, é pulada (soft skip) — não é a gate de 503.
 */
async function collectPlan(window: CollectWindow, pat: string): Promise<CostSnapshotRow[]> {
  const slug = (process.env.SUPABASE_ORG_SLUG ?? "").trim()
  if (!slug) {
    logEvent({
      level: "warn",
      category: "cron",
      event_type: "supabase_usage_org_slug_missing",
      message: "SUPABASE_ORG_SLUG not set — skipping plan sub-call (usage still collected)",
      metadata: { window },
      source: "lib/billing-collectors/supabase-usage",
    })
    return []
  }

  const org = await mgmtFetch<SupabaseOrgResponse>(`/v1/organizations/${slug}`, pat)
  return [
    {
      snapshot_date: window.to,
      metric: "supabase_plan_info",
      // Marcador de presença — o dado real (nome do plano) está em raw_response.
      value: 1,
      currency: null, // AC4 — uso técnico, nunca custo.
      collection_status: "ok",
      raw_response: { id: org.id, name: org.name, plan: org.plan },
    },
  ]
}

/**
 * Sub-chamada de USO (AC2b). Grava `supabase_requests_total` a partir de
 * usage.api-requests-count. IMPORTANTE: esse endpoint retorna uma janela ROLANTE
 * fixa do provedor (não aceita from/to) — a leitura é alocada em window.to como
 * snapshot pontual de uso técnico. Ver Dev Notes (limitação documentada).
 */
async function collectRequests(window: CollectWindow, pat: string): Promise<CostSnapshotRow[]> {
  const ref = deriveSupabaseProjectRef()
  if (!ref) {
    logEvent({
      level: "warn",
      category: "cron",
      event_type: "supabase_usage_project_ref_missing",
      message: "Could not derive project ref from NEXT_PUBLIC_SUPABASE_URL — skipping requests sub-call",
      metadata: { window },
      source: "lib/billing-collectors/supabase-usage",
    })
    return []
  }

  const data = await mgmtFetch<SupabaseApiRequestsCountResponse>(
    `/v1/projects/${ref}/analytics/endpoints/usage.api-requests-count`,
    pat
  )
  const total = (data.result ?? []).reduce((sum, r) => {
    const c = Number(r.count)
    return sum + (Number.isFinite(c) ? c : 0)
  }, 0)

  return [
    {
      snapshot_date: window.to,
      metric: "supabase_requests_total",
      value: total,
      currency: null, // AC4 — uso técnico, nunca custo.
      collection_status: "ok",
      raw_response: { endpoint: "usage.api-requests-count", result: data.result ?? [] },
    },
  ]
}

/** Coletor de uso técnico Supabase — implementa `BillingCollector` (slug 'supabase'). */
export const supabaseUsageCollector: BillingCollector = {
  serviceSlug: "supabase",

  async collect(window: CollectWindow): Promise<CostSnapshotRow[]> {
    const pat = requireManagementPat()

    // AC6: cada sub-chamada isolada em seu próprio try/catch — se UMA falhar,
    // retornamos só as linhas que tiveram sucesso; se AMBAS falharem, propagamos
    // (o runCollector isola e grava collection_status='error').
    const results = await Promise.allSettled([
      collectPlan(window, pat),
      collectRequests(window, pat),
    ])

    const rows: CostSnapshotRow[] = []
    let anySuccess = false
    let lastError: unknown = null

    for (const r of results) {
      if (r.status === "fulfilled") {
        anySuccess = true
        rows.push(...r.value)
      } else {
        lastError = r.reason
        logEvent({
          level: "warn",
          category: "cron",
          event_type: "supabase_usage_subcall_failed",
          message: r.reason instanceof Error ? r.reason.message : String(r.reason),
          metadata: { window },
          source: "lib/billing-collectors/supabase-usage",
        })
      }
    }

    // Ambas falharam → propaga para o runner tratar como collection_status='error'.
    if (!anySuccess) {
      throw lastError instanceof Error ? lastError : new Error(String(lastError))
    }

    return rows
  },
}
