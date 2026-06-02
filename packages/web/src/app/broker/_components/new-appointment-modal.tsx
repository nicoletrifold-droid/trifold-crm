"use client"

import { useState } from "react"
import { NewAppointmentModal } from "@web/components/appointments/new-appointment-modal"
import { Plus } from "lucide-react"

export function NewAppointmentButton() {
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
          onClose={() => setOpen(false)}
          onSuccess={() => setOpen(false)}
        />
      )}
    </>
  )
}
