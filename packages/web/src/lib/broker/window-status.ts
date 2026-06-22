/**
 * Story 63-4 (Epic 63) — Cálculo do estado da janela de 24h do WhatsApp Business.
 *
 * Helper puro (sem dependências de React/Next) que deriva o estado da janela a
 * partir de `conversations.last_message_at`. Usado pelo `WindowStatusBadge` e
 * por `page.tsx` para desabilitar o composer proativamente.
 *
 * A API de envio (`dispatch-broker-message.ts`) bloqueia em 24h. Este helper usa
 * 22h como limiar de alerta ("fechando") para avisar o corretor 2h antes — os
 * thresholds são independentes e não conflitam.
 *
 * Para canais sem restrição de janela (ex.: Telegram), `isWhatsApp=false` →
 * estado sempre "open" e label vazio (o badge não é exibido).
 */

export type WindowStatusKind = "open" | "closing" | "closed"

export interface WindowStatus {
  status: WindowStatusKind
  /** Milissegundos restantes até a janela fechar (0 quando fechada; Infinity sem restrição). */
  remainingMs: number
  /** Texto pronto para exibição no badge (vazio = não exibir). */
  label: string
}

const HOUR_MS = 60 * 60 * 1000
const WINDOW_MS = 24 * HOUR_MS // janela total de 24h
const CLOSING_THRESHOLD_MS = 22 * HOUR_MS // alerta âmbar a partir de 22h decorridas

const CLOSED_LABEL = "Janela fechada · aguardando o lead"

/**
 * Formata uma duração em ms como "Xh Ym".
 * Valores não-finitos ou ≤ 0 retornam "0h 0m".
 */
export function formatCountdown(remainingMs: number): string {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return "0h 0m"
  const totalMinutes = Math.floor(remainingMs / (60 * 1000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}h ${minutes}m`
}

export function getWindowStatus(
  lastMessageAt: Date | null,
  isWhatsApp: boolean,
  now: Date = new Date()
): WindowStatus {
  // Canal sem restrição de janela (ex.: Telegram) → sem badge.
  if (!isWhatsApp) {
    return { status: "open", remainingMs: Infinity, label: "" }
  }

  // Sem histórico de mensagem → tratamos como janela fechada.
  if (!lastMessageAt) {
    return { status: "closed", remainingMs: 0, label: CLOSED_LABEL }
  }

  const elapsed = now.getTime() - lastMessageAt.getTime()
  const remainingMs = Math.max(0, WINDOW_MS - elapsed)

  if (elapsed >= WINDOW_MS) {
    return { status: "closed", remainingMs: 0, label: CLOSED_LABEL }
  }

  if (elapsed >= CLOSING_THRESHOLD_MS) {
    return {
      status: "closing",
      remainingMs,
      label: `Fecha em ${formatCountdown(remainingMs)}`,
    }
  }

  return {
    status: "open",
    remainingMs,
    label: `Janela aberta · fecha em ${formatCountdown(remainingMs)}`,
  }
}
