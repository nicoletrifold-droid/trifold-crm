import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { validateCreate } from "@web/lib/billing/reminder-validation"

// Story 78-8 — CRUD admin-only de service_billing_reminders (vencimentos/lembretes de
// fatura da plataforma). Schema fixado em 78-1 (migration 164) — sem migration nova.
// Admin-only via requireAuth() + requireRole(["admin"]) (padrão de admin/agent-prompts).
// Estas tabelas NÃO têm org_id (custo da própria plataforma, não de tenant — ver 78-1).
//
// Hotfix de segurança (migration 209 / auditoria P4): a 209 revoga `authenticated` das 5
// tabelas de custo interno da plataforma, porque a policy `admin_only` não tinha noção de org
// (um admin de CLIENTE leria o custo que a Trifold paga → nossa margem). O acesso passa a ser
// só por service-role em rota gated por admin — daí o createAdminClient() aqui em vez do
// client de usuário do requireAuth(). O gate de autorização é o requireRole(["admin"]).

/**
 * GET /api/admin/billing-reminders
 * Lista todos os vencimentos com join em platform_services (slug/name/category),
 * ordenado por due_date. Consumido pela UI da Story 78-9.
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  const roleError = requireRole(appUser, ["admin"])
  if (roleError) return roleError

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from("service_billing_reminders")
    .select(
      // Story 78-14 (AC13): expõe os campos de assinatura fixa para a Story 78-15 sem rota nova.
      "id, service_id, due_date, expected_amount, currency, billing_cycle, alert_days_before, status, paid_at, notes, is_fixed_subscription, subscription_plan, subscription_seats, value_source, seats_source, excluded_from_subscription_total, last_enriched_at, created_at, updated_at, platform_services(slug, name, category)"
    )
    // due_date agora nullable (172): NULLS LAST para não jogar as assinaturas fixas sem data
    // de renovação no topo da lista de vencimentos.
    .order("due_date", { ascending: true, nullsFirst: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}

/**
 * POST /api/admin/billing-reminders
 * Cria um vencimento para um service_id. Valida o payload espelhando os CHECK
 * constraints de 78-1 (currency, billing_cycle, status, alert_days_before).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  const roleError = requireRole(appUser, ["admin"])
  if (roleError) return roleError

  const supabase = createAdminClient()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const validation = validateCreate(body)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const insert = { ...validation.value }
  const { data, error } = await supabase
    .from("service_billing_reminders")
    .insert(insert)
    .select(
      "id, service_id, due_date, expected_amount, currency, billing_cycle, alert_days_before, status, paid_at, notes, created_at, updated_at"
    )
    .single()

  if (error) {
    // FK inexistente (service_id inválido) e violação de CHECK caem aqui como 400.
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
