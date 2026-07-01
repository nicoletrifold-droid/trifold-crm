"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Copy, Check, Download, Loader2, Paperclip, Trash2 } from "lucide-react"
import { titularLabel, type Titular } from "@web/lib/pastas/checklist"

interface Doc {
  id: string
  slug: string
  label: string
  titular: Titular
  situacao: string
  filename: string | null
  uploaded_at: string | null
}

const SITUACAO_LABEL: Record<string, string> = {
  pendente: "Pendente",
  entregue: "Enviado",
  deferido: "Deferido",
  recusado: "Recusado",
}
const SITUACAO_CLASS: Record<string, string> = {
  pendente: "text-gray-400 dark:text-stone-500",
  entregue: "text-blue-600 dark:text-blue-400",
  deferido: "text-emerald-600 dark:text-emerald-400",
  recusado: "text-red-600 dark:text-red-400",
}

export function PastaDetail({
  pasta,
  docs,
}: {
  pasta: { id: string; nome: string; tipo: string; empreendimento: string | null; token: string; formData: Record<string, string> }
  docs: Doc[]
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})

  const link = typeof window !== "undefined" ? `${window.location.origin}/pasta/${pasta.token}` : ""

  async function uploadDoc(doc: Doc, file: File) {
    setBusyId(doc.id)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`/api/pastas/${pasta.id}/documentos/${doc.id}/upload`, { method: "POST", body: fd })
      if (res.ok) router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function deletePasta() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/pastas/${pasta.id}`, { method: "DELETE" })
      if (res.ok) router.push("/dashboard/pastas")
      else setDeleting(false)
    } catch {
      setDeleting(false)
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  async function download(doc: Doc) {
    setBusyId(doc.id)
    try {
      const res = await fetch(`/api/pastas/${pasta.id}/documentos/${doc.id}/signed-url`)
      const data = await res.json().catch(() => null)
      if (res.ok && data?.url) window.open(data.url, "_blank")
    } finally {
      setBusyId(null)
    }
  }

  async function setSituacao(doc: Doc, situacao: string) {
    setBusyId(doc.id)
    try {
      const res = await fetch(`/api/pastas/${pasta.id}/documentos/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situacao }),
      })
      if (res.ok) router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  const titulares = [...new Set(docs.map((d) => d.titular))]

  return (
    <div className="space-y-6">
      <Link href="/dashboard/pastas" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:text-stone-400 dark:hover:text-stone-200">
        <ArrowLeft className="h-4 w-4" /> Pastas
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">
            {pasta.nome} <span className="text-sm font-normal uppercase text-gray-400 dark:text-stone-500">{pasta.tipo}</span>
          </h1>
          {pasta.empreendimento && <p className="text-sm text-gray-500 dark:text-stone-400">{pasta.empreendimento}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copiado" : "Copiar link do interessado"}
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-2 rounded-md border border-red-200 px-2 py-1 dark:border-red-500/30">
              <span className="text-xs text-red-600 dark:text-red-400">Excluir pasta?</span>
              <button onClick={deletePasta} disabled={deleting} className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60">
                {deleting ? "..." : "Sim"}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 dark:text-stone-400 dark:hover:bg-stone-800">
                Não
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Excluir pasta
            </button>
          )}
        </div>
      </div>

      {titulares.map((t) => (
        <div key={t} className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-stone-800 dark:bg-stone-900">
          <h2 className="border-b border-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:border-stone-800 dark:text-stone-200">
            {titularLabel(t)}
          </h2>
          <ul className="divide-y divide-gray-100 dark:divide-stone-800">
            {docs.filter((d) => d.titular === t).map((doc) => {
              const uploaded = doc.situacao !== "pendente"
              return (
                <li key={doc.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-stone-100">{doc.label}</p>
                    <p className="truncate text-xs text-gray-400 dark:text-stone-500">{doc.filename ?? "—"}</p>
                  </div>
                  <span className={`text-xs font-medium ${SITUACAO_CLASS[doc.situacao] ?? ""}`}>
                    {SITUACAO_LABEL[doc.situacao] ?? doc.situacao}
                  </span>
                  <input
                    ref={(el) => { inputs.current[doc.id] = el }}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(doc, f); e.target.value = "" }}
                  />
                  <button onClick={() => inputs.current[doc.id]?.click()} disabled={busyId === doc.id}
                    className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800">
                    {busyId === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                    {uploaded ? "Substituir" : "Anexar"}
                  </button>
                  {uploaded && (
                    <button onClick={() => download(doc)} disabled={busyId === doc.id}
                      className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800">
                      {busyId === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      Baixar
                    </button>
                  )}
                  {uploaded && doc.situacao !== "deferido" && (
                    <button onClick={() => setSituacao(doc, "deferido")} disabled={busyId === doc.id}
                      className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                      Deferir
                    </button>
                  )}
                  {uploaded && doc.situacao !== "recusado" && (
                    <button onClick={() => setSituacao(doc, "recusado")} disabled={busyId === doc.id}
                      className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10">
                      Recusar
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      {Object.keys(pasta.formData).length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-stone-200">Informações preenchidas</h2>
          <dl className="grid gap-2 sm:grid-cols-2">
            {Object.entries(pasta.formData).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 text-sm">
                <dt className="text-gray-400 dark:text-stone-500">{k}</dt>
                <dd className="truncate font-medium text-gray-800 dark:text-stone-200">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
