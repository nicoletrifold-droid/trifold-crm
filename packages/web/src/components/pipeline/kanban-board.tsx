"use client"

import { useState, useCallback, useMemo } from "react"
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core"
import { KanbanColumn } from "./kanban-column"
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
  properties?: { name: string } | null
  users?: { name: string } | null
}

interface KanbanBoardProps {
  initialStages: Stage[]
  initialLeads: Lead[]
}

export function KanbanBoard({ initialStages, initialLeads }: KanbanBoardProps) {
  const [leads, setLeads] = useState(initialLeads)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [showSourceFilter, setShowSourceFilter] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // Compute unique sources with counts from current leads
  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const lead of leads) {
      const s = lead.source ?? "other"
      counts[s] = (counts[s] ?? 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [leads])

  const filteredLeads = useMemo(() => {
    if (selectedSources.length === 0) return leads
    return leads.filter((l) => selectedSources.includes(l.source ?? "other"))
  }, [leads, selectedSources])

  const activeLead = activeId ? filteredLeads.find((l) => l.id === activeId) : null

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
      const newStageId = over.id as string

      const targetStage = initialStages.find((s) => s.id === newStageId)
      if (!targetStage) return

      const lead = leads.find((l) => l.id === leadId)
      if (!lead || lead.stage_id === newStageId) return

      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId ? { ...l, stage_id: newStageId } : l
        )
      )

      const supabase = createClient()
      const { error } = await supabase
        .from("leads")
        .update({ stage_id: newStageId })
        .eq("id", leadId)

      if (error) {
        setLeads((prev) =>
          prev.map((l) =>
            l.id === leadId ? { ...l, stage_id: lead.stage_id } : l
          )
        )
      } else {
        await supabase.from("activities").insert({
          org_id: lead.assigned_broker_id ? undefined : undefined,
          lead_id: leadId,
          type: "stage_change",
          description: `Lead movido para ${targetStage.name}`,
          metadata: {
            from_stage_id: lead.stage_id,
            to_stage_id: newStageId,
          },
        })
      }
    },
    [leads, initialStages]
  )

  return (
    <>
      {/* Source filter bar */}
      {sourceCounts.length > 0 && (
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowSourceFilter((v) => !v)}
            className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50 transition-colors"
          >
            Origem {selectedSources.length > 0 && `(${selectedSources.length})`}
          </button>

          {showSourceFilter && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {selectedSources.length > 0 && (
                <button
                  onClick={() => setSelectedSources([])}
                  className="rounded-md bg-stone-100 px-2 py-1 text-xs text-stone-500 hover:bg-stone-200 transition-colors"
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
                        ? "border-orange-300 bg-orange-50"
                        : "border-stone-200 bg-white hover:bg-stone-50"
                    }`}
                  >
                    <SourceBadge source={source === "other" ? null : source} size="xs" />
                    <span className="text-stone-400">({count})</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {initialStages.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              leads={filteredLeads.filter((l) => l.stage_id === stage.id)}
              onSelectLead={setSelectedLeadId}
            />
          ))}
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
