"use client"

import { useState, useEffect } from "react"
import { X, Phone, Mail, MessageCircle, MapPin, AlertTriangle } from "lucide-react"
import { createClient } from "@web/lib/supabase/client"

type ActionType = "ligacao" | "email" | "whatsapp" | "visita"
type Step = "type" | "form"

interface Stage { id: string; name: string; color: string | null }
interface Property { id: string; name: string }

interface HistoryItem {
  id: string; type: string; description: string; created_at: string
  metadata: { acao?: string; corretor?: { nome: string } }
}

interface Task {
  id: string; title: string; action_type: string; due_at: string | null
  completed_at: string | null; source: string; created_at: string
  assigned_to: { id: string; name: string } | null
}

interface Props {
  leadId: string
  orgId: string
  currentStageId: string | null
  currentInterestLevel: string | null
  onClose: () => void
  onSaved: (note: HistoryItem) => void
  onTaskAdded?: (task: Task) => void
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

export function QuickHistoryModal({
  leadId, orgId, currentStageId, currentInterestLevel,
  onClose, onSaved, onTaskAdded,
}: Props) {
  const [step, setStep] = useState<Step>("type")
  const [actionType, setActionType] = useState<ActionType | null>(null)
  const [stages, setStages] = useState<Stage[]>([])
  const [properties, setProperties] = useState<Property[]>([])

  // Não-visita
  const [hasReturn, setHasReturn] = useState("nao")

  // Visita — fluxo bifurcado
  const [visitHappened, setVisitHappened] = useState("") // "sim" | "nao"
  const [visitScheduled, setVisitScheduled] = useState("nao") // só quando visitHappened=nao

  // Compartilhados
  const [returnDate, setReturnDate] = useState("")
  const [returnTime, setReturnTime] = useState("09:00")
  const [details, setDetails] = useState("")
  const [stageId, setStageId] = useState(currentStageId ?? "")
  const [interestLevel, setInterestLevel] = useState(currentInterestLevel ?? "")
  const [propertyId, setPropertyId] = useState("")
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [conflictError, setConflictError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.from("kanban_stages").select("id, name, color").eq("org_id", orgId).order("position")
      .then(({ data }) => setStages(data ?? []))
    supabase.from("properties").select("id, name").eq("is_active", true).order("name")
      .then(({ data }) => setProperties(data ?? []))
  }, [orgId])

  function selectType(type: ActionType) {
    setActionType(type)
    setStep("form")
    setHasReturn("nao")
    setVisitHappened("")
    setVisitScheduled("nao")
    setReturnDate("")
    setReturnTime("09:00")
    setDetails("")
    setPropertyId("")
    setFeedback(null)
    setConflictError(null)
  }

  // Lógica: quando agendar visita futura
  const isFutureVisit = actionType === "visita"
    && visitHappened === "nao"
    && visitScheduled === "sim"
    && returnDate !== ""
    && new Date(`${returnDate}T${returnTime}:00`) > new Date()

  // Lógica: quando registrar visita já realizada
  const isPastVisit = actionType === "visita" && visitHappened === "sim"

  // Lógica: retorno para não-visita
  const hasScheduledReturn = actionType !== "visita" && hasReturn === "sim" && returnDate !== ""

