"use client"

import { useState, useRef } from "react"
import type { AudienceData } from "./step-audience"
import type { ContentData } from "./step-content"

interface Props {
  audience: AudienceData
  content: ContentData
  onConfirm: (scheduledFor: string | null) => Promise<void>
  onBack: () => void
  submitting: boolean
}

const SEGMENT_LABELS: Record<string, string> = {
  all: "Todos os leads ativos",
  by_stage: "Por etapa do Kanban",
  by_source: "Por origem",
  by_property: "Por empreendimento",
}

export function StepSchedule({ audience, content, onConfirm, onBack, submitting }: Props) {
  const [sendNow, setSendNow] = useState(true)
  const [scheduledFor, setScheduledFor] = useState("")
  const [confirmClicks, setConfirmClicks] = useState(0)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const requiresDoubleClick = audience.recipientCount > 50

  const handleConfirm = async () => {
    if (requiresDoubleClick && confirmClicks === 0) {
      setConfirmClicks(1)
      confirmTimer.current = setTimeout(() => setConfirmClicks(0), 3000)
      return
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    setConfirmClicks(0)
    await onConfirm(sendNow ? null : scheduledFor || null)
  }

  const daysNeeded = Math.ceil(audience.recipientCount / 95)
  const buttonLabel = confirmClicks === 1
    ? "Clique novamente para confirmar"
    : submitting
    ? "Enviando..."
    : "Confirmar e Enviar"

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-stone-800">Passo 3 — Agendamento e Confirmação</h2>
        <p className="mt-0.5 text-sm text-stone-500">Revise o resumo e confirme o envio.</p>
      </div>

      {/* Summary */}
      <div className="rounded-lg border border-stone-200 bg-stone-50 divide-y divide-stone-200">
        <div className="grid grid-cols-2 px-4 py-3 gap-2">
          <span className="text-xs text-stone-500">Campanha</span>
          <span className="text-sm font-medium text-stone-800 truncate">{content.campaignName}</span>
        </div>
        <div className="grid grid-cols-2 px-4 py-3 gap-2">
          <span className="text-xs text-stone-500">Template</span>
          <span className="text-sm text-stone-700">{content.templateName}</span>
        </div>
        <div className="grid grid-cols-2 px-4 py-3 gap-2">
          <span className="text-xs text-stone-500">Segmento</span>
          <span className="text-sm text-stone-700">{SEGMENT_LABELS[audience.segmentType]}</span>
        </div>
        <div className="grid grid-cols-2 px-4 py-3 gap-2">
          <span className="text-xs text-stone-500">Destinatários</span>
          <span className="text-sm font-semibold text-stone-800">{audience.recipientCount} leads</span>
        </div>
        {daysNeeded > 1 && (
          <div className="px-4 py-3">
            <p className="text-xs text-amber-600">
              Distribuição automática: ~95 emails/dia → {daysNeeded} dias para completar o envio.
            </p>
          </div>
        )}
      </div>

      {/* Schedule */}
      <div className="space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            checked={sendNow}
            onChange={() => setSendNow(true)}
            className="accent-indigo-600"
          />
          <span className="text-sm text-stone-700">Enviar agora</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            checked={!sendNow}
            onChange={() => setSendNow(false)}
            className="accent-indigo-600"
          />
          <span className="text-sm text-stone-700">Agendar para data específica</span>
        </label>
        {!sendNow && (
          <input
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            className="ml-6 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        )}
      </div>

      {requiresDoubleClick && confirmClicks === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Audiência com mais de 50 leads. O botão exigirá dois cliques para confirmar.
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          disabled={submitting}
          className="rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-600 hover:bg-stone-50 disabled:opacity-40"
        >
          ← Voltar
        </button>
        <button
          onClick={handleConfirm}
          disabled={submitting || (!sendNow && !scheduledFor)}
          className={`rounded-lg px-5 py-2 text-sm font-medium text-white disabled:opacity-40 transition-colors ${
            confirmClicks === 1
              ? "bg-amber-500 hover:bg-amber-600"
              : "bg-indigo-600 hover:bg-indigo-700"
          }`}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  )
}
