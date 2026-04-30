"use client"

import { useState, useEffect } from "react"

interface Template { id: string; name: string; slug: string; subject: string }

export type ContentData = {
  templateId: string
  templateSlug: string
  templateName: string
  campaignName: string
  subjectOverride: string
}

interface Props {
  initial: ContentData
  onNext: (data: ContentData) => void
  onBack: () => void
}

export function StepContent({ initial, onNext, onBack }: Props) {
  const [templateId, setTemplateId] = useState(initial.templateId)
  const [templateSlug, setTemplateSlug] = useState(initial.templateSlug)
  const [templateName, setTemplateName] = useState(initial.templateName)
  const [campaignName, setCampaignName] = useState(initial.campaignName)
  const [subjectOverride, setSubjectOverride] = useState(initial.subjectOverride)
  const [templates, setTemplates] = useState<Template[]>([])

  useEffect(() => {
    fetch("/api/admin/email-templates")
      .then((r) => r.json())
      .then((json) => {
        const active = ((json.data ?? []) as Template[]).filter((t) => (t as unknown as { is_active: boolean }).is_active)
        setTemplates(active)
      })
  }, [])

  const handleTemplateChange = (id: string) => {
    const t = templates.find((x) => x.id === id)
    if (!t) { setTemplateId(""); setTemplateSlug(""); setTemplateName(""); setSubjectOverride(""); return }
    setTemplateId(t.id)
    setTemplateSlug(t.slug)
    setTemplateName(t.name)
    setSubjectOverride(t.subject)
  }

  const canProceed = !!templateId && !!campaignName.trim()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-stone-800">Passo 2 — Conteúdo</h2>
        <p className="mt-0.5 text-sm text-stone-500">Escolha o template e defina o nome da campanha.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700">Nome da campanha</label>
        <input
          type="text"
          value={campaignName}
          onChange={(e) => setCampaignName(e.target.value)}
          placeholder="Ex: Lançamento Residencial XYZ — Abril 2026"
          className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700">Template de email</label>
        <select
          value={templateId}
          onChange={(e) => handleTemplateChange(e.target.value)}
          className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Selecione um template...</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        {templates.length === 0 && (
          <p className="mt-1 text-[11px] text-amber-600">Nenhum template ativo. Crie um template primeiro.</p>
        )}
      </div>

      {templateId && (
        <div>
          <label className="block text-sm font-medium text-stone-700">Assunto</label>
          <input
            type="text"
            value={subjectOverride}
            onChange={(e) => setSubjectOverride(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <p className="mt-1 text-[11px] text-stone-400">Pré-preenchido com o assunto do template. Editável.</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-600 hover:bg-stone-50"
        >
          ← Voltar
        </button>
        <button
          onClick={() =>
            canProceed &&
            onNext({ templateId, templateSlug, templateName, campaignName: campaignName.trim(), subjectOverride })
          }
          disabled={!canProceed}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          Próximo →
        </button>
      </div>
    </div>
  )
}
