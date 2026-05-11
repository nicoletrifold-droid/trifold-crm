"use client"

import { useState, useEffect, useCallback } from "react"

interface Template {
  id: string
  name: string
  slug: string
  variables: { key: string; label: string; required: boolean }[]
}

interface QuotaInfo {
  sent_today: number
  quota_limit: number
}

type Step = 1 | 2 | 3

export function QuickSendForm() {
  const [step, setStep] = useState<Step>(1)

  // Step 1
  const [toEmail, setToEmail] = useState("")
  const [toName, setToName] = useState("")

  // Step 2
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedSlug, setSelectedSlug] = useState("")
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [variables, setVariables] = useState<Record<string, string>>({})
  const [subjectOverride, setSubjectOverride] = useState("")

  // Step 3
  const [preview, setPreview] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [quota, setQuota] = useState<QuotaInfo | null>(null)
  const [sending, setSending] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [sent, setSent] = useState(false)
  const [queued, setQueued] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTemplates = useCallback(async () => {
    const res = await fetch("/api/admin/email-templates?limit=100")
    if (!res.ok) return
    const data = await res.json() as { data?: Template[] }
    setTemplates(data.data ?? [])
  }, [])

  const fetchQuota = useCallback(async () => {
    const res = await fetch("/api/admin/email-stats")
    if (!res.ok) return
    const data = await res.json() as QuotaInfo
    setQuota(data)
  }, [])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  useEffect(() => {
    if (step === 3) fetchQuota()
  }, [step, fetchQuota])

  const handleTemplateChange = (slug: string) => {
    setSelectedSlug(slug)
    const tpl = templates.find((t) => t.slug === slug) ?? null
    setSelectedTemplate(tpl)
    setVariables({})
    setSubjectOverride("")
  }

  const setVar = (key: string, value: string) =>
    setVariables((prev) => ({ ...prev, [key]: value }))

  const canProceedStep1 = toEmail.includes("@")
  const canProceedStep2 =
    selectedSlug !== "" &&
    (selectedTemplate?.variables ?? [])
      .filter((v) => v.required)
      .every((v) => variables[v.key]?.trim())

  const handlePreview = async () => {
    if (!selectedTemplate) return
    setLoadingPreview(true)
    const res = await fetch(`/api/admin/email-templates/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: selectedTemplate.id, variables }),
    })
    setLoadingPreview(false)
    if (!res.ok) return
    const data = await res.json() as { html?: string }
    setPreview(data.html ?? "")
    setPreviewOpen(true)
  }

  const handleSend = async () => {
    setSending(true)
    setError(null)
    const res = await fetch("/api/admin/email-send-quick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateSlug: selectedSlug,
        to: { email: toEmail, name: toName || undefined },
        variables,
        subjectOverride: subjectOverride || undefined,
      }),
    })
    setSending(false)
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      setError(data.error ?? "Erro ao enviar")
      return
    }
    const data = await res.json() as { queued: boolean }
    setSent(true)
    setQueued(data.queued)
  }

  const quotaRemaining = quota ? quota.quota_limit - quota.sent_today : null

  if (sent) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-6 py-8 text-center">
        <p className="text-lg font-semibold text-emerald-700">
          {queued ? "Email na fila" : "Email enviado"}
        </p>
        <p className="mt-1 text-sm text-emerald-600">
          {queued
            ? "Quota atingida — o email será enviado no próximo ciclo disponível."
            : `Email enviado com sucesso para ${toEmail}`}
        </p>
        <button
          onClick={() => {
            setSent(false)
            setQueued(false)
            setStep(1)
            setToEmail("")
            setToName("")
            setSelectedSlug("")
            setSelectedTemplate(null)
            setVariables({})
            setSubjectOverride("")
          }}
          className="mt-4 rounded-lg border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
        >
          Enviar outro
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {([1, 2, 3] as Step[]).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                step === s
                  ? "bg-orange-600 text-white"
                  : step > s
                  ? "bg-emerald-500 text-white"
                  : "bg-stone-200 text-stone-500"
              }`}
            >
              {step > s ? "✓" : s}
            </div>
            <span className={`text-xs ${step === s ? "font-medium text-stone-800" : "text-stone-400"}`}>
              {s === 1 ? "Destinatário" : s === 2 ? "Template" : "Envio"}
            </span>
            {s < 3 && <span className="text-stone-300">›</span>}
          </div>
        ))}
      </div>

      {/* Step 1 — Destinatário */}
      {step === 1 && (
        <div className="rounded-lg border border-stone-200 bg-white p-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              placeholder="cliente@exemplo.com"
              className="w-full rounded border border-stone-200 px-3 py-2 text-sm text-stone-800 focus:border-orange-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">
              Nome <span className="text-stone-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={toName}
              onChange={(e) => setToName(e.target.value)}
              placeholder="João Silva"
              className="w-full rounded border border-stone-200 px-3 py-2 text-sm text-stone-800 focus:border-orange-400 focus:outline-none"
            />
          </div>
          <button
            onClick={() => setStep(2)}
            disabled={!canProceedStep1}
            className="rounded-lg bg-orange-600 px-5 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-40"
          >
            Próximo
          </button>
        </div>
      )}

      {/* Step 2 — Template */}
      {step === 2 && (
        <div className="rounded-lg border border-stone-200 bg-white p-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">
              Template <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedSlug}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full rounded border border-stone-200 px-3 py-2 text-sm text-stone-800 focus:border-orange-400 focus:outline-none"
            >
              <option value="">Selecionar template...</option>
              {templates.map((t) => (
                <option key={t.slug} value={t.slug}>{t.name}</option>
              ))}
            </select>
          </div>

          {selectedTemplate && selectedTemplate.variables.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-stone-600">Variáveis</p>
              {selectedTemplate.variables.map((v) => (
                <div key={v.key}>
                  <label className="mb-1 block text-xs text-stone-500">
                    {v.label}
                    {v.required && <span className="ml-1 text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    value={variables[v.key] ?? ""}
                    onChange={(e) => setVar(v.key, e.target.value)}
                    className="w-full rounded border border-stone-200 px-3 py-2 text-sm text-stone-800 focus:border-orange-400 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">
              Assunto <span className="text-stone-400 font-normal">(deixe vazio para usar o do template)</span>
            </label>
            <input
              type="text"
              value={subjectOverride}
              onChange={(e) => setSubjectOverride(e.target.value)}
              placeholder="Override do assunto..."
              className="w-full rounded border border-stone-200 px-3 py-2 text-sm text-stone-800 focus:border-orange-400 focus:outline-none"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setStep(1)}
              className="rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-600 hover:bg-stone-50"
            >
              Voltar
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!canProceedStep2}
              className="rounded-lg bg-orange-600 px-5 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-40"
            >
              Próximo
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Preview e envio */}
      {step === 3 && (
        <div className="rounded-lg border border-stone-200 bg-white p-5 space-y-4">
          <div className="rounded border border-stone-100 bg-stone-50 px-4 py-3 text-sm space-y-1">
            <p><span className="text-stone-400">Para:</span> {toEmail}{toName ? ` (${toName})` : ""}</p>
            <p><span className="text-stone-400">Template:</span> {selectedTemplate?.name}</p>
            {subjectOverride && (
              <p><span className="text-stone-400">Assunto:</span> {subjectOverride}</p>
            )}
          </div>

          {quotaRemaining !== null && quotaRemaining < 10 && (
            <div className="rounded border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
              Atenção: apenas {quotaRemaining} email{quotaRemaining !== 1 ? "s" : ""} restante{quotaRemaining !== 1 ? "s" : ""} hoje.
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setStep(2)}
              className="rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-600 hover:bg-stone-50"
            >
              Voltar
            </button>
            <button
              onClick={handlePreview}
              disabled={loadingPreview}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            >
              {loadingPreview ? "Carregando..." : "Pré-visualizar"}
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="rounded-lg bg-orange-600 px-5 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
            >
              {sending ? "Enviando..." : "Enviar agora"}
            </button>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {previewOpen && preview !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
              <h3 className="text-sm font-semibold text-stone-800">Preview do email</h3>
              <button
                onClick={() => setPreviewOpen(false)}
                className="text-stone-400 hover:text-stone-700"
              >
                ✕
              </button>
            </div>
            <div className="overflow-auto flex-1 p-4">
              <iframe
                srcDoc={preview}
                title="Email preview"
                className="h-[60vh] w-full rounded border border-stone-100"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
