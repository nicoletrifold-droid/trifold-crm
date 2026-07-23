"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@web/lib/supabase/client"

const CATEGORIES = ["ART/RRT", "Contratos", "Memoriais", "Outros"] as const
const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB — mesmo limite da API

interface Destinatario {
  id: string
  label: string
}

interface DocUploadFormProps {
  obraId: string
  destinatarios?: Destinatario[]
}

export function DocUploadForm({ obraId, destinatarios = [] }: DocUploadFormProps) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState("")
  const [category, setCategory] = useState<string>("Outros")
  const [clienteObraId, setClienteObraId] = useState<string>("")
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
    if (file.size > MAX_SIZE_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1)
      setError(`Arquivo de ${mb} MB excede o limite de 50 MB.`)
      return
    }

    setLoading(true)
    try {
      // Fluxo em 3 passos para contornar o teto de payload (~4.5 MB) das Serverless
      // Functions da Vercel (PDFs assinados via Clicksign passam fácil disso):
      // 1) /documentos/sign gera uma signed upload URL; 2) o browser envia o arquivo
      // DIRETO ao Supabase Storage via uploadToSignedUrl (o binário nunca passa pela
      // função); 3) /documentos registra só os metadados em JSON.
      const signRes = await fetch(`/api/admin/obras/${obraId}/documentos/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_name: file.name, file_size_bytes: file.size }),
      })
      const signJson = await signRes.json().catch(() => ({}))
      if (!signRes.ok) {
        throw new Error(
          (signJson as { error?: string }).error ?? "Erro ao preparar o envio"
        )
      }
      const { token, storagePath } = signJson as { token: string; storagePath: string }

      const supabase = createClient()
      const { error: upErr } = await supabase.storage
        .from("obra-docs")
        .uploadToSignedUrl(storagePath, token, file, {
          contentType: file.type || "application/octet-stream",
        })
      if (upErr) {
        throw new Error("Falha ao enviar o arquivo. Verifique a conexão e tente novamente.")
      }

      const res = await fetch(`/api/admin/obras/${obraId}/documentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storage_path: storagePath,
          name: name.trim(),
          category,
          cliente_obra_id: clienteObraId || null,
          filename: file.name,
          file_size_bytes: file.size,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Erro ao registrar o documento")
      }

      setName("")
      setCategory("Outros")
      setClienteObraId("")
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
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-stone-400">
            Nome do documento *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: ART - Fundação"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            disabled={loading}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-stone-400">
            Categoria
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
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

      {/* Story 75-6: documento geral (todos) ou exclusivo de um cliente/unidade */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-stone-400">
          Destinatário
        </label>
        <select
          value={clienteObraId}
          onChange={(e) => setClienteObraId(e.target.value)}
          disabled={loading || destinatarios.length === 0}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
        >
          <option value="">Geral — todos da obra</option>
          {destinatarios.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
        {clienteObraId && (
          <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">
            Visível só para este cliente/unidade.
          </p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">
          Arquivo *
        </label>
        <input
          ref={fileRef}
          type="file"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          className="w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-orange-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-orange-700 hover:file:bg-orange-100 dark:text-stone-400 dark:file:bg-orange-500/15 dark:file:text-orange-300 dark:hover:file:bg-orange-500/20"
          disabled={loading}
        />
        {fileName && (
          <p className="mt-1 text-xs text-gray-500 dark:text-stone-400">{fileName}</p>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-300">{error}</p>
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
