"use client"

// Story 75-185 — Formulário de feedback de visita COMPARTILHADO (1 form, 3 portas).
//
// O submit dispara o ciclo completo (POST /api/appointments/[id]/feedback):
// visit_feedback + appointment completed + lead → Visitou + pós-visita da Nicole.
// Usado por: página /broker/agenda/[id]/feedback (rota original), botão na página
// do lead do corretor, dashboard/agenda ("Marcar como realizado") e kanban → Visitou.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { X } from "lucide-react"

interface VisitFeedbackFormProps {
  /** Porta normal: feedback de um agendamento existente. */
  appointmentId?: string
  /** Story 75-193 — porta RETROATIVA: visita sem agendamento no sistema.
   *  Mostra campo de data e envia para /api/leads/[id]/visit-feedback. */
  leadId?: string
  /** Chamado após envio com sucesso (fechar modal / navegar). */
  onSuccess: () => void
  /** Chamado no cancelar. Omitido = sem botão cancelar. */
  onCancel?: () => void
}

function todayLocalISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function VisitFeedbackForm({ appointmentId, leadId, onSuccess, onCancel }: VisitFeedbackFormProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState("")
  const [interestAfter, setInterestAfter] = useState("")
  const [nextSteps, setNextSteps] = useState("")
  const [wantsProposal, setWantsProposal] = useState(false)
  const [additionalNotes, setAdditionalNotes] = useState("")
  const retroMode = !appointmentId && !!leadId
  const [visitedDate, setVisitedDate] = useState(todayLocalISO())

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!feedback.trim() || !interestAfter) return

    setSubmitting(true)
    setError(null)

    try {
      const body: Record<string, unknown> = {
        feedback: feedback.trim(),
        interest_after: interestAfter,
        next_steps: [
          nextSteps.trim(),
          wantsProposal ? "Lead deseja receber proposta" : "",
          additionalNotes.trim() ? `Obs: ${additionalNotes.trim()}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      }

      if (retroMode) {
        // meio-dia local: evita a data "voltar um dia" ao converter p/ UTC
        body.visited_at = new Date(`${visitedDate}T12:00:00`).toISOString()
      }

      const endpoint = retroMode
        ? `/api/leads/${leadId}/visit-feedback`
        : `/api/appointments/${appointmentId}/feedback`
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError((json as { error?: string }).error ?? "Erro ao enviar feedback")
        setSubmitting(false)
        return
      }

      onSuccess()
    } catch {
      setError("Erro ao enviar feedback")
      setSubmitting(false)
    }
  }

  const inputClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder:text-stone-500"
  const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-stone-300"

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {retroMode && (
        <div>
          <label htmlFor="vf-date" className={labelClass}>Quando foi a visita? *</label>
          <input
            id="vf-date"
            type="date"
            value={visitedDate}
            onChange={(e) => setVisitedDate(e.target.value)}
            max={todayLocalISO()}
            required
            className={inputClass}
          />
          <p className="mt-1 text-xs text-gray-400 dark:text-stone-500">
            Visita sem agendamento no sistema — será registrada retroativamente.
          </p>
        </div>
      )}
      <div>
        <label htmlFor="vf-feedback" className={labelClass}>Como foi a visita? *</label>
        <textarea
          id="vf-feedback"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          required
          rows={4}
          placeholder="Descreva como foi a visita, pontos relevantes, impressoes do lead..."
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="vf-interest" className={labelClass}>Nivel de interesse do lead *</label>
        <select
          id="vf-interest"
          value={interestAfter}
          onChange={(e) => setInterestAfter(e.target.value)}
          required
          className={inputClass}
        >
          <option value="">Selecione...</option>
          <option value="cold">Frio</option>
          <option value="warm">Morno</option>
          <option value="hot">Quente</option>
        </select>
      </div>

      <div>
        <label htmlFor="vf-next" className={labelClass}>Proximos passos</label>
        <textarea
          id="vf-next"
          value={nextSteps}
          onChange={(e) => setNextSteps(e.target.value)}
          rows={3}
          placeholder="Quais os proximos passos com este lead?"
          className={inputClass}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="vf-proposal"
          type="checkbox"
          checked={wantsProposal}
          onChange={(e) => setWantsProposal(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 dark:border-stone-600"
        />
        <label htmlFor="vf-proposal" className="text-sm font-medium text-gray-700 dark:text-stone-300">
          O lead quer receber proposta?
        </label>
      </div>

      <div>
        <label htmlFor="vf-notes" className={labelClass}>Observacoes adicionais</label>
        <textarea
          id="vf-notes"
          value={additionalNotes}
          onChange={(e) => setAdditionalNotes(e.target.value)}
          rows={2}
          placeholder="Informacoes extras relevantes..."
          className={inputClass}
        />
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting || !feedback.trim() || !interestAfter}
          className="rounded-md bg-orange-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Enviando..." : "Enviar feedback"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}

interface VisitFeedbackModalProps {
  appointmentId?: string
  leadId?: string
  /** Contexto exibido no header do modal (ex.: nome do lead). */
  title?: string
  subtitle?: string
  onClose: () => void
  onSuccess: () => void
}

/** Overlay padrão do projeto (new-lead-modal): backdrop + card com scroll. */
export function VisitFeedbackModal({ appointmentId, leadId, title, subtitle, onClose, onSuccess }: VisitFeedbackModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Feedback da visita">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-stone-200 bg-white shadow-xl dark:border-stone-700 dark:bg-stone-900">
        <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4 dark:border-stone-800">
          <div>
            <h2 className="text-base font-semibold text-stone-900 dark:text-white">{title ?? "Feedback da visita"}</h2>
            {subtitle && <p className="text-xs text-stone-500 dark:text-stone-400">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">
          <VisitFeedbackForm appointmentId={appointmentId} leadId={leadId} onSuccess={onSuccess} onCancel={onClose} />
        </div>
      </div>
    </div>
  )
}

interface VisitFeedbackButtonProps {
  appointmentId?: string
  /** Story 75-193 — porta retroativa (visita sem agendamento). */
  leadId?: string
  /** Texto do botão (default "Registrar visita"). */
  label?: string
  className?: string
  /** Contexto p/ o header do modal. */
  title?: string
  subtitle?: string
  /** Story 75-186 — callback extra no sucesso (ex.: drawer esconder o botão). */
  onSuccess?: () => void
}

/** Botão autocontido: abre o modal e dá router.refresh() no sucesso. */
export function VisitFeedbackButton({ appointmentId, leadId, label = "Registrar visita", className, title, subtitle, onSuccess }: VisitFeedbackButtonProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={className ?? "rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700"}
      >
        {label}
      </button>
      {open && (
        <VisitFeedbackModal
          appointmentId={appointmentId}
          leadId={leadId}
          title={title}
          subtitle={subtitle}
          onClose={() => setOpen(false)}
          onSuccess={() => {
            setOpen(false)
            router.refresh()
            onSuccess?.()
          }}
        />
      )}
    </>
  )
}
