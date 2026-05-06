"use client"

import { useState } from "react"
import { Pencil } from "lucide-react"
import { ObraEditModal } from "./obra-edit-modal"

interface Obra {
  id: string
  name: string
  description: string | null
  status: string
  progress_pct: number
  expected_delivery_date: string | null
}

export function ObraEditButton({ obra }: { obra: Obra }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <Pencil className="h-4 w-4" />
        Editar
      </button>
      {open && (
        <ObraEditModal obra={obra} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
