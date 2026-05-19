"use client"

import { useDroppable } from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { LeadCard } from "./lead-card"

export const EMPTY_COLUMN_PREFIX = "__empty__"

interface KanbanColumnProps {
  stage: {
    id: string
    name: string
    color: string
  }
  leads: Array<{
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
    properties?: { name: string } | null
    users?: { name: string } | null
  }>
  totalCount?: number
  hasMore?: boolean
  loading?: boolean
  onLoadMore?: () => void
  onSelectLead?: (leadId: string) => void
}

export function KanbanColumn({
  stage,
  leads,
  totalCount,
  hasMore = false,
  loading = false,
  onLoadMore,
  onSelectLead,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  const showTotal = typeof totalCount === "number" && totalCount > leads.length

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 flex-shrink-0 flex-col rounded-lg bg-gray-100 dark:bg-stone-800/50 ${
        isOver ? "ring-2 ring-orange-400" : ""
      }`}
    >
      <div
        className="flex items-center justify-between rounded-t-lg px-3 py-2"
        style={{ borderTop: `3px solid ${stage.color}` }}
      >
        <h3 className="text-sm font-semibold text-gray-700 dark:text-stone-200">{stage.name}</h3>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{
            backgroundColor: `${stage.color}20`,
            color: stage.color,
          }}
          title={showTotal ? `${leads.length} de ${totalCount}` : undefined}
        >
          {showTotal ? `${leads.length}/${totalCount}` : leads.length}
        </span>
      </div>

      <div
        className="flex flex-1 flex-col gap-2 overflow-y-auto p-2"
        style={{ minHeight: "100px" }}
      >
        <SortableContext
          items={leads.map((l) => l.id)}
          strategy={verticalListSortingStrategy}
        >
          {leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              propertyName={lead.properties?.name}
              brokerName={lead.users?.name}
              onSelect={onSelectLead}
            />
          ))}
          {leads.length === 0 && (
            <div
              className="flex flex-1 items-center justify-center py-8"
              style={{ minHeight: "120px" }}
            >
              <p className="text-xs text-gray-400 dark:text-stone-500">Nenhum lead nesta etapa</p>
            </div>
          )}
        </SortableContext>

        {hasMore && onLoadMore && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            {loading ? "Carregando..." : "Carregar mais 50"}
          </button>
        )}
      </div>
    </div>
  )
}
