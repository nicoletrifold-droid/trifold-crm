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
  /**
   * H1 da revisão do @qa (24/08). O ramo `alert_broker` SEMPRE exigiu conversa —
   * `podeFollowUpSemConversa` só deixa passar lead sem conversa quando a etapa tem
   * template E ele cruzou o takeover, e o comentário do cron declara: "o ramo de
   * alert_broker continua exigindo conversa, para não virar rajada de notificação
   * ao corretor".
   *
   * Até a 75-368 isso era garantido por CONSTRUÇÃO: lead sem conversa que passava
   * do gate tinha dias >= takeover, então caía sempre no ramo da Nicole e nunca
   * alcançava o alerta. A cascata desta story rompia essa garantia justamente no
   * caso principal do pedido (lead novo de Meta Ads, sem conversa, desligado para
   * alguém ligar na mão).
   *
   * Passando a conversa para cá, a invariante deixa de ser acidental e passa a ser
   * checada — mais forte do que era antes.
   */
  temConversa: boolean
}

export function decidirAcaoDoFollowUp({
  diasSemContato,
  nicoleTakeoverDays,
  alertDays,
  nicoleFollowUpOffAt,
  temConversa,
}: EntradaDecisaoFollowUp): AcaoDoFollowUp {
  const nicoleDesligada = nicoleFollowUpOffAt != null

  if (diasSemContato >= nicoleTakeoverDays && !nicoleDesligada) return "nicole"
  // H1 — alerta exige conversa. Sem ela o silêncio é o comportamento correto, e é
  // o que quem desligou o follow-up está esperando.
  if (diasSemContato >= alertDays && temConversa) return "alerta"
  return "nada"
}
