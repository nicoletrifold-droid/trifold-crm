"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus, Truck, X, Trash2, ArrowLeft } from "lucide-react"
import {
  FORNECEDOR_STATUS, STATUS_LABELS, STATUS_TONE, CATEGORIAS, CATEGORIA_LABEL, CATEGORIA_COR,
  type Fornecedor, type FornecedorStatus,
} from "@web/lib/lancamentos/fornecedores"

type FormState = {
  nome: string; razao_social: string; cnpj: string; categoria: string; status: FornecedorStatus
  contato_nome: string; telefone: string; email: string; cidade: string; estado: string
  endereco: string; site: string; observacoes: string
}
const EMPTY: FormState = {
  nome: "", razao_social: "", cnpj: "", categoria: "", status: "ativo",
  contato_nome: "", telefone: "", email: "", cidade: "", estado: "", endereco: "", site: "", observacoes: "",
}
function toForm(f: Fornecedor): FormState {
  return {
    nome: f.nome, razao_social: f.razao_social ?? "", cnpj: f.cnpj ?? "", categoria: f.categoria ?? "",
    status: f.status, contato_nome: f.contato_nome ?? "", telefone: f.telefone ?? "", email: f.email ?? "",
    cidade: f.cidade ?? "", estado: f.estado ?? "", endereco: f.endereco ?? "", site: f.site ?? "", observacoes: f.observacoes ?? "",
  }
}

const inputCls = "mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
const labelCls = "block text-xs font-medium text-gray-500 dark:text-stone-400"

