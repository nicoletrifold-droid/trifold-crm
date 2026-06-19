/**
 * Story 63-9 (Epic 63) — Helpers puros para o badge de janela de 24h na LISTA
 * de leads e para a ordenação "Janela fechando primeiro".
 *
 * Sem dependências de React/Next — funções puras testáveis em node (Vitest).
 * Reutiliza `getWindowStatus` da Story 63-4 para derivar o estado da janela.
 */

import { getWindowStatus } from "./window-status"

/** Embed mínimo de `conversations` trazido pela query da lista. */
export interface ConversationRef {
  last_message_at: string | null
}

/**
 * Seleciona o `last_message_at` da conversa MAIS RECENTE de um lead.
 *
 * Um lead pode ter várias `conversations`; a query da lista embute todas via
 * LEFT JOIN (embed único — sem N+1). Esta função reduz o array para o timestamp
 * máximo, sem depender de ordenação/limit no PostgREST.
 *
 * Aceita array, objeto único ou null/undefined (robusto ao formato do embed).
 */
export function selectLatestMessageAt(
  conversations:
    | ConversationRef[]
    | ConversationRef
    | null
    | undefined
): string | null {
  if (!conversations) return null
  const arr = Array.isArray(conversations) ? conversations : [conversations]

  let latest: string | null = null
  let latestMs = -Infinity
  for (const conv of arr) {
    const ts = conv?.last_message_at
    if (!ts) continue
    const ms = new Date(ts).getTime()
    if (!Number.isFinite(ms)) continue
    if (ms > latestMs) {
      latestMs = ms
      latest = ts
    }
  }
  return latest
}

/** Item mínimo necessário para ordenar por urgência de janela. */
export interface WindowSortable {
  phone: string
  last_message_at: string | null
}

/** Telegram (`tg:`) não tem janela de 24h → não é tratado como WhatsApp. */
function isWhatsAppLead(phone: string): boolean {
  return !phone.startsWith("tg:")
}

/**
 * Chave de ordenação por urgência da janela:
 * - `closed` (e canais sem janela) → vão para o FINAL (chave +Infinity);
 * - `open`/`closing` → ordenados por menor `remainingMs` (menos tempo no topo).
 */
export function windowUrgencyKey(lead: WindowSortable, now?: Date): number {
  const lastAt = lead.last_message_at ? new Date(lead.last_message_at) : null
  const { status, remainingMs } = getWindowStatus(
    lastAt,
    isWhatsAppLead(lead.phone),
    now
  )
  if (status === "closed") return Number.POSITIVE_INFINITY
  return remainingMs
}

/**
 * Ordena leads por "janela fechando primeiro" (cópia — não muta o array).
 * Leads com janela ativa e menor tempo restante ficam no topo; leads com
 * janela fechada (ou sem janela) ficam no final.
 */
export function sortByWindowUrgency<T extends WindowSortable>(
  leads: T[],
  now?: Date
): T[] {
  return [...leads].sort((a, b) => {
    const ka = windowUrgencyKey(a, now)
    const kb = windowUrgencyKey(b, now)
    if (ka === kb) return 0
    return ka < kb ? -1 : 1
  })
}
