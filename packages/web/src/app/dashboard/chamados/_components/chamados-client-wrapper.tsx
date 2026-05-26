"use client"

import { useState, useEffect } from "react"
import { Inbox } from "lucide-react"
import { ChamadoCard } from "./chamado-card"

interface Chamado {
  id: string
  description: string
  reason: string
  image_url: string | null
  status: string
  reporter_name: string
  created_at: string
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

  // Re-sync quando a página é atualizada pelo server (após novo chamado)
  useEffect(() => {
    setChamados(initialChamados)
  }, [initialChamados])

  const filtered =
    statusFilter === "todos"
      ? chamados
      : chamados.filter((c) => c.status === statusFilter)

  return (
    <div>
      {/* Filtros de status — somente para admin */}
      {isAdmin && (
        <div className="mb-4 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                statusFilter === f.value
                  ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-stone-300 py-12 text-center dark:border-stone-700">
          <Inbox className="h-10 w-10 text-stone-300 dark:text-stone-600" />
          <div>
            <p className="text-sm font-medium text-stone-500 dark:text-stone-400">
              {statusFilter !== "todos"
                ? "Nenhum chamado com este status"
                : "Nenhum chamado aberto ainda"}
            </p>
            {statusFilter === "todos" && (
              <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">
                Use o formulário ao lado para abrir o primeiro chamado
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
              showReporter={isAdmin}
            />
          ))}
        </div>
      )}
    </div>
  )
}