export function FornecedoresManager({ initial }: { initial: Fornecedor[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Fornecedor | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [catFilter, setCatFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState<"" | FornecedorStatus>("")
  const [q, setQ] = useState("")

  const list = initial.filter((f) => {
    if (catFilter && f.categoria !== catFilter) return false
    if (statusFilter && f.status !== statusFilter) return false
    if (q) {
      const t = q.toLowerCase()
      if (!f.nome.toLowerCase().includes(t) && !(f.cnpj ?? "").toLowerCase().includes(t) && !(f.razao_social ?? "").toLowerCase().includes(t)) return false
    }
    return true
  })

  function openNew() { setEditing(null); setForm(EMPTY); setError(null); setOpen(true) }
  function openEdit(f: Fornecedor) { setEditing(f); setForm(toForm(f)); setError(null); setOpen(true) }
  function set<K extends keyof FormState>(k: K, v: FormState[K]) { setForm((s) => ({ ...s, [k]: v })) }

  async function save() {
    if (!form.nome.trim()) { setError("Nome do fornecedor é obrigatório"); return }
    setSaving(true); setError(null)
    try {
      const url = editing ? `/api/lancamentos/fornecedores/${editing.id}` : "/api/lancamentos/fornecedores"
      const res = await fetch(url, { method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) { setError(body.error ?? "Erro ao salvar"); return }
      setOpen(false); router.refresh()
    } catch {
      setError("Erro de conexão")
    } finally { setSaving(false) }
  }

  async function remove() {
    if (!editing || !confirm(`Excluir o fornecedor "${editing.nome}"?`)) return
    setSaving(true)
    try {
      const res = await fetch(`/api/lancamentos/fornecedores/${editing.id}`, { method: "DELETE" })
      if (res.ok) { setOpen(false); router.refresh() }
    } finally { setSaving(false) }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <Link href="/dashboard/lancamentos" className="grid h-8 w-8 place-items-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-white" aria-label="Voltar">
          <ArrowLeft className="h-[18px] w-[18px]" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white">Fornecedores</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Cadastro reutilizável em todos os lançamentos.</p>
        </div>
        <button onClick={openNew} className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-[#E8856A] px-3 py-2 text-sm font-medium text-white hover:bg-[#d6724f]">
          <Plus className="h-4 w-4" /> Novo fornecedor
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100">
          <option value="">Todas as categorias</option>
          {CATEGORIAS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "" | FornecedorStatus)} className="rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100">
          <option value="">Todos os status</option>
          {FORNECEDOR_STATUS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou CNPJ…" className="min-w-[200px] rounded-md border border-gray-300 px-3 py-1 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100" />
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-stone-300 py-16 text-center dark:border-stone-700">
          <Truck className="h-9 w-9 text-stone-400" />
          <p className="text-sm text-stone-500 dark:text-stone-400">Nenhum fornecedor cadastrado.</p>
          <button onClick={openNew} className="inline-flex items-center gap-1.5 rounded-md bg-[#E8856A] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#d6724f]"><Plus className="h-4 w-4" /> Cadastrar fornecedor</button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-200 dark:border-stone-800">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs text-stone-500 dark:bg-stone-900 dark:text-stone-400">
              <tr>
                <th className="px-3 py-2 font-medium">Categoria</th>
                <th className="px-3 py-2 font-medium">Fornecedor</th>
                <th className="px-3 py-2 font-medium">Contato</th>
                <th className="px-3 py-2 font-medium">CNPJ</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {list.map((f) => (
                <tr key={f.id} onClick={() => openEdit(f)} className="cursor-pointer bg-white hover:bg-stone-50 dark:bg-stone-950 dark:hover:bg-stone-900">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: f.categoria ? CATEGORIA_COR[f.categoria] ?? "#78716c" : "#78716c" }} />
                      <span className="text-stone-700 dark:text-stone-300">{f.categoria ? CATEGORIA_LABEL[f.categoria] ?? f.categoria : "—"}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-stone-900 dark:text-stone-100">{f.nome}</div>
                    {f.razao_social && <div className="text-xs text-stone-400">{f.razao_social}</div>}
                  </td>
                  <td className="px-3 py-2 text-stone-700 dark:text-stone-300">
                    {f.contato_nome || "—"}
                    {f.telefone && <div className="text-xs text-stone-400">{f.telefone}</div>}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-stone-700 dark:text-stone-300">{f.cnpj || "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_TONE[f.status]}`}>{STATUS_LABELS[f.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-stone-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-stone-900 dark:text-white">{editing ? "Editar fornecedor" : "Novo fornecedor"}</h2>
              <button onClick={() => setOpen(false)} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className={labelCls}>Nome / apelido *</label><input className={inputCls} value={form.nome} onChange={(e) => set("nome", e.target.value)} autoFocus /></div>
              <div><label className={labelCls}>Razão social</label><input className={inputCls} value={form.razao_social} onChange={(e) => set("razao_social", e.target.value)} /></div>
              <div><label className={labelCls}>CNPJ</label><input className={inputCls} value={form.cnpj} onChange={(e) => set("cnpj", e.target.value)} /></div>
              <div>
                <label className={labelCls}>Categoria</label>
                <select className={inputCls} value={form.categoria} onChange={(e) => set("categoria", e.target.value)}>
                  <option value="">— Selecione —</option>
                  {CATEGORIAS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select className={inputCls} value={form.status} onChange={(e) => set("status", e.target.value as FornecedorStatus)}>
                  {FORNECEDOR_STATUS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Contato</label><input className={inputCls} value={form.contato_nome} onChange={(e) => set("contato_nome", e.target.value)} /></div>
              <div><label className={labelCls}>Telefone</label><input className={inputCls} value={form.telefone} onChange={(e) => set("telefone", e.target.value)} /></div>
              <div><label className={labelCls}>E-mail</label><input className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
              <div><label className={labelCls}>Cidade</label><input className={inputCls} value={form.cidade} onChange={(e) => set("cidade", e.target.value)} /></div>
              <div><label className={labelCls}>Estado (UF)</label><input className={inputCls} maxLength={2} value={form.estado} onChange={(e) => set("estado", e.target.value.toUpperCase())} /></div>
              <div className="sm:col-span-2"><label className={labelCls}>Endereço</label><input className={inputCls} value={form.endereco} onChange={(e) => set("endereco", e.target.value)} /></div>
              <div className="sm:col-span-2"><label className={labelCls}>Site / Instagram</label><input className={inputCls} value={form.site} onChange={(e) => set("site", e.target.value)} /></div>
              <div className="sm:col-span-2"><label className={labelCls}>Observações</label><textarea rows={3} className={inputCls} value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} /></div>
            </div>
            {error && <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
            <div className="mt-4 flex items-center justify-between gap-2">
              <div>{editing && <button onClick={remove} disabled={saving} className="inline-flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 disabled:opacity-60"><Trash2 className="h-4 w-4" /> Excluir</button>}</div>
              <div className="flex gap-2">
                <button onClick={() => setOpen(false)} className="rounded-md border border-stone-300 px-4 py-1.5 text-sm text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800">Cancelar</button>
                <button onClick={save} disabled={saving} className="rounded-md bg-[#E8856A] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#d6724f] disabled:opacity-60">{saving ? "Salvando…" : editing ? "Salvar" : "Criar"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
