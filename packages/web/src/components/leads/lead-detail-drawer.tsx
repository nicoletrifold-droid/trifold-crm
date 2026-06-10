"use client"

import { useEffect, useMemo, useReducer, useState, useCallback } from "react"
import { createClient } from "@web/lib/supabase/client"
import Link from "next/link"
import { X, Phone, MessageCircle, Mail, Calendar, Check, Plus, Trash2, Clock, XCircle, AlertTriangle, ChevronDown, Pencil, History, UserCheck } from "lucide-react"
import { QuickHistoryModal } from "@web/app/broker/_components/quick-history-modal"
import { INTEREST_LEVEL_LABELS as interestLevelLabels, INTEREST_LEVEL_COLORS as interestLevelColors } from "@web/lib/constants"
import { SourceBadge } from "@web/components/ui/source-badge"

// ── Types ──────────────────────────────────────────────────────────────────

interface LeadQuickData {
  id: string
  org_id: string
  name: string | null
  phone: string
  email: string | null
  qualification_score: number | null
  interest_level: string | null
  source: string | null
  channel: string | null
  utm_source: string | null
  utm_campaign: string | null
  ai_summary: string | null
  lost_reason: string | null
  created_at: string
  updated_at: string
  has_down_payment: boolean | null
  preferred_bedrooms: number | null
  preferred_floor: string | null
  preferred_view: string | null
  preferred_garage_count: number | null
  stage: { id: string; name: string; color: string | null } | null
  property_interest: { id: string; name: string } | null
  broker: { id: string; name: string; email: string } | null
}

type Message = { id: string; role: string; content: string; created_at: string }

type HistoryItem = {
  id: string
  type: string
  description: string
  created_at: string
  metadata: { acao?: string; situacao?: string; corretor?: { nome: string } }
}

type Task = {
  id: string
  title: string
  action_type: string
  due_at: string | null
  completed_at: string | null
  source: string
  created_at: string
  assigned_to: { id: string; name: string } | null
}

interface DrawerState {
  loading: boolean
  lead: LeadQuickData | null
  messages: Message[]
  history: HistoryItem[]
  tasks: Task[]
  showAllHistory: boolean
  showDetails: boolean
  taskForm: { open: boolean; title: string; action_type: string; due_at: string }
  taskSaving: boolean
  noteInput: string
  noteAction: string
  noteSaving: boolean
  showQuickHistory: boolean
}

type DrawerAction =
  | { type: "LOADED"; lead: LeadQuickData | null; messages: Message[]; history: HistoryItem[]; tasks: Task[] }
  | { type: "TOGGLE_HISTORY" }
  | { type: "TOGGLE_DETAILS" }
  | { type: "TASK_FORM_TOGGLE" }
  | { type: "TASK_FORM_CHANGE"; field: string; value: string }
  | { type: "TASK_SAVING"; saving: boolean }
  | { type: "TASK_ADDED"; task: Task }
  | { type: "TASK_TOGGLED"; taskId: string; completed: boolean }
  | { type: "TASK_DELETED"; taskId: string }
  | { type: "NOTE_INPUT"; value: string }
  | { type: "NOTE_ACTION"; value: string }
  | { type: "NOTE_SAVING"; saving: boolean }
  | { type: "NOTE_ADDED"; note: HistoryItem }
  | { type: "TOGGLE_QUICK_HISTORY" }

