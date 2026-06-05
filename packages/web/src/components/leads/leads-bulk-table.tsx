"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { SourceBadge } from "@web/components/ui/source-badge"

const LOST_REASONS = [
  "Cliente Não Atende/Responde Mais",
  "Comprou com Concorrente",
  "Condição de Pagamento",
  "CPF Com Restrição",
  "Desistiu de Comprar",
  "Lead Duplicado",
  "Não Interesse",
  "Preço",
  "Renda Insuficiente",
  "Telefone Inexistente",
  "Outros",
]

type Lead = {
  id: string
  name: string | null
  phone: string
  qualification_score: number | null
  updated_at: string | null
  source: string | null
  stage: { id: string; name: string; color: string | null } | null
  property_interest: { id: string; name: string } | null
  broker: { id: string; name: string } | null
}

type Broker = { id: string; name: string }

export function LeadsBulkTable({
  leads,
  brokers,
}: {
  leads: Lead[]
  brokers: Broker[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [newBroker, setNewBroker] = useState("")
  const [lostReason, setLostReason] = useState("")
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
    if (newBroker) body.broker_id = newBroker === "__none__" ? null : newBroker
    if (lostReason) body.lost_reason = lostReason

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
            <th className="px-6 py-3">Score</th>
            <th className="px-6 py-3">Último contato</th>
            <th className="px-6 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-stone-800">
          {leads.map((lead) => {
            const isChecked = selected.has(lead.id)
            return (
              <tr
                key={lead.id}
                onClick={() => toggleOne(lead.id)}
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
                  {lead.phone}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                  {lead.property_interest?.name ?? "-"}
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
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-stone-400">
                  {lead.broker?.name ?? "-"}
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
                <td
                  className="px-6 py-4 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Link
                    href={`/dashboard/leads/${lead.id}`}
                    className="text-sm text-orange-600 hover:text-orange-700 dark:text-orange-300 dark:hover:text-orange-200"
                  >
                    Ver
                  </Link>
                </td>
              </tr>
            )
          })}
          {leads.length === 0 && (
            <tr>
              <td
                colSpan={10}
                className="px-6 py-8 text-center text-sm text-gray-500 dark:text-stone-400"
              >
                Nenhum lead encontrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Barra de ação em massa */}
      {someSelected && (
        <div className="fixed bottom-0 left-60 right-0 z-50 flex items-center gap-4 border-t border-stone-700 bg-stone-900 px-6 py-4 shadow-2xl">
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
              {LOST_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
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
        </div>
      )}
    </div>
  )
}
