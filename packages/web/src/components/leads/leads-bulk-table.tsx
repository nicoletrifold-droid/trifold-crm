"use client"

import { useState, useTransition } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MessageCircle } from "lucide-react"
import { SourceBadge } from "@web/components/ui/source-badge"
import { QualificacaoComercialBadge } from "@web/components/ui/qualificacao-comercial-badge"
import { whatsAppState } from "@web/lib/leads/whatsapp"
import { CALOR_LABELS, type CalorValue } from "@web/lib/leads/calor"
import { ReativarLeadButton } from "@web/components/leads/reativar-lead-button"
import { LOST_REASON_GROUPS } from "@web/lib/constants"

// Story 75-237 — cores do selinho de Calor (mesma família dos outros badges da
// tabela; "Não definido" não vira badge, pra não poluir a coluna).
const CALOR_BADGE: Record<string, string> = {
  hot: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  warm: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  cold: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
}

type Lead = {
  id: string
  name: string | null
  phone: string
  qualification_score: number | null
  /** Story 75-237 — Calor do Lead (percepção do corretor): cold|warm|hot|null. */
  interest_level?: string | null
  /** Story 84-6 (Epic 84) — Qualificação Comercial (manual): bom|regular|ruim|invalido|null. */
  qualificacao_comercial?: string | null
  updated_at: string | null
  source: string | null
  /** Story 75-160 — comprovado por conversa/canal de WhatsApp (vence o formato do número). */
  hasWhatsappConversation?: boolean
  stage: { id: string; name: string; color: string | null } | null
  property_interest: { id: string; name: string } | null
  broker: { id: string; name: string } | null
}

type Broker = { id: string; name: string }

