"use client"

import { useState, useEffect } from "react"
import { X, Phone, Mail, MessageCircle, MapPin } from "lucide-react"
import { createClient } from "@web/lib/supabase/client"

type ActionType = "ligacao" | "email" | "whatsapp" | "visita"
type Step = "type" | "form"

interface Stage { id: string; name: string; color: string | null }

interface HistoryItem {
  id: string; type: string; description: string; created_at: string
  metadata: { acao?: string; corretor?: { nome: string } }
}

interface Props {
  leadId: string
  orgId: string
  currentStageId: string | null
  currentInterestLevel: string | null
  onClose: () => void
  onSaved: (note: HistoryItem) => void
}

const ACTION_OPTIONS: { type: ActionType; label: string; icon: React.ReactNode }[] = [
  { type: "ligacao",  label: "Ligação",   icon: <Phone className="h-6 w-6" /> },
  { type: "email",    label: "E-mail",    icon: <Mail className="h-6 w-6" /> },
  { type: "whatsapp", label: "WhatsApp",  icon: <MessageCircle className="h-6 w-6" /> },
  { type: "visita",   label: "Visita",    icon: <MapPin className="h-6 w-6" /> },
]

const ACTION_LABELS: Record<ActionType, string> = {
  ligacao: "Ligação", email: "E-mail", whatsapp: "WhatsApp", visita: "Visita",
}

const INTEREST_LEVELS = [
  { value: "cold", label: "Frio" },
  { value: "warm", label: "Morno" },
  { value: "hot",  label: "Quente" },
]

export function QuickHistoryModal({ leadId, orgId, currentStageId, currentInterestLevel, onClose, onSaved }: Props) {
  const [step, setStep] = useState<Step>("type")
  const [actionType, setActionType] = useState<ActionType | null>(null)
  const [stages, setStages] = useState<Stage[]>([])

  // Form fields
  const [hasReturn, setHasReturn] = useState("nao")
  const [returnDate, setReturnDate] = useState("")
  const [returnTime, setReturnTime] = useState("07:00")
  const [details, setDetails] = useState("")
  const [stageId, setStageId] = useState(currentStageId ?? "")
  const [interestLevel, setInterestLevel] = useState(currentInterestLevel ?? "")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from("kanban_stages")
      .select("id, name, color")
      .eq("org_id", orgId)
      .order("position")
      .then(({ data }) => setStages(data ?? []))
  }, [orgId])

  function selectType(type: ActionType) {
    setActionType(type)
    setStep("form")
  }

  async function handleSave() {
    if (!actionType || !details.trim()) return
    setSaving(true)

    const metadata: Record<string, unknown> = {}
    if (hasReturn === "sim" && returnDate) {
      metadata.return_at = `${returnDate}T${returnTime}:00`
      metadata.return_by = "corretor"
    }

    // 1. Create history note
    const noteRes = await fetch(`/api/leads/${leadId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: details.trim(),
        action_type: actionType,
        metadata,
      }),
    })

    if (!noteRes.ok) { setSaving(false); return }
    const { data: note } = await noteRes.json() as { data: HistoryItem }

    // 2. Update stage if changed
    const updates: Record<string, string> = {}
    if (stageId && stageId !== currentStageId) updates.stage_id = stageId
    if (interestLevel && interestLevel !== currentInterestLevel) updates.interest_level = interestLevel

    if (Object.keys(updates).length > 0) {
      await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
    }

    onSaved(note)
    onClose()
  }

  const inputClass = "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
  const labelClass = "mb-1 block text-xs font-medium text-gray-600 dark:text-stone-400"

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-stone-900">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-stone-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-stone-100">
            {step === "type"
              ? "Registrar ou Agendar Contato"
              : `Registrar ${ACTION_LABELS[actionType!]}`}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:text-stone-500 dark:hover:bg-stone-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "type" ? (
          /* ── Seletor de tipo ─────────────────────── */
          <div className="px-6 py-6">
            <p className="mb-4 text-center text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-stone-500">
              Interação
            </p>
            <div className="grid grid-cols-4 gap-3">
              {ACTION_OPTIONS.map(({ type, label, icon }) => (
                <button
                  key={type}
                  onClick={() => selectType(type)}
                  className="flex flex-col items-center gap-2 rounded-xl border-2 border-orange-400 bg-orange-50 px-3 py-4 text-orange-600 transition-all hover:bg-orange-100 dark:border-orange-500/50 dark:bg-orange-500/10 dark:text-orange-300 dark:hover:bg-orange-500/20"
                >
                  {icon}
                  <span className="text-xs font-semibold">{label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Formulário de registro ──────────────── */
          <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">

              {/* Coluna esquerda — campos principais */}
              <div className="space-y-4">
                {/* Agendou retorno */}
                <div>
                  <label className={labelClass}>Agendou algum retorno?</label>
                  <select value={hasReturn} onChange={e => setHasReturn(e.target.value)} className={inputClass}>
                    <option value="nao">Não</option>
                    <option value="sim">Sim</option>
                  </select>
                </div>

                {hasReturn === "sim" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Data</label>
                      <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Hora</label>
                      <input type="time" value={returnTime} onChange={e => setReturnTime(e.target.value)} className={inputClass} />
                    </div>
                  </div>
                )}

                {/* Quem retorna */}
                <div>
                  <label className={labelClass}>Quem deve retornar?</label>
                  <select className={inputClass} defaultValue="corretor">
                    <option value="corretor">Corretor</option>
                  </select>
                </div>

                {/* Detalhes */}
                <div>
                  <label className={labelClass}>Detalhes do Contato</label>
                  <textarea
                    value={details}
                    onChange={e => setDetails(e.target.value)}
                    placeholder="O que você conversou com o cliente?"
                    rows={4}
                    className={`${inputClass} resize-none`}
                  />
                </div>
              </div>

              {/* Coluna direita — ATUALIZAR LEAD */}
              <div className="w-full lg:w-52">
                <div className="rounded-xl border-2 border-orange-300 bg-orange-50 p-4 dark:border-orange-500/40 dark:bg-orange-500/10">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">
                    Atualizar Lead
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-orange-700 dark:text-orange-300">
                        Situação do Lead
                      </label>
                      <select
                        value={stageId}
                        onChange={e => setStageId(e.target.value)}
                        className="w-full rounded-lg border border-orange-200 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-orange-400 focus:outline-none dark:border-orange-500/30 dark:bg-stone-800 dark:text-stone-100"
                      >
                        <option value="">— manter atual —</option>
                        {stages.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-orange-700 dark:text-orange-300">
                        Calor do Lead
                      </label>
                      <select
                        value={interestLevel}
                        onChange={e => setInterestLevel(e.target.value)}
                        className="w-full rounded-lg border border-orange-200 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-orange-400 focus:outline-none dark:border-orange-500/30 dark:bg-stone-800 dark:text-stone-100"
                      >
                        <option value="">— manter atual —</option>
                        {INTEREST_LEVELS.map(l => (
                          <option key={l.value} value={l.value}>{l.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Salvar */}
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving || !details.trim()}
                className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {saving ? "Salvando…" : "Salvar Informações"}
              </button>
              <button
                onClick={() => setStep("type")}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200"
              >
                ← Voltar
              </button>
            </div>
          </div>
        )}

        {/* Footer com Cancelar */}
        <div className="flex justify-end border-t border-gray-100 px-6 py-3 dark:border-stone-800">
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600 dark:text-stone-500 dark:hover:text-stone-300">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
