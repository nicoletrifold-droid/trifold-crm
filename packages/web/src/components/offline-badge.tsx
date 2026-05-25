'use client'

import { WifiOff } from 'lucide-react'
import { useOnlineStatus } from '@web/hooks/use-online-status'

export function OfflineBadge() {
  const online = useOnlineStatus()

  if (online) return null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Você está offline"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium motion-safe:animate-[slideDown_0.2s_ease-out] bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>Offline</span>
    </div>
  )
}
