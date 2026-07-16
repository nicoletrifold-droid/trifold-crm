"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { STATUS_LABELS, STATUS_STYLES } from "../../_components/blast-list"

interface VariantStats {
  sent: number
  opened: number
  opened_rate: number
  clicked: number
  click_rate: number
}

interface BlastStats {
  id: string
  name: string
  status: string
  total_recipients: number
  scheduled_for: string | null
  created_at: string
  ab_test_enabled: boolean
  subject_variant_a: string | null
  subject_variant_b: string | null
  sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  failed: number
  pending: number
  total_logs: number
  by_variant: { a: VariantStats; b: VariantStats } | null
}

function formatPct(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

interface Props {
  id: string
}

export function BlastDetail({ id }: Props) {
  const router = useRouter()
  const [stats, setStats] = useState<BlastStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    const res = await fetch(`/api/admin/email-blasts/${id}/stats`)
    if (res.status === 403) { router.push("/dashboard"); return }
    if (res.status === 404) { setError("Blast não encontrado"); setLoading(false); return }
    const json = (await res.json()) as { data?: BlastStats; error?: string }
    if (!res.ok || !json.data) {
      setError(json.error ?? "Erro ao carregar dados do blast")
      setLoading(false)
      return
    }
    setStats(json.data)
    setLoading(false)
  }, [id, router])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchStats() }, [fetchStats])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-stone-400">Carregando...</p>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/sistema/email-blasts" className="text-sm text-indigo-600 hover:underline">
          ← Voltar
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? "Erro ao carregar dados do blast"}
        </div>
      </div>
    )
  }

  const generalStats = [
    { label: "Enviados", value: stats.sent },
    { label: "Entregues", value: stats.delivered },
    { label: "Abertos", value: stats.opened },
    { label: "Clicados", value: stats.clicked },
    { label: "Retornados", value: stats.bounced },
    { label: "Falhados", value: stats.failed },
    { label: "Pendentes", value: stats.pending },
  ]

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/sistema/email-blasts" className="text-sm text-indigo-600 hover:underline">
          ← Voltar
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">{stats.name}</h1>
          <p className="mt-0.5 text-sm text-stone-500">
            {stats.total_recipients} destinatário{stats.total_recipients !== 1 ? "s" : ""}
          </p>
        </div>
        <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[stats.status] ?? "bg-stone-100 text-stone-500"}`}>
          {STATUS_LABELS[stats.status] ?? stats.status}
        </span>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-medium text-stone-700">Estatísticas gerais</h2>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {generalStats.map((s) => (
            <div key={s.label}>
              <p className="text-xs text-stone-400">{s.label}</p>
              <p className="text-lg font-semibold text-stone-800">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {stats.by_variant && (
        <div className="rounded-lg border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-medium text-stone-700">Teste A/B de assunto</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-stone-100 bg-stone-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-stone-400">Variante A</p>
              <p className="mt-1 text-sm text-stone-700 truncate">{stats.subject_variant_a}</p>
              <div className="mt-3 space-y-1.5 text-sm">
                <p className="text-stone-600">Enviados: <span className="font-medium text-stone-800">{stats.by_variant.a.sent}</span></p>
                <p className="text-stone-600">Abertos: <span className="font-medium text-stone-800">{stats.by_variant.a.opened}</span> ({formatPct(stats.by_variant.a.opened_rate)})</p>
                <p className="text-stone-600">Clicados: <span className="font-medium text-stone-800">{stats.by_variant.a.clicked}</span> ({formatPct(stats.by_variant.a.click_rate)})</p>
              </div>
            </div>
            <div className="rounded-lg border border-stone-100 bg-stone-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-stone-400">Variante B</p>
              <p className="mt-1 text-sm text-stone-700 truncate">{stats.subject_variant_b}</p>
              <div className="mt-3 space-y-1.5 text-sm">
                <p className="text-stone-600">Enviados: <span className="font-medium text-stone-800">{stats.by_variant.b.sent}</span></p>
                <p className="text-stone-600">Abertos: <span className="font-medium text-stone-800">{stats.by_variant.b.opened}</span> ({formatPct(stats.by_variant.b.opened_rate)})</p>
                <p className="text-stone-600">Clicados: <span className="font-medium text-stone-800">{stats.by_variant.b.clicked}</span> ({formatPct(stats.by_variant.b.click_rate)})</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
