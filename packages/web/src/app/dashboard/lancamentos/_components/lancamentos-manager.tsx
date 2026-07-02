"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus, Rocket, X, Trash2 } from "lucide-react"
import {
  LANCAMENTO_STATUS,
  STATUS_LABELS,
  STATUS_TONE,
  LANCAMENTO_CORES,
  COR_HEX,
  type Lancamento,
  type LancamentoStatus,
} from "@web/lib/lancamentos/lancamentos"

type FormState = {
  nome: string
  property_interest_id: string
  status: LancamentoStatus
  cor: string
}
const EMPTY: FormState = { nome: "", property_interest_id: "", status: "planejamento", cor: "coral" }

const inputCls =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
const labelCls = "block text-xs font-medium text-gray-500 dark:text-stone-400"

export function LancamentosManager({
  initial,
  empreendimentos,
}: {
  initial: Lancamento[]
  empreendimentos: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Lancamento | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<"" | LancamentoStatus>("")

  const list = statusFilter ? initial.filter((l) => l.status === statusFilter) : initial

  function openNew() {
    setEditing(null)
    setForm(EMPTY)
    setError(null)
    setOpen(true)
  }
  function openEdit(l: Lancamento) {
    setEditing(l)
    setForm({
      nome: l.nome,
      property_interest_id: l.property_interest_id ?? "",
      status: l.status,
      cor: l.cor in COR_HEX ? l.cor : "coral",
    })
    setError(null)
    setOpen(true)
  }
  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function save() {
    if (!form.nome.trim()) {
      setError("Nome do lançamento é obrigatório")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const url = editing ? `/api/lancamentos/${editing.id}` : "/api/lancamentos"
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nome: form.nome,
          property_interest_id: form.property_interest_id || null,
          status: form.status,
          cor: form.cor,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(body.error ?? "Erro ao salvar")
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError("Erro de conexão ao salvar")
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!editing) return
    if (!confirm(`Excluir o lançamento "${editing.nome}"? Esta ação não pode ser desfeita.`)) return
    setSaving(true)
    try {
      const res = await fetch(`/api/lancamentos/${editing.id}`, { method: "DELETE" })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        setError(b.error ?? "Erro ao excluir")
        return
      }
      setOpen(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white">Lançamentos</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Quadros de cada empreendimento em lançamento.
          </p>
        </div>
        <button
          onClick={openNew}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-[#E8856A] px-3 py-2 text-sm font-medium text-white hover:bg-[#d6724f]"
        >
          <Plus className="h-4 w-4" /> Novo lançamento
        </button>
      </div>

      {/* Filtro */}
      <div className="mb-5 flex items-center gap-2">
        <label className="text-xs text-stone-500 dark:text-stone-400">Status</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "" | LancamentoStatus)}
          className="rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
        >
          <option value="">Todos</option>
          {LANCAMENTO_STATUS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {/* Grid */}
      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-stone-300 py-20 text-center dark:border-stone-700">
          <Rocket className="h-9 w-9 text-stone-400" />
          <p className="text-sm text-stone-500 dark:text-stone-400">Nenhum lançamento ainda.</p>
          <button
            onClick={openNew}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#E8856A] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#d6724f]"
          >
            <Plus className="h-4 w-4" /> Criar primeiro lançamento
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((l) => (
            <div
              key={l.id}
              className="group relative rounded-lg border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-stone-800 dark:bg-stone-900"
            >
              <Link href={`/dashboard/lancamentos/${l.id}`} className="block">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full transition-transform group-hover:scale-125"
                    style={{ background: COR_HEX[l.cor] ?? COR_HEX.coral }}
                  />
                  <span className={`ml-auto inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_TONE[l.status]}`}>
                    {STATUS_LABELS[l.status]}
                  </span>
                </div>
                <h3 className="mt-3 truncate text-base font-semibold text-stone-900 dark:text-white">{l.nome}</h3>
                <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
                  {l.empreendimento_nome ? `Empreendimento · ${l.empreendimento_nome}` : "Sem empreendimento vinculado"}
                </p>
                <p className="mt-4 text-xs font-medium text-[#E8856A]">Abrir board →</p>
              </Link>
              <button
                onClick={() => openEdit(l)}
                className="absolute bottom-3 right-3 rounded-md px-2 py-1 text-xs text-stone-400 opacity-0 transition-opacity hover:bg-stone-100 hover:text-stone-600 group-hover:opacity-100 dark:hover:bg-stone-800 dark:hover:text-stone-200"
              >
                Editar
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal criar/editar */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-stone-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-stone-900 dark:text-white">
                {editing ? "Editar lançamento" : "Novo lançamento"}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className={labelCls}>Nome do lançamento *</label>
                <input className={inputCls} value={form.nome} onChange={(e) => set("nome", e.target.value)} autoFocus />
              </div>
              <div>
                <label className={labelCls}>Empreendimento</label>
                <select
                  className={inputCls}
                  value={form.property_interest_id}
                  onChange={(e) => set("property_interest_id", e.target.value)}
                >
                  <option value="">— Nenhum —</option>
                  {empreendimentos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select
                  className={inputCls}
                  value={form.status}
                  onChange={(e) => set("status", e.target.value as LancamentoStatus)}
                >
                  {LANCAMENTO_STATUS.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Cor de identidade</label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {LANCAMENTO_CORES.map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => set("cor", c)}
                      aria-label={`Cor ${c}`}
                      className={`h-7 w-7 rounded-full transition-transform ${
                        form.cor === c ? "scale-110 ring-2 ring-offset-2 ring-stone-400 dark:ring-offset-stone-900" : ""
                      }`}
                      style={{ background: COR_HEX[c] }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {error && <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}

            <div className="mt-5 flex items-center justify-between gap-2">
              <div>
                {editing && (
                  <button
                    onClick={remove}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" /> Excluir
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-stone-300 px-4 py-1.5 text-sm text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                >
                  Cancelar
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-md bg-[#E8856A] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#d6724f] disabled:opacity-60"
                >
                  {saving ? "Salvando…" : editing ? "Salvar" : "Criar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
