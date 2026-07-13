import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { validateUpdate } from "@web/lib/billing/reminder-validation"
import { avancarCiclo } from "@web/lib/billing/reminder-schedule"

// Story 78-8 — edição/remoção de um vencimento (service_billing_reminders). Admin-only.
// Story 78-11 — recorrência-ao-pagar: ao marcar 'paid', avança due_date para o próximo ciclo.

/**
 * PATCH /api/admin/billing-reminders/[id]
 * Edita campos parciais e/ou muda o status (ex.: marcar pago/adiado/pulado).
 *
 * Transição de status → 'paid' (Story 78-11, AC7):
 *   - Sempre seta paid_at = now() (registro histórico do último pagamento).
 *   - billing_cycle IN ('monthly','annual'): RECORRÊNCIA síncrona — avança due_date para o
 *     próximo ciclo (avancarCiclo, com clamp de dia-do-mês), reseta status='pending' e
 *     last_alerted_on=NULL. A linha "nasce pronta pro próximo ciclo"; a resposta já reflete o
 *     próximo vencimento. Recorrência NUNCA mais acontece por decurso de tempo no cron (AC8).
 *   - billing_cycle = 'usage': status permanece 'paid', due_date NÃO muda, last_alerted_on
 *     não é tocado (herdado de 78-8 — ciclo variável não recorre automaticamente).
 * Se o status sai de 'paid' para qualquer outro (não-paid), paid_at é limpo (= NULL) —
 * decisão de manter paid_at coerente com o status corrente (78-8).
 *
 * last_alerted_on NUNCA é aceito cru do cliente (AC11): o whitelist de validateUpdate descarta
 * campos desconhecidos; aqui ele só é derivado internamente (reset no fluxo de recorrência).
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
    if (validation.value.status === "paid") {
      update.paid_at = new Date().toISOString()

      // RECORRÊNCIA-AO-PAGAR (78-11, AC7): busca a linha atual para calcular o próximo ciclo
      // (o novo due_date depende do valor ATUAL, não do payload do cliente). O billing_cycle
      // efetivo considera um eventual billing_cycle enviado no MESMO PATCH (usa o valor final).
      const { data: atual, error: fetchErr } = await supabase
        .from("service_billing_reminders")
        .select("due_date, billing_cycle")
        .eq("id", id)
        .maybeSingle()

      if (fetchErr) {
        return NextResponse.json({ error: fetchErr.message }, { status: 400 })
      }
      if (!atual) {
        return NextResponse.json({ error: "Vencimento não encontrado" }, { status: 404 })
      }

      const cicloEfetivo = (validation.value.billing_cycle ?? atual.billing_cycle) as string
      if (cicloEfetivo === "monthly" || cicloEfetivo === "annual") {
        const proximo = avancarCiclo(atual.due_date as string, cicloEfetivo)
        if (proximo) {
          update.due_date = proximo
          update.status = "pending" // já nasce pronta pro próximo ciclo (não fica 'paid')
          update.last_alerted_on = null // reseta o dedup por dia para o novo ciclo
        }
        // proximo === null (due_date atual corrompida): mantém status='paid' sem avançar —
        // fail-safe, não estoura a requisição.
      }
      // cicloEfetivo === 'usage': status permanece 'paid', due_date/last_alerted_on inalterados.
    } else {
      // status vira não-'paid': paid_at limpo (coerência status↔paid_at, herdado de 78-8).
      update.paid_at = null
    }
  }

  const { data, error } = await supabase
    .from("service_billing_reminders")
    .update(update)
    .eq("id", id)
    .select(
      "id, service_id, due_date, expected_amount, currency, billing_cycle, alert_days_before, status, paid_at, last_alerted_on, notes, created_at, updated_at"
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
