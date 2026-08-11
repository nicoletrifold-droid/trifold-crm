"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, X, Trash2 } from "lucide-react"
import { EQUIPE_TIPOS, EQUIPE_TIPO_LABELS, type FvsEquipe, type EquipeTipo } from "@web/lib/fvs/fvs"

const inputCls = "mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
const labelCls = "block text-xs font-medium text-gray-500 dark:text-stone-400"
const btnPrimary = "inline-flex items-center gap-1.5 rounded-md bg-[#E8856A] px-3 py-2 text-sm font-medium text-white hover:bg-[#d6724f] disabled:opacity-50"

type FormState = { nome: string; tipo: EquipeTipo; ativo: boolean }
const EMPTY: FormState = { nome: "", tipo: "interna", ativo: true }

export function EquipesManager({ equipes }: { equipes: FvsEquipe[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<FvsEquipe | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openNew() { setEditing(null); setForm(EMPTY); setError(null); setOpen(true) }
  function openEdit(e: FvsEquipe) { setEditing(e); setForm({ nome: e.nome, tipo: e.tipo, ativo: e.ativo }); setError(null); setOpen(true) }

  async function save() {
    setSaving(true); setError(null)
    try {
      const url = editing ? `/api/fvs/equipes/${editing.id}` : "/api/fvs/equipes"
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) { setError(body.error ?? "Erro ao salvar"); return }
      setOpen(false); router.refresh()
    } catch { setError("Erro de conexão") } finally { setSaving(false) }
  }

  async function remove() {
    if (!editing || !confirm(`Excluir a equipe "${editing.nome}"?`)) return
    setSaving(true)
    try {
      const res = await fetch(`/api/fvs/equipes/${editing.id}`, { method: "DELETE" })
      if (res.ok) { setOpen(false); router.refresh() }
    } finally { setSaving(false) }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <Link href="/dashboard/fvs" className="grid h-8 w-8 place-items-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-white" aria-label="Voltar">
          <ArrowLeft className="h-[18px] w-[18px]" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white">Equipes</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Toda vistoria nasce apontando quem executou o serviço.</p>
        </div>
        <button onClick={openNew} className={`ml-auto ${btnPrimary}`}>
          <Plus className="h-4 w-4" /> Nova equipe
        </button>
      </div>

      {equipes.length === 0 ? (
        <p className="rounded-md border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
          Nenhuma equipe cadastrada ainda.
        </p>
      ) : (
        <ul className="space-y-2">
          {equipes.map((e) => (
            <li
              key={e.id}
              onClick={() => openEdit(e)}
              className="flex cursor-pointer flex-wrap items-center gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:hover:bg-stone-800"
            >
              <p className="min-w-0 flex-1 font-medium text-stone-900 dark:text-white">{e.nome}</p>
              <span className="rounded px-1.5 py-0.5 text-xs bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                {EQUIPE_TIPO_LABELS[e.tipo]}
              </span>
              <span className={e.ativo
                ? "rounded px-1.5 py-0.5 text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "rounded px-1.5 py-0.5 text-xs bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-300"}>
                {e.ativo ? "Ativa" : "Inativa"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-stone-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-stone-900 dark:text-white">{editing ? "Editar equipe" : "Nova equipe"}</h2>
              <button onClick={() => setOpen(false)} className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200" aria-label="Fechar"><X className="h-4 w-4" /></button>
            </div>
            <label className={labelCls}>Nome *</label>
            <input type="text" value={form.nome} onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))} className={inputCls} placeholder="Hidráulica — Empreiteira X" />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Tipo</label>
                <select value={form.tipo} onChange={(e) => setForm((s) => ({ ...s, tipo: e.target.value as EquipeTipo }))} className={inputCls}>
                  {EQUIPE_TIPOS.map((t) => <option key={t} value={t}>{EQUIPE_TIPO_LABELS[t]}</option>)}
                </select>
              </div>
              {editing && (
                <div>
                  <label className={labelCls}>Status</label>
                  <select value={form.ativo ? "1" : "0"} onChange={(e) => setForm((s) => ({ ...s, ativo: e.target.value === "1" }))} className={inputCls}>
                    <option value="1">Ativa</option>
                    <option value="0">Inativa</option>
                  </select>
                </div>
              )}
            </div>
            {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="mt-5 flex items-center gap-2">
              <button onClick={save} disabled={saving || !form.nome.trim()} className={btnPrimary}>Salvar</button>
              {editing && (
                <button onClick={remove} disabled={saving} className="ml-auto inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10">
                  <Trash2 className="h-4 w-4" /> Excluir
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
