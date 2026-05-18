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
    utm_campaign?: string | null
  }
  propertyName?: string
  brokerName?: string
  onSelect?: (leadId: string) => void
}

type PropertyBadge = { label: string; bg: string; text: string; dot: string }
const PROPERTY_BADGE_UNKNOWN: PropertyBadge = {
  label: "—", bg: "bg-stone-50 dark:bg-stone-800", text: "text-stone-400 dark:text-stone-500", dot: "bg-stone-300 dark:bg-stone-600",
}
const PROPERTY_BADGE: Record<string, PropertyBadge> = {
  vind: { label: "Vind", bg: "bg-emerald-50 dark:bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-400" },
  yarden: { label: "Yarden", bg: "bg-blue-50 dark:bg-blue-500/15", text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-400" },
  both: { label: "Ambos", bg: "bg-violet-50 dark:bg-violet-500/15", text: "text-violet-700 dark:text-violet-300", dot: "bg-violet-400" },
  unknown: PROPERTY_BADGE_UNKNOWN,
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
    touchAction: 'none' as const,
  }

  const score = lead.qualification_score ?? 0
  const scoreColor =
    score >= 70 ? "text-emerald-600 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/15" :
    score >= 40 ? "text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-500/15" :
    "text-stone-400 bg-stone-50 dark:text-stone-400 dark:bg-stone-800"

  const daysSinceContact = getDaysSinceContact(lead.updated_at)
  const needsFollowUp = daysSinceContact > 2
  const isUrgent = daysSinceContact > 4

  const alertBorderClass = isUrgent
    ? "border-red-400 dark:border-red-500/50"
    : needsFollowUp
    ? "border-orange-400 dark:border-orange-500/50"
    : "border-stone-200 dark:border-stone-800"

  const timeAgo = getTimeAgo(lead.updated_at)
  const filledCount = getMandatoryFieldsFilled(lead)
  const totalMandatory = MANDATORY_FIELDS.length
  const fillPercent = Math.round((filledCount / totalMandatory) * 100)

  const interestKey = propertyName?.toLowerCase().includes("vind") ? "vind" :
    propertyName?.toLowerCase().includes("yarden") ? "yarden" : "unknown"
  const badge = PROPERTY_BADGE[interestKey] ?? PROPERTY_BADGE_UNKNOWN

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
      className={`group cursor-grab rounded-xl border bg-white p-3 transition-all hover:shadow-md active:cursor-grabbing dark:bg-stone-900 ${alertBorderClass} ${needsFollowUp ? "border-2" : ""} ${!needsFollowUp ? "hover:border-stone-300 dark:hover:border-stone-700" : ""}`}
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
            <p className="truncate text-[13px] font-semibold text-stone-900 dark:text-stone-100">
              {lead.name || lead.phone}
            </p>
            {lead.name && (
              <p className="truncate text-[11px] text-stone-400 dark:text-stone-500">{lead.phone}</p>
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
          {lead.source === "whatsapp_click_to_ad" && lead.utm_campaign && (
            <span className="inline-flex items-center rounded-md bg-green-50 px-1.5 py-0.5 text-[9px] font-medium text-green-600 dark:bg-green-500/15 dark:text-green-300">
              {lead.utm_campaign.length > 16 ? lead.utm_campaign.slice(0, 16) + "…" : lead.utm_campaign}
            </span>
          )}
          <div className="flex flex-1 items-center gap-1.5">
            <div className="h-1 flex-1 rounded-full bg-stone-100 dark:bg-stone-700">
              <div
                className="h-1 rounded-full bg-orange-400 transition-all"
                style={{ width: `${fillPercent}%` }}
              />
            </div>
            <span className="text-[9px] tabular-nums text-stone-300 dark:text-stone-500">
              {filledCount}/{totalMandatory}
            </span>
          </div>
        </div>

        {/* AI Summary Preview */}
        {summaryPreview && (
          <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
            {summaryPreview}
          </p>
        )}

        {/* Follow-up Alert Badge */}
        {needsFollowUp && (
          <div className="mt-2 flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                isUrgent
                  ? "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300"
                  : "bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300"
              }`}
            >
              {daysSinceContact}d sem contato
            </span>
            <span className="text-[10px] text-stone-400 dark:text-stone-500">
              {lead.assigned_broker_id ? "Corretor" : "Nicole"}
            </span>
          </div>
        )}

        {/* Footer: Broker + Time */}
        <div className="mt-2.5 flex items-center justify-between">
          {initials ? (
            <div className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-[9px] font-bold text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                {initials}
              </span>
              <span className="text-[10px] text-stone-400 dark:text-stone-500">{brokerName?.split(" ")[0]}</span>
            </div>
          ) : (
            <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-400 dark:bg-red-500/15 dark:text-red-300">
              Sem corretor
            </span>
          )}
          <span className="text-[10px] tabular-nums text-stone-300 dark:text-stone-600">{timeAgo}</span>
        </div>
      </div>
    </div>
  )
}

