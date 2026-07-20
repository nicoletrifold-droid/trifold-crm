"use client"

import { useState } from "react"
import { Pencil } from "lucide-react"
import { DashboardLeadEditForm } from "./dashboard-lead-edit-form"

interface Props {
  lead: Record<string, unknown>
  properties: { id: string; name: string }[]
}

export function EditLeadToggle({ lead, properties }: Props) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <DashboardLeadEditForm
        lead={{
          id: lead.id as string,
          name: lead.name as string | null,
          phone: lead.phone as string,
          email: lead.email as string | null,
          interest_level: lead.interest_level as string | null,
          property_interest_id: lead.property_interest_id as string | null,
          preferred_bedrooms: lead.preferred_bedrooms as number | null,
          preferred_floor: lead.preferred_floor as string | null,
          preferred_view: lead.preferred_view as string | null,
          preferred_garage_count: lead.preferred_garage_count as number | null,
          has_down_payment: lead.has_down_payment as boolean | null,
          observacao: lead.observacao as string | null,
          finalidade: lead.finalidade as string | null,
          orcamento: lead.orcamento as string | null,
          prazo_compra: lead.prazo_compra as string | null,
          forma_pagamento: lead.forma_pagamento as string | null,
          // Story 75-181 — perfil p/ marketing
          profissao: lead.profissao as string | null,
          renda_familiar: lead.renda_familiar as string | null,
          filhos: lead.filhos as string | null,
          estado_civil: lead.estado_civil as string | null,
          faixa_etaria: lead.faixa_etaria as string | null,
          situacao_moradia: lead.situacao_moradia as string | null,
          cidade_bairro: lead.cidade_bairro as string | null,
          tem_pet: lead.tem_pet as string | null,
        }}
        properties={properties}
        onClose={() => setEditing(false)}
      />
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="Editar lead"
      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-orange-500 transition-colors dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-orange-400"
    >
      <Pencil className="h-4 w-4" />
    </button>
  )
}
