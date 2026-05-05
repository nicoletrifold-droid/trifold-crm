"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

interface Automation {
  id: string
  name: string
  trigger_event: string
  trigger_filter: Record<string, string> | null
  delay_minutes: number
  is_active: boolean
  created_at: string
  email_templates: { id: string; name: string; slug: string } | null
}

const TRIGGER_LABELS: Record<string, string> = {
  "lead.created": "Lead criado",
  "lead.status_changed": "Lead mudou status",
  "cron.daily": "Follow-up diário",
}

const DELAY_LABELS: Record<number, string> = {
  0: "Imediato",
  60: "1 hora",
  1440: "24 horas",
  2880: "48 horas",
  4320: "72 horas",
}

export function AutomationList() {
  const router = useRouter()
  const [automations, setAutomations] = useState<Automation[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/admin/email-automations")
    if (res.status === 403) { router.push("/dashboard"); return }
    const json = (await res.json()) as { data?: Automation[] }
    setAutomations(json.data ?? [])
    setLoading(false)
  }, [router])

  useEffect(() => { fetchData() }, [fetchData])

  const toggle = async (automation: Automation) => {
    setTogglingId(automation.id)
    await fetch(`/api/admin/email-automations/${automation.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !automation.is_active }),
    })
    setTogglingId(null)
    await fetchData()
  }

  const remove = async (id: string) => {
    setDeleting(true)
    await fetch(`/api/admin/email-automations/${id}`, { method: "DELETE" })
    setConfirmId(null)
    setDeleting(false)
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
          <h1 className="text-xl font-semibold text-stone-900">Automações de Email</h1>
          <p className="mt-0.5 text-sm text-stone-500">
            {automations.length} automaç{automations.length !== 1 ? "ões" : "ão"}
          </p>
        </div>
        <Link
          href="/dashboard/sistema/email-automacoes/novo"
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + Nova Automação
        </Link>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white">
        {automations.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-stone-400">Nenhuma automação configurada</p>
            <Link
              href="/dashboard/sistema/email-automacoes/novo"
              className="mt-2 inline-block text-sm text-indigo-600 hover:underline"
            >
              Criar primeira automação
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-stone-50">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-stone-400">
              <span>Nome</span>
              <span>Trigger</span>
              <span>Template</span>
              <span>Delay</span>
              <span className="text-right">Ações</span>
            </div>

            {automations.map((a) => (
              <div
                key={a.id}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-center px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-stone-800">{a.name}</p>
                  {a.trigger_filter?.status && (
                    <p className="text-[11px] text-stone-400">
                      Filtro: status = {a.trigger_filter.status}
                    </p>
                  )}
                </div>
                <span className="text-xs text-stone-600">
                  {TRIGGER_LABELS[a.trigger_event] ?? a.trigger_event}
                </span>
                <span className="text-xs text-stone-600">
                  {a.email_templates?.name ?? <span className="text-red-500">Sem template</span>}
                </span>
                <span className="text-xs text-stone-500">
                  {DELAY_LABELS[a.delay_minutes] ?? `${a.delay_minutes}min`}
                </span>
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => toggle(a)}
                    disabled={togglingId === a.id}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50 ${
                      a.is_active ? "bg-indigo-600" : "bg-stone-200"
                    }`}
                    title={a.is_active ? "Desativar" : "Ativar"}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        a.is_active ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <Link
                    href={`/dashboard/sistema/email-automacoes/${a.id}`}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    Editar
                  </Link>
                  <button
                    onClick={() => setConfirmId(a.id)}
                    className="text-xs text-stone-400 hover:text-red-500"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-sm font-semibold text-stone-900">Excluir automação?</h3>
            <p className="mt-1.5 text-sm text-stone-500">
              Esta ação não pode ser desfeita.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmId(null)}
                className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => remove(confirmId)}
                disabled={deleting}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                {deleting ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
