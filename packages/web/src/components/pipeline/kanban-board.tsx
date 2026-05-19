"use client"

import { useState, useCallback, useMemo } from "react"
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core"
import { KanbanColumn, EMPTY_COLUMN_PREFIX } from "./kanban-column"
import { LeadCard } from "./lead-card"
import { LeadDetailDrawer } from "@web/components/leads/lead-detail-drawer"
import { SourceBadge } from "@web/components/ui/source-badge"
import { createClient } from "@web/lib/supabase/client"

interface Stage {
  id: string
  name: string
  slug: string
  color: string
  position: number
}

interface Lead {
  id: string
  name: string | null
  phone: string
  stage_id: string | null
  qualification_score: number | null
  interest_level: string | null
  property_interest_id: string | null
  assigned_broker_id: string | null
  created_at: string
  updated_at: string
  ai_summary?: string | null
  source?: string | null
  utm_campaign?: string | null
  properties?: { name: string } | null
  users?: { name: string } | null
}

export interface InitialStageState {
  stage_id: string
  leads: Lead[]
  totalCount: number
  hasMore: boolean
}

export interface PipelineFilters {
  property_id: string | null
  broker_id: string | null
  campaign_id: string | null
  score: string | null
}

interface KanbanBoardProps {
  initialStages: Stage[]
  initialLeadsPerStage: InitialStageState[]
  activeFilters?: PipelineFilters
}

interface StageState {
  leads: Lead[]
  totalCount: number
  hasMore: boolean
  loading: boolean
}

const PAGE_SIZE = 50

function buildInitialStageMap(initialLeadsPerStage: InitialStageState[]): Map<string, StageState> {
  const map = new Map<string, StageState>()
  for (const entry of initialLeadsPerStage) {
    map.set(entry.stage_id, {
      leads: entry.leads,
      totalCount: entry.totalCount,
      hasMore: entry.hasMore,
      loading: false,
    })
  }
  return map
}

