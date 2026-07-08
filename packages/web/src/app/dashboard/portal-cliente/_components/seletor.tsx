"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Search, ChevronRight, Building2, User } from "lucide-react"

export interface Unidade {
  vinculoId: string
  obraName: string
  unidade: string | null
  clienteNome: string | null
  distrato: boolean
}

export interface EmpreendimentoGroup {
  propertyId: string
  propertyName: string
  unidades: Unidade[]
}

export function PortalClienteSeletor({ groups }: { groups: EmpreendimentoGroup[] }) {
  const [q, setQ] = useState("")

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return groups
    return groups
      .map((g) => {
        const propMatch = g.propertyName.toLowerCase().includes(term)
        const unidades = propMatch
          ? g.unidades
          : g.unidades.filter(
              (u) =>
                u.obraName.toLowerCase().includes(term) ||
                (u.unidade ?? "").toLowerCase().includes(term) ||
                (u.clienteNome ?? "").toLowerCase().includes(term)
            )
        return { ...g, unidades }
      })
      .filter((g) => g.unidades.length > 0)
  }, [q, groups])

  const totalUnidades = groups.reduce((n, g) => n + g.unidades.length, 0)

  return (
    <div>
      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por cliente, unidade ou empreendimento..."
          className="w-full rounded-lg border border-stone-300 bg-white py-2.5 pl-10 pr-3 text-sm text-stone-800 placeholder-stone-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder-stone-500"
        />
      </div>

      {totalUnidades === 0 ? (
        <p className="rounded-lg border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-500 dark:border-stone-800 dark:bg-stone-900">
          Nenhuma unidade cadastrada ainda.
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-500 dark:border-stone-800 dark:bg-stone-900">
          Nenhum resultado para “{q}”.
        </p>
      ) : (
        <div className="space-y-6">
          {filtered.map((g) => (
            <section key={g.propertyId}>
              <div className="mb-2 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-orange-500" />
                <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200">
                  {g.propertyName}
                </h2>
                <span className="text-xs text-stone-400">
                  {g.unidades.length} unidade{g.unidades.length !== 1 ? "s" : ""}
                </span>
              </div>
              <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
                {g.unidades.map((u) => (
                  <li key={u.vinculoId}>
                    <Link
                      href={`/dashboard/portal-cliente/${u.vinculoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/60"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-stone-800 dark:text-stone-100">
                          <User className="h-3.5 w-3.5 flex-shrink-0 text-stone-400" />
                          {u.clienteNome ?? "Cliente sem nome"}
                          {u.distrato && (
                            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-400">
                              distrato
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">
                          {u.unidade ? `Unidade ${u.unidade}` : u.obraName}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
