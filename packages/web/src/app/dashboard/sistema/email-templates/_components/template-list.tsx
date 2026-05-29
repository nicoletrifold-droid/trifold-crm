"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

interface Template {
  id: string
  name: string
  slug: string
  category: string
  is_active: boolean
  created_at: string
}

const CATEGORY_LABELS: Record<string, string> = {
  transacional: "Transacional",
  campanha: "Campanha",
  automacao: "Automação",
}

export function EmailTemplateList() {
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>([])
  const [total, setTotal] = useState(0)
  const [category, setCategory] = useState("")
  const [loading, setLoading] = useState(true)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [archiving, setArchiving] = useState(false)

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams({ limit: "50" })
    if (category) params.set("category", category)

    const res = await fetch(`/api/admin/email-templates?${params.toString()}`)
    if (res.status === 403) {
      router.push("/dashboard")
      return
    }
    const json = (await res.json()) as { data?: Template[]; total?: number }
    setTemplates(json.data ?? [])
    setTotal(json.total ?? 0)
    setLoading(false)
  }, [category, router])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData()
  }, [fetchData])

  const archive = async (id: string) => {
    setArchiving(true)
    await fetch(`/api/admin/email-templates/${id}`, { method: "DELETE" })
    setConfirmId(null)
    setArchiving(false)
    await fetchData()
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-stone-400">Carregando...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">Templates de Email</h1>
          <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
            {total} template{total !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/dashboard/sistema/email-templates/novo"
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + Novo Template
        </Link>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3 dark:border-stone-800">
          <h2 className="text-sm font-medium text-stone-700 dark:text-stone-300">Templates</h2>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded border border-stone-200 px-2 py-1 text-xs text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
          >
            <option value="">Todos</option>
            <option value="transacional">Transacional</option>
            <option value="campanha">Campanha</option>
            <option value="automacao">Automação</option>
          </select>
        </div>

        {templates.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-stone-400">Nenhum template encontrado</p>
            <Link
              href="/dashboard/sistema/email-templates/novo"
              className="mt-2 inline-block text-sm text-indigo-600 hover:underline"
            >
              Criar primeiro template
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-stone-50 dark:divide-stone-800">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-stone-400">
              <span>Nome</span>
              <span>Categoria</span>
              <span>Status</span>
              <span>Criado em</span>
              <span className="text-right">Ações</span>
            </div>
            {templates.map((t) => (
              <div
                key={t.id}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-center px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-stone-800 dark:text-stone-100">{t.name}</p>
                  <p className="font-mono text-[11px] text-stone-400">{t.slug}</p>
                </div>
                <span className="text-xs text-stone-600 dark:text-stone-400">
                  {CATEGORY_LABELS[t.category] ?? t.category}
                </span>
                <span>
                  {t.is_active ? (
                    <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                      Ativo
                    </span>
                  ) : (
                    <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                      Rascunho
                    </span>
                  )}
                </span>
                <span className="text-xs text-stone-500 dark:text-stone-400">{formatDate(t.created_at)}</span>
                <div className="flex justify-end gap-3">
                  <Link
                    href={`/dashboard/sistema/email-templates/${t.id}`}
                    className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    Editar
                  </Link>
                  <button
                    onClick={() => setConfirmId(t.id)}
                    className="text-xs text-stone-400 hover:text-red-500"
                  >
                    Arquivar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
            <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Arquivar template?</h3>
            <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
              O template será desativado e não ficará disponível para novos envios.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmId(null)}
                className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                Cancelar
              </button>
              <button
                onClick={() => archive(confirmId)}
                disabled={archiving}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                {archiving ? "Arquivando..." : "Arquivar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
