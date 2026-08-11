"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Plus, RotateCcw, Users, X } from "lucide-react"
import { LeadDetailDrawer } from "@web/components/leads/lead-detail-drawer"

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

export function ImobLeadsManager({
  initial,
  properties,
  users,
  view,
  counts,
}: {
  initial: ImobLead[]
  properties: Property[]
  users: OrgUser[]
  view: "ativos" | "perdidos"
  counts: { ativos: number; perdidos: number }
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  // Lead aberto no drawer completo (mesmo componente do pipeline: Tarefas, Histórico, Transferir…).
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  // Story 75-297 — reativação de lead perdido (modal responsável + motivo).
  const [reativarLead, setReativarLead] = useState<ImobLead | null>(null)
  const [reativarBrokerId, setReativarBrokerId] = useState("")
  const [reativarMotivo, setReativarMotivo] = useState("")
  const [reativando, setReativando] = useState(false)
  const [reativarError, setReativarError] = useState<string | null>(null)

  function openReativar(lead: ImobLead) {
    setReativarLead(lead)
    setReativarBrokerId(lead.assigned_broker_id ?? "")
    setReativarMotivo("")
    setReativarError(null)
  }

  function closeReativar() {
    if (reativando) return
    setReativarLead(null)
  }

  async function submitReativar() {
    if (!reativarLead) return
    setReativarError(null)
    if (!reativarBrokerId) { setReativarError("Selecione o responsável."); return }
    if (!reativarMotivo.trim()) { setReativarError("O motivo é obrigatório."); return }
    setReativando(true)
    try {
      const res = await fetch(`/api/imob/leads/${reativarLead.id}/reativar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ broker_id: reativarBrokerId, motivo: reativarMotivo.trim() }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) { setReativarError(body.error ?? "Falha ao reativar."); return }
      setReativarLead(null)
      router.refresh()
    } catch {
      setReativarError("Erro de conexão.")
    } finally {
      setReativando(false)
    }
  }

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

  const isPerdidos = view === "perdidos"
  const subTabCls = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${
      active
        ? "bg-stone-200 text-stone-900 dark:bg-stone-700 dark:text-white"
        : "text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
    }`

  return (
    <div className="min-h-0 flex-1">
      <div className="mb-3 flex items-center justify-between gap-2">
        {/* Story 75-297 — views: perdido = ETAPA (mesma régua da house). */}
        <div className="flex items-center gap-1 rounded-lg bg-stone-100 p-1 dark:bg-stone-900">
          <Link href="/dashboard/imob/leads" className={subTabCls(!isPerdidos)}>
            Em atendimento ({counts.ativos})
          </Link>
          <Link href="/dashboard/imob/leads?view=perdidos" className={subTabCls(isPerdidos)}>
            Perdidos ({counts.perdidos})
          </Link>
        </div>
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
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {isPerdidos ? "Nenhum lead perdido no IMOB." : "Nenhum lead do IMOB ainda."}
          </p>
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
                {isPerdidos && <th className="px-3 py-2 font-medium"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {initial.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => setSelectedLeadId(l.id)}
                  className="cursor-pointer bg-white hover:bg-stone-50 dark:bg-stone-950 dark:hover:bg-stone-900"
                >
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
                  {/* O select de Responsável não deve abrir o drawer. */}
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
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
                  {isPerdidos && (
                    <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => openReativar(l)}
                        title="Reativar lead"
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700/50 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Reativar
                      </button>
                    </td>
                  )}
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

      {/* Story 75-297 — modal de reativação (view Perdidos): responsável + motivo. */}
      {reativarLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeReativar}>
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Reativar lead</h3>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              {reativarLead.name ?? "O lead"} volta para &quot;Aguardando atendimento&quot; com o
              responsável escolhido.
            </p>

            <label className="mt-4 block text-xs font-medium text-stone-600 dark:text-stone-300">
              Responsável <span className="text-red-500">*</span>
            </label>
            <select
              value={reativarBrokerId}
              onChange={(e) => setReativarBrokerId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#E8856A] focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
            >
              <option value="">Selecione o responsável…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>

            <label className="mt-4 block text-xs font-medium text-stone-600 dark:text-stone-300">
              Motivo da reativação <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reativarMotivo}
              onChange={(e) => setReativarMotivo(e.target.value)}
              rows={3}
              placeholder="Ex.: cliente retornou o contato pedindo nova proposta."
              className="mt-1 w-full resize-none rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#E8856A] focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
            />

            {reativarError && <p className="mt-2 text-xs text-red-500">{reativarError}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={closeReativar}
                disabled={reativando}
                className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                Cancelar
              </button>
              <button
                onClick={() => void submitReativar()}
                disabled={reativando}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {reativando ? "Reativando…" : "Reativar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer completo do lead — mesmo componente do pipeline (Tarefas, Histórico
          de Contatos, Transferir Corretor, etc.). Atualiza a lista ao fechar. */}
      <LeadDetailDrawer
        leadId={selectedLeadId}
        onClose={() => { setSelectedLeadId(null); router.refresh() }}
      />
    </div>
  )
}
