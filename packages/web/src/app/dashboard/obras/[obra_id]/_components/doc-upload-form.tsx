"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"

const CATEGORIES = ["ART/RRT", "Contratos", "Memoriais", "Outros"] as const

interface DocUploadFormProps {
  obraId: string
}

export function DocUploadForm({ obraId }: DocUploadFormProps) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState("")
  const [category, setCategory] = useState<string>("Outros")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const file = fileRef.current?.files?.[0]
    if (!file) {
      setError("Selecione um arquivo")
      return
    }
    if (!name.trim()) {
      setError("Nome do documento é obrigatório")
      return
    }

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("name", name.trim())
      formData.append("category", category)

      const res = await fetch(`/api/admin/obras/${obraId}/documentos`, {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Erro ao enviar documento")
      }

      setName("")
      setCategory("Outros")
      setFileName(null)
      if (fileRef.current) fileRef.current.value = ""
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar documento")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Nome do documento *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: ART - Fundação"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
            disabled={loading}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Categoria
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
            disabled={loading}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">
          Arquivo *
        </label>
        <input
          ref={fileRef}
          type="file"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          className="w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-orange-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-orange-700 hover:file:bg-orange-100"
          disabled={loading}
        />
        {fileName && (
          <p className="mt-1 text-xs text-gray-500">{fileName}</p>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
      >
        {loading ? "Enviando..." : "Enviar documento"}
      </button>
    </form>
  )
}
