"use client"

// Story 75-185 — página refatorada: o formulário virou componente compartilhado
// (components/appointments/visit-feedback-form.tsx), usado também na página do lead,
// no dashboard/agenda e no kanban → Visitou. Esta rota segue sendo a porta da agenda
// do corretor (links "Dar feedback").

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { VisitFeedbackForm } from "@web/components/appointments/visit-feedback-form"

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
  const [error, setError] = useState<string | null>(null)

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

      {/* Feedback form — compartilhado (Story 75-185) */}
      <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <VisitFeedbackForm
          appointmentId={id}
          onSuccess={() => router.push("/broker/agenda")}
          onCancel={() => router.push("/broker/agenda")}
        />
      </div>
    </div>
  )
}
