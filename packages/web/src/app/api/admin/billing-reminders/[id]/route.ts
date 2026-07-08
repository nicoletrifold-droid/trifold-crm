import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { validateUpdate } from "@web/lib/billing/reminder-validation"

// Story 78-8 — edição/remoção de um vencimento (service_billing_reminders). Admin-only.

/**
 * PATCH /api/admin/billing-reminders/[id]
 * Edita campos parciais e/ou muda o status (ex.: marcar pago/adiado/pulado).
 * Transição de status → paid seta paid_at = now() (idempotente por natureza de UPDATE).
 * Se o status sai de 'paid' para qualquer outro, paid_at é limpo (paid_at = NULL) —
 * decisão de manter paid_at coerente com o status corrente (T2.3).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ["admin"])
  if (roleError) return roleError

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const validation = validateUpdate(body)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const update: Record<string, unknown> = { ...validation.value }

  // paid_at é derivado da transição de status (não aceito cru do cliente).
  if (validation.value.status !== undefined) {
    update.paid_at = validation.value.status === "paid" ? new Date().toISOString() : null
  }

  const { data, error } = await supabase
    .from("service_billing_reminders")
    .update(update)
    .eq("id", id)
    .select(
      "id, service_id, due_date, expected_amount, currency, billing_cycle, alert_days_before, status, paid_at, notes, created_at, updated_at"
    )
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (!data) {
    return NextResponse.json({ error: "Vencimento não encontrado" }, { status: 404 })
  }

  return NextResponse.json({ data })
}

/**
 * DELETE /api/admin/billing-reminders/[id]
 * Remove um vencimento cadastrado (hard delete — a FK service_id aponta para
 * platform_services, não há dependentes na outra direção).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const roleError = requireRole(appUser, ["admin"])
  if (roleError) return roleError

  const { id } = await params

  const { error } = await supabase
    .from("service_billing_reminders")
    .delete()
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
