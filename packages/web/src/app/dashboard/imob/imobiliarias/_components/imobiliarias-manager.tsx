"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Building2, Link2, Copy, Check, RefreshCw, Ban } from "lucide-react"
import {
  STATUS_LABELS,
  IMOBILIARIA_STATUS,
  TIPO_PRODUTO_LABELS,
  ENGAJAMENTO_NOTAS,
  engajamentoTone,
  type Imobiliaria,
  type ImobiliariaStatus,
} from "@web/lib/imob/imobiliarias"
import { ImobiliariaFormModal } from "./imobiliaria-form-modal"

const STATUS_TONE: Record<ImobiliariaStatus, string> = {
  prospeccao: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  ativo: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  inativo: "bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-300",
}

export function ImobiliariasManager({ initial }: { initial: Imobiliaria[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Imobiliaria | null>(null)
  const [statusFilter, setStatusFilter] = useState<"" | ImobiliariaStatus>("")

  const list = statusFilter ? initial.filter((i) => i.status === statusFilter) : initial

  function openNew() { setEditing(null); setOpen(true) }
  function openEdit(i: Imobiliaria) { setEditing(i); setOpen(true) }

  // Story 81-4 — link público de agendamento por imobiliária (copiar/gerar/revogar).
  const [copied, setCopied] = useState<string | null>(null)
  const [savingToken, setSavingToken] = useState<string | null>(null)
  async function copyBookingLink(i: Imobiliaria) {
    if (!i.booking_token) return
    await navigator.clipboard.writeText(`${window.location.origin}/agendar/${i.booking_token}`)
    setCopied(i.id)
    setTimeout(() => setCopied(null), 1500)
  }
  async function bookingTokenAction(id: string, action: "regenerate" | "revoke") {
    if (action === "revoke" && !window.confirm("Revogar o link desta imobiliária? Ela não conseguirá mais agendar até você gerar um novo.")) return
    if (action === "regenerate" && !window.confirm("Gerar novo link? O link antigo para de funcionar na hora.")) return
    setSavingToken(id)
    try {
      await fetch(`/api/imob/imobiliarias/${id}/booking-token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      })
      router.refresh()
    } finally {
      setSavingToken(null)
    }
  }

  // Story 75-100 — engajamento é editado INLINE na lista (não no modal). Salva na hora.
  const [savingEngaj, setSavingEngaj] = useState<string | null>(null)
  async function setEngajamento(id: string, value: string) {
    setSavingEngaj(id)
    try {
      await fetch(`/api/imob/imobiliarias/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ engajamento: value === "" ? null : Number(value) }),
      })
      router.refresh()
    } catch {
      /* silencioso — a lista reflete no próximo load */
    } finally {
      setSavingEngaj(null)
    }
  }

  return (
    <div className="min-h-0 flex-1">
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label className="text-xs text-stone-500 dark:text-stone-400">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | ImobiliariaStatus)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
          >
            <option value="">Todos</option>
            {IMOBILIARIA_STATUS.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
        >
          <Plus className="h-4 w-4" /> Nova imobiliária
        </button>
      </div>

      {/* Lista */}
      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-300 py-16 text-center dark:border-stone-700">
          <Building2 className="h-9 w-9 text-stone-400 dark:text-stone-500" />
          <p className="text-sm text-stone-500 dark:text-stone-400">Nenhuma imobiliária cadastrada.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-200 dark:border-stone-800">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs text-stone-500 dark:bg-stone-900 dark:text-stone-400">
              <tr>
                <th className="px-3 py-2 font-medium">Engaj.</th>
                <th className="px-3 py-2 font-medium">Imobiliária</th>
                <th className="px-3 py-2 font-medium">Gerente</th>
                <th className="px-3 py-2 font-medium">Contato</th>
                <th className="px-3 py-2 font-medium">Corretores</th>
                <th className="px-3 py-2 font-medium">Cidade</th>
                <th className="px-3 py-2 font-medium">Produtos</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Agenda</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {list.map((i) => (
                <tr
                  key={i.id}
                  onClick={() => openEdit(i)}
                  className="cursor-pointer bg-white hover:bg-stone-50 dark:bg-stone-950 dark:hover:bg-stone-900"
                >
                  {/* Story 75-100: engajamento editável INLINE (dropdown), fora do modal. */}
                  <td className="px-3 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${engajamentoTone(i.engajamento).dot}`} />
                      <select
                        value={i.engajamento == null ? "" : String(i.engajamento)}
                        disabled={savingEngaj === i.id}
                        onChange={(e) => setEngajamento(i.id, e.target.value)}
                        className={`rounded-md border border-stone-300 bg-white px-1.5 py-0.5 text-xs font-medium disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 ${engajamentoTone(i.engajamento).text}`}
                      >
                        <option value="">Não avaliado</option>
                        {ENGAJAMENTO_NOTAS.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-stone-900 dark:text-stone-100">{i.nome}</div>
                    {i.cnpj && <div className="text-xs text-stone-400">{i.cnpj}</div>}
                    {i.creci_juridico && <div className="text-xs text-stone-400">CRECI {i.creci_juridico}</div>}
                  </td>
                  <td className="px-3 py-2 text-stone-700 dark:text-stone-300">{i.gerente_nome || "—"}</td>
                  <td className="px-3 py-2 text-stone-700 dark:text-stone-300">
                    {i.contato_nome || "—"}
                    {i.contato_telefone && <div className="text-xs text-stone-400">{i.contato_telefone}</div>}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-stone-700 dark:text-stone-300">{i.num_corretores ?? "—"}</td>
                  <td className="px-3 py-2 text-stone-700 dark:text-stone-300">
                    {i.cidade ? `${i.cidade}${i.estado ? `/${i.estado}` : ""}` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {i.tipos_produto && i.tipos_produto.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {i.tipos_produto.map((t) => (
                          <span key={t} className="inline-flex rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                            {TIPO_PRODUTO_LABELS[t as keyof typeof TIPO_PRODUTO_LABELS] ?? t}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_TONE[i.status]}`}>
                      {STATUS_LABELS[i.status]}
                    </span>
                  </td>
                  {/* Story 81-4 — link público de agendamento (copiar · gerar novo · revogar) */}
                  <td className="px-3 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {i.booking_token ? (
                        <>
                          <button
                            onClick={() => void copyBookingLink(i)}
                            title="Copiar link de agendamento"
                            className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:hover:bg-violet-500/25"
                          >
                            {copied === i.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            {copied === i.id ? "Copiado!" : "Link"}
                          </button>
                          <button
                            onClick={() => void bookingTokenAction(i.id, "revoke")}
                            disabled={savingToken === i.id}
                            title="Revogar link"
                            className="rounded-md p-1 text-stone-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => void bookingTokenAction(i.id, "regenerate")}
                          disabled={savingToken === i.id}
                          title="Gerar link de agendamento"
                          className="inline-flex items-center gap-1 rounded-md border border-stone-300 px-2 py-1 text-[11px] font-medium text-stone-500 hover:border-violet-400 hover:text-violet-600 disabled:opacity-50 dark:border-stone-700 dark:text-stone-400 dark:hover:border-violet-500 dark:hover:text-violet-300"
                        >
                          <Link2 className="h-3 w-3" /> Gerar link
                        </button>
                      )}
                      {i.booking_token && (
                        <button
                          onClick={() => void bookingTokenAction(i.id, "regenerate")}
                          disabled={savingToken === i.id}
                          title="Gerar novo link (invalida o atual)"
                          className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600 disabled:opacity-50 dark:hover:bg-stone-800 dark:hover:text-stone-300"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal criar/editar (componente compartilhado — Story 75-148) */}
      {open && (
        <ImobiliariaFormModal
          editing={editing}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); router.refresh() }}
        />
      )}
    </div>
  )
}
