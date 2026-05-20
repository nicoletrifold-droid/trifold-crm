"use client"

import { useState } from "react"
import { CreateRoleModal } from "./create-role-modal"

interface ProfileActionsHeaderProps {
  orgId: string
}

/**
 * Wrapper Client Component que renderiza o botão "+ Novo Perfil" e gerencia
 * o estado do `CreateRoleModal`. Mantém `page.tsx` como Server Component puro.
 */
export function ProfileActionsHeader({ orgId }: ProfileActionsHeaderProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 dark:bg-orange-600 dark:hover:bg-orange-700"
      >
        + Novo Perfil
      </button>

      <CreateRoleModal
        orgId={orgId}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  )
}