export function KanbanBoard({
  initialStages,
  initialLeadsPerStage,
  activeFilters,
}: KanbanBoardProps) {
  const [stageMap, setStageMap] = useState<Map<string, StageState>>(() =>
    buildInitialStageMap(initialLeadsPerStage)
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [showSourceFilter, setShowSourceFilter] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // Flatten all loaded leads across stages for source filter aggregation.
  const allLeads = useMemo(() => {
    const out: Lead[] = []
    for (const state of stageMap.values()) {
      for (const lead of state.leads) {
        out.push(lead)
      }
    }
    return out
  }, [stageMap])

  // Compute unique sources with counts from current leads
  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const lead of allLeads) {
      const s = lead.source ?? "other"
      counts[s] = (counts[s] ?? 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [allLeads])

  const matchesSourceFilter = useCallback(
    (lead: Lead) => {
      if (selectedSources.length === 0) return true
      return selectedSources.includes(lead.source ?? "other")
    },
    [selectedSources]
  )

  const activeLead = useMemo(() => {
    if (!activeId) return null
    for (const state of stageMap.values()) {
      const found = state.leads.find((l) => l.id === activeId)
      if (found && matchesSourceFilter(found)) return found
    }
    return null
  }, [activeId, stageMap, matchesSourceFilter])

  const toggleSource = useCallback((source: string) => {
    setSelectedSources((prev) =>
      prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]
    )
  }, [])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveId(null)
      const { active, over } = event

      if (!over) return

      const leadId = active.id as string
      let newStageId = over.id as string

      // Resolve over.id para um stage ID. Pode ser:
      // 1. Stage ID direto (dropped na área da coluna, inclusive colunas vazias)
      // 2. Lead ID (dropped em cima de outro card) → busca qual stage contém esse lead
      if (newStageId.startsWith(EMPTY_COLUMN_PREFIX)) {
        newStageId = newStageId.slice(EMPTY_COLUMN_PREFIX.length)
      }

      let targetStage = initialStages.find((s) => s.id === newStageId)
      if (!targetStage) {
        for (const [stageId, state] of stageMap.entries()) {
          if (state.leads.some((l) => l.id === newStageId)) {
            newStageId = stageId
            targetStage = initialStages.find((s) => s.id === stageId)
            break
          }
        }
      }
      if (!targetStage) return

      // Locate the lead and its current stage.
      let movedLead: Lead | null = null
      let sourceStageId: string | null = null
      for (const [stageId, state] of stageMap.entries()) {
        const found = state.leads.find((l) => l.id === leadId)
        if (found) {
          movedLead = found
          sourceStageId = stageId
          break
        }
      }

      if (!movedLead || !sourceStageId) return
      if (sourceStageId === newStageId) return

      const previousStageId = movedLead.stage_id ?? sourceStageId
      const updatedLead: Lead = { ...movedLead, stage_id: newStageId }

      // Optimistic update on the Map state.
      setStageMap((prev) => {
        const next = new Map(prev)
        const src = next.get(sourceStageId!)
        if (src) {
          next.set(sourceStageId!, {
            ...src,
            leads: src.leads.filter((l) => l.id !== leadId),
            totalCount: Math.max(0, src.totalCount - 1),
          })
        }
        const dst = next.get(newStageId) ?? {
          leads: [],
          totalCount: 0,
          hasMore: false,
          loading: false,
        }
        next.set(newStageId, {
          ...dst,
          leads: [updatedLead, ...dst.leads],
          totalCount: dst.totalCount + 1,
        })
        return next
      })

      const supabase = createClient()
      const { error } = await supabase
        .from("leads")
        .update({ stage_id: newStageId })
        .eq("id", leadId)

      if (error) {
        // Rollback on failure.
        setStageMap((prev) => {
          const next = new Map(prev)
          const dst = next.get(newStageId)
          if (dst) {
            next.set(newStageId, {
              ...dst,
              leads: dst.leads.filter((l) => l.id !== leadId),
              totalCount: Math.max(0, dst.totalCount - 1),
            })
          }
          const src = next.get(sourceStageId!) ?? {
            leads: [],
            totalCount: 0,
            hasMore: false,
            loading: false,
          }
          next.set(sourceStageId!, {
            ...src,
            leads: [{ ...movedLead!, stage_id: previousStageId }, ...src.leads],
            totalCount: src.totalCount + 1,
          })
          return next
        })
        return
      }

      await supabase.from("activities").insert({
        lead_id: leadId,
        type: "stage_change",
        description: `Lead movido para ${targetStage.name}`,
        metadata: {
          from_stage_id: previousStageId,
          to_stage_id: newStageId,
        },
      })
    },
    [stageMap, initialStages]
  )

  const handleLoadMore = useCallback(
    async (stageId: string) => {
      const current = stageMap.get(stageId)
      if (!current || !current.hasMore || current.loading) return

      setStageMap((prev) => {
        const next = new Map(prev)
        const state = next.get(stageId)
        if (state) {
          next.set(stageId, { ...state, loading: true })
        }
        return next
      })

      try {
        const params = new URLSearchParams()
        params.set("stage_id", stageId)
        params.set("offset", String(current.leads.length))
        params.set("limit", String(PAGE_SIZE))
        if (activeFilters?.property_id) params.set("property_id", activeFilters.property_id)
        if (activeFilters?.broker_id) params.set("broker_id", activeFilters.broker_id)
        if (activeFilters?.campaign_id) params.set("campaign_id", activeFilters.campaign_id)
        if (activeFilters?.score) params.set("score", activeFilters.score)

        const res = await fetch(`/api/pipeline/leads?${params.toString()}`)
        if (!res.ok) {
          throw new Error(`Load more failed: ${res.status}`)
        }
        const json = (await res.json()) as {
          leads: Lead[]
          totalCount: number
          hasMore: boolean
        }

        setStageMap((prev) => {
          const next = new Map(prev)
          const state = next.get(stageId)
          if (!state) return prev
          // Avoid appending leads that drag/drop already inserted locally.
          const existingIds = new Set(state.leads.map((l) => l.id))
          const fresh = (json.leads ?? []).filter((l) => !existingIds.has(l.id))
          next.set(stageId, {
            leads: [...state.leads, ...fresh],
            totalCount: json.totalCount ?? state.totalCount,
            hasMore: Boolean(json.hasMore),
            loading: false,
          })
          return next
        })
      } catch (err) {
        console.error("[KanbanBoard] load more error:", err)
        setStageMap((prev) => {
          const next = new Map(prev)
          const state = next.get(stageId)
          if (state) {
            next.set(stageId, { ...state, loading: false })
          }
          return next
        })
      }
    },
    [stageMap, activeFilters]
  )

  return (
    <>
      {/* Source filter bar */}
      {sourceCounts.length > 0 && (
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowSourceFilter((v) => !v)}
            className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50 transition-colors dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Origem {selectedSources.length > 0 && `(${selectedSources.length})`}
          </button>

          {showSourceFilter && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {selectedSources.length > 0 && (
                <button
                  onClick={() => setSelectedSources([])}
                  className="rounded-md bg-stone-100 px-2 py-1 text-xs text-stone-500 hover:bg-stone-200 transition-colors dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700"
                >
                  Todos
                </button>
              )}
              {sourceCounts.map(([source, count]) => {
                const active = selectedSources.includes(source)
                return (
                  <button
                    key={source}
                    onClick={() => toggleSource(source)}
                    className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
                      active
                        ? "border-orange-300 bg-orange-50 dark:border-orange-500/40 dark:bg-orange-500/15"
                        : "border-stone-200 bg-white hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800"
                    }`}
                  >
                    <SourceBadge source={source === "other" ? null : source} size="xs" />
                    <span className="text-stone-400 dark:text-stone-500">({count})</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {initialStages.map((stage) => {
            const state = stageMap.get(stage.id)
            const stageLeads = state?.leads ?? []
            const visibleLeads = stageLeads.filter(matchesSourceFilter)
            return (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                leads={visibleLeads}
                totalCount={state?.totalCount ?? visibleLeads.length}
                hasMore={state?.hasMore ?? false}
                loading={state?.loading ?? false}
                onLoadMore={() => handleLoadMore(stage.id)}
                onSelectLead={setSelectedLeadId}
              />
            )
          })}
        </div>

        <DragOverlay>
          {activeLead && (
            <LeadCard
              lead={activeLead}
              propertyName={activeLead.properties?.name}
              brokerName={activeLead.users?.name}
            />
          )}
        </DragOverlay>

        <LeadDetailDrawer
          leadId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
        />
      </DndContext>
    </>
  )
}
