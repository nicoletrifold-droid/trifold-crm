/**
 * Story 75-290 — LEITURA do feedback de visita (as portas 75-185/186/193 são todas
 * de escrita e desaparecem depois do envio).
 *
 * Núcleo puro: casa cada `visit_feedback` com o AUTOR e ordena as visitas.
 * Fica fora da rota porque é aqui que estão as duas armadilhas do épico:
 *
 * 1. `visit_feedback` NÃO guarda autor — `visit-feedback-core.ts` deixa `broker_id`
 *    de fora de propósito (a coluna referencia `brokers(id)`, mas
 *    `appointments.broker_id` aponta para `users(id)`). O autor só existe na
 *    activity `visit_completed` (75-203), ligada por `metadata->>'feedback_id'`.
 *    Não há FK: o vínculo é jsonb, então nenhum embed PostgREST resolve isso.
 * 2. `visited_at` é NULLABLE desde a migration 011 — ordenar por ele sem tratar
 *    nulo põe uma visita sem data no topo, fingindo ser a mais recente.
 */

/**
 * Estado da porta única do header (Story 75-290). Mora aqui, e não no
 * componente, para poder ser testado sem DOM — o projeto não tem
 * @testing-library/jsdom.
 *
 * `hidden` importa tanto quanto os outros: lead que nunca visitou não ganha
 * botão morto no header.
 */
export type VisitFeedbackDoor = "read" | "write-pending" | "write-retro" | "hidden"

export function visitFeedbackDoor(state: {
  hasFeedback: boolean
  pendingAppointmentId?: string | null
  canRegisterRetro?: boolean
}): VisitFeedbackDoor {
  // Ler vem primeiro: com feedback registrado, a leitura é o caminho — e o
  // modal ainda oferece registrar a visita pendente por dentro.
  if (state.hasFeedback) return "read"
  if (state.pendingAppointmentId) return "write-pending"
  if (state.canRegisterRetro) return "write-retro"
  return "hidden"
}

export interface VisitFeedbackRecord {
  id: string
  visited_at: string | null
  created_at: string | null
  feedback: string | null
  interest_after: string | null
  next_steps: string | null
}

export interface VisitCompletedActivity {
  user_id: string | null
  metadata: unknown
}

export interface VisitFeedbackEntry {
  id: string
  /** Data da visita (cai para created_at quando visited_at é nulo). */
  visited_at: string | null
  feedback: string
  interest_after: string | null
  next_steps: string | null
  /** Quem registrou. `null` = autor desconhecido (a tela mostra "Sistema"). */
  author: string | null
}

/** `metadata` é jsonb solto: só aceita objeto com feedback_id string. */
export function feedbackIdFromActivity(activity: VisitCompletedActivity): string | null {
  const meta = activity.metadata
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null
  const id = (meta as Record<string, unknown>).feedback_id
  return typeof id === "string" && id.length > 0 ? id : null
}

/**
 * Autor de cada feedback. Recebe SÓ activities `visit_completed`: a activity
 * `followup_post_visit` da Nicole carrega o MESMO `feedback_id` no metadata
 * (visit-feedback-core) e tem `user_id` nulo — se entrasse na conta, poderia
 * apagar o nome do corretor. Por segurança, activity com autor sempre vence a
 * sem autor para o mesmo feedback.
 */
export function authorIdByFeedback(activities: VisitCompletedActivity[]): Map<string, string> {
  const byFeedback = new Map<string, string>()
  for (const activity of activities) {
    const feedbackId = feedbackIdFromActivity(activity)
    if (!feedbackId || !activity.user_id) continue
    if (!byFeedback.has(feedbackId)) byFeedback.set(feedbackId, activity.user_id)
  }
  return byFeedback
}

/** Instante usado na ordenação: visita, ou criação quando a visita não tem data. */
function sortableTime(record: VisitFeedbackRecord): number | null {
  const raw = record.visited_at ?? record.created_at
  if (!raw) return null
  const parsed = Date.parse(raw)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * Lista pronta para a tela: mais recente primeiro, sem data por último
 * (NUNCA no topo — ver armadilha 2 no topo do arquivo).
 */
export function buildVisitFeedbackList(
  feedbacks: VisitFeedbackRecord[],
  activities: VisitCompletedActivity[],
  userNames: Record<string, string | null | undefined>
): VisitFeedbackEntry[] {
  const authorIds = authorIdByFeedback(activities)

  return feedbacks
    .map((record) => {
      const authorId = authorIds.get(record.id)
      const name = authorId ? userNames[authorId] : null
      return {
        at: sortableTime(record),
        entry: {
          id: record.id,
          visited_at: record.visited_at ?? record.created_at,
          feedback: record.feedback ?? "",
          interest_after: record.interest_after,
          next_steps: record.next_steps,
          author: name && name.trim().length > 0 ? name : null,
        },
      }
    })
    .sort((a, b) => {
      if (a.at === null && b.at === null) return 0
      if (a.at === null) return 1
      if (b.at === null) return -1
      return b.at - a.at
    })
    .map(({ entry }) => entry)
}
