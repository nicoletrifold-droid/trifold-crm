/**
 * Story 75-368 — qual ação o cron de follow-up deve tomar para um lead.
 *
 * A regra vive numa função pura, testada sem banco e sem rede — mesmo desenho da
 * `decidirTemplateDoFollowUp` (Story 75-353).
 *
 * O ponto sutil que esta função existe para proteger: `alert_broker` e `nicole_sent`
 * são um `if / else if`, não dois `if` independentes. Como
 * `nicole_takeover_days >= alert_days`, um lead que cruzou o takeover NUNCA chega ao
 * ramo do alerta. Quando o follow-up da Nicole está desligado para o lead, ele deixa
 * de entrar no ramo da Nicole e CASCATEIA para o alerta — que é exatamente o
 * comportamento pedido: a IA cala, o corretor continua avisado.
 *
 * É por isso que o desligamento NÃO pode virar filtro na consulta de leads: a mesma
 * consulta alimenta os dois ramos, e filtrar nela mataria também o alerta.
 */
export type AcaoDoFollowUp = "nicole" | "alerta" | "nada"

export interface EntradaDecisaoFollowUp {
  /** Dias sem contato calculados pelo cron. */
  diasSemContato: number
  /** `follow_up_rules.nicole_takeover_days` da etapa. */
  nicoleTakeoverDays: number
  /** `follow_up_rules.alert_days` da etapa. */
  alertDays: number
  /** `leads.nicole_followup_off_at` — preenchida = desligado, null = ligado. */
  nicoleFollowUpOffAt: string | null
}

export function decidirAcaoDoFollowUp({
  diasSemContato,
  nicoleTakeoverDays,
  alertDays,
  nicoleFollowUpOffAt,
}: EntradaDecisaoFollowUp): AcaoDoFollowUp {
  const nicoleDesligada = nicoleFollowUpOffAt != null

  if (diasSemContato >= nicoleTakeoverDays && !nicoleDesligada) return "nicole"
  if (diasSemContato >= alertDays) return "alerta"
  return "nada"
}
