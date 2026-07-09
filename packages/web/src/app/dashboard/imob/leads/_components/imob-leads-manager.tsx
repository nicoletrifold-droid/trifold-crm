"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Users, X } from "lucide-react"

export type ImobLead = {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  observacao: string | null
  created_at: string
  stage_name: string | null
  stage_color: string | null
  property_name: string | null
  assigned_broker_id: string | null
  responsavel_name: string | null
}

type Property = { id: string; name: string }
type OrgUser = { id: string; name: string }

const inputCls =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
const labelCls = "block text-xs font-medium text-gray-500 dark:text-stone-400"

const EMPTY = { name: "", phone: "", email: "", property_interest_id: "", observacao: "" }

export function ImobLeadsManager({ initial, properties, users }: { initial: ImobLead[]; properties: Property[]; users: OrgUser[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [assigningId, setAssigningId] = useState<string | null>(null)

  function set<K extends keyof typeof EMPTY>(k: K, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  // Define/troca o responsável do lead (via endpoint admin-backed do IMOB) e recarrega.
  async function assignResponsavel(leadId: string, userId: string) {
    setAssigningId(leadId)
    try {
      const res = await fetch(`/api/imob/leads/${leadId}/assign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ broker_id: userId || null }),
      })
      if (res.ok) router.refresh()
    } finally {
      setAssigningId(null)
    }
  }

  async function save() {
    if (!form.phone.trim()) { setError("Telefone é obrigatório"); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch("/api/imob/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, property_interest_id: form.property_interest_id || null }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) { setError(body.error ?? "Erro ao salvar"); return }
      setOpen(false); setForm({ ...EMPTY }); router.refresh()
    } catch {
      setError("Erro de conexão ao salvar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-0 flex-1">
      <div className="mb-3 flex items-center justify-end">
        <button
          onClick={() => { setForm({ ...EMPTY }); setError(null); setOpen(true) }}
          className="inline-flex items-center gap-1.5 rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
        >
          <Plus className="h-4 w-4" /> Novo lead
        </button>
      </div>

      {initial.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-300 py-16 text-center dark:border-stone-700">
          <Users className="h-9 w-9 text-stone-400 dark:text-stone-500" />
          <p className="text-sm text-stone-500 dark:text-stone-400">Nenhum lead do IMOB ainda.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-200 dark:border-stone-800">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs text-stone-500 dark:bg-stone-900 dark:text-stone-400">
              <tr>
                <th className="px-3 py-2 font-medium">Lead</th>
                <th className="px-3 py-2 font-medium">Telefone</th>
                <th className="px-3 py-2 font-medium">Empreendimento</th>
                <th className="px-3 py-2 font-medium">Etapa</th>
                <th className="px-3 py-2 font-medium">Responsável</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {initial.map((l) => (
                <tr key={l.id} className="bg-white dark:bg-stone-950">
                  <td className="px-3 py-2">
                    <div className="font-medium text-stone-900 dark:text-stone-100">{l.name || "Sem nome"}</div>
                    {l.email && <div className="text-xs text-stone-400">{l.email}</div>}
                  </td>
                  <td className="px-3 py-2 text-stone-700 dark:text-stone-300">{l.phone || "—"}</td>
                  <td className="px-3 py-2 text-stone-700 dark:text-stone-300">{l.property_name || "—"}</td>
                  <td className="px-3 py-2">
                    {l.stage_name ? (
                      <span
                        className="inline-flex rounded-md px-2 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: `${l.stage_color ?? "#78716c"}20`, color: l.stage_color ?? "#57534e" }}
                      >
                        {l.stage_name}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={l.assigned_broker_id ?? ""}
                      disabled={assigningId === l.id}
                      onChange={(e) => assignResponsavel(l.id, e.target.value)}
                      className="w-full max-w-[180px] rounded-md border border-stone-300 bg-white px-2 py-1 text-xs text-stone-800 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                    >
                      <option value="">Sem responsável</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-stone-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-stone-900 dark:text-white">Novo lead — IMOB</h2>
              <button onClick={() => setOpen(false)} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Nome</label>
                <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus />
              </div>
              <div>
                <label className={labelCls}>Telefone *</label>
                <input className={inputCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>E-mail</label>
                <input className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Empreendimento</label>
                <select className={inputCls} value={form.property_interest_id} onChange={(e) => set("property_interest_id", e.target.value)}>
                  <option value="">—</option>
                  {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Observação</label>
                <textarea rows={2} className={inputCls} value={form.observacao} onChange={(e) => set("observacao", e.target.value)} />
              </div>
            </div>
            {error && <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-md border border-stone-300 px-4 py-1.5 text-sm text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800">Cancelar</button>
              <button onClick={save} disabled={saving} className="rounded-md bg-orange-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60">
                {saving ? "Salvando…" : "Criar lead"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
