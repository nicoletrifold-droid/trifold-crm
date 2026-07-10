"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowLeft, Wallet, MessageCircle, Mail, Bell } from "lucide-react"

interface Row {
  id: string
  created_at: string
  tipo: string
  canal: string
  status: string
  vencimento: string | null
  obra_id: string | null
  cliente_nome: string
  obra_nome: string
}

const TIPO_LABEL: Record<string, string> = {
  novo_boleto: "Boleto emitido",
  vence_hoje: "Vence hoje",
  atraso_5: "Atraso (5 dias)",
  atraso_15: "Atraso (15 dias)",
}
const CANAL_LABEL: Record<string, string> = { whatsapp: "WhatsApp", email: "E-mail", push: "Push" }
const CanalIcon = ({ canal }: { canal: string }) => {
  const cls = "h-3.5 w-3.5"
  if (canal === "whatsapp") return <MessageCircle className={`${cls} text-emerald-600 dark:text-emerald-400`} />
  if (canal === "email") return <Mail className={`${cls} text-blue-600 dark:text-blue-400`} />
  return <Bell className={`${cls} text-stone-500`} />
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}
function fmtDate(d: string | null) {
  if (!d) return "—"
  const [y, m, dd] = d.slice(0, 10).split("-")
  return dd && m && y ? `${dd}/${m}/${y}` : d
}

export default function NotificacoesFinanceirasPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tipo, setTipo] = useState("")
  const [canal, setCanal] = useState("")
  const [obra, setObra] = useState("")

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (tipo) p.set("tipo", tipo)
      if (canal) p.set("canal", canal)
      if (obra) p.set("obra_id", obra)
      const res = await fetch(`/api/sistema/notificacoes-financeiras?${p.toString()}`)
      if (res.status === 403) { setError("Acesso restrito a administradores e supervisores."); return }
      if (!res.ok) throw new Error("Erro ao carregar")
      const json = await res.json()
      setRows(json.data ?? [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido")
    } finally {
      setLoading(false)
    }
  }, [tipo, canal, obra])

  useEffect(() => { fetchData() }, [fetchData])

  // Opções de empreendimento (das linhas carregadas) + agrupamento
  const obrasOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rows) if (r.obra_id) m.set(r.obra_id, r.obra_nome)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const grupos = useMemo(() => {
    const m = new Map<string, Row[]>()
    for (const r of rows) {
      const k = r.obra_nome || "Sem empreendimento"
      ;(m.get(k) ?? m.set(k, []).get(k)!).push(r)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [rows])

  const selectCls = "rounded border border-stone-200 px-2 py-1 text-xs text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/sistema" className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200">
          <ArrowLeft className="h-3.5 w-3.5" /> Sistema
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <Wallet className="h-5 w-5 text-orange-600" />
          <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">Notificações Financeiras</h1>
        </div>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Boletos — emissão, vencimento e atraso enviados aos clientes, por cliente e empreendimento.
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <select value={obra} onChange={(e) => setObra(e.target.value)} className={selectCls}>
          <option value="">Todos os empreendimentos</option>
          {obrasOptions.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={selectCls}>
          <option value="">Todos os tipos</option>
          <option value="novo_boleto">Boleto emitido</option>
          <option value="vence_hoje">Vence hoje</option>
          <option value="atraso_5">Atraso (5 dias)</option>
          <option value="atraso_15">Atraso (15 dias)</option>
        </select>
        <select value={canal} onChange={(e) => setCanal(e.target.value)} className={selectCls}>
          <option value="">Todos os canais</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">E-mail</option>
          <option value="push">Push</option>
        </select>
        <span className="ml-auto self-center text-xs text-stone-400 dark:text-stone-500">{rows.length} notificações</span>
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</p>}
      {loading && <p className="py-10 text-center text-sm text-stone-400">Carregando...</p>}

      {!loading && !error && grupos.length === 0 && (
        <div className="rounded-lg border border-stone-200 bg-white px-4 py-10 text-center text-sm text-stone-400 dark:border-stone-800 dark:bg-stone-900">
          Nenhuma notificação financeira registrada ainda. Os disparos passam a aparecer aqui a partir de agora.
        </div>
      )}

      {/* Grupos por empreendimento */}
      {!loading && grupos.map(([obraNome, list]) => (
        <div key={obraNome} className="rounded-lg border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3 dark:border-stone-800">
            <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100">{obraNome}</h2>
            <span className="text-xs text-stone-400 dark:text-stone-500">{list.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-stone-400 dark:text-stone-500">
                  <th className="px-4 py-2 font-medium">Cliente</th>
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  <th className="px-4 py-2 font-medium">Canal</th>
                  <th className="px-4 py-2 font-medium">Vencimento</th>
                  <th className="px-4 py-2 font-medium">Data do envio</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50 dark:divide-stone-800">
                {list.map((r) => (
                  <tr key={r.id} className="text-stone-700 dark:text-stone-300">
                    <td className="px-4 py-2">{r.cliente_nome}</td>
                    <td className="px-4 py-2">{TIPO_LABEL[r.tipo] ?? r.tipo}</td>
                    <td className="px-4 py-2"><span className="inline-flex items-center gap-1.5"><CanalIcon canal={r.canal} />{CANAL_LABEL[r.canal] ?? r.canal}</span></td>
                    <td className="px-4 py-2 tabular-nums">{fmtDate(r.vencimento)}</td>
                    <td className="px-4 py-2 tabular-nums text-stone-500 dark:text-stone-400">{fmtDateTime(r.created_at)}</td>
                    <td className="px-4 py-2">
                      {r.status === "sent"
                        ? <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Enviado</span>
                        : <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300">Falhou</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
