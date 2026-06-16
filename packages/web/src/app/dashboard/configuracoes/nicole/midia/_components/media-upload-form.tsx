"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface Property {
  id: string
  name: string
}

interface Props {
  properties: Property[]
  base: string
}

const CATEGORY_LABELS = [
  { value: "planta", label: "Planta" },
  { value: "fachada", label: "Fachada" },
  { value: "tabela", label: "Tabela de Preços" },
  { value: "outro", label: "Outro" },
]

export function MediaUploadForm({ properties, base }: Props) {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setUploading(true)

    const formData = new FormData(e.currentTarget)

    try {
      const res = await fetch("/api/nicole/media", {
        method: "POST",
        body: formData,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((json as { error?: string }).error ?? "Erro ao enviar arquivo.")
        return
      }
      router.push(base)
      router.refresh()
    } catch {
      setError("Erro de conexão. Tente novamente.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
      <h2 className="mb-4 text-lg font-semibold dark:text-stone-100">Novo arquivo</h2>
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">
              Título *
            </label>
            <input
              type="text"
              name="title"
              required
              placeholder="Ex: Planta Tipo A — Yarden"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">
              Empreendimento
            </label>
            <select
              name="property_id"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            >
              <option value="">Nenhum (geral)</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">
              Categoria
            </label>
            <select
              name="category"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            >
              {CATEGORY_LABELS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-stone-300">
              Arquivo *{" "}
              <span className="text-xs text-gray-400">(JPEG, PNG, WebP, PDF — máx 20 MB)</span>
            </label>
            <input
              type="file"
              name="file"
              required
              accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            />
          </div>
        </div>
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={uploading}
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {uploading ? "Enviando…" : "Enviar arquivo"}
          </button>
          <Link
            href={base}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
