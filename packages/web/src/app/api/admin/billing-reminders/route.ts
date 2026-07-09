import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { validateCreate } from "@web/lib/billing/reminder-validation"

// Story 78-8 — CRUD admin-only de service_billing_reminders (vencimentos/lembretes de
// fatura da plataforma). Schema fixado em 78-1 (migration 164) — sem migration nova.
// Admin-only via requireAuth() + requireRole(["admin"]) (padrão de admin/agent-prompts);
// a RLS admin_only da tabela (78-1) reforça isso na camada de dados (defesa em profundidade).
// Estas tabelas NÃO têm org_id (custo da própria plataforma, não de tenant — ver 78-1).

/**
 * GET /api/admin/billing-reminders
 * Lista todos os vencimentos com join em platform_services (slug/name/category),
 * ordenado por due_date. Consumido pela UI da Story 78-9.
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ["admin"])
  if (roleError) return roleError

  const { data, error } = await supabase
    .from("service_billing_reminders")
    .select(
      "id, service_id, due_date, expected_amount, currency, billing_cycle, alert_days_before, status, paid_at, notes, created_at, updated_at, platform_services(slug, name, category)"
    )
    .order("due_date", { ascending: true })

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
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ["admin"])
  if (roleError) return roleError

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
