"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Copy, Check, Download, Loader2, Paperclip, Trash2, FileSignature, X, FileText, Sparkles } from "lucide-react"
import { titularLabel, type Titular } from "@web/lib/pastas/checklist"
import type { TermoData } from "@web/lib/pastas/termo/fill"

interface Doc {
  id: string
  slug: string
  label: string
  titular: Titular
  situacao: string
  filename: string | null
  uploaded_at: string | null
}

interface Signature {
  id: string
  status: string
  hasSigned: boolean
}

// Story 75-120 — status da assinatura eletrônica (Clicksign) por documento.
const ASSINATURA_LABEL: Record<string, string> = {
  running: "Aguardando assinatura",
  signed: "Assinado",
  closed: "Assinado",
  refused: "Recusado",
  canceled: "Cancelado",
  error: "Erro",
}
const ASSINATURA_CLASS: Record<string, string> = {
  running: "text-amber-600 dark:text-amber-400",
  signed: "text-emerald-600 dark:text-emerald-400",
  closed: "text-emerald-600 dark:text-emerald-400",
  refused: "text-red-600 dark:text-red-400",
  canceled: "text-gray-500 dark:text-stone-400",
  error: "text-red-600 dark:text-red-400",
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

// Procura e-mail/telefone nas informações preenchidas da pasta (chaves variam).
function guessFromFormData(formData: Record<string, string>, kind: "email" | "phone"): string {
  const entries = Object.entries(formData)
  for (const [k, v] of entries) {
    const key = k.toLowerCase()
    if (kind === "email" && (key.includes("mail") || /@/.test(v))) return v
    if (kind === "phone" && (key.includes("tel") || key.includes("cel") || key.includes("whats") || key.includes("fone"))) return v
  }
  return ""
}

export function PastaDetail({
  pasta,
  docs,
  signatures = {},
  clicksignEnabled = false,
  clicksignSandbox = false,
}: {
  pasta: { id: string; nome: string; tipo: string; empreendimento: string | null; token: string; formData: Record<string, string> }
  docs: Doc[]
  signatures?: Record<string, Signature>
  clicksignEnabled?: boolean
  clicksignSandbox?: boolean
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})

  // Modal "Enviar para assinatura"
  const [signDoc, setSignDoc] = useState<Doc | null>(null)
  const [signName, setSignName] = useState("")
  const [signEmail, setSignEmail] = useState("")
  const [signPhone, setSignPhone] = useState("")
  const [signAuth, setSignAuth] = useState("email")
  const [signing, setSigning] = useState(false)
  const [signError, setSignError] = useState<string | null>(null)

  function openSignModal(doc: Doc) {
    setSignDoc(doc)
    setSignName(pasta.nome)
    setSignEmail(guessFromFormData(pasta.formData, "email"))
    setSignPhone(guessFromFormData(pasta.formData, "phone"))
    setSignAuth("email")
    setSignError(null)
  }

  async function submitSignature() {
    if (!signDoc) return
    setSigning(true)
    setSignError(null)
    try {
      const res = await fetch(`/api/pastas/${pasta.id}/documentos/${signDoc.id}/assinatura`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signer_name: signName,
          signer_email: signEmail,
          signer_phone: signPhone,
          auth_method: signAuth,
        }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok) {
        setSignDoc(null)
        router.refresh()
      } else {
        setSignError(data?.error ?? "Falha ao enviar para assinatura")
      }
    } catch {
      setSignError("Falha de conexão")
    } finally {
      setSigning(false)
    }
  }

  async function downloadSigned(sig: Signature) {
    setBusyId(sig.id)
    try {
      const res = await fetch(`/api/pastas/${pasta.id}/assinatura/${sig.id}/signed-url`)
      const data = await res.json().catch(() => null)
      if (res.ok && data?.url) window.open(data.url, "_blank")
    } finally {
      setBusyId(null)
    }
  }

  // Story 75-127 — gerar Termo de Intenção a partir dos documentos
  const [termoData, setTermoData] = useState<TermoData | null>(null)
  const [termoLoading, setTermoLoading] = useState(false)
  const [termoSaving, setTermoSaving] = useState(false)
  const [termoError, setTermoError] = useState<string | null>(null)

  async function abrirTermo() {
    setTermoLoading(true)
    setTermoError(null)
    try {
      const res = await fetch(`/api/pastas/${pasta.id}/termo/extrair`, { method: "POST" })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.data) {
        setTermoData(data.data as TermoData)
      } else {
        setTermoError(data?.error ?? "Falha ao ler os documentos")
      }
    } catch {
      setTermoError("Falha de conexão")
    } finally {
      setTermoLoading(false)
    }
  }

  async function gerarTermo() {
    if (!termoData) return
    setTermoSaving(true)
    setTermoError(null)
    try {
      const res = await fetch(`/api/pastas/${pasta.id}/termo/gerar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(termoData),
      })
      const data = await res.json().catch(() => null)
      if (res.ok) {
        setTermoData(null)
        router.refresh()
      } else {
        setTermoError(data?.error ?? "Falha ao gerar o Termo")
      }
    } catch {
      setTermoError("Falha de conexão")
    } finally {
      setTermoSaving(false)
    }
  }

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
            onClick={abrirTermo}
            disabled={termoLoading}
            title="Ler os documentos e preencher o Termo de Intenção"
            className="flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-60 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
          >
            {termoLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {termoLoading ? "Lendo documentos..." : "Gerar Termo de Intenção"}
          </button>
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
              const sig = signatures[doc.id]
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
                  {/* Story 75-120 — assinatura eletrônica */}
                  {uploaded && !sig && clicksignEnabled && (
                    <button onClick={() => openSignModal(doc)} disabled={busyId === doc.id}
                      className="flex items-center gap-1 rounded-md border border-indigo-200 px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-500/30 dark:text-indigo-400 dark:hover:bg-indigo-500/10">
                      <FileSignature className="h-3.5 w-3.5" />
                      Enviar p/ assinatura
                    </button>
                  )}
                  {sig && (
                    <span className={`flex items-center gap-1.5 text-xs font-medium ${ASSINATURA_CLASS[sig.status] ?? "text-gray-500"}`}>
                      <FileSignature className="h-3.5 w-3.5" />
                      {ASSINATURA_LABEL[sig.status] ?? sig.status}
                      {sig.hasSigned && (
                        <button onClick={() => downloadSigned(sig)} disabled={busyId === sig.id}
                          className="ml-1 inline-flex items-center gap-1 rounded border border-emerald-200 px-1.5 py-0.5 text-[11px] text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-500/10">
                          {busyId === sig.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                          Assinado
                        </button>
                      )}
                    </span>
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

      {termoError && !termoData && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {termoError}
        </p>
      )}

      {/* Story 75-127 — revisão + geração do Termo de Intenção */}
      {termoData && (
        <TermoReviewModal
          data={termoData}
          onChange={setTermoData}
          onClose={() => { setTermoData(null); setTermoError(null) }}
          onConfirm={gerarTermo}
          saving={termoSaving}
          error={termoError}
        />
      )}

      {/* Story 75-120 — modal "Enviar para assinatura" */}
      {signDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !signing && setSignDoc(null)}>
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-800" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-stone-100">Enviar para assinatura</h3>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-stone-400">{signDoc.label}</p>
              </div>
              {clicksignSandbox && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">Teste</span>
              )}
              <button onClick={() => !signing && setSignDoc(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-stone-200">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-600 dark:text-stone-300">Nome do signatário</span>
                <input value={signName} onChange={(e) => setSignName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600 dark:text-stone-300">E-mail</span>
                <input type="email" value={signEmail} onChange={(e) => setSignEmail(e.target.value)} placeholder="email@exemplo.com"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600 dark:text-stone-300">Telefone (WhatsApp/SMS)</span>
                <input value={signPhone} onChange={(e) => setSignPhone(e.target.value)} placeholder="(00) 00000-0000"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600 dark:text-stone-300">Autenticação</span>
                <select value={signAuth} onChange={(e) => setSignAuth(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100">
                  <option value="email">E-mail</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="sms">SMS</option>
                </select>
              </label>
              <p className="text-[11px] text-gray-400 dark:text-stone-500">Informe e-mail ou telefone. O signatário recebe o convite direto da Clicksign.</p>
              {signError && <p className="text-xs text-red-600 dark:text-red-400">{signError}</p>}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setSignDoc(null)} disabled={signing}
                className="rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-800">
                Cancelar
              </button>
              <button onClick={submitSignature} disabled={signing}
                className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
                {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Story 75-127 — tela de revisão dos dados extraídos antes de gerar o Termo.
const tInput =
  "mt-1 w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
const TERMO_FLUXOS = [
  { v: "fluxo_30_70", l: "Fluxo 30/70" },
  { v: "fluxo_100_obra", l: "Fluxo 100% obra" },
  { v: "plano_safra", l: "Plano Safra" },
  { v: "plano_investidor", l: "Plano Investidor" },
]

function TField({ label, value, onChange, cls = "" }: { label: string; value: string | null | undefined; onChange: (v: string) => void; cls?: string }) {
  return (
    <label className={`block ${cls}`}>
      <span className="text-xs text-gray-500 dark:text-stone-400">{label}</span>
      <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={tInput} />
    </label>
  )
}

function TermoReviewModal({
  data, onChange, onClose, onConfirm, saving, error,
}: {
  data: TermoData
  onChange: (d: TermoData) => void
  onClose: () => void
  onConfirm: () => void
  saving: boolean
  error: string | null
}) {
  const set = (patch: Partial<TermoData>) => onChange({ ...data, ...patch })
  const setEnd = (patch: Partial<NonNullable<TermoData["endereco"]>>) =>
    onChange({ ...data, endereco: { ...(data.endereco ?? {}), ...patch } })
  const setConj = (patch: Partial<NonNullable<TermoData["conjuge"]>>) =>
    onChange({ ...data, conjuge: { ...(data.conjuge ?? {}), ...patch } })
  const e = data.endereco ?? {}
  const c = data.conjuge

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && onClose()}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl dark:bg-stone-900" onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 pb-3 pt-4 dark:border-stone-800">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-indigo-500" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-stone-100">Revisar Termo de Intenção</h3>
          </div>
          <button onClick={() => !saving && onClose()} className="text-gray-400 hover:text-gray-600 dark:hover:text-stone-200"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <p className="text-[11px] text-gray-400 dark:text-stone-500">Dados lidos dos documentos + pasta. Confira e corrija antes de gerar.</p>

          <TField label="Nome / Razão social" value={data.nome1} onChange={(v) => set({ nome1: v })} />
          <div className="grid grid-cols-2 gap-2">
            <TField label="Profissão" value={data.profissao} onChange={(v) => set({ profissao: v })} />
            <TField label="Celular" value={data.celular} onChange={(v) => set({ celular: v })} />
          </div>
          <TField label="E-mail" value={data.email} onChange={(v) => set({ email: v })} />

          <div className="rounded-md border border-gray-100 p-2.5 dark:border-stone-800">
            <span className="text-[11px] font-semibold uppercase text-gray-400 dark:text-stone-500">Endereço</span>
            <TField label="Logradouro" value={e.logradouro} onChange={(v) => setEnd({ logradouro: v })} />
            <div className="grid grid-cols-3 gap-2">
              <TField label="Nº" value={e.numero} onChange={(v) => setEnd({ numero: v })} />
              <TField label="Compl." value={e.complemento} onChange={(v) => setEnd({ complemento: v })} cls="col-span-2" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <TField label="Cidade" value={e.cidade} onChange={(v) => setEnd({ cidade: v })} cls="col-span-2" />
              <TField label="UF" value={e.uf} onChange={(v) => setEnd({ uf: v })} />
            </div>
            <TField label="CEP" value={e.cep} onChange={(v) => setEnd({ cep: v })} />
          </div>

          {c && (
            <div className="rounded-md border border-gray-100 p-2.5 dark:border-stone-800">
              <span className="text-[11px] font-semibold uppercase text-gray-400 dark:text-stone-500">Cônjuge / Companheiro(a)</span>
              <TField label="Nome" value={c.nome} onChange={(v) => setConj({ nome: v })} />
              <div className="grid grid-cols-2 gap-2">
                <TField label="Profissão" value={c.profissao} onChange={(v) => setConj({ profissao: v })} />
                <TField label="Celular" value={c.celular} onChange={(v) => setConj({ celular: v })} />
              </div>
              <TField label="E-mail" value={c.email} onChange={(v) => setConj({ email: v })} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <TField label="Corretor" value={data.corretor} onChange={(v) => set({ corretor: v })} />
            <TField label="Imobiliária" value={data.imobiliaria} onChange={(v) => set({ imobiliaria: v })} />
          </div>

          <label className="block">
            <span className="text-xs text-gray-500 dark:text-stone-400">Fluxo de pagamento</span>
            <select value={data.fluxoPagamento ?? ""} onChange={(ev) => set({ fluxoPagamento: (ev.target.value || null) as TermoData["fluxoPagamento"] })} className={tInput}>
              <option value="">— não assinalar —</option>
              {TERMO_FLUXOS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-stone-300">
            <input type="checkbox" checked={!!data.temPix} onChange={(ev) => set({ temPix: ev.target.checked })} />
            Assinalar &quot;Farei o PIX&quot; (Grupo 1). Desmarcado = &quot;Não farei&quot; (Grupo 2).
          </label>

          <div className="grid grid-cols-2 gap-2">
            <TField label="Data — dia" value={data.data?.dia} onChange={(v) => set({ data: { ...(data.data ?? {}), dia: v } })} />
            <TField label="Data — mês" value={data.data?.mes} onChange={(v) => set({ data: { ...(data.data ?? {}), mes: v } })} />
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3 dark:border-stone-800">
          <button onClick={() => !saving && onClose()} className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:text-stone-400 dark:hover:bg-stone-800">Cancelar</button>
          <button onClick={onConfirm} disabled={saving} className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {saving ? "Gerando..." : "Gerar e anexar"}
          </button>
        </div>
      </div>
    </div>
  )
}
