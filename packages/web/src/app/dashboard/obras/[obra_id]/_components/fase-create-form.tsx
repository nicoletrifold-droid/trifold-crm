"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, ChevronDown, ChevronUp } from "lucide-react"

const STATUS_OPTIONS = [
  { value: "a_iniciar", label: "A iniciar" },
  { value: "em_andamento", label: "Em execução" },
  { value: "pausada", label: "Pausada" },
  { value: "concluida", label: "Concluída" },
]

type Template = { id: string; nome: string; etapa: string }

interface FaseCreateFormProps {
  obraId: string
}

export function FaseCreateForm({ obraId }: FaseCreateFormProps) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState("a_iniciar")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Template picker state
  const [showPicker, setShowPicker] = useState(false)
  const [templates, setTemplates] = useState<Template[] | null>(null)
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [search, setSearch] = useState("")

  async function handleTogglePicker() {
    const opening = !showPicker
    setShowPicker(opening)
    if (opening && templates === null) {
      setLoadingTemplates(true)
      try {
        const res = await fetch("/api/admin/obras/fases/templates")
        if (res.ok) {
          const data = (await res.json()) as { templates: Template[] }
          setTemplates(data.templates)
        }
      } catch {
        // silently ignore, list will be empty
      } finally {
        setLoadingTemplates(false)
      }
    }
  }

  function handleSelectTemplate(t: Template) {
    setName(t.nome)
    setDescription(t.etapa)
    setShowPicker(false)
    setSearch("")
  }

  const filtered = (templates ?? []).filter(
    (t) =>
      t.nome.toLowerCase().includes(search.toLowerCase()) ||
      t.etapa.toLowerCase().includes(search.toLowerCase())
  )

  // Group by nome (category)
  const grouped = filtered.reduce<Record<string, Template[]>>((acc, t) => {
    ;(acc[t.nome] ??= []).push(t)
    return acc
  }, {})

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError(null)
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/obras/${obraId}/fases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          status,
          start_date: startDate || null,
          end_date: endDate || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? "Erro ao criar fase")
      }
      setName("")
      setDescription("")
      setStatus("a_iniciar")
      setStartDate("")
      setEndDate("")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar fase")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
      <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-stone-200">Adicionar Fase</h3>
      <div className="space-y-3">
        <div>
          <label className="mb-1 flex items-center gap-0.5 text-xs font-medium text-gray-600 dark:text-stone-400">
            Nome da fase <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            placeholder="Nome da fase"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
          />
          <button
            type="button"
            onClick={handleTogglePicker}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
          >
            {showPicker ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Fechar banco
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                Escolher do banco
              </>
            )}
          </button>

          {showPicker && (
            <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 dark:border-stone-700 dark:bg-stone-800">
              <div className="p-2">
                <input
                  type="text"
                  placeholder="Buscar fase ou etapa..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-xs focus:border-orange-500 focus:outline-none dark:border-stone-600 dark:bg-stone-700 dark:text-stone-100 dark:placeholder-stone-500"
                  autoFocus
                />
              </div>
              <div className="max-h-52 overflow-y-auto">
                {loadingTemplates && (
                  <div className="flex items-center justify-center py-6">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                  </div>
                )}
                {!loadingTemplates && Object.keys(grouped).length === 0 && (
                  <p className="px-3 py-4 text-center text-xs text-gray-400 dark:text-stone-500">
                    Nenhum template encontrado
                  </p>
                )}
                {!loadingTemplates &&
                  Object.entries(grouped).map(([grupo, items]) => (
                    <div key={grupo}>
                      <p className="sticky top-0 bg-gray-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:bg-stone-700 dark:text-stone-400">
                        {grupo}
                      </p>
                      {items.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => handleSelectTemplate(t)}
                          className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-orange-50 hover:text-orange-700 dark:text-stone-300 dark:hover:bg-orange-500/10 dark:hover:text-orange-300"
                        >
                          {t.etapa}
                        </button>
                      ))}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 flex items-center gap-0.5 text-xs font-medium text-gray-600 dark:text-stone-400">
            Etapa <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            placeholder="Etapa"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-stone-400">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-stone-400">
              Data de início
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-stone-400">
              Data de término
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
            />
          </div>
        </div>
      </div>

      <p className="mt-1 text-[11px] text-gray-400 dark:text-stone-500">
        <span className="text-red-400">*</span> Campos obrigatórios
      </p>

      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-300">{error}</p>}

      <button
        type="submit"
        disabled={saving || !name.trim() || !description.trim()}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        {saving ? "Adicionando..." : "Adicionar Fase"}
      </button>
    </form>
  )
}
