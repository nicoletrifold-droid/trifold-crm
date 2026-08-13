"use client"

import { useState } from "react"
import { NewAppointmentModal } from "@web/components/appointments/new-appointment-modal"
import { Plus } from "lucide-react"

interface NewAppointmentButtonProps {
  brokerId?: string
  userRole?: string // Story 81-2 (mantido p/ UX do mundo imob no modal)
  /** 75-307: seletor HOUSE/IMOB — capability agenda.escolher_equipe (resolvida no server) */
  canPickTeam?: boolean
}

export function NewAppointmentButton({ brokerId, userRole, canPickTeam }: NewAppointmentButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Novo Compromisso
      </button>
      {open && (
        <NewAppointmentModal
          brokerId={brokerId}
          userRole={userRole}
          canPickTeam={canPickTeam}
          onClose={() => setOpen(false)}
          onSuccess={() => setOpen(false)}
        />
      )}
    </>
  )
}
