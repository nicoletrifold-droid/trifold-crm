// Story 78-14 — Enriquecedor de ASSINATURA FIXA da Vercel (assentos apenas nesta story).
//
// Reusa os secrets VERCEL_BILLING_TOKEN / VERCEL_TEAM_ID (78-2, já usados por 78-5 — nenhum
// secret novo).
//
// Endpoint CONFIRMADO na OpenAPI oficial (https://openapi.vercel.sh), T1.5 — CORREÇÃO factual
// à story: o método GET de membros de time NÃO existe em /v2/teams/{teamId}/members (v2 só tem
// POST). O GET fica em /v3/teams/{teamId}/members, respondendo:
//   { members: [...], pagination: { count, hasNext, next, prev } }
// (paginação por cursor de timestamp; seats = soma de members.length em todas as páginas).
//
// NÃO deriva expected_amount automaticamente (AC8): a decisão de auto-derivar valor para a Vercel
// é condicional à T-Vercel-Dedup (AC10). Até lá, a linha vercel fica com excluded_from_
// subscription_total=true (seed 172) e nunca soma ao total de assinaturas fixas.
//
// INVARIANTE (AC9): subscription_seats só é gravado se seats_source != 'manual'.

import { logEvent } from "@web/lib/logger"
import type { createAdminClient } from "@web/lib/supabase/admin"
import type {
  CurrentSubscriptionRow,
  EnrichmentResult,
  SubscriptionUpdate,
} from "@web/lib/billing/subscriptions/types"

type AdminClient = ReturnType<typeof createAdminClient>

const VERCEL_BASE = "https://api.vercel.com"
const REQUEST_TIMEOUT_MS = 30_000
const SERVICE_SLUG = "vercel"
const PAGE_LIMIT = 100
/** Salvaguarda contra loop de paginação (100 membros/página × 20 = 2000 assentos). */
const MAX_PAGES = 20

interface VercelMembersResponse {
  members?: unknown[]
  pagination?: { hasNext?: boolean; next?: number | null }
}

/**
 * Conta assentos via GET /v3/teams/{teamId}/members, seguindo a paginação por cursor de
 * timestamp (`pagination.next` → param `since`) até esgotar. Salvaguardas: para em MAX_PAGES e
 * se o cursor repetir (evita loop). Para o time da Trifold (poucos membros) a 1ª página basta.
 */
async function countVercelSeats(token: string, teamId: string): Promise<number> {
  let total = 0
  let since: number | null = null
  const seenCursors = new Set<number>()

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ teamId, limit: String(PAGE_LIMIT) })
    if (since != null) params.set("since", String(since))

    const res = await fetch(`${VERCEL_BASE}/v3/teams/${teamId}/members?${params.toString()}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`Vercel API ${res.status} on /v3/teams/${teamId}/members: ${body.slice(0, 300)}`)
    }

    const data = (await res.json()) as VercelMembersResponse
    total += Array.isArray(data.members) ? data.members.length : 0

    const next = data.pagination?.next
    if (!data.pagination?.hasNext || next == null || seenCursors.has(next)) break
    seenCursors.add(next)
    since = next
  }

  return total
}

/** Regra de não-sobrescrita (AC9) — pura. Vercel só grava seats (sem preço nesta story, AC8). */
export function buildVercelUpdate(params: {
  seats: number | null
  current: CurrentSubscriptionRow
  now: string
}): SubscriptionUpdate {
  const { seats, current, now } = params
  const update: SubscriptionUpdate = { last_enriched_at: now }
  if (seats != null && current.seats_source !== "manual") {
    update.subscription_seats = seats
    update.seats_source = "api"
  }
  return update
}

/** Orquestra o enriquecimento da Vercel: valida credenciais, conta assentos, aplica UPDATE (AC9). */
export async function enrichVercel(admin: AdminClient): Promise<EnrichmentResult> {
  const token = (process.env.VERCEL_BILLING_TOKEN ?? "").trim()
  const teamId = (process.env.VERCEL_TEAM_ID ?? "").trim()
  if (!token || !teamId) {
    return {
      serviceSlug: SERVICE_SLUG,
      status: "skipped",
      reason: "missing_credentials (VERCEL_BILLING_TOKEN/VERCEL_TEAM_ID)",
    }
  }

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

  let seats: number
  try {
    seats = await countVercelSeats(token, teamId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logEvent({
      level: "warn",
      category: "cron",
      event_type: "subscription_enrich_vercel_failed",
      message: msg,
      source: "lib/billing/subscriptions/enrich-vercel",
    })
    return { serviceSlug: SERVICE_SLUG, status: "error", error: msg }
  }

  const now = new Date().toISOString()
  const update = buildVercelUpdate({ seats, current, now })

  const { error: updErr } = await admin
    .from("service_billing_reminders")
    .update(update)
    .eq("id", current.id)

  if (updErr) {
    return { serviceSlug: SERVICE_SLUG, status: "error", error: updErr.message }
  }

  return { serviceSlug: SERVICE_SLUG, status: "ok", update, seats }
}
