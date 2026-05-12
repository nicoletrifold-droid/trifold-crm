"use client"

import { useState, useEffect, useCallback } from "react"

interface Stage { id: string; name: string }
interface Property { id: string; name: string }

const SOURCE_OPTIONS = [
  { value: "meta_ads", label: "Meta Ads" },
  { value: "whatsapp_organic", label: "WhatsApp orgânico" },
  { value: "whatsapp_click_to_ad", label: "WhatsApp Click-to-Ad" },
  { value: "manual", label: "Cadastro manual" },
]

export type AudienceData = {
  segmentType: "all" | "by_stage" | "by_source" | "by_property"
  stageIds: string[]
  sources: string[]
  propertyId: string
  recipientCount: number
}

interface Props {
  initial: AudienceData
  onNext: (data: AudienceData) => void
}

export function StepAudience({ initial, onNext }: Props) {
  const [segmentType, setSegmentType] = useState(initial.segmentType)
  const [stageIds, setStageIds] = useState<string[]>(initial.stageIds)
  const [sources, setSources] = useState<string[]>(initial.sources)
  const [propertyId, setPropertyId] = useState(initial.propertyId)
  const [stages, setStages] = useState<Stage[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [count, setCount] = useState<number | null>(initial.recipientCount || null)
  const [counting, setCounting] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch("/api/stages").then((r) => r.json()),
      fetch("/api/properties").then((r) => r.json()),
    ]).then(([s, p]) => {
      setStages((s.data as Stage[]) ?? [])
      setProperties((p.data as Property[]) ?? [])
    })
  }, [])

  const fetchCount = useCallback(async () => {
    setCounting(true)
    const params = new URLSearchParams({ segment_type: segmentType })
    stageIds.forEach((id) => params.append("stage_id", id))
    sources.forEach((s) => params.append("source", s))
    if (propertyId) params.set("property_id", propertyId)
    const res = await fetch(`/api/admin/email-blasts/count?${params}`)
    const json = await res.json()
    setCount(json.count ?? 0)
    setCounting(false)
  }, [segmentType, stageIds, sources, propertyId])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void fetchCount() }, [fetchCount])

  const toggleStage = (id: string) =>
    setStageIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  const toggleSource = (s: string) =>
    setSources((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])

  const canProceed = segmentType === "all"
    || (segmentType === "by_stage" && stageIds.length > 0)
    || (segmentType === "by_source" && sources.length > 0)
    || (segmentType === "by_property" && !!propertyId)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-stone-800">Passo 1 — Audiência</h2>
        <p className="mt-0.5 text-sm text-stone-500">Selecione quais leads receberão o email.</p>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-stone-700">Segmento</label>
        {(["all", "by_stage", "by_source", "by_property"] as const).map((type) => (
          <label key={type} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              value={type}
              checked={segmentType === type}
              onChange={() => setSegmentType(type)}
              className="accent-indigo-600"
            />
            <span className="text-sm text-stone-700">
              {type === "all" && "Todos os leads ativos com email"}
              {type === "by_stage" && "Por status (etapa do Kanban)"}
              {type === "by_source" && "Por origem"}
              {type === "by_property" && "Por empreendimento"}
            </span>
          </label>
        ))}
      </div>

      {segmentType === "by_stage" && (
        <div className="rounded-lg border border-stone-200 p-4 space-y-2">
          <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">Etapas</p>
          {stages.map((s) => (
            <label key={s.id} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={stageIds.includes(s.id)}
                onChange={() => toggleStage(s.id)}
                className="accent-indigo-600"
              />
              <span className="text-sm text-stone-700">{s.name}</span>
            </label>
          ))}
        </div>
      )}

      {segmentType === "by_source" && (
        <div className="rounded-lg border border-stone-200 p-4 space-y-2">
          <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">Origens</p>
          {SOURCE_OPTIONS.map((o) => (
            <label key={o.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sources.includes(o.value)}
                onChange={() => toggleSource(o.value)}
                className="accent-indigo-600"
              />
              <span className="text-sm text-stone-700">{o.label}</span>
            </label>
          ))}
        </div>
      )}

      {segmentType === "by_property" && (
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Empreendimento</label>
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Selecione...</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="rounded-lg bg-stone-50 border border-stone-200 px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-stone-600">Destinatários estimados</span>
        <span className="text-lg font-semibold text-stone-800">
          {counting ? "..." : (count ?? "—")}
        </span>
      </div>

      {count !== null && count > 100 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {count} leads selecionados — o blast será distribuído em aproximadamente{" "}
          <strong>{Math.ceil(count / 95)} dias</strong> para respeitar o limite de 100 emails/dia.
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() =>
            canProceed && count !== null &&
            onNext({ segmentType, stageIds, sources, propertyId, recipientCount: count })
          }
          disabled={!canProceed || count === null || count === 0}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          Próximo →
        </button>
      </div>
    </div>
  )
}
