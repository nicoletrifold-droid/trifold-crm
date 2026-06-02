"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Plus, X } from "lucide-react"

interface Property { id: string; name: string }
interface Stage { id: string; name: string; color: string }

export function NewLeadModal({
  properties,
  stages,
}: {
  properties: Property[]
  stages: Stage[]
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const dialogRef = useRef<HTMLDivElement>(null)

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    property_interest_id: "",
    stage_id: "",
  })

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    if (open) document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  function reset() {
    setForm({ name: "", phone: "", email: "", property_interest_id: "", stage_id: "" })
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.phone.trim()) { setError("Telefone é obrigatório."); return }
    setSaving(true)
    setError(null)

    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name || null,
        phone: form.phone,
        email: form.email || null,
        property_interest_id: form.property_interest_id || null,
        stage_id: form.stage_id || null,
      }),
    })

    const json = await res.json().catch(() => ({}))
    setSaving(false)

    if (!res.ok) {
      setError((json as { error?: string }).error ?? "Erro ao cadastrar lead.")
      return
    }

    setOpen(false)
    reset()
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); reset() }}
        className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700"
      >
        <Plus className="h-4 w-4" />
        Novo Lead
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            ref={dialogRef}
            className="w-full max-w-md rounded-2xl border border-stone-200 bg-white shadow-xl dark:border-stone-700 dark:bg-stone-900"
          >
            <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4 dark:border-stone-800">
              <h2 className="text-base font-semibold text-stone-900 dark:text-white">Cadastrar Lead</h2>
              <button onClick={() => setOpen(false)} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 p-6">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">
                  Telefone <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="(44) 99999-0000"
                  className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-orange-300 focus:outline-none focus:ring-1 focus:ring-orange-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">Nome</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Nome completo"
                  className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-orange-300 focus:outline-none focus:ring-1 focus:ring-orange-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">E-mail</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="email@exemplo.com"
                  className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-orange-300 focus:outline-none focus:ring-1 focus:ring-orange-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                />
              </div>

              {properties.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">Empreendimento</label>
                  <select
                    value={form.property_interest_id}
                    onChange={(e) => setForm(f => ({ ...f, property_interest_id: e.target.value }))}
                    className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-orange-300 focus:outline-none focus:ring-1 focus:ring-orange-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                  >
                    <option value="">Selecione...</option>
                    {properties.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {stages.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">Etapa inicial</label>
                  <select
                    value={form.stage_id}
                    onChange={(e) => setForm(f => ({ ...f, stage_id: e.target.value }))}
                    className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-orange-300 focus:outline-none focus:ring-1 focus:ring-orange-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                  >
                    <option value="">Selecione...</option>
                    {stages.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-lg border border-stone-200 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-lg bg-orange-600 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                >
                  {saving ? "Salvando..." : "Cadastrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
