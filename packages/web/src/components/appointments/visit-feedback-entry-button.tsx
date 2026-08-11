"use client"

// Story 75-290 — a porta ÚNICA de feedback de visita no header do lead.
//
// Uma porta, três estados. O estado NÃO é buscado aqui: vem de quem hospeda o
// botão, que já calcula a régua "visita passada sem visit_feedback" (o drawer em
// state; as páginas do lead no server). Assim o header não paga request nenhum
// enquanto ninguém clica — e a régua não ganha uma terceira cópia no código.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ClipboardList } from "lucide-react"
import { visitFeedbackDoor } from "@web/lib/appointments/visit-feedback-read"
import { VisitFeedbackModal } from "./visit-feedback-form"
import { VisitFeedbackHistoryModal } from "./visit-feedback-history"

interface VisitFeedbackEntryButtonProps {
  leadId: string
  leadName?: string
  /** Visita passada (scheduled/confirmed/completed) SEM visit_feedback. */
  pendingAppointmentId?: string | null
  /** O lead já tem ≥1 feedback registrado → o botão abre a LEITURA. */
  hasFeedback: boolean
  /** Lead em "Visitou" sem agendamento nenhum: porta retroativa (75-193). */
  canRegisterRetro?: boolean
  /** Rótulo curto — o header do drawer tem 448px e já carrega 3 controles. */
  compact?: boolean
  /**
   * Feedback registrado por AQUI. Quem hospeda o botão mantém o estado, então
   * precisa saber: sem isso o botão fica congelado no rótulo antigo (o
   * `router.refresh()` re-renderiza server components, não o state do drawer).
   */
  onRegistered?: () => void
  className?: string
}

export function VisitFeedbackEntryButton({
  leadId,
  leadName,
  pendingAppointmentId,
  hasFeedback,
  canRegisterRetro = false,
  compact = false,
  onRegistered,
  className,
}: VisitFeedbackEntryButtonProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  // A decisão vive no núcleo puro (visitFeedbackDoor), testada sem DOM.
  const door = visitFeedbackDoor({ hasFeedback, pendingAppointmentId, canRegisterRetro })

  // Lead que nunca visitou não ganha botão morto no header.
  if (door === "hidden") return null

  // Curto no drawer (448px, já com "Editar Lead" + "Ver completo" + fechar),
  // inteiro nas páginas do lead, onde o header é largo. O `title` sempre diz a
  // frase completa.
  const label =
    door === "read"
      ? compact
        ? "Feedback"
        : "Feedback da visita"
      : door === "write-pending"
        ? compact
          ? "Registrar"
          : "Registrar feedback"
        : compact
          ? "Registrar"
          : "Registrar visita"

  const tone =
    door === "read"
      ? "bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
      : "bg-orange-600 text-white hover:bg-orange-700"

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={hasFeedback ? "Ler o feedback da visita" : "Registrar o feedback da visita"}
        className={className ?? `inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tone}`}
      >
        <ClipboardList className="h-3.5 w-3.5" />
        {label}
      </button>

      {open &&
        (door === "read" ? (
          <VisitFeedbackHistoryModal
            leadId={leadId}
            leadName={leadName}
            pendingAppointmentId={pendingAppointmentId}
            onClose={() => setOpen(false)}
            onRegistered={onRegistered}
          />
        ) : (
          <VisitFeedbackModal
            appointmentId={pendingAppointmentId ?? undefined}
            leadId={pendingAppointmentId ? undefined : leadId}
            title={pendingAppointmentId ? "Feedback da visita" : "Registrar visita"}
            subtitle={leadName}
            onClose={() => setOpen(false)}
            onSuccess={() => {
              setOpen(false)
              router.refresh()
              onRegistered?.()
            }}
          />
        ))}
    </>
  )
}
