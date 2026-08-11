"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, ListPlus, X, Trash2 } from "lucide-react"
import {
  LOCAL_TIPOS, LOCAL_TIPO_LABELS, parseLocaisLote,
  type FvsLocal, type LocalTipo,
} from "@web/lib/fvs/fvs"

const inputCls = "mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
const labelCls = "block text-xs font-medium text-gray-500 dark:text-stone-400"
const btnPrimary = "inline-flex items-center gap-1.5 rounded-md bg-[#E8856A] px-3 py-2 text-sm font-medium text-white hover:bg-[#d6724f] disabled:opacity-50"
const btnGhost = "inline-flex items-center gap-1.5 rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"

type Props = {
  obras: { id: string; name: string }[]
  obraId: string | null
  locais: FvsLocal[]
}

type FormState = { nome: string; tipo: LocalTipo; torre: string; pavimento: string }
const EMPTY: FormState = { nome: "", tipo: "apartamento", torre: "", pavimento: "" }

export function LocaisManager({ obras, obraId, locais }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState<false | "novo" | "lote">(false)
  const [editing, setEditing] = useState<FvsLocal | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [loteText, setLoteText] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lote = useMemo(() => parseLocaisLote(loteText), [loteText])

  function openNew() { setEditing(null); setForm(EMPTY); setError(null); setOpen("novo") }
  function openEdit(l: FvsLocal) {
    setEditing(l)
    setForm({ nome: l.nome, tipo: l.tipo, torre: l.torre ?? "", pavimento: l.pavimento?.toString() ?? "" })
    setError(null)
    setOpen("novo")
  }
  function set<K extends keyof FormState>(k: K, v: FormState[K]) { setForm((s) => ({ ...s, [k]: v })) }

  function pavOf(s: string): number | null {
    return s.trim() === "" ? null : Number(s)
  }

  async function save() {
    if (!obraId) return
    setSaving(true); setError(null)
    try {
      const res = editing
        ? await fetch(`/api/fvs/locais/${editing.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              nome: form.nome, tipo: form.tipo, torre: form.torre,
              pavimento: pavOf(form.pavimento),
            }),
          })
        : await fetch("/api/fvs/locais", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              obra_id: obraId, tipo: form.tipo, torre: form.torre,
              locais: [{ nome: form.nome, pavimento: pavOf(form.pavimento) }],
            }),
          })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) { setError(body.error ?? "Erro ao salvar"); return }
      setOpen(false); router.refresh()
    } catch { setError("Erro de conexão") } finally { setSaving(false) }
  }

  async function saveLote() {
    if (!obraId || lote.locais.length === 0) return
    setSaving(true); setError(null)
    try {
      const res = await fetch("/api/fvs/locais", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ obra_id: obraId, tipo: form.tipo, torre: form.torre, locais: lote.locais }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) { setError(body.error ?? "Erro ao salvar"); return }
      setOpen(false); setLoteText(""); router.refresh()
    } catch { setError("Erro de conexão") } finally { setSaving(false) }
  }

  async function remove() {
    if (!editing || !confirm(`Excluir o local "${editing.nome}"?`)) return
    setSaving(true)
    try {
      const res = await fetch(`/api/fvs/locais/${editing.id}`, { method: "DELETE" })
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
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white">Locais</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">A régua da vistoria é o local — apartamento, hall ou área comum.</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button onClick={() => { setError(null); setForm(EMPTY); setOpen("lote") }} className={btnGhost} disabled={!obraId}>
            <ListPlus className="h-4 w-4" /> Criar em lote
          </button>
          <button onClick={openNew} className={btnPrimary} disabled={!obraId}>
            <Plus className="h-4 w-4" /> Novo local
          </button>
        </div>
      </div>

      <div className="mb-3">
        <label className={labelCls} htmlFor="obra-select">Obra</label>
        <select
          id="obra-select"
          value={obraId ?? ""}
          onChange={(e) => router.push(`/dashboard/fvs/locais?obra=${e.target.value}`)}
          className="mt-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
        >
          {obras.length === 0 && <option value="">Nenhuma obra cadastrada</option>}
          {obras.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>

      {locais.length === 0 ? (
        <p className="rounded-md border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
          Nenhum local nesta obra ainda. Use <b>Criar em lote</b> para colar a lista da planilha.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-200 dark:border-stone-800">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">
                <th className="px-4 py-2.5">Nome</th>
                <th className="px-4 py-2.5">Tipo</th>
                <th className="px-4 py-2.5">Torre</th>
                <th className="px-4 py-2.5">Pavimento</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {locais.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => openEdit(l)}
                  className="cursor-pointer border-b border-stone-100 bg-white last:border-0 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:hover:bg-stone-800"
                >
                  <td className="px-4 py-2.5 font-medium text-stone-900 dark:text-white">{l.nome}</td>
                  <td className="px-4 py-2.5 text-stone-600 dark:text-stone-300">{LOCAL_TIPO_LABELS[l.tipo]}</td>
                  <td className="px-4 py-2.5 text-stone-600 dark:text-stone-300">{l.torre ?? "—"}</td>
                  <td className="px-4 py-2.5 text-stone-600 dark:text-stone-300">{l.pavimento ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={l.ativo
                      ? "rounded px-1.5 py-0.5 text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : "rounded px-1.5 py-0.5 text-xs bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-300"}>
                      {l.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl dark:bg-stone-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-stone-900 dark:text-white">
                {open === "lote" ? "Criar locais em lote" : editing ? "Editar local" : "Novo local"}
              </h2>
              <button onClick={() => setOpen(false)} className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200" aria-label="Fechar">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Tipo</label>
                <select value={form.tipo} onChange={(e) => set("tipo", e.target.value as LocalTipo)} className={inputCls}>
                  {LOCAL_TIPOS.map((t) => <option key={t} value={t}>{LOCAL_TIPO_LABELS[t]}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Torre (opcional)</label>
                <input type="text" value={form.torre} onChange={(e) => set("torre", e.target.value)} className={inputCls} />
              </div>
            </div>

            {open === "novo" ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Nome *</label>
                  <input type="text" value={form.nome} onChange={(e) => set("nome", e.target.value)} className={inputCls} placeholder="Apto 1401" />
                </div>
                <div>
                  <label className={labelCls}>Pavimento (opcional)</label>
                  <input type="number" value={form.pavimento} onChange={(e) => set("pavimento", e.target.value)} className={inputCls} placeholder="14" />
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <label className={labelCls}>Um local por linha — pavimento opcional após “;” ou TAB</label>
                <textarea
                  value={loteText}
                  onChange={(e) => setLoteText(e.target.value)}
                  rows={8}
                  className={`${inputCls} font-mono`}
                  placeholder={"Apto 101; 1\nApto 102; 1\nHall 1º pavimento; 1\nSalão de festas"}
                />
                <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                  {lote.locais.length} local(is) prontos
                  {lote.duplicados.length > 0 && ` · ${lote.duplicados.length} duplicado(s) ignorado(s)`}
                  {lote.invalidos.length > 0 && ` · ${lote.invalidos.length} linha(s) com pavimento inválido`}
                </p>
              </div>
            )}

            {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

            <div className="mt-5 flex items-center gap-2">
              {open === "novo" ? (
                <button onClick={save} disabled={saving} className={btnPrimary}>
                  {editing ? "Salvar" : "Criar local"}
                </button>
              ) : (
                <button onClick={saveLote} disabled={saving || lote.locais.length === 0} className={btnPrimary}>
                  Criar {lote.locais.length} local(is)
                </button>
              )}
              {editing && open === "novo" && (
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