export function LeadsBulkTable({
  leads,
  brokers,
  view = "ativos",
  canReactivate = false,
}: {
  leads: Lead[]
  brokers: Broker[]
  view?: "ativos" | "perdidos"
  canReactivate?: boolean
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [newBroker, setNewBroker] = useState("")
  // Story 75-264 — motivo estruturado (slug) + observação livre opcional
  const [lostReason, setLostReason] = useState("")
  const [lostObs, setLostObs] = useState("")
  const [isPending, startTransition] = useTransition()

  const allSelected = leads.length > 0 && selected.size === leads.length
  const someSelected = selected.size > 0

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(leads.map((l) => l.id)))
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleSave() {
    if (!someSelected) return
    if (!newBroker && !lostReason) return

    const body: Record<string, unknown> = { lead_ids: Array.from(selected) }
    if (newBroker === "__roleta__") {
      body.roleta = true // Story 75-207
    } else if (newBroker) {
      body.broker_id = newBroker === "__none__" ? null : newBroker
    }
    if (lostReason) {
      body.lost_reason_grupo = lostReason
      if (lostObs.trim()) body.lost_reason = lostObs.trim()
    }

    startTransition(async () => {
      const res = await fetch("/api/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setSelected(new Set())
        setNewBroker("")
        setLostReason("")
        setLostObs("")
        router.refresh()
      }
    })
  }

  return (
    <div className="relative">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-stone-800">
        <thead>
          <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-stone-800/50 dark:text-stone-400">
            <th className="px-4 py-3">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 dark:border-stone-600"
              />
            </th>
            <th className="px-6 py-3">Nome</th>
            <th className="px-6 py-3">Telefone</th>
            <th className="px-6 py-3">Empreendimento</th>
            <th className="px-6 py-3">Etapa</th>
            <th className="px-6 py-3">Origem</th>
            <th className="px-6 py-3">Corretor</th>
            {/* Story 75-206: Último contato antes do Score (mais relevante à análise) */}
            <th className="px-6 py-3">Último contato</th>
            <th className="px-6 py-3">Calor</th>
            {/* Story 84-6 (Epic 84) — Qualificação Comercial (manual), ao lado do Calor. */}
            <th className="px-6 py-3">Qualificação</th>
            <th className="px-6 py-3">Score</th>
            {view === "perdidos" && canReactivate && <th className="px-6 py-3"></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
          {leads.map((lead) => {
            const isChecked = selected.has(lead.id)
            return (
              <tr
                key={lead.id}
                onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-stone-800/30 ${
                  isChecked ? "bg-orange-50 dark:bg-orange-900/10" : ""
                }`}
              >
                <td
                  className="px-4 py-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleOne(lead.id)}
                    className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 dark:border-stone-600"
                  />
                </td>
                <td className="px-6 py-4 font-medium text-gray-900 dark:text-stone-100">
                  {lead.name || "Sem nome"}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                  <div className="flex items-center gap-2">
                    {whatsAppState({ phone: lead.phone, source: lead.source, hasWhatsappConversation: lead.hasWhatsappConversation }) !== "none" && (
                      <Link
                        href={`/dashboard/leads/${lead.id}?tab=conversa`}
                        onClick={(e) => e.stopPropagation()}
                        title="Conversar no WhatsApp (número da empresa)"
                        aria-label="Conversar no WhatsApp"
                        className="inline-flex items-center justify-center rounded p-1 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Link>
                    )}
                    <span>{lead.phone}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {lead.property_interest?.name ? (
                    <span className="inline-flex items-center rounded-md bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">
                      {lead.property_interest.name}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-300 dark:text-stone-600">—</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {lead.stage ? (
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: lead.stage.color
                          ? `${lead.stage.color}20`
                          : "#f3f4f6",
                        color: lead.stage.color || "#374151",
                      }}
                    >
                      {lead.stage.name}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400 dark:text-stone-500">-</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <SourceBadge source={lead.source} />
                </td>
                <td className="px-6 py-4">
                  {lead.broker?.name ? (
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                        {lead.broker.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="text-sm font-medium text-gray-700 dark:text-stone-300">
                        {lead.broker.name.split(" ")[0]}
                      </span>
                    </div>
                  ) : (
                    <span className="inline-flex items-center rounded-md bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500 dark:bg-stone-700/50 dark:text-stone-400">
                      Sem corretor
                    </span>
                  )}
                </td>
                {/* Story 75-206: Último contato antes do Score */}
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                  {lead.updated_at
                    ? new Date(lead.updated_at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "-"}
                </td>
                <td className="px-6 py-4">
                  {/* Story 75-237 — o filtro de Calor precisa ser legível na lista:
                      sem isso dá pra filtrar "Quente" mas não ver a temperatura. */}
                  {lead.interest_level && CALOR_BADGE[lead.interest_level] ? (
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${CALOR_BADGE[lead.interest_level]}`}>
                      {CALOR_LABELS[lead.interest_level as CalorValue] ?? lead.interest_level}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400 dark:text-stone-500">-</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {/* Story 84-6 (Epic 84) — badge reusado da 84-2; null → traço (não polui). */}
                  {lead.qualificacao_comercial ? (
                    <QualificacaoComercialBadge value={lead.qualificacao_comercial} />
                  ) : (
                    <span className="text-sm text-gray-400 dark:text-stone-500">-</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {lead.qualification_score != null ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        lead.qualification_score >= 70
                          ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
                          : lead.qualification_score >= 40
                            ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300"
                            : "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200"
                      }`}
                    >
                      {lead.qualification_score}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400 dark:text-stone-500">-</span>
                  )}
                </td>
                {/* Story 75-206: botão "Ver" removido (a linha inteira já navega);
                    a coluna de ação só existe onde há Reativar (perdidos). */}
                {view === "perdidos" && canReactivate && (
                  <td
                    className="px-6 py-4 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ReativarLeadButton leadId={lead.id} leadName={lead.name} />
                  </td>
                )}
              </tr>
            )
          })}
          {leads.length === 0 && (
            <tr>
              <td
                colSpan={view === "perdidos" && canReactivate ? 11 : 10}
                className="px-6 py-8 text-center text-sm text-gray-500 dark:text-stone-400"
              >
                Nenhum lead encontrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Barra de ação em massa — renderizada no body via portal para escapar qualquer overflow/sticky */}
      {someSelected && typeof document !== "undefined" && createPortal(
        <div className="fixed bottom-0 left-0 right-0 z-[9999] flex items-center gap-4 border-t border-stone-700 bg-stone-900 px-6 py-4 shadow-2xl" style={{ paddingLeft: "calc(14rem + 1.5rem)" }}>
          <span className="min-w-max text-sm font-medium text-white">
            {selected.size} selecionado{selected.size !== 1 ? "s" : ""}
          </span>

          {/* Novo corretor */}
          <div className="flex flex-1 items-center gap-2">
            <label className="min-w-max text-xs font-semibold uppercase tracking-wider text-stone-400">
              Novo Corretor:
            </label>
            <select
              value={newBroker}
              onChange={(e) => setNewBroker(e.target.value)}
              className="flex-1 rounded-md border border-stone-600 bg-stone-700 px-3 py-1.5 text-sm text-white focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
            >
              <option value="">Não alterar</option>
              <option value="__none__">Remover corretor</option>
              {/* Story 75-207: devolve à roleta e redistribui na hora */}
              <option value="__roleta__">↩ Voltar para a Roleta</option>
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Finalizar como perdido */}
          <div className="flex flex-1 items-center gap-2">
            <label className="min-w-max text-xs font-semibold uppercase tracking-wider text-red-400">
              Finalizar como Perdido:
            </label>
            <select
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              className="flex-1 rounded-md border border-stone-600 bg-stone-700 px-3 py-1.5 text-sm text-white focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
            >
              <option value="">Não finalizar</option>
              {LOST_REASON_GROUPS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
            {lostReason && (
              <input
                type="text"
                value={lostObs}
                onChange={(e) => setLostObs(e.target.value)}
                placeholder="Observação (opcional)"
                className="flex-1 rounded-md border border-stone-600 bg-stone-700 px-3 py-1.5 text-sm text-white placeholder:text-stone-400 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
              />
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={isPending || (!newBroker && !lostReason)}
            className="min-w-max rounded-md bg-orange-600 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Salvando..." : "Salvar"}
          </button>

          <button
            onClick={() => setSelected(new Set())}
            className="text-sm text-stone-400 hover:text-white"
          >
            Cancelar
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}
