/**
 * Story 75-358 — quando a Nicole pode dizer "não conseguimos nos encontrar".
 *
 * Antes essa decisão saía da ETAPA do lead (`leadStageId === STAGE_IDS.no_show`).
 * Etapa é um rótulo que qualquer pessoa renomeia numa tela, e foi exatamente o que
 * aconteceu: em 08/06/2026 a etapa `…0009` deixou de ser "No-Show" e virou
 * "Atendimento" sem que o código soubesse. Resultado medido em 20/08/2026 — os
 * 4 de 4 leads que responderam ao disparo das 11:00 foram acusados de furar uma
 * visita, e os quatro tinham ZERO linhas em `appointments`.
 *
 * A prova de que alguém faltou não está no rótulo da coluna: está em
 * `appointments.status = 'no_show'`. Este módulo é só a decisão (pura), no mesmo
 * padrão de `no-show-decision.ts` e `detect-appointment.ts` — o pipeline aplica.
 */

/** Sub-conjunto de `appointments` que a decisão precisa. */
export interface AppointmentForReengage {
  status: string | null | undefined
  scheduled_at: string | Date | null | undefined
}

function toEpoch(value: string | Date | null | undefined): number {
  if (value === null || value === undefined) return NaN
  return new Date(value).getTime()
}

/**
 * O contexto de no-show entra SOMENTE quando o agendamento mais recente do lead
 * (por `scheduled_at`) está `no_show`.
 *
 * A regra é uma só, e cobre os quatro casos que importam:
 *
 * - **Sem agendamento nenhum** → `false`. É o caso de 20/08: lead que só clicou num
 *   anúncio nunca combinou horário com ninguém, e não existe nada para remarcar.
 * - **Faltou e REMARCOU** → o mais recente é o novo agendamento → `false`. Oferecer
 *   "quer marcar outro dia?" para quem já tem visita na agenda é pior que não dizer
 *   nada: convida o lead a desmarcar o que está marcado.
 * - **Faltou e depois visitou** → o mais recente é `completed` → `false`.
 * - **Faltou e não voltou** → `true`. É o único caso para o qual o bloco foi escrito.
 *
 * A etapa do lead não entra na conta de propósito. Mesmo com a coluna No-Show da
 * mig 236 no lugar, quem manda é o agendamento — se alguém renomear uma coluna
 * outra vez, a Nicole não volta a mentir.
 */
export function deveReengajarNoShow(
  appointments: readonly AppointmentForReengage[] | null | undefined
): boolean {
  if (!appointments || appointments.length === 0) return false

  let maisRecente: AppointmentForReengage | null = null
  let maisRecenteEpoch = -Infinity

  for (const appt of appointments) {
    const epoch = toEpoch(appt.scheduled_at)
    // Agendamento sem data não serve de referência temporal — ignorado, nunca
    // tratado como "hoje" (era assim que o `NaN` virava o mais recente).
    if (Number.isNaN(epoch)) continue
    if (epoch > maisRecenteEpoch) {
      maisRecenteEpoch = epoch
      maisRecente = appt
    }
  }

  return maisRecente?.status === "no_show"
}