  async function handleSave() {
    if (!actionType || !details.trim()) return
    setSaving(true)
    setConflictError(null)

    const metadata: Record<string, unknown> = {}
    if (propertyId) {
      const prop = properties.find(p => p.id === propertyId)
      metadata.property_id = propertyId
      if (prop) metadata.property_name = prop.name
    }

    // Data relevante para o registro
    const eventAt = returnDate ? `${returnDate}T${returnTime}:00` : null
    if (eventAt) metadata.event_at = eventAt

    // 1. Criar nota no histórico
    const noteRes = await fetch(`/api/leads/${leadId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: details.trim(), action_type: actionType, metadata }),
    })
    if (!noteRes.ok) { setSaving(false); return }
    const { data: note } = await noteRes.json() as { data: HistoryItem }

    // 2. Atualizar stage/interest se mudou
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

    let taskCreated = false
    let appointmentCreated = false

    if (isFutureVisit) {
      // 3a. Visita futura → tarefa pendente + agenda
      const taskRes = await fetch(`/api/leads/${leadId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Visita Agendada", action_type: "visita", due_at: eventAt }),
      })
      if (taskRes.ok) {
        taskCreated = true
        const { data: task } = await taskRes.json() as { data: Task }
        onTaskAdded?.(task)
      }

      const apptRes = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId, scheduled_at: eventAt,
          duration_minutes: 60, property_id: propertyId || null, status: "scheduled",
        }),
      })
      if (apptRes.ok) {
        appointmentCreated = true
      } else if (apptRes.status === 409) {
        const err = await apptRes.json().catch(() => ({}))
        setConflictError((err as { error?: string }).error ?? "Conflito de horário na agenda.")
        setSaving(false)
        return
      }

    } else if (hasScheduledReturn) {
      // 3b. Retorno agendado (não-visita) → tarefa pendente
      const titles: Record<ActionType, string> = {
        ligacao: "Retorno - Ligação", email: "Retorno - E-mail",
        whatsapp: "Retorno - WhatsApp", visita: "Visita Agendada",
      }
      const taskRes = await fetch(`/api/leads/${leadId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titles[actionType], action_type: actionType, due_at: eventAt }),
      })
      if (taskRes.ok) {
        taskCreated = true
        const { data: task } = await taskRes.json() as { data: Task }
        onTaskAdded?.(task)
      }
    }

    // Feedback
    if (appointmentCreated && taskCreated) {
      setFeedback("✓ Visita criada na agenda com lembrete automático!")
    } else if (isPastVisit) {
      setFeedback("✓ Visita registrada no histórico.")
    } else if (taskCreated) {
      setFeedback("✓ Histórico salvo e tarefa criada!")
    }

    onSaved(note)
    setSaving(false)
    setTimeout(onClose, feedback ? 1500 : 0)
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
            {step === "type" ? "Registrar ou Agendar Contato" : `Registrar ${ACTION_LABELS[actionType!]}`}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:text-stone-500 dark:hover:bg-stone-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "type" ? (
          <div className="px-6 py-6">
            <p className="mb-4 text-center text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-stone-500">Interação</p>
            <div className="grid grid-cols-4 gap-3">
              {ACTION_OPTIONS.map(({ type, label, icon }) => (
                <button key={type} onClick={() => selectType(type)}
                  className="flex flex-col items-center gap-2 rounded-xl border-2 border-orange-400 bg-orange-50 px-3 py-4 text-orange-600 transition-all hover:bg-orange-100 dark:border-orange-500/50 dark:bg-orange-500/10 dark:text-orange-300 dark:hover:bg-orange-500/20">
                  {icon}
                  <span className="text-xs font-semibold">{label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-h-[75vh] overflow-y-auto px-6 py-5">
            {feedback && (
              <div className="mb-4 rounded-lg bg-green-50 px-4 py-2.5 text-sm font-medium text-green-700 dark:bg-green-500/10 dark:text-green-300">
                {feedback}
              </div>
            )}
            {conflictError && (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{conflictError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
              <div className="space-y-4">

                {/* ── VISITA — fluxo bifurcado ── */}
                {actionType === "visita" && (
                  <>
                    {/* Empreendimento */}
                    {properties.length > 0 && (
                      <div>
                        <label className={labelClass}>Empreendimento / Imóvel</label>
                        <select value={propertyId} onChange={e => setPropertyId(e.target.value)} className={inputClass}>
                          <option value="">Selecione (opcional)</option>
                          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                    )}

                    {/* A visita aconteceu? */}
                    <div>
                      <label className={labelClass}>A visita aconteceu?</label>
                      <select value={visitHappened} onChange={e => { setVisitHappened(e.target.value); setVisitScheduled("nao"); setReturnDate(""); setConflictError(null) }} className={inputClass}>
                        <option value="">Selecione</option>
                        <option value="sim">Sim — já aconteceu</option>
                        <option value="nao">Não</option>
                      </select>
                    </div>

                    {/* Visita já aconteceu → registrar data */}
                    {visitHappened === "sim" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelClass}>Data da visita</label>
                          <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Hora</label>
                          <input type="time" value={returnTime} onChange={e => setReturnTime(e.target.value)} className={inputClass} />
                        </div>
                      </div>
                    )}

                    {/* Visita não aconteceu → Agendou? */}
                    {visitHappened === "nao" && (
                      <div>
                        <label className={labelClass}>Agendou uma visita?</label>
                        <select value={visitScheduled} onChange={e => { setVisitScheduled(e.target.value); setReturnDate(""); setConflictError(null) }} className={inputClass}>
                          <option value="nao">Não</option>
                          <option value="sim">Sim — agendar visita</option>
                        </select>
                      </div>
                    )}

                    {/* Visita futura agendada → data/hora */}
                    {visitHappened === "nao" && visitScheduled === "sim" && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={labelClass}>Data da visita</label>
                            <input type="date" value={returnDate} onChange={e => { setReturnDate(e.target.value); setConflictError(null) }} className={inputClass} />
                          </div>
                          <div>
                            <label className={labelClass}>Hora</label>
                            <input type="time" value={returnTime} onChange={e => setReturnTime(e.target.value)} className={inputClass} />
                          </div>
                        </div>
                        {isFutureVisit && (
                          <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                            <span>📅</span>
                            <span>Será criada como tarefa pendente e adicionada à agenda com lembrete automático.</span>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {/* ── OUTROS TIPOS — retorno agendado ── */}
                {actionType !== "visita" && (
                  <>
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
                    {hasReturn === "sim" && (
                      <div>
                        <label className={labelClass}>Quem deve retornar?</label>
                        <select className={inputClass} defaultValue="corretor">
                          <option value="corretor">Corretor</option>
                        </select>
                      </div>
                    )}
                  </>
                )}

                {/* Detalhes */}
                <div>
                  <label className={labelClass}>Detalhes do Contato</label>
                  <textarea value={details} onChange={e => setDetails(e.target.value)}
                    placeholder="O que você conversou com o cliente?" rows={4}
                    className={`${inputClass} resize-none`} />
                </div>
              </div>

              {/* ATUALIZAR LEAD */}
              <div className="w-full lg:w-52">
                <div className="rounded-xl border-2 border-orange-300 bg-orange-50 p-4 dark:border-orange-500/40 dark:bg-orange-500/10">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">Atualizar Lead</p>
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-orange-700 dark:text-orange-300">Situação do Lead</label>
                      <select value={stageId} onChange={e => setStageId(e.target.value)}
                        className="w-full rounded-lg border border-orange-200 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-orange-400 focus:outline-none dark:border-orange-500/30 dark:bg-stone-800 dark:text-stone-100">
                        <option value="">— manter atual —</option>
                        {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-orange-700 dark:text-orange-300">Calor do Lead</label>
                      <select value={interestLevel} onChange={e => setInterestLevel(e.target.value)}
                        className="w-full rounded-lg border border-orange-200 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-orange-400 focus:outline-none dark:border-orange-500/30 dark:bg-stone-800 dark:text-stone-100">
                        <option value="">— manter atual —</option>
                        {INTEREST_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button onClick={handleSave} disabled={saving || !details.trim()}
                className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                {saving ? "Salvando…" : "Salvar Informações"}
              </button>
              <button onClick={() => setStep("type")}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-stone-400 dark:hover:text-stone-200">
                ← Voltar
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end border-t border-gray-100 px-6 py-3 dark:border-stone-800">
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600 dark:text-stone-500 dark:hover:text-stone-300">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
