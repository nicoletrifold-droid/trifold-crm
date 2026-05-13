"use client"

import { useEffect, useState } from "react"
import { UF_OPTIONS } from "./types"

export interface BrindesFilters {
  obra_nome: string
  tipo: string
  nome: string
  cidade: string
  estado: string
}

interface FilterBarProps {
  filters: BrindesFilters
  onFiltersChange: (f: BrindesFilters) => void
  obraOptions: string[]
}

export function BrindesFilterBar({ filters, onFiltersChange, obraOptions }: FilterBarProps) {
  const [localNome, setLocalNome] = useState(filters.nome)
  const [localCidade, setLocalCidade] = useState(filters.cidade)

  // Debounce text inputs 300ms
  useEffect(() => {
    const t = setTimeout(() => {
      if (localNome !== filters.nome) {
        onFiltersChange({ ...filters, nome: localNome })
      }
    }, 300)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localNome])

  useEffect(() => {
    const t = setTimeout(() => {
      if (localCidade !== filters.cidade) {
        onFiltersChange({ ...filters, cidade: localCidade })
      }
    }, 300)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localCidade])

  function clear() {
    setLocalNome("")
    setLocalCidade("")
    onFiltersChange({ obra_nome: "", tipo: "", nome: "", cidade: "", estado: "" })
  }

  const hasFilters = filters.obra_nome || filters.tipo || filters.nome || filters.cidade || filters.estado

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Obra</label>
        <select
          value={filters.obra_nome}
          onChange={(e) => onFiltersChange({ ...filters, obra_nome: e.target.value })}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="">Todas</option>
          {obraOptions.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Tipo</label>
        <select
          value={filters.tipo}
          onChange={(e) => onFiltersChange({ ...filters, tipo: e.target.value })}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="">Todos</option>
          <option value="mae">Mãe</option>
          <option value="pai">Pai</option>
          <option value="outro">Outro</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Nome</label>
        <input
          type="text"
          value={localNome}
          onChange={(e) => setLocalNome(e.target.value)}
          placeholder="Buscar nome..."
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Cidade</label>
        <input
          type="text"
          value={localCidade}
          onChange={(e) => setLocalCidade(e.target.value)}
          placeholder="Cidade..."
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Estado</label>
        <select
          value={filters.estado}
          onChange={(e) => onFiltersChange({ ...filters, estado: e.target.value })}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="">UF</option>
          {UF_OPTIONS.map((uf) => (
            <option key={uf} value={uf}>{uf}</option>
          ))}
        </select>
      </div>

      {hasFilters && (
        <button
          type="button"
          onClick={clear}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          Limpar
        </button>
      )}
    </div>
  )
}
