"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

interface Template {
  id: string
  name: string
  slug: string
  is_active: boolean
}

interface Stage {
  id: string
  name: string
}

interface AutomationFormProps {
  initialData?: {
    id: string
    name: string
    trigger_event: string
    trigger_filter: Record<string, string> | null
    template_id: string | null
    delay_minutes: number
    is_active: boolean
  }
}

const TRIGGER_OPTIONS = [
  { value: "lead.created", label: "Lead criado" },
  { value: "lead.status_changed", label: "Lead mudou status" },
  { value: "cron.daily", label: "Follow-up diário" },
  { value: "client.birthday", label: "Aniversário de cliente" },
]

const DELAY_OPTIONS = [
  { value: 0, label: "Imediato" },
  { value: 60, label: "1 hora" },
  { value: 1440, label: "24 horas" },
  { value: 2880, label: "48 horas" },
  { value: 4320, label: "72 horas" },
]

export function AutomationForm({ initialData }: AutomationFormProps) {
  const router = useRouter()
  const isEdit = !!initialData

  const [name, setName] = useState(initialData?.name ?? "")
  const [triggerEvent, setTriggerEvent] = useState(initialData?.trigger_event ?? "lead.created")
  const [filterStatus, setFilterStatus] = useState(initialData?.trigger_filter?.status ?? "")
  const [templateId, setTemplateId] = useState(initialData?.template_id ?? "")
  const [delayMinutes, setDelayMinutes] = useState(initialData?.delay_minutes ?? 0)
  const [isActive, setIsActive] = useState(initialData?.is_active ?? false)

  const [templates, setTemplates] = useState<Template[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/email-templates").then((r) => r.json()),
      fetch("/api/stages").then((r) => r.json()),
    ]).then(([tJson, sJson]) => {
      const allTemplates = (tJson.data as Template[]) ?? []
      setTemplates(allTemplates.filter((t) => t.is_active))
      setStages((sJson.data as Stage[]) ?? [])
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) { setError("Nome é obrigatório"); return }
    if (!templateId) { setError("Selecione um template"); return }
    if (triggerEvent === "lead.status_changed" && !filterStatus) {
      setError("Selecione o status para o filtro"); return
    }

    const trigger_filter =
      triggerEvent === "lead.status_changed" && filterStatus
        ? { status: filterStatus }
        : null

    const payload = {
      name: name.trim(),
      trigger_event: triggerEvent,
      trigger_filter,
      template_id: templateId,
      delay_minutes: delayMinutes,
      is_active: isActive,
    }

    setSaving(true)
    try {
      const url = isEdit
        ? `/api/admin/email-automations/${initialData!.id}`
        : "/api/admin/email-automations"
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? "Erro ao salvar"); return }
      router.push("/dashboard/sistema/email-automacoes")
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">
          {isEdit ? "Editar Automação" : "Nova Automação"}
        </h1>
        <p className="mt-0.5 text-sm text-stone-500">
          Configure quando e qual email será disparado automaticamente.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="rounded-lg border border-stone-200 bg-white p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-stone-700">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Boas-vindas ao novo lead"
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder-stone-300 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Trigger */}
          <div>
            <label className="block text-sm font-medium text-stone-700">Trigger</label>
            <select
              value={triggerEvent}
              onChange={(e) => { setTriggerEvent(e.target.value); setFilterStatus("") }}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {TRIGGER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Trigger filter — only for status_changed */}
          {triggerEvent === "lead.status_changed" && (
            <div>
              <label className="block text-sm font-medium text-stone-700">Status alvo</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Selecione o status...</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-stone-400">
                Email será disparado quando o lead for movido para este status.
              </p>
            </div>
          )}

          {/* Template */}
          <div>
            <label className="block text-sm font-medium text-stone-700">Template de email</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Selecione um template...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {templates.length === 0 && (
              <p className="mt-1 text-[11px] text-amber-600">
                Nenhum template ativo encontrado. Crie um template primeiro.
              </p>
            )}
          </div>

          {/* Birthday info panel */}
          {triggerEvent === "client.birthday" && (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
              <p className="text-sm text-indigo-700">
                Email disparado automaticamente no dia do aniversário de cada cliente com data de nascimento cadastrada.
                O envio ocorre diariamente às 08h (horário de Brasília).
              </p>
            </div>
          )}

          {/* Delay — hidden for birthday trigger (email always sends on the day) */}
          {triggerEvent !== "client.birthday" && (
            <div>
              <label className="block text-sm font-medium text-stone-700">Delay</label>
              <select
                value={delayMinutes}
                onChange={(e) => setDelayMinutes(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {DELAY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Active toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-stone-700">Ativa</p>
              <p className="text-[11px] text-stone-400">Automação disparará quando o trigger ocorrer.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                isActive ? "bg-indigo-600" : "bg-stone-200"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  isActive ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push("/dashboard/sistema/email-automacoes")}
            className="rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-600 hover:bg-stone-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Salvando..." : isEdit ? "Salvar alterações" : "Criar automação"}
          </button>
        </div>
      </form>
    </div>
  )
}
