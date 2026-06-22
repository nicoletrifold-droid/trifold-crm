"use client"

import { CheckCircle2, Clock, CircleOff } from "lucide-react"
import { getWindowStatus, type WindowStatusKind } from "@web/lib/broker/window-status"

interface WindowStatusBadgeProps {
  /** `conversations.last_message_at` convertido para Date (ou null sem histórico). */
  lastMessageAt: Date | null
  /** false para canais sem restrição de janela (ex.: Telegram) → não renderiza. */
  isWhatsApp: boolean
}

const STYLES: Record<
  WindowStatusKind,
  { Icon: typeof CheckCircle2; className: string }
> = {
  open: {
    Icon: CheckCircle2,
    className:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  closing: {
    Icon: Clock,
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  closed: {
    Icon: CircleOff,
    className:
      "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
  },
}

/**
 * Story 63-4 — Badge de status da janela de 24h do WhatsApp.
 * Para leads Telegram (`isWhatsApp=false`) retorna `null` (AC3).
 */
export function WindowStatusBadge({
  lastMessageAt,
  isWhatsApp,
}: WindowStatusBadgeProps) {
  if (!isWhatsApp) return null

  const { status, label } = getWindowStatus(lastMessageAt, isWhatsApp)
  const { Icon, className } = STYLES[status]

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  )
}
