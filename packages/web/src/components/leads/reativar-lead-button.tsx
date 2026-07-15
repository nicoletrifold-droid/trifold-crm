"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RotateCcw } from "lucide-react"

type EligibleBroker = { userId: string; name: string }

const ROLETA = "__roleta__"

// Mensagens quando a roleta não conseguiu distribuir na hora (lead já saiu de Perdido).
const ROLETA_PENDING_MSG: Record<string, string> = {
  sem_corretor_disponivel: "Lead reativado. Nenhum corretor livre agora — a roleta distribui assim que houver.",
  fora_horario: "Lead reativado. Fora do horário comercial — a roleta distribui na próxima janela.",
  roleta_inativa: "Lead reativado, mas a roleta está desativada — o lead ficou sem corretor aguardando.",
  sem_config: "Lead reativado, mas a roleta não está configurada — o lead ficou sem corretor aguardando.",
  em_bolsao: "Lead reativado; aguardando distribuição.",
  perdido: "Lead reativado; aguardando distribuição.",
}

export function ReativarLeadButton({
  leadId,
  leadName,
}: {
  leadId: string
  leadName: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [brokers, setBrokers] = useState<EligibleBroker[]>([])
  const [fallback, setFallback] = useState(false)
  const [brokerId, setBrokerId] = useState("")
  const [motivo, setMotivo] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function openModal() {
    setOpen(true)
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/reativar`)
      const data = (await res.json().catch(() => ({}))) as {
        brokers?: EligibleBroker[]
        fallback?: boolean
        currentBrokerId?: string | null
        error?: string
      }
      if (!res.ok) {
        setError(data.error ?? "Falha ao carregar corretores.")
        return
      }
      const list = data.brokers ?? []
      setBrokers(list)
      setFallback(Boolean(data.fallback))
      // Default: corretor atual do lead, se estiver entre os elegíveis.
      const current = data.currentBrokerId
      setBrokerId(current && list.some((b) => b.userId === current) ? current : "")
    } catch {
      setError("Erro de conexão.")
    } finally {
      setLoading(false)
    }
  }

  function close() {
    if (saving) return
    setOpen(false)
    setBrokerId("")
    setMotivo("")
    setError(null)
  }

  async function submit() {
    setError(null)
    if (!brokerId) { setError("Selecione o corretor ou a roleta."); return }
    if (!motivo.trim()) { setError("O motivo é obrigatório."); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/reativar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broker_id: brokerId, motivo: motivo.trim() }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        via_roleta?: boolean
        status?: string
      }
      if (res.ok) {
        // Roleta pediu distribuição mas não conseguiu agora (fora de horário / sem corretor
        // livre / roleta inativa): o lead saiu de Perdido e fica aguardando a roleta.
        if (data.via_roleta && data.status && data.status !== "distributed") {
          alert(ROLETA_PENDING_MSG[data.status] ?? "Lead reativado; aguardando a roleta distribuir.")
        }
        setOpen(false)
        setBrokerId("")
        setMotivo("")
        router.refresh()
      } else {
        setError(data.error ?? "Falha ao reativar.")
      }
    } catch {
      setError("Erro de conexão.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        onClick={openModal}
        title="Reativar lead"
        className="inline-flex items-center gap-1 rounded-md border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700/50 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
      >
        <RotateCcw className="h-3.5 w-3.5" /> Reativar
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              Reativar lead
            </h3>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              {leadName ?? "O lead"} volta para &quot;Aguardando atendimento&quot; com o corretor
              escolhido, que será notificado.
            </p>

            <label className="mt-4 block text-xs font-medium text-stone-600 dark:text-stone-300">
              Enviar para <span className="text-red-500">*</span>
            </label>
            <select
              value={brokerId}
              onChange={(e) => setBrokerId(e.target.value)}
              disabled={loading}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#E8856A] focus:outline-none disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 dark:text-white"
            >
              <option value="">{loading ? "Carregando…" : "Selecione uma opção…"}</option>
              <option value={ROLETA}>🎲 Devolver para a roleta (distribuição automática)</option>
              {brokers.length > 0 && <option disabled>──── ou escolha um corretor ────</option>}
              {brokers.map((b) => (
                <option key={b.userId} value={b.userId}>
                  {b.name}
                </option>
              ))}
            </select>
            {brokerId === ROLETA ? (
              <p className="mt-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-500/10 dark:text-emerald-300">
                🎲 A roleta vai distribuir automaticamente, na ordem dela, para o próximo corretor do empreendimento.
              </p>
            ) : fallback && !loading ? (
              <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                Nenhum corretor vinculado ao empreendimento — mostrando todos os corretores ativos.
              </p>
            ) : null}

            <label className="mt-4 block text-xs font-medium text-stone-600 dark:text-stone-300">
              Motivo da reativação <span className="text-red-500">*</span>
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder="Ex.: cliente retornou o contato pedindo nova proposta."
              className="mt-1 w-full resize-none rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#E8856A] focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
            />

            {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={close}
                disabled={saving}
                className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                Cancelar
              </button>
              <button
                onClick={() => void submit()}
                disabled={saving || loading}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "Reativando…" : "Reativar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
