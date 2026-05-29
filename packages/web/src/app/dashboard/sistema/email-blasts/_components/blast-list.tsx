"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

interface Blast {
  id: string
  name: string
  status: string
  total_recipients: number
  sent_count: number
  scheduled_for: string | null
  created_at: string
  email_templates: { name: string } | null
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-stone-100 text-stone-500",
  scheduled: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-500",
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  scheduled: "Agendado",
  in_progress: "Em andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
}

export function BlastList() {
  const router = useRouter()
  const [blasts, setBlasts] = useState<Blast[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/admin/email-blasts")
    if (res.status === 403) { router.push("/dashboard"); return }
    const json = (await res.json()) as { data?: Blast[] }
    setBlasts(json.data ?? [])
    setLoading(false)
  }, [router])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchData() }, [fetchData])

  const cancel = async (id: string) => {
    setCancelling(true)
    await fetch(`/api/admin/email-blasts/${id}`, { method: "DELETE" })
    setCancelId(null)
    setCancelling(false)
    await fetchData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-stone-400">Carregando...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Email Blasts</h1>
          <p className="mt-0.5 text-sm text-stone-500">
            {blasts.length} blast{blasts.length !== 1 ? "s" : ""} registrado{blasts.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/dashboard/sistema/email-blasts/novo"
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + Novo Blast
        </Link>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white">
        {blasts.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-stone-400">Nenhum blast criado ainda</p>
            <Link
              href="/dashboard/sistema/email-blasts/novo"
              className="mt-2 inline-block text-sm text-indigo-600 hover:underline"
            >
              Criar primeiro blast
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <div className="divide-y divide-stone-50 min-w-[500px]">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-stone-400">
              <span>Campanha</span>
              <span>Template</span>
              <span>Progresso</span>
              <span>Status</span>
              <span className="text-right">Ações</span>
            </div>

            {blasts.map((b) => {
              const progress = b.total_recipients > 0
                ? Math.round((b.sent_count / b.total_recipients) * 100)
                : 0
              const canCancel = ["scheduled", "in_progress"].includes(b.status)
              return (
                <div
                  key={b.id}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-center px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-stone-800">{b.name}</p>
                    <p className="text-[11px] text-stone-400">
                      {b.scheduled_for
                        ? `Agendado: ${new Date(b.scheduled_for).toLocaleString("pt-BR")}`
                        : new Date(b.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <span className="text-xs text-stone-600 truncate">
                    {(b.email_templates as unknown as { name: string } | null)?.name ?? "—"}
                  </span>
                  <div>
                    <p className="text-xs text-stone-600">{b.sent_count}/{b.total_recipients}</p>
                    <div className="mt-1 h-1.5 w-20 rounded-full bg-stone-100">
                      <div
                        className="h-1.5 rounded-full bg-indigo-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                  <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[b.status] ?? "bg-stone-100 text-stone-500"}`}>
                    {STATUS_LABELS[b.status] ?? b.status}
                  </span>
                  <div className="flex items-center justify-end gap-3">
                    {canCancel && (
                      <button
                        onClick={() => setCancelId(b.id)}
                        className="text-xs text-stone-400 hover:text-red-500"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          </div>
        )}
      </div>

      {cancelId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-sm font-semibold text-stone-900">Cancelar blast?</h3>
            <p className="mt-1.5 text-sm text-stone-500">
              Emails pendentes serão removidos da fila. Emails já enviados não são afetados.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setCancelId(null)}
                className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-50"
              >
                Voltar
              </button>
              <button
                onClick={() => cancel(cancelId)}
                disabled={cancelling}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                {cancelling ? "Cancelando..." : "Cancelar blast"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
