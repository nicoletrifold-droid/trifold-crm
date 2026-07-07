"use client"

import { useEffect, useState } from "react"
import { Plus, Loader2 } from "lucide-react"
import { ImobiliariaFormModal } from "@web/app/dashboard/imob/imobiliarias/_components/imobiliaria-form-modal"

// Story 75-148 — seletor de imobiliária da BASE (fim do texto livre) + botão "+ Cadastrar
// nova imobiliária" inline (abre o formulário completo). Usado em "Nova pasta" (wizard) e
// "Gerar link". Busca a lista em GET /api/imob/imobiliarias (gate compartilhado IMOB/Pastas).

export interface ImobOption {
  id: string
  nome: string
  cidade?: string | null
  estado?: string | null
}

const selectCls =
  "mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"

export function ImobiliariaSelect({
  value,
  onChange,
  required = false,
  label = "Imobiliária",
}: {
  value: string | null
  onChange: (v: { id: string; nome: string } | null) => void
  required?: boolean
  label?: string
}) {
  const [list, setList] = useState<ImobOption[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)

  useEffect(() => {
    let alive = true
    fetch("/api/imob/imobiliarias")
      .then((r) => r.json())
      .then((d) => { if (alive) setList((d?.imobiliarias ?? []) as ImobOption[]) })
      .catch(() => { /* silencioso — select fica vazio, botão "+ nova" segue disponível */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  function handleSelect(id: string) {
    const opt = list.find((o) => o.id === id)
    onChange(opt ? { id: opt.id, nome: opt.nome } : null)
  }

  return (
    <div className="block">
      <span className="text-xs text-gray-500 dark:text-stone-400">
        {label}{required ? " *" : ""}
      </span>
      <div className="mt-1 flex items-center gap-1.5">
        <select
          value={value ?? ""}
          onChange={(e) => handleSelect(e.target.value)}
          disabled={loading}
          className={`${selectCls} mt-0 flex-1`}
        >
          <option value="">{loading ? "Carregando…" : required ? "Selecione a imobiliária" : "— nenhuma —"}</option>
          {list.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}{o.cidade ? ` — ${o.cidade}${o.estado ? `/${o.estado}` : ""}` : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setModal(true)}
          title="Cadastrar nova imobiliária"
          className="flex shrink-0 items-center gap-1 rounded-md border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Nova
        </button>
      </div>

      {modal && (
        <ImobiliariaFormModal
          editing={null}
          onClose={() => setModal(false)}
          onSaved={(imob) => {
            setList((prev) =>
              [{ id: imob.id, nome: imob.nome, cidade: imob.cidade, estado: imob.estado }, ...prev]
                .filter((o, idx, arr) => arr.findIndex((x) => x.id === o.id) === idx)
            )
            onChange({ id: imob.id, nome: imob.nome })
            setModal(false)
          }}
        />
      )}
    </div>
  )
}
