"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Upload, X, Check, AlertCircle, Loader2 } from "lucide-react"

interface Fase {
  id: string
  name: string
  order_index: number
}

interface FotoUploadFormProps {
  obraId: string
  fases: Fase[]
}

const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

type UploadStatus = "idle" | "uploading" | "done" | "error"

interface FileEntry {
  id: string
  file: File
  previewUrl: string
  status: UploadStatus
  errorMessage?: string
}

export function FotoUploadForm({ obraId, fases }: FotoUploadFormProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [caption, setCaption] = useState("")
  const [faseId, setFaseId] = useState<string>("")
  const [uploading, setUploading] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    setGlobalError(null)
    const selected = e.target.files
    if (!selected || selected.length === 0) return

    const newEntries: FileEntry[] = []
    for (const file of Array.from(selected)) {
      if (!file.type.startsWith("image/")) {
        newEntries.push({
          id: crypto.randomUUID(),
          file,
          previewUrl: "",
          status: "error",
          errorMessage: "Não é uma imagem",
        })
        continue
      }
      if (file.size > MAX_SIZE_BYTES) {
        newEntries.push({
          id: crypto.randomUUID(),
          file,
          previewUrl: "",
          status: "error",
          errorMessage: "Excede 10 MB",
        })
        continue
      }
      newEntries.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        status: "idle",
      })
    }

    setEntries((prev) => [...prev, ...newEntries])
    if (inputRef.current) inputRef.current.value = ""
  }

  function removeEntry(id: string) {
    setEntries((prev) => {
      const target = prev.find((e) => e.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((e) => e.id !== id)
    })
  }

  function clearAll() {
    for (const e of entries) {
      if (e.previewUrl) URL.revokeObjectURL(e.previewUrl)
    }
    setEntries([])
    setCaption("")
    setFaseId("")
    setGlobalError(null)
  }

  async function uploadOne(entry: FileEntry): Promise<boolean> {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entry.id
          ? { ...e, status: "uploading", errorMessage: undefined }
          : e
      )
    )

    const formData = new FormData()
    formData.append("file", entry.file)
    if (caption.trim()) formData.append("caption", caption.trim())
    if (faseId) formData.append("fase_id", faseId)

    try {
      const res = await fetch(`/api/admin/obras/${obraId}/fotos`, {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entry.id
              ? {
                  ...e,
                  status: "error",
                  errorMessage: data.error ?? "Erro no upload",
                }
              : e
          )
        )
        return false
      }

      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, status: "done" } : e))
      )
      return true
    } catch {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id
            ? { ...e, status: "error", errorMessage: "Erro de rede" }
            : e
        )
      )
      return false
    }
  }

  async function handleUploadAll() {
    if (uploading) return
    const pending = entries.filter((e) => e.status === "idle")
    if (pending.length === 0) {
      setGlobalError("Nenhum arquivo válido selecionado.")
      return
    }
    setUploading(true)
    setGlobalError(null)

    let successCount = 0
    // Sequencial para evitar sobrecarga do Storage
    for (const entry of pending) {
      const ok = await uploadOne(entry)
      if (ok) successCount++
    }

    setUploading(false)

    if (successCount > 0) {
      // Limpa entries de sucesso e revalida lista
      setEntries((prev) => {
        const remaining = prev.filter((e) => e.status !== "done")
        return remaining
      })
      if (successCount === pending.length) {
        setCaption("")
        setFaseId("")
      }
      router.refresh()
    }
  }

  const hasIdle = entries.some((e) => e.status === "idle")

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900 dark:text-stone-100">
          Adicionar Fotos
        </h3>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            disabled={uploading}
            className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 dark:text-stone-400 dark:hover:text-stone-200"
          >
            Limpar tudo
          </button>
        )}
      </div>

      <div className="space-y-4">
        {/* Inputs auxiliares (caption e fase) */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="upload-caption"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-stone-300"
            >
              Legenda (opcional)
            </label>
            <input
              id="upload-caption"
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              disabled={uploading}
              maxLength={255}
              placeholder="Aplicada a todas as fotos do lote"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
            />
          </div>
          <div>
            <label
              htmlFor="upload-fase"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-stone-300"
            >
              Vincular a uma fase (opcional)
            </label>
            <select
              id="upload-fase"
              value={faseId}
              onChange={(e) => setFaseId(e.target.value)}
              disabled={uploading || fases.length === 0}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
            >
              <option value="">— Nenhuma fase —</option>
              {fases.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Drop area / file input */}
        <label
          htmlFor="foto-input"
          className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-8 text-center hover:border-orange-400 hover:bg-orange-50 dark:border-stone-700 dark:bg-stone-800/50 dark:hover:border-orange-400 dark:hover:bg-orange-500/10"
        >
          <Upload className="mb-2 h-8 w-8 text-gray-400 dark:text-stone-500" />
          <p className="text-sm font-medium text-gray-700 dark:text-stone-300">
            Clique para selecionar imagens
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-stone-400">
            JPG, PNG, WebP — até 10 MB cada
          </p>
          <input
            id="foto-input"
            ref={inputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handleFilesSelected}
            disabled={uploading}
            className="hidden"
          />
        </label>

        {/* Preview grid */}
        {entries.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-stone-800 dark:bg-stone-800/50"
              >
                <div className="relative aspect-square w-full bg-gray-100 dark:bg-stone-800">
                  {entry.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.previewUrl}
                      alt={entry.file.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-gray-400 dark:text-stone-500">
                      Sem preview
                    </div>
                  )}

                  {/* Status overlay */}
                  {entry.status === "uploading" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    </div>
                  )}
                  {entry.status === "done" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-green-500/40">
                      <Check className="h-5 w-5 text-white" />
                    </div>
                  )}
                  {entry.status === "error" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-500/40">
                      <AlertCircle className="h-5 w-5 text-white" />
                    </div>
                  )}

                  {/* Remove button */}
                  {entry.status !== "uploading" && (
                    <button
                      type="button"
                      onClick={() => removeEntry(entry.id)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                      aria-label="Remover"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                <div className="px-2 py-1.5">
                  <p className="truncate text-xs text-gray-700 dark:text-stone-300">
                    {entry.file.name}
                  </p>
                  {entry.errorMessage && (
                    <p className="text-[11px] text-red-600 dark:text-red-300">
                      {entry.errorMessage}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {globalError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">
            {globalError}
          </p>
        )}

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={handleUploadAll}
            disabled={uploading || !hasIdle}
            className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
            {uploading ? "Enviando..." : "Enviar Fotos"}
          </button>
        </div>
      </div>
    </div>
  )
}
