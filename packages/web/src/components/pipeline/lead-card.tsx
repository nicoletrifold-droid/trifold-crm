"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { MANDATORY_FIELDS } from "@trifold/shared"
import { getDaysSinceContact, getTimeAgo } from "@web/lib/time"
import { SourceBadge } from "@web/components/ui/source-badge"

interface LeadCardProps {
  lead: {
    id: string
    name: string | null
    phone: string
    qualification_score: number | null
    interest_level: string | null
    property_interest_id: string | null
    assigned_broker_id: string | null
    created_at: string
    updated_at: string
    ai_summary?: string | null
    source?: string | null
  }
  propertyName?: string
  brokerName?: string
  onSelect?: (leadId: string) => void
}

const PROPERTY_BADGE: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  vind: { label: "Vind", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-400" },
  yarden: { label: "Yarden", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-400" },
  both: { label: "Ambos", bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-400" },
  unknown: { label: "—", bg: "bg-stone-50", text: "text-stone-400", dot: "bg-stone-300" },
}

function getMandatoryFieldsFilled(lead: LeadCardProps["lead"]): number {
  let filled = 0
  for (const field of MANDATORY_FIELDS) {
    const value = (lead as Record<string, unknown>)[field.key]
    if (value !== null && value !== undefined && value !== "") filled++
  }
  return filled
}

export function LeadCard({ lead, propertyName, brokerName, onSelect }: LeadCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const score = lead.qualification_score ?? 0
  const scoreColor =
    score >= 70 ? "text-emerald-600 bg-emerald-50" :
    score >= 40 ? "text-amber-600 bg-amber-50" :
    "text-stone-400 bg-stone-50"

  const daysSinceContact = getDaysSinceContact(lead.updated_at)
  const needsFollowUp = daysSinceContact > 2
  const isUrgent = daysSinceContact > 4

  const alertBorderClass = isUrgent
    ? "border-red-400"
    : needsFollowUp
    ? "border-orange-400"
    : "border-stone-200"

  const timeAgo = getTimeAgo(lead.updated_at)
  const filledCount = getMandatoryFieldsFilled(lead)
  const totalMandatory = MANDATORY_FIELDS.length
  const fillPercent = Math.round((filledCount / totalMandatory) * 100)

  const interestKey = propertyName?.toLowerCase().includes("vind") ? "vind" :
    propertyName?.toLowerCase().includes("yarden") ? "yarden" : "unknown"
  const badge = PROPERTY_BADGE[interestKey]

  const summaryPreview = lead.ai_summary
    ? lead.ai_summary.length > 80 ? lead.ai_summary.slice(0, 80) + "..." : lead.ai_summary
    : null

  const initials = brokerName
    ? brokerName.split(" ").map((n) => n[0]).join("").slice(0, 2)
    : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group cursor-grab rounded-xl border bg-white p-3 transition-all hover:shadow-md active:cursor-grabbing ${alertBorderClass} ${needsFollowUp ? "border-2" : ""} ${!needsFollowUp ? "hover:border-stone-300" : ""}`}
    >
      <div
        onClick={(e) => {
          // Only trigger if not dragging (no significant pointer movement)
          if (onSelect && !isDragging) {
            e.preventDefault()
            onSelect(lead.id)
          }
        }}
        className="block"
      >
        {/* Header: Name + Score */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-stone-900">
              {lead.name || lead.phone}
            </p>
            {lead.name && (
              <p className="truncate text-[11px] text-stone-400">{lead.phone}</p>
            )}
          </div>
          {score > 0 && (
            <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${scoreColor}`}>
              {score}
            </span>
          )}
        </div>

        {/* Property Badge + Source Badge + Progress */}
        <div className="mt-2 flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${badge.bg} ${badge.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
            {badge.label}
          </span>
          {lead.source && <SourceBadge source={lead.source} size="xs" />}
          <div className="flex flex-1 items-center gap-1.5">
            <div className="h-1 flex-1 rounded-full bg-stone-100">
              <div
                className="h-1 rounded-full bg-orange-400 transition-all"
                style={{ width: `${fillPercent}%` }}
              />
            </div>
            <span className="text-[9px] tabular-nums text-stone-300">
              {filledCount}/{totalMandatory}
            </span>
          </div>
        </div>

        {/* AI Summary Preview */}
        {summaryPreview && (
          <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-stone-500">
            {summaryPreview}
          </p>
        )}

        {/* Follow-up Alert Badge */}
        {needsFollowUp && (
          <div className="mt-2 flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                isUrgent
                  ? "bg-red-50 text-red-600"
                  : "bg-orange-50 text-orange-600"
              }`}
            >
              {daysSinceContact}d sem contato
            </span>
            <span className="text-[10px] text-stone-400">
              {lead.assigned_broker_id ? "Corretor" : "Nicole"}
            </span>
          </div>
        )}

        {/* Footer: Broker + Time */}
        <div className="mt-2.5 flex items-center justify-between">
          {initials ? (
            <div className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-[9px] font-bold text-orange-700">
                {initials}
              </span>
              <span className="text-[10px] text-stone-400">{brokerName?.split(" ")[0]}</span>
            </div>
          ) : (
            <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
              Sem corretor
            </span>
          )}
          <span className="text-[10px] tabular-nums text-stone-300">{timeAgo}</span>
        </div>
      </div>
    </div>
  )
}