function reducer(state: DrawerState, action: DrawerAction): DrawerState {
  switch (action.type) {
    case "LOADED":
      return { ...state, loading: false, lead: action.lead, messages: action.messages, history: action.history, tasks: action.tasks }
    case "TOGGLE_HISTORY":
      return { ...state, showAllHistory: !state.showAllHistory }
    case "TOGGLE_DETAILS":
      return { ...state, showDetails: !state.showDetails }
    case "TASK_FORM_TOGGLE":
      return { ...state, taskForm: { ...state.taskForm, open: !state.taskForm.open, title: "", due_at: "", action_type: "ligacao" } }
    case "TASK_FORM_CHANGE":
      return { ...state, taskForm: { ...state.taskForm, [action.field]: action.value } }
    case "TASK_SAVING":
      return { ...state, taskSaving: action.saving }
    case "TASK_ADDED":
      return { ...state, tasks: [action.task, ...state.tasks], taskForm: { open: false, title: "", action_type: "ligacao", due_at: "" }, taskSaving: false }
    case "TASK_TOGGLED":
      return {
        ...state,
        tasks: state.tasks.map(t =>
          t.id === action.taskId ? { ...t, completed_at: action.completed ? new Date().toISOString() : null } : t
        ),
      }
    case "TASK_DELETED":
      return { ...state, tasks: state.tasks.filter(t => t.id !== action.taskId) }
    case "NOTE_INPUT":
      return { ...state, noteInput: action.value }
    case "NOTE_ACTION":
      return { ...state, noteAction: action.value }
    case "NOTE_SAVING":
      return { ...state, noteSaving: action.saving }
    case "NOTE_ADDED":
      return {
        ...state,
        history: [action.note, ...state.history],
        noteInput: "",
        noteSaving: false,
      }
    case "TOGGLE_QUICK_HISTORY":
      return { ...state, showQuickHistory: !state.showQuickHistory }
    default:
      return state
  }
}

const initialState: DrawerState = {
  loading: true,
  lead: null,
  messages: [],
  history: [],
  tasks: [],
  showAllHistory: false,
  showDetails: false,
  taskForm: { open: false, title: "", action_type: "ligacao", due_at: "" },
  taskSaving: false,
  noteInput: "",
  noteAction: "ligacao",
  noteSaving: false,
  showQuickHistory: false,
}

// ── Component ─────────────────────────────────────────────────────────────

export interface LeadDetailDrawerProps {
  leadId: string | null
  onClose: () => void
}

export function LeadDetailDrawer({ leadId, onClose }: LeadDetailDrawerProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    if (leadId) {
      document.addEventListener("keydown", handler)
      return () => document.removeEventListener("keydown", handler)
    }
  }, [leadId, onClose])

  if (!leadId) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto bg-white shadow-2xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-800"
        style={{ animation: "slideInFromRight 200ms ease-out" }}
      >
        <LeadDetailContent key={leadId} leadId={leadId} onClose={onClose} />
      </div>
    </>
  )
}

// ── Drawer content ────────────────────────────────────────────────────────

