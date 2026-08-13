import { NextRequest, NextResponse } from "next/server"
import { isPlatformAdmin } from "@web/lib/platform"
import { requireAuth } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"
import { validateUpdate } from "@web/lib/billing/reminder-validation"
import { avancarCiclo } from "@web/lib/billing/reminder-schedule"

// Story 78-8 — edição/remoção de um vencimento (service_billing_reminders). Admin-only.
// Story 78-11 — recorrência-ao-pagar: ao marcar 'paid', avança due_date para o próximo ciclo.
//
// Hotfix de segurança (migration 209 / auditoria P4): a 209 revoga `authenticated` das tabelas
// de custo interno da plataforma (a policy `admin_only` não tinha noção de org). Acesso só por
// service-role em rota gated por admin — daí o createAdminClient() em vez do client de usuário
// do requireAuth(). O gate de autorização é is_platform_admin (75-314 — plataforma).

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
  const { appUser } = auth

  const roleError = (await isPlatformAdmin(appUser.id))
    ? null
    : NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (roleError) return roleError

  const supabase = createAdminClient()

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

  // Story 78-14 (AC14): uma edição manual marca a FONTE como 'manual' no MESMO request, para que
  // o próximo ciclo do enriquecedor (AC9) nunca sobrescreva silenciosamente o valor cadastrado.
  // value_source/seats_source NUNCA são aceitos crus do cliente — são derivados aqui.
  if (validation.value.expected_amount !== undefined) {
    update.value_source = "manual"
  }
  if (validation.value.subscription_seats !== undefined) {
    update.seats_source = "manual"
  }

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
      // Story 78-14 (REL-001): a migration 172 tornou due_date nullable (assinaturas fixas
      // recém-seedadas nascem sem vencimento). Só há ciclo a avançar se houver uma data-base;
      // com due_date=null, apenas registra paid_at (já setado acima) sem avançar — não inventa
      // data nem estoura em avancarCiclo(null) (TypeError → 500). Simétrico ao filtro de null do
      // cron (AC12). Comportamento inalterado para reminders com due_date preenchido.
      if (
        (cicloEfetivo === "monthly" || cicloEfetivo === "annual") &&
        atual.due_date != null
      ) {
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
      // Story 78-14 (AC14): retorna também os campos de assinatura fixa após a edição manual.
      "id, service_id, due_date, expected_amount, currency, billing_cycle, alert_days_before, status, paid_at, last_alerted_on, notes, is_fixed_subscription, subscription_plan, subscription_seats, value_source, seats_source, excluded_from_subscription_total, last_enriched_at, created_at, updated_at"
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
  const { appUser } = auth

  const roleError = (await isPlatformAdmin(appUser.id))
    ? null
    : NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (roleError) return roleError

  const supabase = createAdminClient()

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
