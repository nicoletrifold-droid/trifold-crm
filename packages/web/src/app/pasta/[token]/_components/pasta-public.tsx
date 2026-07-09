"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Upload, Paperclip, Loader2 } from "lucide-react"
import { titularLabel, type InfoField, type Titular } from "@web/lib/pastas/checklist"
import { maskPhoneBR, emailError, phoneError, formatPhoneBR, normalizeEmail } from "@web/lib/validation/contato"

interface Doc {
  id: string
  slug: string
  label: string
  titular: Titular
  situacao: string
  filename: string | null
}

export function PastaPublicClient({
  token,
  pasta,
  docs,
  infoFields,
}: {
  token: string
  pasta: { nome: string; empreendimento: string | null; formData: Record<string, string> }
  docs: Doc[]
  infoFields: InfoField[]
}) {
  const router = useRouter()
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})

  const pendentes = docs.filter((d) => d.situacao === "pendente" || d.situacao === "recusado")
  const entregues = docs.filter((d) => d.situacao === "entregue" || d.situacao === "deferido")

  async function handleFile(doc: Doc, file: File) {
    setUploadingId(doc.id)
    setError(null)
    try {
      const fd = new FormData()
      fd.append("docId", doc.id)
      fd.append("file", file)
      const res = await fetch(`/api/pasta/${token}/upload`, { method: "POST", body: fd })
      if (res.ok) {
        router.refresh()
      } else {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? "Não foi possível enviar o arquivo.")
      }
    } catch {
      setError("Não foi possível enviar o arquivo.")
    } finally {
      setUploadingId(null)
    }
  }

  const grouped = groupByTitular(docs)

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <span className="text-lg font-bold tracking-widest text-orange-600">TRIFOLD</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-bold">Envio de documentos</h1>
        <p className="mt-1 text-stone-500">
          Olá, <strong>{pasta.nome}</strong>
          {pasta.empreendimento ? <> — {pasta.empreendimento}</> : null}. Anexe os documentos
          abaixo. Você pode enviar aos poucos; o que já enviou fica registrado.
        </p>

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Progresso */}
        <div className="mt-6 rounded-lg border border-stone-200 bg-white p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-stone-500">Progresso</span>
            <span className="font-semibold">
              {entregues.length}/{docs.length} enviados
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${docs.length ? (entregues.length / docs.length) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Duas colunas: Pendente x Entregue */}
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <section className="rounded-lg border border-stone-200 bg-white">
            <h2 className="border-b border-stone-200 px-4 py-3 font-semibold">
              Documentação pendente
            </h2>
            <ul className="divide-y divide-stone-100">
              {pendentes.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-stone-400">
                  Tudo enviado. Obrigado!
                </li>
              )}
              {pendentes.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{doc.label}</p>
                    <p className="text-xs text-stone-400">{titularLabel(doc.titular)}</p>
                    {doc.situacao === "recusado" && (
                      <p className="text-xs font-medium text-red-500">Recusado — reenvie</p>
                    )}
                  </div>
                  <input
                    ref={(el) => { inputs.current[doc.id] = el }}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleFile(doc, f)
                      e.target.value = ""
                    }}
                  />
                  <button
                    onClick={() => inputs.current[doc.id]?.click()}
                    disabled={uploadingId === doc.id}
                    className="flex shrink-0 items-center gap-1.5 rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-60"
                  >
                    {uploadingId === doc.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Paperclip className="h-3.5 w-3.5" />
                    )}
                    Anexar
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-stone-200 bg-white">
            <h2 className="border-b border-stone-200 px-4 py-3 font-semibold">
              Documentação entregue
            </h2>
            <ul className="divide-y divide-stone-100">
              {entregues.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-stone-400">
                  Nada enviado ainda.
                </li>
              )}
              {entregues.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{doc.label}</p>
                    <p className="truncate text-xs text-stone-400">{doc.filename}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    {doc.situacao === "deferido" ? "Deferido" : "Enviado"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Formulário de informações */}
        {infoFields.length > 0 && (
          <InfoForm token={token} fields={infoFields} initial={pasta.formData} grouped={grouped} />
        )}
      </main>
    </div>
  )
}

function groupByTitular(docs: Doc[]): Titular[] {
  const seen: Titular[] = []
  for (const d of docs) if (!seen.includes(d.titular)) seen.push(d.titular)
  return seen
}

function InfoForm({
  token,
  fields,
  initial,
}: {
  token: string
  fields: InfoField[]
  initial: Record<string, string>
  grouped: Titular[]
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {}
    for (const f of fields) v[f.key] = initial[f.key] ?? ""
    return v
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errs, setErrs] = useState<Record<string, string | null>>({})

  const titulares = [...new Set(fields.map((f) => f.titular))]

  async function save() {
    // Story 80-1 — trava e-mail/telefone: obrigatórios e no formato correto.
    const nextErrs: Record<string, string | null> = {}
    for (const f of fields) {
      if (f.type === "email") nextErrs[f.key] = emailError(values[f.key], true)
      else if (f.type === "tel") nextErrs[f.key] = phoneError(values[f.key], true)
    }
    if (Object.values(nextErrs).some(Boolean)) {
      setErrs(nextErrs)
      return
    }
    setErrs({})

    // Normaliza contatos antes de salvar (telefone com máscara, e-mail minúsculo).
    const payload: Record<string, string> = { ...values }
    for (const f of fields) {
      if (f.type === "email") payload[f.key] = normalizeEmail(payload[f.key])
      else if (f.type === "tel") payload[f.key] = formatPhoneBR(payload[f.key])
    }

    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch(`/api/pasta/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form_data: payload }),
      })
      if (res.ok) {
        setValues(payload)
        setSaved(true)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="font-semibold">Informações</h2>
      {titulares.map((t) => (
        <div key={t} className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase text-stone-400">{titularLabel(t)}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {fields
              .filter((f) => f.titular === t)
              .map((f) => (
                <label key={f.key} className="block">
                  <span className="text-xs text-stone-500">{f.label}</span>
                  <input
                    type={f.type}
                    inputMode={f.type === "tel" ? "tel" : undefined}
                    placeholder={f.type === "tel" ? "(44) 99999-9999" : undefined}
                    value={values[f.key] ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value
                      const val = f.type === "tel" ? maskPhoneBR(raw) : raw
                      setValues((v) => ({ ...v, [f.key]: val }))
                      setSaved(false)
                      if (errs[f.key]) setErrs((p) => ({ ...p, [f.key]: null }))
                    }}
                    className="mt-1 w-full rounded-md border border-stone-200 px-2 py-1.5 text-sm focus:border-orange-400 focus:outline-none"
                  />
                  {errs[f.key] && <span className="mt-1 block text-xs text-red-500">{errs[f.key]}</span>}
                </label>
              ))}
          </div>
        </div>
      ))}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-md bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-900 disabled:opacity-60"
        >
          <Upload className="h-4 w-4" />
          {saving ? "Salvando..." : "Salvar informações"}
        </button>
        {saved && <span className="text-sm text-emerald-600">Salvo!</span>}
      </div>
    </section>
  )
}