function LeadDetailContent({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      // Primeiro: dispara sync de histórico em background (não bloqueia render).
      // Endpoint usa throttle: se foi sincronizado nos últimos 15 min, retorna fresh.
      const syncPromise = fetch(`/api/leads/${leadId}/sync-history`, { method: "POST" }).catch(() => null)

      const [leadRes, convResult, tasksRes, historyResult] = await Promise.all([
        fetch(`/api/leads/${leadId}`),
        supabase
          .from("conversations")
          .select(`id, messages:messages(id, role, content, created_at)`)
          .eq("lead_id", leadId)
          .order("last_message_at", { ascending: false })
          .limit(1),
        fetch(`/api/leads/${leadId}/tasks`),
        supabase
          .from("activities")
          .select("id, type, description, created_at, metadata")
          .eq("lead_id", leadId)
          .in("type", ["supremo_contact", "broker_note", "lead_lost"])
          .order("created_at", { ascending: false })
          .limit(50),
      ])

      if (cancelled) return

      let lead: LeadQuickData | null = null
      if (leadRes.ok) {
        const json = await leadRes.json() as { data: Record<string, unknown> }
        const raw = json.data
        if (raw) {
          lead = {
            id: raw.id as string,
            org_id: (raw.org_id as string) ?? "",
            name: (raw.name as string | null) ?? null,
            phone: raw.phone as string,
            email: (raw.email as string | null) ?? null,
            qualification_score: (raw.qualification_score as number | null) ?? null,
            interest_level: (raw.interest_level as string | null) ?? null,
            source: (raw.source as string | null) ?? null,
            channel: (raw.channel as string | null) ?? null,
            utm_source: (raw.utm_source as string | null) ?? null,
            utm_campaign: (raw.utm_campaign as string | null) ?? null,
            ai_summary: (raw.ai_summary as string | null) ?? null,
            lost_reason: (raw.lost_reason as string | null) ?? null,
            created_at: raw.created_at as string,
            updated_at: raw.updated_at as string,
            has_down_payment: (raw.has_down_payment as boolean | null) ?? null,
            preferred_bedrooms: (raw.preferred_bedrooms as number | null) ?? null,
            preferred_floor: (raw.preferred_floor as string | null) ?? null,
            preferred_view: (raw.preferred_view as string | null) ?? null,
            preferred_garage_count: (raw.preferred_garage_count as number | null) ?? null,
            stage: (raw.stage as LeadQuickData["stage"]) ?? null,
            property_interest: (raw.property_interest as LeadQuickData["property_interest"]) ?? null,
            broker: (raw.broker as LeadQuickData["broker"]) ?? null,
          }
        }
      }

      const msgs = ((convResult.data?.[0]?.messages ?? []) as Message[])
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5)

      const tasks: Task[] = tasksRes.ok ? ((await tasksRes.json()) as { data: Task[] }).data ?? [] : []
      const history = (historyResult.data ?? []) as HistoryItem[]

      dispatch({ type: "LOADED", lead, messages: msgs, history, tasks })

      // Após o sync em background completar, recarrega tarefas e histórico se houve mudança
      const syncResult = await syncPromise
      if (cancelled) return
      if (syncResult?.ok) {
        const syncJson = await syncResult.json().catch(() => null) as { ok?: boolean; activitiesAdded?: number; tasksAdded?: number } | null
        if (syncJson?.ok && ((syncJson.activitiesAdded ?? 0) > 0 || (syncJson.tasksAdded ?? 0) > 0)) {
          const [tasksRes2, historyRes2] = await Promise.all([
            fetch(`/api/leads/${leadId}/tasks`),
            supabase
              .from("activities")
              .select("id, type, description, created_at, metadata")
              .eq("lead_id", leadId)
              .in("type", ["supremo_contact", "broker_note", "lead_lost"])
              .order("created_at", { ascending: false })
              .limit(50),
          ])
          if (cancelled) return
          const tasks2: Task[] = tasksRes2.ok ? ((await tasksRes2.json()) as { data: Task[] }).data ?? [] : []
          const history2 = (historyRes2.data ?? []) as HistoryItem[]
          dispatch({ type: "LOADED", lead, messages: msgs, history: history2, tasks: tasks2 })
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [leadId, supabase])

  const { loading, lead, messages, history, tasks, showAllHistory, showDetails, taskForm, taskSaving, noteInput, noteAction, noteSaving, showQuickHistory } = state
  const isCTWA = lead?.source === "whatsapp_click_to_ad"
  const PERDIDO_STAGE_IDS = [
    "00000000-0000-0000-0001-000000000008",
    "95327bd7-3e88-4038-aa16-250a74ab085c",
  ]
  const isPerdido = (!!lead?.stage && PERDIDO_STAGE_IDS.includes(lead.stage.id)) || !!lead?.lost_reason

  // ── Task actions ──────────────────────────────────────────────────────

  async function handleAddTask() {
    if (!taskForm.title.trim()) return
    dispatch({ type: "TASK_SAVING", saving: true })
    const res = await fetch(`/api/leads/${leadId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: taskForm.title.trim(),
        action_type: taskForm.action_type,
        due_at: taskForm.due_at || null,
      }),
    })
    if (res.ok) {
      const json = await res.json() as { data: Task }
      dispatch({ type: "TASK_ADDED", task: json.data })
    } else {
      dispatch({ type: "TASK_SAVING", saving: false })
    }
  }

  async function handleToggleTask(taskId: string, currentlyCompleted: boolean) {
    if (!currentlyCompleted && !window.confirm("Deseja marcar esta tarefa como concluída?")) return
    dispatch({ type: "TASK_TOGGLED", taskId, completed: !currentlyCompleted })
    await fetch(`/api/leads/${leadId}/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !currentlyCompleted }),
    })
  }

  async function handleDeleteTask(taskId: string) {
    if (!window.confirm("Deseja excluir esta tarefa? Esta ação não pode ser desfeita.")) return
    dispatch({ type: "TASK_DELETED", taskId })
    await fetch(`/api/leads/${leadId}/tasks/${taskId}`, { method: "DELETE" })
  }

  async function handleMarkAsLost() {
    const reason = window.prompt("Motivo da perda (será exibido no histórico do lead):")
    if (reason === null) return
    const res = await fetch(`/api/leads/${leadId}/mark-lost`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    })
    if (res.ok) window.location.reload()
    else alert("Erro ao marcar lead como perdido")
  }

  async function handleAddNote() {
    const text = noteInput.trim()
    if (!text || noteSaving) return
    dispatch({ type: "NOTE_SAVING", saving: true })
    const res = await fetch(`/api/leads/${leadId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: text, action_type: noteAction }),
    })
    if (res.ok) {
      const json = (await res.json()) as { data: HistoryItem }
      dispatch({ type: "NOTE_ADDED", note: json.data })
    } else {
      const err = await res.json().catch(() => ({ error: "Erro ao salvar" }))
      alert(err.error ?? "Erro ao salvar nota")
      dispatch({ type: "NOTE_SAVING", saving: false })
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  const actionIcons: Record<string, React.ReactNode> = {
    ligacao: <Phone className="h-3.5 w-3.5" />,
    whatsapp: <MessageCircle className="h-3.5 w-3.5" />,
    email: <Mail className="h-3.5 w-3.5" />,
    visita: <Calendar className="h-3.5 w-3.5" />,
    outro: <Clock className="h-3.5 w-3.5" />,
  }
  const actionLabels: Record<string, string> = {
    ligacao: "Ligação", whatsapp: "WhatsApp", email: "Email", visita: "Visita", outro: "Outro",
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
  }
  function fmtDateShort(iso: string) {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
  }

  const [taskTab, setTaskTab] = useState<"todas" | "atrasadas" | "para-hoje" | "futuras">("todas")

  const pendingTasks = tasks.filter(t => !t.completed_at)
  const doneTasks = tasks.filter(t => t.completed_at)

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1)
  const atrasadas = pendingTasks.filter(t => t.due_at && new Date(t.due_at) < todayStart)
  const paraHoje = pendingTasks.filter(t => t.due_at && new Date(t.due_at) >= todayStart && new Date(t.due_at) < tomorrowStart)
  const futuras = pendingTasks.filter(t => t.due_at && new Date(t.due_at) >= tomorrowStart)
  const tabTasks = taskTab === "atrasadas" ? atrasadas : taskTab === "para-hoje" ? paraHoje : taskTab === "futuras" ? futuras : pendingTasks

  const visibleHistory = showAllHistory ? history : history.slice(0, 8)

  return (
    <>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200 bg-white px-5 py-4 dark:border-stone-800 dark:bg-stone-900">
        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="h-6 w-40 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-bold text-stone-900 dark:text-stone-100">
                {lead?.name || lead?.phone || "..."}
              </h2>
              <Link
                href={`/broker/leads/${leadId}`}
                title="Editar lead"
                className="shrink-0 rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-orange-500 transition-colors dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-orange-400"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/broker/leads/${leadId}`}
            className="rounded-md bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-200 transition-colors dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
          >
            Editar Lead
          </Link>
          <Link
            href={`/dashboard/leads/${leadId}`}
            className="rounded-md bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-100 transition-colors dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/20"
          >
            Ver completo
          </Link>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-colors dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4 p-5">
          {[80, 95, 70, 88, 75, 92].map((w, i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-stone-100 dark:bg-stone-800" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : lead ? (
        <div className="divide-y divide-stone-100 dark:divide-stone-800">
          {/* Badges + Phone */}
          <div className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              {lead.stage && (
                <span
                  className="rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{
                    backgroundColor: lead.stage.color ? `${lead.stage.color}20` : "#f3f4f6",
                    color: lead.stage.color || "#374151",
                  }}
                >
                  {lead.stage.name}
                </span>
              )}
              {lead.qualification_score != null && (
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  lead.qualification_score >= 70
                    ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
                    : lead.qualification_score >= 40
                      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300"
                      : "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200"
                }`}>
                  Score: {lead.qualification_score}
                </span>
              )}
              {lead.interest_level && (
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  interestLevelColors[lead.interest_level] ?? "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200"
                }`}>
                  {interestLevelLabels[lead.interest_level] ?? lead.interest_level}
                </span>
              )}
              {lead.source && <SourceBadge source={lead.source} />}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-600 dark:text-stone-400">
              <span className="font-medium">{lead.phone}</span>
              {lead.email && <span className="truncate">{lead.email}</span>}
              {lead.broker && <span className="text-orange-600 dark:text-orange-300">{lead.broker.name}</span>}
              {lead.property_interest && <span>{lead.property_interest.name}</span>}
            </div>
            {isPerdido && (
              <div className="mt-3 rounded-lg bg-red-50 p-3 dark:bg-red-500/10">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500 dark:text-red-400" />
                  <div className="flex-1 text-sm">
                    <p className="font-semibold text-red-700 dark:text-red-300">Lead perdido</p>
                    {lead.lost_reason && (
                      <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">{lead.lost_reason}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── ORIGEM DO LEAD ──────────────────────────────────────── */}
          <div className="px-5 py-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Origem do Lead
            </h3>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-stone-500 dark:text-stone-400">Origem</dt>
                <dd className="break-words text-right font-medium text-stone-900 dark:text-stone-100">
                  {lead.utm_campaign ?? lead.utm_source ?? (lead.source ? (
                    {
                      meta_ads: "Meta Ads",
                      whatsapp_organic: "WhatsApp Orgânico",
                      whatsapp_click_to_ad: "WhatsApp Click-to-Ad",
                      website: "Website",
                      referral: "Indicação",
                      walk_in: "Walk-in",
                      telegram: "Telegram",
                      google_forms: "Google Forms",
                      other: "Outro",
                    }[lead.source] ?? lead.source
                  ) : "-")}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-stone-500 dark:text-stone-400">Data captura</dt>
                <dd className="text-right font-medium text-stone-900 dark:text-stone-100">
                  {new Date(lead.created_at).toLocaleString("pt-BR", {
                    day: "2-digit", month: "2-digit", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </dd>
              </div>
            </dl>
          </div>

          {/* ── TAREFAS ─────────────────────────────────────────────────── */}
          <div className="px-5 py-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Tarefas
              </h3>
              {!isPerdido && !taskForm.open && (
                <button
                  onClick={() => dispatch({ type: "TASK_FORM_TOGGLE" })}
                  className="flex items-center gap-1 rounded-md bg-orange-50 px-2 py-1 text-xs font-medium text-orange-600 hover:bg-orange-100 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/20"
                >
                  <Plus className="h-3 w-3" /> Nova
                </button>
              )}
            </div>

            {/* Abas de filtro */}
            <div className="mb-3 flex gap-1 overflow-x-auto">
              {(
                [
                  { key: "todas", label: "A realizar", count: pendingTasks.length },
                  { key: "para-hoje", label: "Para hoje", count: paraHoje.length },
                  { key: "atrasadas", label: "Atrasadas", count: atrasadas.length },
                  { key: "futuras", label: "Futuras", count: futuras.length },
                ] as const
              ).map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => setTaskTab(key)}
                  className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    taskTab === key
                      ? key === "atrasadas" && count > 0
                        ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                        : "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300"
                      : "bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700"
                  }`}
                >
                  {label}{count > 0 && ` (${count})`}
                </button>
              ))}
            </div>

            {isPerdido && pendingTasks.length === 0 ? (
              <div className="rounded-lg bg-stone-100 px-3 py-2.5 text-center text-xs text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                Lead perdido — novas tarefas não podem ser criadas.
              </div>
            ) : (
              <>
                {taskForm.open && (
                  <div className="mb-3 rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-500/30 dark:bg-orange-500/10">
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Descrição da tarefa..."
                        value={taskForm.title}
                        onChange={e => dispatch({ type: "TASK_FORM_CHANGE", field: "title", value: e.target.value })}
                        className="w-full rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                        autoFocus
                        onKeyDown={e => { if (e.key === "Enter") handleAddTask(); if (e.key === "Escape") dispatch({ type: "TASK_FORM_TOGGLE" }) }}
                      />
                      <div className="flex gap-2">
                        <select
                          value={taskForm.action_type}
                          onChange={e => dispatch({ type: "TASK_FORM_CHANGE", field: "action_type", value: e.target.value })}
                          className="rounded-md border border-stone-200 bg-white px-2 py-1 text-xs dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                        >
                          {Object.entries(actionLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <input
                          type="datetime-local"
                          value={taskForm.due_at}
                          onChange={e => dispatch({ type: "TASK_FORM_CHANGE", field: "due_at", value: e.target.value })}
                          className="flex-1 rounded-md border border-stone-200 bg-white px-2 py-1 text-xs dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleAddTask}
                          disabled={taskSaving || !taskForm.title.trim()}
                          className="flex-1 rounded-md bg-orange-600 px-2 py-1 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                        >
                          {taskSaving ? "Salvando..." : "Salvar"}
                        </button>
                        <button
                          onClick={() => dispatch({ type: "TASK_FORM_TOGGLE" })}
                          className="rounded-md bg-stone-100 px-2 py-1 text-xs font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {tabTasks.length > 0 ? (
                  <div className="space-y-2">
                    {tabTasks.map(task => {
                      const isOverdue = task.due_at && new Date(task.due_at) < todayStart
                      return (
                        <div key={task.id} className={`flex items-start gap-3 rounded-lg p-2.5 ${
                          isOverdue ? "bg-red-50 dark:bg-red-500/10" : "bg-stone-50 dark:bg-stone-800/50"
                        }`}>
                          <button
                            onClick={() => handleToggleTask(task.id, false)}
                            aria-label="Marcar como concluída"
                            title="Concluir tarefa"
                            className="group mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-stone-300 transition-colors hover:border-emerald-500 hover:bg-emerald-50 dark:border-stone-600 dark:hover:border-emerald-400 dark:hover:bg-emerald-500/10"
                          >
                            <Check className="h-3.5 w-3.5 text-transparent transition-colors group-hover:text-emerald-500 dark:group-hover:text-emerald-400" />
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-stone-500 dark:text-stone-400">{actionIcons[task.action_type] ?? actionIcons.outro}</span>
                              <p className="text-sm text-stone-800 dark:text-stone-200">{task.title}</p>
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-xs">
                              {task.due_at && (
                                <span className={isOverdue ? "font-medium text-red-600 dark:text-red-400" : "text-stone-400 dark:text-stone-500"}>
                                  {isOverdue ? "Venceu " : ""}{fmtDate(task.due_at)}
                                </span>
                              )}
                              {task.assigned_to?.name && (
                                <span className="text-stone-400 dark:text-stone-500">· {task.assigned_to.name}</span>
                              )}
                              {task.source === "supremo" && (
                                <span className="text-[10px] text-stone-400">· Supremo</span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            aria-label="Deletar tarefa"
                            className="shrink-0 p-1 text-stone-300 hover:text-red-500 dark:text-stone-600 dark:hover:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ) : !taskForm.open && (
                  <p className="text-xs text-stone-400 dark:text-stone-500">Sem tarefas.</p>
                )}

                {doneTasks.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300">
                      {doneTasks.length} tarefa{doneTasks.length > 1 ? "s" : ""} concluída{doneTasks.length > 1 ? "s" : ""}
                    </summary>
                    <div className="mt-2 space-y-1">
                      {doneTasks.slice(0, 8).map(task => (
                        <div key={task.id} className="flex items-center gap-2 rounded px-2 py-1 opacity-60">
                          <button
                            onClick={() => handleToggleTask(task.id, true)}
                            aria-label="Reabrir tarefa"
                            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-500 text-white"
                          >
                            <Check className="h-2.5 w-2.5" />
                          </button>
                          <p className="flex-1 truncate text-xs line-through text-stone-500">{task.title}</p>
                          <span className="text-[10px] text-stone-400">{fmtDateShort(task.completed_at!)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </>
            )}
          </div>

          {/* ── HISTÓRICO DE CONTATOS ──────────────────────────────────── */}
          <div className="px-5 py-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Histórico de Contatos{history.length > 0 ? ` (${history.length})` : ""}
              </h3>
              {!isPerdido && (
                <button
                  onClick={() => dispatch({ type: "TOGGLE_QUICK_HISTORY" })}
                  className="flex items-center gap-1 rounded-md bg-orange-50 px-2 py-1 text-xs font-medium text-orange-600 hover:bg-orange-100 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/20"
                >
                  <History className="h-3 w-3" /> + Novo Histórico
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <p className="text-xs text-stone-400 dark:text-stone-500">Nenhum contato registrado.</p>
            ) : (
              <div className="space-y-2.5">
                {visibleHistory.map((item) => {
                  const meta = item.metadata as { acao?: string; situacao?: string; corretor?: { nome: string } }
                  const acaoLabel = actionLabels[meta.acao ?? ""] ?? meta.acao ?? "Contato"
                  const icon = actionIcons[meta.acao ?? "outro"] ?? actionIcons.outro
                  const isBrokerNote = item.type === "broker_note"
                  const isLost = item.type === "lead_lost"

                  return (
                    <div key={item.id} className="flex gap-2.5">
                      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${
                        isLost
                          ? "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300"
                          : isBrokerNote
                            ? "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300"
                            : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"
                      }`}>
                        {isLost ? <XCircle className="h-3.5 w-3.5" /> : icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                            {isLost ? "Perdido" : isBrokerNote ? "Nota" : acaoLabel}
                            {meta.corretor?.nome && (
                              <span className="ml-1 font-normal text-stone-400 dark:text-stone-500">
                                · {meta.corretor.nome.trim()}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-[10px] text-stone-400 dark:text-stone-500">{fmtDate(item.created_at)}</span>
                        </div>
                        <p className="mt-0.5 break-words text-sm text-stone-600 dark:text-stone-400">{item.description}</p>
                        {meta.situacao && (
                          <span className="mt-1 inline-block rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                            {meta.situacao}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
                {history.length > 8 && (
                  <button
                    onClick={() => dispatch({ type: "TOGGLE_HISTORY" })}
                    className="text-xs font-medium text-orange-600 hover:text-orange-700 dark:text-orange-300 dark:hover:text-orange-200"
                  >
                    {showAllHistory ? "Mostrar menos" : `Ver mais ${history.length - 8} contatos`}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── DETALHES (expansível) ─────────────────────────────────── */}
          <div className="px-5 py-4">
            <button
              onClick={() => dispatch({ type: "TOGGLE_DETAILS" })}
              className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
            >
              Detalhes do Lead
              <ChevronDown className={`h-4 w-4 transition-transform ${showDetails ? "rotate-180" : ""}`} />
            </button>
            {showDetails && (
              <dl className="mt-3 space-y-2 text-sm">
                {lead.channel && <div className="flex justify-between"><dt className="text-stone-500">Canal</dt><dd className="font-medium text-stone-900 dark:text-stone-100">{lead.channel}</dd></div>}
                {lead.preferred_bedrooms != null && <div className="flex justify-between"><dt className="text-stone-500">Quartos</dt><dd className="font-medium text-stone-900 dark:text-stone-100">{lead.preferred_bedrooms}</dd></div>}
                {lead.preferred_floor && <div className="flex justify-between"><dt className="text-stone-500">Andar</dt><dd className="font-medium text-stone-900 dark:text-stone-100">{lead.preferred_floor}</dd></div>}
                {lead.preferred_view && <div className="flex justify-between"><dt className="text-stone-500">Vista</dt><dd className="font-medium text-stone-900 dark:text-stone-100">{lead.preferred_view}</dd></div>}
                {lead.has_down_payment != null && <div className="flex justify-between"><dt className="text-stone-500">Tem entrada</dt><dd className="font-medium text-stone-900 dark:text-stone-100">{lead.has_down_payment ? "Sim" : "Não"}</dd></div>}
                {lead.ai_summary && (
                  <div className="border-t border-stone-100 pt-2 dark:border-stone-800">
                    <dt className="mb-1 text-xs text-stone-500">Resumo IA</dt>
                    <dd className="whitespace-pre-wrap text-sm text-stone-700 dark:text-stone-300">{lead.ai_summary}</dd>
                  </div>
                )}
                {messages.length > 0 && (
                  <div className="border-t border-stone-100 pt-2 dark:border-stone-800">
                    <dt className="mb-2 text-xs text-stone-500">Últimas mensagens</dt>
                    <div className="space-y-1.5">
                      {messages.slice(0, 3).map((msg) => (
                        <div key={msg.id} className={`rounded px-2 py-1.5 text-xs ${
                          msg.role === "user" ? "bg-stone-100 dark:bg-stone-800"
                          : msg.role === "broker" ? "bg-blue-50 dark:bg-blue-500/15"
                          : "bg-orange-50 dark:bg-orange-500/15"
                        }`}>
                          <span className="text-[10px] font-medium uppercase opacity-60">
                            {msg.role === "user" ? "Lead" : msg.role === "assistant" ? "IA" : msg.role === "broker" ? "Corretor" : msg.role}
                          </span>
                          <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="border-t border-stone-100 pt-2 text-[10px] text-stone-400 dark:border-stone-800 dark:text-stone-500">
                  <div>Criado: {new Date(lead.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}</div>
                  <div>Atualizado: {new Date(lead.updated_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              </dl>
            )}
          </div>

          {/* ── TRANSFERIR CORRETOR (admin/supervisor/gerente-comercial) ── */}
          <TransferBrokerSection leadId={leadId} supabase={supabase} />

          {/* Marcar como Perdido */}
          {!isPerdido && (
            <div className="px-5 py-4">
              <button
                onClick={handleMarkAsLost}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
              >
                <XCircle className="h-4 w-4" />
                Marcar como Perdido
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="p-5 text-sm text-stone-400 dark:text-stone-500">Lead não encontrado.</div>
      )}

      {/* QuickHistoryModal */}
      {lead && showQuickHistory && (
        <QuickHistoryModal
          leadId={leadId}
          orgId={lead.org_id}
          currentStageId={(lead.stage as { id: string } | null)?.id ?? null}
          currentInterestLevel={lead.interest_level}
          onClose={() => dispatch({ type: "TOGGLE_QUICK_HISTORY" })}
          onSaved={(note) => dispatch({ type: "NOTE_ADDED", note })}
        />
      )}
    </>
  )
}

// ── Transferir Corretor (admin / supervisor / gerente-comercial only) ─────────

type SupabaseClient = ReturnType<typeof createClient>

function TransferBrokerSection({ leadId, supabase }: { leadId: string; supabase: SupabaseClient }) {
  const [canTransfer, setCanTransfer] = useState(false)
  const [open, setOpen] = useState(false)
  const [brokers, setBrokers] = useState<{ id: string; name: string }[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const role = (data.user?.app_metadata?.role as string | undefined) ?? ""
      if (["admin", "supervisor", "gerente-comercial"].includes(role)) {
        setCanTransfer(true)
      }
    })
  }, [supabase])

  const fetchBrokers = useCallback(async () => {
    const { data } = await supabase
      .from("brokers")
      .select("user_id, users:user_id(id, name)")
      .eq("is_available", true)
    const list = (data ?? []).map((b) => {
      const u = Array.isArray(b.users) ? b.users[0] : b.users
      return { id: (u as { id: string })?.id ?? "", name: (u as { name: string })?.name ?? "" }
    }).filter(b => b.id)
    setBrokers(list)
  }, [supabase])

  function handleOpen() {
    setOpen(true)
    setDone(false)
    void fetchBrokers()
  }

  async function handleConfirm() {
    if (!selectedId) return
    setSaving(true)
    const res = await fetch(`/api/leads/${leadId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ broker_id: selectedId }),
    })
    setSaving(false)
    if (res.ok) { setDone(true); setOpen(false) }
  }

  if (!canTransfer) return null

  return (
    <div className="border-t border-stone-100 px-5 py-4 dark:border-stone-800">
      {!open ? (
        <button
          onClick={handleOpen}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
        >
          <UserCheck className="h-4 w-4" />
          {done ? "Corretor transferido ✓" : "Transferir Corretor"}
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Transferir para</p>
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
          >
            <option value="">Selecione o corretor</option>
            {brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <div className="flex gap-2">
            <button onClick={handleConfirm} disabled={saving || !selectedId}
              className="flex-1 rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50">
              {saving ? "Transferindo…" : "Confirmar"}
            </button>
            <button onClick={() => setOpen(false)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
