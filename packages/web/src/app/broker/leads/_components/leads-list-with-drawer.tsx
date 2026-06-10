"use client"

import { useState } from "react"
import Link from "next/link"
import { Pencil } from "lucide-react"
import { LeadDetailDrawer } from "@web/components/leads/lead-detail-drawer"

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
  kanban_stages: { name: string; color: string | null } | { name: string; color: string | null }[] | null
  properties: { name: string } | { name: string }[] | null
}

interface Props {
  leads: Lead[]
  stages: Stage[]
  properties: Property[]
}

export function LeadsListWithDrawer({ leads }: Props) {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)

  function getStage(lead: Lead) {
    return Array.isArray(lead.kanban_stages) ? lead.kanban_stages[0] : lead.kanban_stages
  }
  function getProperty(lead: Lead) {
    return Array.isArray(lead.properties) ? lead.properties[0] : lead.properties
  }

  return (
    <>
      {/* Mobile */}
      <div className="space-y-2 lg:hidden">
        {leads.map((lead) => {
          const stageData = getStage(lead)
          const propertyData = getProperty(lead)
          return (
            <div key={lead.id} className="flex items-center gap-2">
              <Link
                href={`/broker/leads/${lead.id}`}
                className="flex flex-1 items-center gap-3 rounded-xl bg-white px-4 py-3.5 ring-1 ring-gray-200 active:bg-gray-50 dark:bg-stone-900 dark:ring-stone-800 dark:active:bg-stone-800"
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
                  <p className="text-[11px] text-stone-600">
                    {new Date(lead.updated_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </Link>
              <button
                onClick={() => setSelectedLeadId(lead.id)}
                aria-label="Atender lead"
                className="shrink-0 rounded-xl bg-orange-50 p-3 text-orange-500 ring-1 ring-orange-200 hover:bg-orange-100 dark:bg-orange-500/10 dark:ring-orange-500/30 dark:hover:bg-orange-500/20"
              >
                <Pencil className="h-4 w-4" />
              </button>
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
            {leads.map((lead) => {
              const stageData = getStage(lead)
              const propertyData = getProperty(lead)
              const score = lead.qualification_score
              return (
                <tr key={lead.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-stone-800/40">
                  <td className="px-4 py-3">
                    <Link href={`/broker/leads/${lead.id}`} className="block">
                      <p className="font-medium text-gray-900 dark:text-stone-100">
                        {lead.name || lead.phone}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-stone-500">{lead.phone}</p>
                    </Link>
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
                    <button
                      onClick={() => setSelectedLeadId(lead.id)}
                      aria-label="Atender lead"
                      className="rounded-lg p-1.5 text-stone-400 hover:bg-orange-50 hover:text-orange-500 transition-colors dark:text-stone-600 dark:hover:bg-orange-500/10 dark:hover:text-orange-400"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
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
