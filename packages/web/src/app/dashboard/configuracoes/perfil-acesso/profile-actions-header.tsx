"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { CreateRoleModal } from "./create-role-modal"

interface ProfileActionsHeaderProps {
  orgId: string
  existingColors: string[]
}

/**
 * Wrapper Client Component que renderiza o botão "+ Novo Perfil" e gerencia
 * o estado do `CreateRoleModal`. Mantém `page.tsx` como Server Component puro.
 */
export function ProfileActionsHeader({ orgId, existingColors }: ProfileActionsHeaderProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="group inline-flex items-center gap-2 rounded-lg bg-gradient-to-b from-orange-500 to-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-500/25 ring-1 ring-orange-600/30 transition-all hover:from-orange-500 hover:to-orange-700 hover:shadow-lg hover:shadow-orange-500/30 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 dark:ring-orange-400/20 dark:focus:ring-offset-stone-950"
      >
        <Plus
          className="h-4 w-4 transition-transform group-hover:rotate-90"
          strokeWidth={2.5}
          aria-hidden="true"
        />
        Novo Perfil
      </button>

      <CreateRoleModal
        orgId={orgId}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        existingColors={existingColors}
      />
    </>
  )
}
