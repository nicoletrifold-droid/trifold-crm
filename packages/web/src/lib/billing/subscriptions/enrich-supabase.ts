// Story 78-14 — Enriquecedor de ASSINATURA FIXA do Supabase (plano + assentos + preço-por-tabela).
//
// Reusa os secrets SUPABASE_MANAGEMENT_PAT / SUPABASE_ORG_SLUG (78-2, já usados por 78-7 — nenhum
// secret novo). Estilo defensivo herdado de supabase-usage.ts (mgmtFetch + Promise.allSettled).
//
// Endpoints CONFIRMADos na OpenAPI oficial (https://api.supabase.com/api/v1-json), T1.4:
//   - GET /v1/organizations/{slug}         → { plan: "free"|"pro"|"team"|"enterprise"|"platform" }
//   - GET /v1/organizations/{slug}/members → ARRAY de membros (seats = array.length; sem paginação
//     no contrato — retorna a lista completa). Schema do item: V1OrganizationMemberResponse.
//
// INVARIANTE (AC9): nunca sobrescreve edição manual. subscription_plan é sempre atualizado do API
// (rótulo, não campo protegido); expected_amount só se value_source ∈ {null,'api_price_table'};
// subscription_seats só se seats_source != 'manual'. due_date/billing_cycle/alert_days_before/
// status/notes NUNCA são tocados aqui.

import { logEvent } from "@web/lib/logger"
import type { createAdminClient } from "@web/lib/supabase/admin"
import { lookupSubscriptionPrice } from "@web/lib/billing/subscriptions/price-table"
import type {
  CurrentSubscriptionRow,
  EnrichmentResult,
  SubscriptionUpdate,
} from "@web/lib/billing/subscriptions/types"

type AdminClient = ReturnType<typeof createAdminClient>

const SUPABASE_MGMT_BASE = "https://api.supabase.com"
const REQUEST_TIMEOUT_MS = 20_000
const SERVICE_SLUG = "supabase"

interface SupabaseOrgResponse {
  plan?: string
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
 * Regra de não-sobrescrita (AC9) — pura. Recebe os dados do API + o estado atual da linha e
 * devolve APENAS os campos que devem ser gravados. subscription_plan/last_enriched_at sempre;
 * subscription_seats só se seats_source != 'manual'; expected_amount só se value_source não é
 * 'manual' E existe preço conhecido para o plano.
 */
export function buildSupabaseUpdate(params: {
  plan: string | null
  seats: number | null
  current: CurrentSubscriptionRow
  now: string
}): SubscriptionUpdate {
  const { plan, seats, current, now } = params
  const update: SubscriptionUpdate = { last_enriched_at: now }

  if (plan != null) {
    update.subscription_plan = plan
  }

  if (seats != null && current.seats_source !== "manual") {
    update.subscription_seats = seats
    update.seats_source = "api"
  }

  if (current.value_source !== "manual") {
    const price = lookupSubscriptionPrice(SERVICE_SLUG, plan)
    if (price) {
      update.expected_amount = price.amount
      update.value_source = "api_price_table"
    }
  }

  return update
}

/**
 * Orquestra o enriquecimento do Supabase: valida credenciais, chama plano + membros
 * (best-effort, allSettled), localiza a linha única (AC3), aplica o UPDATE respeitando AC9.
 */
export async function enrichSupabase(admin: AdminClient): Promise<EnrichmentResult> {
  const pat = (process.env.SUPABASE_MANAGEMENT_PAT ?? "").trim()
  const slug = (process.env.SUPABASE_ORG_SLUG ?? "").trim()
  if (!pat || !slug) {
    return {
      serviceSlug: SERVICE_SLUG,
      status: "skipped",
      reason: "missing_credentials (SUPABASE_MANAGEMENT_PAT/SUPABASE_ORG_SLUG)",
    }
  }

  // Localiza a linha única de assinatura fixa do serviço 'supabase' (garantida pela AC3).
  const { data: row, error: rowErr } = await admin
    .from("service_billing_reminders")
    .select("id, service_id, value_source, seats_source, platform_services!inner(slug)")
    .eq("platform_services.slug", SERVICE_SLUG)
    .eq("is_fixed_subscription", true)
    .maybeSingle()

  if (rowErr) {
    return { serviceSlug: SERVICE_SLUG, status: "error", error: rowErr.message }
  }
  if (!row) {
    return {
      serviceSlug: SERVICE_SLUG,
      status: "skipped",
      reason: "no_fixed_subscription_row (seed 172 não aplicado?)",
    }
  }

  const current: CurrentSubscriptionRow = {
    id: row.id as string,
    service_id: row.service_id as string,
    value_source: (row.value_source as string | null) ?? null,
    seats_source: (row.seats_source as string | null) ?? null,
  }

  // Duas sub-chamadas isoladas — se UMA falhar, ainda enriquecemos o que deu certo (AC7).
  const [planRes, membersRes] = await Promise.allSettled([
    mgmtFetch<SupabaseOrgResponse>(`/v1/organizations/${slug}`, pat),
    mgmtFetch<unknown[]>(`/v1/organizations/${slug}/members`, pat),
  ])

  let plan: string | null = null
  let seats: number | null = null
  let anySuccess = false
  let lastError: unknown = null

  if (planRes.status === "fulfilled") {
    anySuccess = true
    plan = typeof planRes.value.plan === "string" ? planRes.value.plan : null
  } else {
    lastError = planRes.reason
  }

  if (membersRes.status === "fulfilled") {
    anySuccess = true
    seats = Array.isArray(membersRes.value) ? membersRes.value.length : null
  } else {
    lastError = membersRes.reason
  }

  if (!anySuccess) {
    const msg = lastError instanceof Error ? lastError.message : String(lastError)
    logEvent({
      level: "warn",
      category: "cron",
      event_type: "subscription_enrich_supabase_failed",
      message: msg,
      source: "lib/billing/subscriptions/enrich-supabase",
    })
    return { serviceSlug: SERVICE_SLUG, status: "error", error: msg }
  }

  const now = new Date().toISOString()
  const update = buildSupabaseUpdate({ plan, seats, current, now })

  const { error: updErr } = await admin
    .from("service_billing_reminders")
    .update(update)
    .eq("id", current.id)

  if (updErr) {
    return { serviceSlug: SERVICE_SLUG, status: "error", error: updErr.message }
  }

  return { serviceSlug: SERVICE_SLUG, status: "ok", update, plan, seats }
}
