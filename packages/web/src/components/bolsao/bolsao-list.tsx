"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Container, Clock, Phone } from "lucide-react"
import { createClient } from "@web/lib/supabase/client"

export interface BolsaoLead {
  id: string
  name: string | null
  phone: string | null
  bolsao_em: string
  property_name: string | null
}

interface Props {
  initialLeads: BolsaoLead[]
  orgId: string
  /** Corretor pode puxar; gestor vê read-only. */
  canPull: boolean
  /** true = área do corretor (sempre dark); false = dashboard (light/dark). */
  dark?: boolean
}

function waitingLabel(sinceISO: string, nowMs: number): string {
  const mins = Math.max(0, Math.floor((nowMs - new Date(sinceISO).getTime()) / 60000))
  if (mins < 60) return `há ${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `há ${h}h ${m}min` : `há ${h}h`
}

export function BolsaoList({ initialLeads, orgId, canPull, dark = false }: Props) {
  const router = useRouter()
  const [leads, setLeads] = useState(initialLeads)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  // Story 75-89: distingue aviso de erro (ex.: "já foi atendido por outro") de sucesso,
  // pra dar realce visível em vez de um texto sutil que o corretor não percebe.
  const [msgIsError, setMsgIsError] = useState(false)
  // Relógio do "tempo de espera" — atualiza a cada minuto (não depende de fetch).
  const [nowMs, setNowMs] = useState(() => initialLeads.reduce((a, l) => Math.max(a, new Date(l.bolsao_em).getTime()), 0) || 0)

  useEffect(() => setLeads(initialLeads), [initialLeads])

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000)
    setNowMs(Date.now())
    return () => clearInterval(t)
  }, [])

  // Realtime: qualquer mudança em leads desta org → re-renderiza o pool (router.refresh).
  useEffect(() => {
    const supabase = createClient()
    const ch = supabase
      .channel(`bolsao-${orgId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "leads", filter: `org_id=eq.${orgId}` }, () => {
        router.refresh()
      })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [orgId, router])

  const pegar = useCallback(async (id: string) => {
    setPendingId(id)
    setMsg(null)
    setMsgIsError(false)
    try {
      const res = await fetch(`/api/bolsao/${id}/pegar`, { method: "POST" })
      const body = (await res.json().catch(() => ({}))) as { message?: string; status?: string }
      setMsg(body.message ?? (res.ok ? "Pronto!" : "Erro ao pegar o lead."))
      setMsgIsError(!res.ok)
      if (res.ok) {
        setLeads((cur) => cur.filter((l) => l.id !== id))
        router.refresh()
      } else if (body.status === "gone") {
        // Lead já foi puxado por outro — some da lista e o refresh confirma (não volta,
        // pois a query do pool exige assigned_broker_id null — Story 75-89).
        setLeads((cur) => cur.filter((l) => l.id !== id))
        router.refresh()
      }
      // Story 75-149: status "ex_dono" (o corretor deixou este lead cair no bolsão) cai no
      // caminho genérico acima (banner de erro via setMsg/setMsgIsError) e o card PERMANECE
      // na lista de propósito — o lead segue no pool para outro corretor pegar.
    } catch {
      setMsg("Erro de conexão ao pegar o lead.")
      setMsgIsError(true)
    } finally {
      setPendingId(null)
    }
  }, [router])

  const cardCls = dark
    ? "rounded-xl border border-stone-800 bg-stone-900 p-4"
    : "rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
  const nameCls = dark ? "text-white" : "text-gray-900 dark:text-white"
  const subCls = dark ? "text-stone-400" : "text-stone-500 dark:text-stone-400"

  if (leads.length === 0) {
    return (
      <div className={`mt-8 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed py-20 text-center ${dark ? "border-stone-700" : "border-stone-300 dark:border-stone-700"}`}>
        <Container className={`h-10 w-10 ${dark ? "text-stone-500" : "text-stone-400 dark:text-stone-500"}`} />
        <p className={`text-sm ${subCls}`}>Nenhum lead no bolsão agora.</p>
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-3">
      {msg && (
        <p
          role="status"
          className={
            msgIsError
              ? "rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-600 dark:text-amber-400"
              : `text-sm ${subCls}`
          }
        >
          {msg}
        </p>
      )}
      {leads.map((l) => (
        <div key={l.id} className={`flex items-center justify-between gap-4 ${cardCls}`}>
          <div className="min-w-0">
            <p className={`font-semibold truncate ${nameCls}`}>{l.name ?? "Lead sem nome"}</p>
            <div className={`mt-1 flex flex-wrap items-center gap-3 text-xs ${subCls}`}>
              {l.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{l.phone}</span>}
              {l.property_name && <span className="truncate">{l.property_name}</span>}
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{nowMs ? waitingLabel(l.bolsao_em, nowMs) : ""}</span>
            </div>
          </div>
          {canPull && (
            <button
              onClick={() => void pegar(l.id)}
              disabled={pendingId === l.id}
              className="shrink-0 rounded-lg bg-[#E8856A] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#d6724f] disabled:opacity-50"
            >
              {pendingId === l.id ? "Pegando…" : "Pegar"}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
