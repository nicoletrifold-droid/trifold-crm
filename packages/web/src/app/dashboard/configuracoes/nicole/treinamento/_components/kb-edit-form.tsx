"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface Property { id: string; name: string }
interface Entry {
  id: string; title: string; content: string
  source: string | null; source_id: string | null
}

interface Props {
  entry: Entry
  properties: Property[]
  base: string
}

export function KbEditForm({ entry, properties, base }: Props) {
  const router = useRouter()
  const [title, setTitle] = useState(entry.title)
  const [content, setContent] = useState(entry.content)
  const [sourceId, setSourceId] = useState(entry.source_id ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true); setError(null)
    const res = await fetch(`/api/knowledge-base/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), content: content.trim(), source_id: sourceId || null }),
    })
    setSaving(false)
    if (res.ok) {
      router.push(base)
      router.refresh()
    } else {
      const json = await res.json().catch(() => ({}))
      setError((json as { error?: string }).error ?? "Erro ao salvar")
    }
  }

  const inputClass = "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"

  return (
    <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
      <h2 className="mb-4 text-lg font-semibold dark:text-stone-100">Editar entrada</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">Título *</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">Fonte</label>
          <input type="text" value={entry.source ?? ""} disabled
            className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400 dark:border-stone-800 dark:bg-stone-900/50 dark:text-stone-500 cursor-not-allowed" />
          <p className="mt-0.5 text-[11px] text-gray-400 dark:text-stone-500">Fonte não pode ser alterada</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">Empreendimento</label>
          <select value={sourceId} onChange={e => setSourceId(e.target.value)}
            className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100">
            <option value="">Nenhum</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">Conteúdo *</label>
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={8}
            className={`${inputClass} resize-y`} />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving || !title.trim() || !content.trim()}
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50">
            {saving ? "Salvando…" : "Salvar"}
          </button>
          <Link href={base} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800">
            Cancelar
          </Link>
        </div>
      </div>
    </div>
  )
}
