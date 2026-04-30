"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { StepAudience, type AudienceData } from "./step-audience"
import { StepContent, type ContentData } from "./step-content"
import { StepSchedule } from "./step-schedule"

const STEPS = ["Audiência", "Conteúdo", "Confirmação"]

const defaultAudience: AudienceData = {
  segmentType: "all",
  stageIds: [],
  sources: [],
  propertyId: "",
  recipientCount: 0,
}

const defaultContent: ContentData = {
  templateId: "",
  templateSlug: "",
  templateName: "",
  campaignName: "",
  subjectOverride: "",
}

export function BlastWizard() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [audience, setAudience] = useState<AudienceData>(defaultAudience)
  const [content, setContent] = useState<ContentData>(defaultContent)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async (scheduledFor: string | null) => {
    setSubmitting(true)
    setError(null)

    const segmentFilter: Record<string, unknown> = { type: audience.segmentType }
    if (audience.segmentType === "by_stage") segmentFilter.stage_ids = audience.stageIds
    if (audience.segmentType === "by_source") segmentFilter.sources = audience.sources
    if (audience.segmentType === "by_property") segmentFilter.property_id = audience.propertyId

    const res = await fetch("/api/admin/email-blasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: content.campaignName,
        template_id: content.templateId,
        template_slug: content.templateSlug,
        subject_override: content.subjectOverride || undefined,
        segment_filter: segmentFilter,
        scheduled_for: scheduledFor ?? undefined,
      }),
    })

    const json = await res.json()
    setSubmitting(false)

    if (!res.ok) {
      setError(json.error ?? "Erro ao criar blast")
      return
    }

    router.push("/dashboard/sistema/email-blasts")
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Novo Email Blast</h1>
        <p className="mt-0.5 text-sm text-stone-500">Envio em massa para segmento de leads.</p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-0">
        {STEPS.map((label, i) => {
          const n = i + 1
          const active = step === n
          const done = step > n
          return (
            <div key={label} className="flex items-center">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                active ? "bg-indigo-600 text-white" : done ? "bg-indigo-100 text-indigo-700" : "bg-stone-100 text-stone-400"
              }`}>
                <span>{done ? "✓" : n}</span>
                <span>{label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-px w-6 ${done ? "bg-indigo-300" : "bg-stone-200"}`} />
              )}
            </div>
          )
        })}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-stone-200 bg-white p-6">
        {step === 1 && (
          <StepAudience
            initial={audience}
            onNext={(data) => { setAudience(data); setStep(2) }}
          />
        )}
        {step === 2 && (
          <StepContent
            initial={content}
            onNext={(data) => { setContent(data); setStep(3) }}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <StepSchedule
            audience={audience}
            content={content}
            onConfirm={handleConfirm}
            onBack={() => setStep(2)}
            submitting={submitting}
          />
        )}
      </div>
    </div>
  )
}
