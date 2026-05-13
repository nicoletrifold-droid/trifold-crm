"use client"

import type { DataComemorativa } from "./types"

interface DateSelectorProps {
  datas: DataComemorativa[]
  selectedId: string | null
  onChange: (id: string | null) => void
}

export function DateSelector({ datas, selectedId, onChange }: DateSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium text-gray-700 whitespace-nowrap dark:text-stone-300">
        Data comemorativa:
      </label>
      <select
        value={selectedId ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
      >
        <option value="">— Selecionar —</option>
        {datas.map((d) => (
          <option key={d.id} value={d.id}>
            {d.nome} ({new Date(d.data + "T12:00:00").toLocaleDateString("pt-BR")})
          </option>
        ))}
      </select>
    </div>
  )
}
