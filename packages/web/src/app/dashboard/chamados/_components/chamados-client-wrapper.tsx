"use client"

import { useState, useEffect, useCallback } from "react"
import { Inbox } from "lucide-react"
import { ChamadoCard } from "./chamado-card"

interface Chamado {
  id: string
  description: string
  reason: string
  image_url: string | null
  image_urls?: string[] | null
  status: string
  reporter_name: string
  created_at: string
  admin_response?: string | null
  responded_at?: string | null
}

const STATUS_FILTERS = [
  { value: "todos", label: "Todos" },
  { value: "aberto", label: "Abertos" },
  { value: "em_analise", label: "Em análise" },
  { value: "resolvido", label: "Resolvidos" },
]

interface Props {
  initialChamados: Chamado[]
  isAdmin: boolean
}

export function ChamadosClientWrapper({ initialChamados, isAdmin }: Props) {
  const [chamados, setChamados] = useState<Chamado[]>(initialChamados)
  const [statusFilter, setStatusFilter] = useState<string>("todos")

  useEffect(() => {
    setChamados(initialChamados)
  }, [initialChamados])

  const handleStatusChange = useCallback(
    (id: string, updates: { status: string; admin_response?: string | null }) => {
      setChamados((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, status: updates.status, admin_response: updates.admin_response ?? c.admin_response }
            : c
        )
      )
    },
    []
  )

  const filtered =
    statusFilter === "todos"
      ? chamados
      : chamados.filter((c) => c.status === statusFilter)

  const openCount = chamados.filter((c) => c.status !== "resolvido").length

  return (
    <div>
      {isAdmin && (
        <div className="mb-4 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => {
            const count =
              f.value === "todos"
                ? chamados.length
                : chamados.filter((c) => c.status === f.value).length
            return (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  statusFilter === f.value
                    ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700"
                }`}
              >
                {f.label}
                {count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    statusFilter === f.value
                      ? "bg-white/20 text-white dark:bg-black/20 dark:text-stone-900"
                      : "bg-stone-200 text-stone-500 dark:bg-stone-700 dark:text-stone-400"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {!isAdmin && openCount > 0 && (
        <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">
          {openCount} ticket{openCount !== 1 ? "s" : ""} em aberto
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-stone-300 py-12 text-center dark:border-stone-700">
          <Inbox className="h-10 w-10 text-stone-300 dark:text-stone-600" />
          <div>
            <p className="text-sm font-medium text-stone-500 dark:text-stone-400">
              {statusFilter !== "todos" ? "Nenhum ticket com este status" : "Nenhum ticket ainda"}
            </p>
            {statusFilter === "todos" && (
              <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">
                Use o formulário ao lado para abrir o primeiro ticket
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((chamado) => (
            <ChamadoCard
              key={chamado.id}
              chamado={chamado}
              isAdmin={isAdmin}
              showReporter={isAdmin}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}
