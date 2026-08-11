"use client"

// Story 75-290 — LEITURA do feedback de visita.
//
// As portas 75-185/186/193 são todas de escrita e somem depois do envio: com o
// feedback registrado, só sobrava o Histórico do lead (75-202), misturado com
// follow-ups da Nicole e mudanças de etapa. Aqui a visita aparece sozinha.
//
// Estado do botão vem de fora (o host já calcula a régua); esta busca é LAZY,
// só acontece quando o modal abre.

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { X } from "lucide-react"
import { INTEREST_LEVEL_LABELS, INTEREST_LEVEL_COLORS } from "@web/lib/constants"
import type { VisitFeedbackEntry } from "@web/lib/appointments/visit-feedback-read"
import { VisitFeedbackForm } from "./visit-feedback-form"

interface VisitFeedbackHistoryModalProps {
  leadId: string
  /** Nome do lead, no subtítulo do modal. */
  leadName?: string
  /** Visita passada sem feedback: habilita registrar uma NOVA sem sair do modal. */
  pendingAppointmentId?: string | null
  onClose: () => void
}

function formatVisitDate(iso: string | null): string {
  if (!iso) return "data não registrada"
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return "data não registrada"
  return parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
}

export function VisitFeedbackHistoryModal({
  leadId,
  leadName,
  pendingAppointmentId,
  onClose,
}: VisitFeedbackHistoryModalProps) {
  const router = useRouter()
  const [entries, setEntries] = useState<VisitFeedbackEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [registering, setRegistering] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/leads/${leadId}/visit-feedback`)
      .then(async (res) => {
        if (!res.ok) throw new Error("falhou")
        return res.json()
      })
      .then((json) => {
        if (cancelled) return
        setEntries((json?.feedbacks as VisitFeedbackEntry[]) ?? [])
      })
      .catch(() => {
        if (!cancelled) setError("Não foi possível carregar o feedback da visita.")
      })
    return () => {
      cancelled = true
    }
  }, [leadId])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Feedback da visita"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-stone-200 bg-white shadow-xl dark:border-stone-700 dark:bg-stone-900">
        <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4 dark:border-stone-800">
          <div>
            <h2 className="text-base font-semibold text-stone-900 dark:text-white">
              {registering ? "Registrar visita" : "Feedback da visita"}
            </h2>
            {leadName && <p className="text-xs text-stone-500 dark:text-stone-400">{leadName}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {registering ? (
            <VisitFeedbackForm
              appointmentId={pendingAppointmentId ?? undefined}
              leadId={pendingAppointmentId ? undefined : leadId}
              onSuccess={() => {
                onClose()
                router.refresh()
              }}
              onCancel={() => setRegistering(false)}
            />
          ) : (
            <>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              {!error && entries === null && (
                <div className="space-y-3">
                  {[90, 70, 80].map((w, i) => (
                    <div
                      key={i}
                      className="h-4 animate-pulse rounded bg-stone-100 dark:bg-stone-800"
                      style={{ width: `${w}%` }}
                    />
                  ))}
                </div>
              )}

              {!error && entries?.length === 0 && (
                <p className="text-sm text-stone-500 dark:text-stone-400">
                  Nenhum feedback de visita registrado para este lead.
                </p>
              )}

              {!error && entries && entries.length > 0 && (
                <ul className="space-y-5">
                  {entries.map((entry) => (
                    <li
                      key={entry.id}
                      className="rounded-xl border border-stone-200 p-4 dark:border-stone-700"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-stone-900 dark:text-stone-100">
                          {formatVisitDate(entry.visited_at)}
                        </span>
                        {entry.interest_after && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              INTEREST_LEVEL_COLORS[entry.interest_after] ??
                              "bg-stone-100 text-stone-700"
                            }`}
                          >
                            {INTEREST_LEVEL_LABELS[entry.interest_after] ?? entry.interest_after}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 whitespace-pre-line text-sm text-stone-700 dark:text-stone-300">
                        {entry.feedback}
                      </p>
                      {entry.next_steps && (
                        <div className="mt-3">
                          <p className="text-xs font-medium uppercase tracking-wide text-stone-400 dark:text-stone-500">
                            Próximos passos
                          </p>
                          <p className="mt-1 whitespace-pre-line text-sm text-stone-700 dark:text-stone-300">
                            {entry.next_steps}
                          </p>
                        </div>
                      )}
                      <p className="mt-3 text-xs text-stone-400 dark:text-stone-500">
                        Registrado por {entry.author ?? "Sistema"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {!error && entries !== null && (
                <button
                  onClick={() => setRegistering(true)}
                  className="mt-5 w-full rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700"
                >
                  {pendingAppointmentId ? "Registrar feedback da visita pendente" : "Registrar outra visita"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
