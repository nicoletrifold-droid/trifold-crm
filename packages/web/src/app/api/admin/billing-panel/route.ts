import { NextResponse } from "next/server"
import { isPlatformAdmin } from "@web/lib/platform"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"

// Story 78-9 — API consolidada do Painel de Saúde & Billing (admin-only).
// Lê APENAS platform_services + service_cost_snapshots (contrato fixado em 78-1,
// valores reais de metric/currency confirmados em 78-3). NÃO lê service_billing_reminders:
// essa tabela tem API própria (GET /api/admin/billing-reminders — Story 78-8), consumida
// separadamente pela UI. Admin-only via requireAuth() + requireRole(["admin"]).
// Sem org_id (custo da própria plataforma).
//
// Hotfix de segurança (migration 209 / auditoria P4): estas tabelas guardam o custo que a
// TRIFOLD paga pelos serviços. A policy `admin_only` (78-1) era `user_role() = 'admin'` SEM
// noção de org — na primeira conta admin de CLIENTE, esse cliente leria nosso custo e, como a
// cobrança é custo + markup, deduziria nossa margem. A migration 209 revoga `authenticated`
// dessas 5 tabelas; o acesso passa a ser exclusivamente por service-role em rota gated por
// admin (padrão de 131_imobiliarias.sql). Por isso a leitura usa createAdminClient() e NÃO o
// client de usuário do requireAuth() — que a partir da 209 receberia lista vazia.
// O gate de autorização é o requireRole(["admin"]) abaixo (não mais a RLS).

type CollectionStatus = "ok" | "manual" | "no_data" | "error"

interface MoneyByCurrency {
  currency: string
  amount: number
}

interface ServiceSummary {
  slug: string
  name: string
  category: string
  automation_tier: string
  billing_url: string
  billing_url_confirmed: boolean
  display_order: number
  collection_status: CollectionStatus
  last_collected_at: string | null
  month_costs: MoneyByCurrency[]
}

interface SnapshotRow {
  service_id: string
  metric: string
  value: number | string
  currency: string | null
  collection_status: CollectionStatus
  collected_at: string
  snapshot_date: string
}

interface PlatformServiceRow {
  id: string
  slug: string
  name: string
  category: string
  automation_tier: string
  billing_url: string
  billing_url_confirmed: boolean
  enabled: boolean
  display_order: number
}

/**
 * Retorna { year, monthStart, nextMonthStart } do mês corrente em America/Sao_Paulo
 * (NFR-8 do épico — evita erro de borda de dia/mês por diferença de timezone).
 */
function currentMonthRangeSaoPaulo(): { monthStart: string; nextMonthStart: string } {
  // en-CA => "YYYY-MM-DD"
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
  const [yStr, mStr] = today.split("-")
  const year = Number(yStr)
  const month = Number(mStr)
  const monthStart = `${yStr}-${mStr}-01`
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const nextMonthStart = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`
  return { monthStart, nextMonthStart }
}

/** Soma valores agrupados por moeda (nunca soma moedas diferentes — AC7). */
function sumByCurrency(rows: MoneyByCurrency[]): MoneyByCurrency[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    map.set(r.currency, (map.get(r.currency) ?? 0) + r.amount)
  }
  return [...map.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => a.currency.localeCompare(b.currency))
}

/**
 * GET /api/admin/billing-panel
 * Agrega gasto monetário do mês corrente por serviço + total consolidado (excluindo meta_ads)
 * + status de coleta efetivo por serviço. Consumido pela página /dashboard/sistema/billing.
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  const roleError = (await isPlatformAdmin(appUser.id))
    ? null
    : NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (roleError) return roleError

  // Tabelas de plataforma (sem org_id) — leitura só por service-role (migration 209).
  const supabase = createAdminClient()

  // 1. Catálogo de serviços habilitados, na ordem de exibição.
  const { data: servicesData, error: servicesError } = await supabase
    .from("platform_services")
    .select(
      "id, slug, name, category, automation_tier, billing_url, billing_url_confirmed, enabled, display_order"
    )
    .eq("enabled", true)
    .order("display_order", { ascending: true })

  if (servicesError) {
    return NextResponse.json({ error: servicesError.message }, { status: 500 })
  }

  const services = (servicesData ?? []) as PlatformServiceRow[]

  // 2. Snapshots do mês corrente (America/Sao_Paulo).
  const { monthStart, nextMonthStart } = currentMonthRangeSaoPaulo()
  const { data: snapshotsData, error: snapshotsError } = await supabase
    .from("service_cost_snapshots")
    .select("service_id, metric, value, currency, collection_status, collected_at, snapshot_date")
    .gte("snapshot_date", monthStart)
    .lt("snapshot_date", nextMonthStart)

  if (snapshotsError) {
    return NextResponse.json({ error: snapshotsError.message }, { status: 500 })
  }

  const snapshots = (snapshotsData ?? []) as SnapshotRow[]

  // Agrupar snapshots por service_id.
  const byService = new Map<string, SnapshotRow[]>()
  for (const snap of snapshots) {
    const list = byService.get(snap.service_id) ?? []
    list.push(snap)
    byService.set(snap.service_id, list)
  }

  const buildSummary = (svc: PlatformServiceRow): ServiceSummary => {
    const rows = byService.get(svc.id) ?? []

    // Gasto monetário do mês: só métricas com currency IS NOT NULL (regra do contrato
    // 78-1/78-3 — distingue métrica monetária de uso técnico sem hardcodar nome de metric).
    const monetary: MoneyByCurrency[] = rows
      .filter((r) => r.currency != null)
      .map((r) => ({ currency: r.currency as string, amount: Number(r.value) }))
    const month_costs = sumByCurrency(monetary)

    // Status de coleta efetivo = status do snapshot mais recente (collected_at) do mês;
    // sem snapshot no mês => "no_data".
    let collection_status: CollectionStatus = "no_data"
    let last_collected_at: string | null = null
    if (rows.length > 0) {
      const latest = rows.reduce((acc, r) =>
        new Date(r.collected_at).getTime() > new Date(acc.collected_at).getTime() ? r : acc
      )
      collection_status = latest.collection_status
      last_collected_at = latest.collected_at
    }

    return {
      slug: svc.slug,
      name: svc.name,
      category: svc.category,
      automation_tier: svc.automation_tier,
      billing_url: svc.billing_url,
      billing_url_confirmed: svc.billing_url_confirmed,
      display_order: svc.display_order,
      collection_status,
      last_collected_at,
      month_costs,
    }
  }

  // Separar meta_ads (seção própria — AC6) dos demais serviços.
  const regularSummaries: ServiceSummary[] = []
  let metaAds: ServiceSummary | null = null
  for (const svc of services) {
    const summary = buildSummary(svc)
    if (svc.slug === "meta_ads") {
      metaAds = summary
    } else {
      regularSummaries.push(summary)
    }
  }

  // Total consolidado do mês, por moeda, excluindo meta_ads (AC5/CON-8).
  const consolidated_total = sumByCurrency(
    regularSummaries.flatMap((s) => s.month_costs)
  )

  return NextResponse.json({
    services: regularSummaries,
    meta_ads: metaAds,
    consolidated_total,
    generated_at: new Date().toISOString(),
  })
}
