/**
 * Story 63-17 (Epic 63 Fase 6) — Rótulos e cores de canal das conversas.
 *
 * Mesma definição usada inline em `dashboard/conversas/page.tsx` (L25-28),
 * extraída aqui para reuso pela inbox do corretor (`/broker/chat`) sem
 * duplicar a constante. WhatsApp = verde, Telegram = azul.
 */

export interface ChannelLabel {
  label: string
  /** Classe de cor de texto (Tailwind). */
  color: string
  /** Classe de background do chip (Tailwind). */
  bg: string
}

export const channelLabels: Record<string, ChannelLabel> = {
  whatsapp: {
    label: "WhatsApp",
    color: "text-green-700 dark:text-green-300",
    bg: "bg-green-100 dark:bg-green-500/15",
  },
  telegram: {
    label: "Telegram",
    color: "text-blue-700 dark:text-blue-300",
    bg: "bg-blue-100 dark:bg-blue-500/15",
  },
}

/** Resolve o rótulo do canal, com fallback neutro para canais desconhecidos. */
export function getChannelLabel(channel: string): ChannelLabel {
  return (
    channelLabels[channel] ?? {
      label: channel,
      color: "text-gray-700 dark:text-stone-300",
      bg: "bg-gray-100 dark:bg-stone-700/50",
    }
  )
}
