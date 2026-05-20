"use client"

import { useTransition } from "react"
import { toggleBrokerAvailability } from "./_actions"

export function ToggleAvailabilityButton({
  brokerId,
  isAvailable,
}: {
  brokerId: string
  isAvailable: boolean
}) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(() => toggleBrokerAvailability(brokerId, isAvailable))
      }
      className={`rounded-md px-3 py-1 text-xs font-medium transition-opacity disabled:opacity-50 ${
        isAvailable
          ? "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/20"
          : "bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-500/15 dark:text-green-300 dark:hover:bg-green-500/20"
      }`}
    >
      {pending ? "..." : isAvailable ? "Desativar" : "Ativar"}
    </button>
  )
}
