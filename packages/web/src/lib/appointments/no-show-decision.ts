/**
 * Story 75-177 — Decisão sobre agendamentos "obsoletos" (scheduled/confirmed há +48h)
 * no detector de no-show (`processNoShowDetection`, cron follow-up).
 *
 * O detector antigo marcava no_show olhando SÓ `appointments.status`, e o único ponto
 * que muda o status para `completed` é o formulário formal de feedback. Corretor que
 * registra a visita "no braço" (arrasta o card para Visitou + escreve uma Nota) deixava
 * o agendamento eternamente `scheduled` → o cron revertia o lead 48h depois.
 *
 * Este módulo concentra apenas a lógica PURA de decisão, para testabilidade isolada
 * (mesmo padrão de `broker/transition-message.ts`). O route aplica o efeito.
 */
import { STAGE_IDS } from "@trifold/shared"

/** Etapas onde a visita claramente ocorreu — um "reset" de no-show seria destrutivo. */
export const POST_VISIT_STAGE_IDS: readonly string[] = [
  STAGE_IDS.visitou,
  STAGE_IDS.proposta,
  STAGE_IDS.negociando,
  STAGE_IDS.fechou,
]

/** Etapas terminais/parqueadas que o no-show NUNCA deve ressuscitar. */
export const NO_SHOW_TERMINAL_STAGE_IDS: readonly string[] = [
  STAGE_IDS.perdido,
  STAGE_IDS.represamento,
]

/** Tipos de atividade que indicam que o corretor (humano) tratou o lead. */
export const BROKER_ACTIVITY_TYPES: readonly string[] = [
  "broker_note",
  "note_added",
  "stage_change",
  "visit_completed",
]

/**
 * - `no_show`  → marcar agendamento no_show + mover lead (comportamento atual)
 * - `complete` → lead JÁ está em etapa pós-visita: a visita aconteceu. Marcar
 *                `completed`, NÃO mover.
 * - `close`    → Story 75-321: corretor tratou o lead depois do horário, mas NÃO
 *                há prova de que a visita ocorreu. Marcar `closed` (encerrado sem
 *                confirmação), NÃO mover. Antes isto virava `completed` e inflava
 *                "Visitas realizadas" no Analytics — 27% das realizadas de
 *                jul/ago 2026 eram agendamentos sem feedback nenhum, incluindo
 *                um em que a nota do corretor era "Cliente desmarcou".
 * - `cancel`   → lead terminal/parqueado: cancelar agendamento, NÃO mover (não ressuscitar)
 */
export type StaleAppointmentAction = "no_show" | "complete" | "close" | "cancel"

export interface StaleAppointmentInput {
  /** Etapa atual do lead. */
  leadStageId: string | null | undefined
  /** `scheduled_at` do agendamento. */
  scheduledAt: string | Date
  /** Timestamp da atividade humana mais recente do corretor no lead, ou null. */
  latestBrokerActivityAt?: string | Date | null
}

/** Converte para epoch ms; retorna NaN se inválido/ausente. */
function toEpoch(value: string | Date | null | undefined): number {
  if (value === null || value === undefined) return NaN
  return new Date(value).getTime()
}

/**
 * Decide o que fazer com um agendamento obsoleto (scheduled/confirmed, +48h) antes de
 * marcá-lo como no-show. A ordem de precedência é intencional: primeiro protege leads
 * terminais, depois leads que já avançaram, depois sinal de atividade humana; só então
 * conclui que foi um no-show real.
 */
export function decideStaleAppointment(input: StaleAppointmentInput): StaleAppointmentAction {
  const { leadStageId, scheduledAt, latestBrokerActivityAt } = input

  // Guard bônus: terminal/parqueado → nunca ressuscitar.
  if (leadStageId && NO_SHOW_TERMINAL_STAGE_IDS.includes(leadStageId)) return "cancel"

  // Guard 1: lead já avançou para pós-visita → visita ocorreu.
  if (leadStageId && POST_VISIT_STAGE_IDS.includes(leadStageId)) return "complete"

  // Guard 2: houve atividade humana do corretor DEPOIS do horário agendado → está
  // tratando. Story 75-321: isso encerra o agendamento (não fica pendente para
  // sempre, que era a dor da 75-177) mas NÃO afirma que a visita aconteceu — daí
  // `close` e não `complete`. Só o feedback ou a etapa pós-visita provam presença.
  const activity = toEpoch(latestBrokerActivityAt)
  const scheduled = toEpoch(scheduledAt)
  if (Number.isFinite(activity) && Number.isFinite(scheduled) && activity > scheduled) {
    return "close"
  }

  return "no_show"
}
