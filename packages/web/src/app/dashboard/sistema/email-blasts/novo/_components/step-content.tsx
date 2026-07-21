"use client"

import { useState, useEffect } from "react"

interface Template { id: string; name: string; slug: string; subject: string }

export type ContentData = {
  templateId: string
  templateSlug: string
  templateName: string
  campaignName: string
  subjectOverride: string
  abTestEnabled: boolean
  abTestVariable: "subject" | "body"
  subjectVariantA: string
  subjectVariantB: string
  bodyVariantATemplateId: string
  bodyVariantASlug: string
  bodyVariantAName: string
  bodyVariantBTemplateId: string
  bodyVariantBSlug: string
  bodyVariantBName: string
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
  const [abTestEnabled, setAbTestEnabled] = useState(initial.abTestEnabled)
  const [abTestVariable, setAbTestVariable] = useState(initial.abTestVariable)
  const [subjectVariantA, setSubjectVariantA] = useState(initial.subjectVariantA)
  const [subjectVariantB, setSubjectVariantB] = useState(initial.subjectVariantB)
  const [bodyVariantATemplateId, setBodyVariantATemplateId] = useState(initial.bodyVariantATemplateId)
  const [bodyVariantBTemplateId, setBodyVariantBTemplateId] = useState(initial.bodyVariantBTemplateId)
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
    if (!t) {
      setTemplateId("")
      setTemplateSlug("")
      setTemplateName("")
      setSubjectOverride("")
      setSubjectVariantA("")
      setSubjectVariantB("")
      return
    }
    setTemplateId(t.id)
    setTemplateSlug(t.slug)
    setTemplateName(t.name)
    setSubjectOverride(t.subject)
    setSubjectVariantA(t.subject)
    setSubjectVariantB("")
  }

  const handleToggleAbTest = (enabled: boolean) => {
    setAbTestEnabled(enabled)
    if (enabled && !subjectVariantA) {
      setSubjectVariantA(subjectOverride)
    }
  }

  const canProceed = !!templateId && !!campaignName.trim() &&
    (!abTestEnabled ||
      (abTestVariable === "subject"
        ? !!subjectVariantA.trim() && !!subjectVariantB.trim()
        : !!bodyVariantATemplateId && !!bodyVariantBTemplateId && bodyVariantATemplateId !== bodyVariantBTemplateId))

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
          className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700">Template de email</label>
        <select
          value={templateId}
          onChange={(e) => handleTemplateChange(e.target.value)}
          className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={abTestEnabled}
              onChange={(e) => handleToggleAbTest(e.target.checked)}
              className="accent-indigo-600"
            />
            <span className="text-sm text-stone-700">Ativar teste A/B de assunto</span>
          </label>
        </div>
      )}

      {templateId && abTestEnabled && (
        <div>
          <label className="block text-sm font-medium text-stone-700">O que testar?</label>
          <div className="mt-1 flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={abTestVariable === "subject"}
                onChange={() => setAbTestVariable("subject")}
                className="accent-indigo-600"
              />
              <span className="text-sm text-stone-700">Assunto</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={abTestVariable === "body"}
                onChange={() => setAbTestVariable("body")}
                className="accent-indigo-600"
              />
              <span className="text-sm text-stone-700">Corpo</span>
            </label>
          </div>
        </div>
      )}

      {templateId && !abTestEnabled && (
        <div>
          <label className="block text-sm font-medium text-stone-700">Assunto</label>
          <input
            type="text"
            value={subjectOverride}
            onChange={(e) => setSubjectOverride(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <p className="mt-1 text-[11px] text-stone-400">Pré-preenchido com o assunto do template. Editável.</p>
        </div>
      )}

      {templateId && abTestEnabled && abTestVariable === "subject" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700">Assunto A</label>
            <input
              type="text"
              value={subjectVariantA}
              onChange={(e) => setSubjectVariantA(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700">Assunto B</label>
            <input
              type="text"
              value={subjectVariantB}
              onChange={(e) => setSubjectVariantB(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <p className="text-[11px] text-stone-400">A audiência será dividida automaticamente ~50/50 entre as duas versões.</p>
        </div>
      )}

      {templateId && abTestEnabled && abTestVariable === "body" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700">Template A</label>
            <select
              value={bodyVariantATemplateId}
              onChange={(e) => setBodyVariantATemplateId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Selecione um template...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700">Template B</label>
            <select
              value={bodyVariantBTemplateId}
              onChange={(e) => setBodyVariantBTemplateId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Selecione um template...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          {bodyVariantATemplateId && bodyVariantATemplateId === bodyVariantBTemplateId && (
            <p className="text-[11px] text-amber-600">Template A e Template B devem ser diferentes.</p>
          )}
          <p className="text-[11px] text-stone-400">A audiência será dividida automaticamente ~50/50 entre as duas versões. Cada template usa seu próprio assunto cadastrado.</p>
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
            onNext({
              templateId,
              templateSlug,
              templateName,
              campaignName: campaignName.trim(),
              subjectOverride,
              abTestEnabled,
              abTestVariable,
              subjectVariantA,
              subjectVariantB,
              bodyVariantATemplateId,
              bodyVariantASlug: templates.find((t) => t.id === bodyVariantATemplateId)?.slug ?? "",
              bodyVariantAName: templates.find((t) => t.id === bodyVariantATemplateId)?.name ?? "",
              bodyVariantBTemplateId,
              bodyVariantBSlug: templates.find((t) => t.id === bodyVariantBTemplateId)?.slug ?? "",
              bodyVariantBName: templates.find((t) => t.id === bodyVariantBTemplateId)?.name ?? "",
            })
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
