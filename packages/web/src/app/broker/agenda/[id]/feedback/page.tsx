"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface AppointmentData {
  id: string
  scheduled_at: string
  duration_minutes: number
  location: string | null
  status: string
  lead: { id: string; name: string } | null
  property: { id: string; name: string } | null
}

export default function FeedbackPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()

  const [appointment, setAppointment] = useState<AppointmentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [feedback, setFeedback] = useState("")
  const [interestAfter, setInterestAfter] = useState("")
  const [nextSteps, setNextSteps] = useState("")
  const [wantsProposal, setWantsProposal] = useState(false)
  const [additionalNotes, setAdditionalNotes] = useState("")

  useEffect(() => {
    async function loadAppointment() {
      try {
        const res = await fetch(`/api/appointments/${id}`)
        if (!res.ok) {
          setError("Agendamento nao encontrado")
          setLoading(false)
          return
        }
        const json = await res.json()
        const apt = json.data ?? json
        const lead = Array.isArray(apt.lead) ? apt.lead[0] : apt.lead
        const property = Array.isArray(apt.property) ? apt.property[0] : apt.property
        setAppointment({
          id: apt.id,
          scheduled_at: apt.scheduled_at,
          duration_minutes: apt.duration_minutes,
          location: apt.location,
          status: apt.status,
          lead: lead ?? null,
          property: property ?? null,
        })
      } catch {
        setError("Erro ao carregar agendamento")
      } finally {
        setLoading(false)
      }
    }
    loadAppointment()
  }, [id])

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

      const res = await fetch(`/api/appointments/${id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const json = await res.json()
        setError(json.error ?? "Erro ao enviar feedback")
        setSubmitting(false)
        return
      }

      router.push("/broker/agenda")
    } catch {
      setError("Erro ao enviar feedback")
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <p className="text-sm text-stone-400">Carregando...</p>
      </div>
    )
  }

  if (error && !appointment) {
    return (
      <div className="space-y-4">
        <Link href="/broker/agenda" className="text-sm text-orange-600 hover:underline">
          &larr; Voltar para agenda
        </Link>
        <div className="rounded-lg bg-red-50 p-6 text-center dark:bg-red-500/15">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      </div>
    )
  }

  const aptDate = appointment ? new Date(appointment.scheduled_at) : null

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/broker/agenda" className="text-sm text-orange-600 hover:underline dark:text-orange-300 dark:hover:text-orange-200">
        &larr; Voltar para agenda
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Feedback da visita</h1>

      {/* Appointment info */}
      {appointment && aptDate && (
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-800/50">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[10px] font-medium uppercase text-stone-400 dark:text-stone-500">Lead</p>
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                {appointment.lead?.name ?? "-"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase text-stone-400 dark:text-stone-500">Empreendimento</p>
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                {appointment.property?.name ?? "-"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase text-stone-400 dark:text-stone-500">Data / Hora</p>
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                {aptDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}{" "}
                {aptDate.toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "America/Sao_Paulo",
                })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Feedback form */}
      <form onSubmit={handleSubmit} className="space-y-5 rounded-xl bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        {/* Visit feedback */}
        <div>
          <label htmlFor="feedback" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-stone-300">
            Como foi a visita? *
          </label>
          <textarea
            id="feedback"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            required
            rows={4}
            placeholder="Descreva como foi a visita, pontos relevantes, impressoes do lead..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder:text-stone-500"
          />
        </div>

        {/* Interest level */}
        <div>
          <label htmlFor="interest" className="mb-1.5 block text-sm font-medium text-gray-700">
            Nivel de interesse do lead *
          </label>
          <select
            id="interest"
            value={interestAfter}
            onChange={(e) => setInterestAfter(e.target.value)}
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
          >
            <option value="">Selecione...</option>
            <option value="cold">Frio</option>
            <option value="warm">Morno</option>
            <option value="hot">Quente</option>
          </select>
        </div>

        {/* Next steps */}
        <div>
          <label htmlFor="nextSteps" className="mb-1.5 block text-sm font-medium text-gray-700">
            Proximos passos
          </label>
          <textarea
            id="nextSteps"
            value={nextSteps}
            onChange={(e) => setNextSteps(e.target.value)}
            rows={3}
            placeholder="Quais os proximos passos com este lead?"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder:text-stone-500"
          />
        </div>

        {/* Wants proposal */}
        <div className="flex items-center gap-2">
          <input
            id="wantsProposal"
            type="checkbox"
            checked={wantsProposal}
            onChange={(e) => setWantsProposal(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 dark:border-stone-600"
          />
          <label htmlFor="wantsProposal" className="text-sm font-medium text-gray-700 dark:text-stone-300">
            O lead quer receber proposta?
          </label>
        </div>

        {/* Additional notes */}
        <div>
          <label htmlFor="additionalNotes" className="mb-1.5 block text-sm font-medium text-gray-700">
            Observacoes adicionais
          </label>
          <textarea
            id="additionalNotes"
            value={additionalNotes}
            onChange={(e) => setAdditionalNotes(e.target.value)}
            rows={3}
            placeholder="Informacoes extras relevantes..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder:text-stone-500"
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
          <Link
            href="/broker/agenda"
            className="rounded-md border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
