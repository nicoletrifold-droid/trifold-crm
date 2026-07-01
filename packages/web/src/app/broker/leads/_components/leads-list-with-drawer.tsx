"use client"

import { useState } from "react"
import Link from "next/link"
import { MessageCircle, Clock } from "lucide-react"
import { LeadDetailDrawer } from "@web/components/leads/lead-detail-drawer"
import { WaitingBadge } from "@web/components/leads/waiting-badge"
import { getWindowStatus, type WindowStatusKind } from "@web/lib/broker/window-status"
import { sortByWindowUrgency } from "@web/lib/broker/leads-window"

interface Stage { id: string; name: string; color: string | null }
interface Property { id: string; name: string }

interface Lead {
  id: string
  name: string | null
  phone: string
  email: string | null
  qualification_score: number | null
  stage_id: string | null
  property_interest_id: string | null
  updated_at: string
  /** Story 63-9 — `last_message_at` da conversa mais recente (badge de janela). */
  last_message_at: string | null
  kanban_stages: { name: string; color: string | null } | { name: string; color: string | null }[] | null
  properties: { name: string } | { name: string }[] | null
  /** Story 75-49 — minutos de expediente aguardando atendimento (só p/ leads em "Aguardando"). */
  waitingMinutes?: number | null
}

/** Story 63-9 — estilo do badge compacto de janela de 24h por status. */
const WINDOW_BADGE: Record<WindowStatusKind, { dot: string; label: string; text: string }> = {
  open: {
    dot: "bg-green-500",
    label: "Aberta",
    text: "text-green-700 dark:text-green-400",
  },
  closing: {
    dot: "bg-amber-500",
    label: "Fechando",
    text: "text-amber-700 dark:text-amber-400",
  },
  closed: {
    dot: "bg-stone-400",
    label: "Fechada",
    text: "text-stone-500 dark:text-stone-400",
  },
}

/**
 * Story 63-9 — badge compacto de status da janela de 24h para o card mobile.
 * Leads Telegram (`tg:`) não exibem badge (AC2). Reutiliza `getWindowStatus` (63-4).
 */
function LeadWindowBadge({ lead }: { lead: Lead }) {
  const isWhatsApp = !lead.phone.startsWith("tg:")
  if (!isWhatsApp) return null

  const lastAt = lead.last_message_at ? new Date(lead.last_message_at) : null
  const { status } = getWindowStatus(lastAt, isWhatsApp)
  const style = WINDOW_BADGE[status]

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {style.label}
    </span>
  )
}

interface Props {
  leads: Lead[]
  stages: Stage[]
  properties: Property[]
}

export function LeadsListWithDrawer({ leads }: Props) {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  // Story 63-9 (AC4) — ordenação "Janela fechando primeiro" (client-side).
  const [sortByWindow, setSortByWindow] = useState(false)

  function getStage(lead: Lead) {
    return Array.isArray(lead.kanban_stages) ? lead.kanban_stages[0] : lead.kanban_stages
  }
  function getProperty(lead: Lead) {
    return Array.isArray(lead.properties) ? lead.properties[0] : lead.properties
  }

  const displayedLeads = sortByWindow ? sortByWindowUrgency(leads) : leads

  return (
    <>
      {/* Story 63-9 (AC4) — toggle de ordenação por urgência de janela */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setSortByWindow((v) => !v)}
          aria-pressed={sortByWindow}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium ring-1 transition-colors ${
            sortByWindow
              ? "bg-orange-500 text-white ring-orange-500"
              : "bg-white text-stone-600 ring-gray-200 hover:bg-gray-50 dark:bg-stone-900 dark:text-stone-300 dark:ring-stone-800 dark:hover:bg-stone-800"
          }`}
        >
          <Clock className="h-4 w-4" />
          Janela fechando primeiro
        </button>
      </div>

      {/* Mobile */}
      <div className="space-y-2 lg:hidden">
        {displayedLeads.map((lead) => {
          const stageData = getStage(lead)
          const propertyData = getProperty(lead)
          return (
            <div key={lead.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedLeadId(lead.id)}
                className="flex flex-1 items-center gap-3 rounded-xl bg-white px-4 py-3.5 text-left ring-1 ring-gray-200 active:bg-gray-50 dark:bg-stone-900 dark:ring-stone-800 dark:active:bg-stone-800"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-gray-900 dark:text-stone-100">
                    {lead.name || lead.phone}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-stone-500">{lead.phone}</p>
                  {(propertyData as { name?: string } | null)?.name && (
                    <p className="mt-0.5 truncate text-xs text-stone-600">
                      {(propertyData as { name: string }).name}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  {stageData && (
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
                      style={{
                        backgroundColor: `${(stageData as { color: string }).color}20`,
                        color: (stageData as { color: string }).color,
                      }}
                    >
                      {(stageData as { name: string }).name}
                    </span>
                  )}
                  <LeadWindowBadge lead={lead} />
                  <WaitingBadge minutes={lead.waitingMinutes} />
                  <p className="text-[11px] text-stone-600">
                    {new Date(lead.updated_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </button>
              <Link
                href={`/broker/leads/${lead.id}`}
                aria-label="Abrir conversa"
                className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl bg-orange-50 p-3 text-orange-500 ring-1 ring-orange-200 hover:bg-orange-100 dark:bg-orange-500/10 dark:ring-orange-500/30 dark:hover:bg-orange-500/20"
              >
                <MessageCircle className="h-5 w-5" />
              </Link>
            </div>
          )
        })}
      </div>

      {/* Desktop */}
      <div className="hidden overflow-x-auto rounded-xl bg-white ring-1 ring-gray-200 dark:bg-stone-900 dark:ring-stone-800 lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-stone-800 dark:text-stone-500">
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">Empreendimento</th>
              <th className="px-4 py-3">Etapa</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Último contato</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-stone-800/60">
            {displayedLeads.map((lead) => {
              const stageData = getStage(lead)
              const propertyData = getProperty(lead)
              const score = lead.qualification_score
              return (
                <tr key={lead.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-stone-800/40">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedLeadId(lead.id)}
                      className="block w-full text-left"
                    >
                      <p className="font-medium text-gray-900 dark:text-stone-100">
                        {lead.name || lead.phone}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-stone-500">{lead.phone}</p>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-stone-400">
                    {(propertyData as { name?: string } | null)?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {stageData ? (
                      <span
                        className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: `${(stageData as { color: string }).color}20`,
                          color: (stageData as { color: string }).color,
                        }}
                      >
                        {(stageData as { name: string }).name}
                      </span>
                    ) : "—"}
                    {lead.waitingMinutes != null && (
                      <div className="mt-1"><WaitingBadge minutes={lead.waitingMinutes} /></div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {score != null ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        score >= 70
                          ? "bg-green-500/20 text-green-400"
                          : score >= 40
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-gray-200 text-gray-600 dark:bg-stone-700 dark:text-stone-400"
                      }`}>
                        {score}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-stone-500">
                    {new Date(lead.updated_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/broker/leads/${lead.id}`}
                      aria-label="Abrir conversa"
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-1.5 text-stone-400 hover:bg-orange-50 hover:text-orange-500 transition-colors dark:text-stone-600 dark:hover:bg-orange-500/10 dark:hover:text-orange-400"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <LeadDetailDrawer
        leadId={selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
      />
    </>
  )
}
