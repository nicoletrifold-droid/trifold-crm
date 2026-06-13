"use client"

import { useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Upload, X, Send, CheckCircle } from "lucide-react"

const MAX_FILES = 5
const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"]

interface ChamadoFormProps {
  userName: string
  onSubmitSuccess?: () => void
}

interface FieldErrors {
  description?: string
  reason?: string
  images?: string
}

interface ImageEntry {
  file: File
  preview: string
}

export function ChamadoForm({ userName, onSubmitSuccess }: ChamadoFormProps) {
  const router = useRouter()
  const [description, setDescription] = useState("")
  const [reason, setReason] = useState("")
  const [images, setImages] = useState<ImageEntry[]>([])
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validateDescription = (val: string): string | undefined => {
    if (!val.trim()) return "Descrição é obrigatória"
    if (val.trim().length < 20) return `Mínimo 20 caracteres (${val.trim().length}/20)`
    return undefined
  }

  const validateReason = (val: string): string | undefined => {
    if (!val.trim()) return "Motivo é obrigatório"
    if (val.trim().length < 10) return `Mínimo 10 caracteres (${val.trim().length}/10)`
    return undefined
  }

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const files = Array.from(incoming)
    const remaining = MAX_FILES - images.length

    if (remaining <= 0) {
      setFieldErrors((e) => ({ ...e, images: `Máximo de ${MAX_FILES} imagens` }))
      return
    }

    const toAdd = files.slice(0, remaining)
    const errors: string[] = []

    const entries: ImageEntry[] = []
    for (const file of toAdd) {
      if (!ALLOWED_MIME.includes(file.type)) {
        errors.push(`${file.name}: formato inválido`)
        continue
      }
      if (file.size > MAX_SIZE) {
        errors.push(`${file.name}: excede 5 MB`)
        continue
      }
      entries.push({ file, preview: URL.createObjectURL(file) })
    }

    if (errors.length > 0) {
      setFieldErrors((e) => ({ ...e, images: errors.join(" · ") }))
      return
    }

    setFieldErrors((e) => ({ ...e, images: undefined }))
    setImages((prev) => [...prev, ...entries])
  }, [images.length])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      addFiles(e.dataTransfer.files)
    },
    [addFiles]
  )

  const removeImage = (idx: number) => {
    setImages((prev) => {
      const entry = prev[idx]
      if (entry) URL.revokeObjectURL(entry.preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setGlobalError(null)

    const descErr = validateDescription(description)
    const reasonErr = validateReason(reason)
    if (descErr || reasonErr) {
      setFieldErrors({ description: descErr, reason: reasonErr })
      return
    }

    setSubmitting(true)

    const fd = new FormData()
    fd.append("description", description.trim())
    fd.append("reason", reason.trim())
    for (const { file } of images) {
      fd.append("images", file)
    }

    try {
      const res = await fetch("/api/admin/chamados", { method: "POST", body: fd })
      const json = await res.json()

      if (!res.ok) {
        setGlobalError(json.error ?? "Erro ao enviar ticket")
        return
      }

      setDescription("")
      setReason("")
      images.forEach(({ preview }) => URL.revokeObjectURL(preview))
      setImages([])
      if (fileInputRef.current) fileInputRef.current.value = ""
      setFieldErrors({})
      setSubmitted(true)
      setTimeout(() => setSubmitted(false), 4000)
      router.refresh()
      onSubmitSuccess?.()
    } catch {
      setGlobalError("Erro de conexão. Tente novamente.")
    } finally {
      setSubmitting(false)
    }
  }

  const now = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  })

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {submitted && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-500/10 dark:text-green-300">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          Ticket enviado com sucesso!
        </div>
      )}

      {globalError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {globalError}
        </div>
      )}

      <div className="flex gap-4 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 dark:border-stone-700 dark:bg-stone-800/50">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-stone-500 dark:text-stone-400">Solicitante</p>
          <p className="text-sm font-semibold text-stone-800 dark:text-stone-200">{userName}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-xs text-stone-500 dark:text-stone-400">Data/hora</p>
          <p className="text-sm font-medium text-stone-700 dark:text-stone-300">{now}</p>
        </div>
      </div>

      {/* Image upload */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">
          Screenshots / Imagens{" "}
          <span className="font-normal text-stone-400">(opcional · até {MAX_FILES})</span>
        </label>

        {/* Previews */}
        {images.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {images.map(({ preview }, idx) => (
              <div key={idx} className="relative">
                <div className="relative h-24 w-32 overflow-hidden rounded-lg border border-stone-200 dark:border-stone-700">
                  <Image src={preview} alt={`Imagem ${idx + 1}`} fill className="object-cover" sizes="128px" />
                </div>
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow hover:bg-red-600"
                  aria-label="Remover imagem"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Drop zone — oculta quando atingiu o limite */}
        {images.length < MAX_FILES && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 px-6 py-6 transition-colors hover:border-stone-400 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800/30 dark:hover:border-stone-600 dark:hover:bg-stone-800/50"
          >
            <Upload className="h-6 w-6 text-stone-400" />
            <p className="text-sm text-stone-500 dark:text-stone-400">
              Arraste imagens ou{" "}
              <span className="font-semibold text-stone-700 underline dark:text-stone-300">
                clique para selecionar
              </span>
            </p>
            <p className="text-xs text-stone-400">
              JPEG, PNG, WEBP ou GIF · máx. 5 MB por imagem
              {images.length > 0 && ` · ${images.length}/${MAX_FILES} adicionadas`}
            </p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files) }}
        />
        {fieldErrors.images && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.images}</p>
        )}
      </div>

      {/* Description */}
      <div>
        <label
          htmlFor="description"
          className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300"
        >
          Descrição do problema ou melhoria <span className="text-red-500">*</span>
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() =>
            setFieldErrors((prev) => ({ ...prev, description: validateDescription(description) }))
          }
          rows={4}
          placeholder="Descreva detalhadamente o erro encontrado ou a melhoria desejada..."
          className={`w-full resize-none rounded-xl border px-4 py-3 text-sm outline-none transition-colors focus:ring-2 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500 ${
            fieldErrors.description
              ? "border-red-400 focus:ring-red-300 dark:border-red-500"
              : "border-stone-300 focus:border-stone-400 focus:ring-stone-200 dark:border-stone-700 dark:focus:border-stone-600"
          }`}
        />
        <div className="mt-1 flex items-start justify-between gap-2">
          {fieldErrors.description ? (
            <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.description}</p>
          ) : (
            <span />
          )}
          <span className="flex-shrink-0 text-xs text-stone-400">
            {description.trim().length}/20 mín
          </span>
        </div>
      </div>

      {/* Reason */}
      <div>
        <label
          htmlFor="reason"
          className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300"
        >
          Motivo / justificativa <span className="text-red-500">*</span>
        </label>
        <textarea
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() =>
            setFieldErrors((prev) => ({ ...prev, reason: validateReason(reason) }))
          }
          rows={3}
          placeholder="Por que esta mudança é necessária? Qual impacto no seu trabalho?"
          className={`w-full resize-none rounded-xl border px-4 py-3 text-sm outline-none transition-colors focus:ring-2 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500 ${
            fieldErrors.reason
              ? "border-red-400 focus:ring-red-300 dark:border-red-500"
              : "border-stone-300 focus:border-stone-400 focus:ring-stone-200 dark:border-stone-700 dark:focus:border-stone-600"
          }`}
        />
        <div className="mt-1 flex items-start justify-between gap-2">
          {fieldErrors.reason ? (
            <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.reason}</p>
          ) : (
            <span />
          )}
          <span className="flex-shrink-0 text-xs text-stone-400">
            {reason.trim().length}/10 mín
          </span>
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
      >
        {submitting ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent dark:border-stone-900 dark:border-t-transparent" />
            Enviando…
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            Enviar Ticket
          </>
        )}
      </button>
    </form>
  )
}
