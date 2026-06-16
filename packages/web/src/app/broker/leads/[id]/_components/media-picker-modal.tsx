"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"

interface MediaAsset {
  id: string
  title: string
  category: string
  file_url: string
  file_name: string
  file_type: "image" | "pdf"
  property_name: string | null
}

interface Props {
  leadId: string
  onClose: () => void
}

const CATEGORY_LABELS: Record<string, string> = {
  planta: "Planta",
  fachada: "Fachada",
  tabela: "Tabela",
  outro: "Outro",
}

export function MediaPickerModal({ leadId, onClose }: Props) {
  const router = useRouter()
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const loadAssets = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/nicole/media")
      if (res.ok) {
        const json = (await res.json()) as { data: MediaAsset[] }
        setAssets(json.data ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAssets()
  }, [loadAssets])

  async function handleSend(assetId: string, assetTitle: string) {
    setSending(assetId)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`/api/nicole/media/${assetId}/send?lead_id=${leadId}`, {
        method: "POST",
      })
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean
        error?: string
        message?: string
        sent?: boolean
      }

      if (!res.ok || !json.success) {
        if (json.error === "WHATSAPP_WINDOW_CLOSED") {
          setError(json.message ?? "Fora da janela de 24h do WhatsApp.")
        } else {
          setError(json.message ?? "Não foi possível enviar. Tente novamente.")
        }
        return
      }

      if (json.sent) {
        setSuccess(`"${assetTitle}" enviado com sucesso.`)
      } else {
        setSuccess(`"${assetTitle}" registrado (envio WhatsApp pendente).`)
      }
      router.refresh()
    } catch {
      setError("Erro de conexão. Tente novamente.")
    } finally {
      setSending(null)
    }
  }

  const filtered = assets.filter(
    (a) =>
      !search ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      (a.property_name ?? "").toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-t-2xl bg-white shadow-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-700 sm:rounded-xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-stone-700">
          <h3 className="text-base font-semibold text-gray-900 dark:text-stone-100">
            Biblioteca de Mídia
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 dark:text-stone-500 dark:hover:bg-stone-800"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-gray-100 px-4 py-2 dark:border-stone-800">
          <input
            type="text"
            placeholder="Buscar por título ou empreendimento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
          />
        </div>

        {/* Feedback */}
        {error && (
          <div className="mx-4 mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">
            {error}
          </div>
        )}
        {success && (
          <div className="mx-4 mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-500/15 dark:text-green-300">
            {success}
          </div>
        )}

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {loading ? (
            <p className="py-8 text-center text-sm text-gray-400 dark:text-stone-500">
              Carregando…
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400 dark:text-stone-500">
              Nenhum arquivo encontrado.
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((asset) => (
                <li
                  key={asset.id}
                  className="flex items-center gap-3 rounded-lg border border-gray-100 p-3 dark:border-stone-800"
                >
                  {asset.file_type === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={asset.file_url}
                      alt={asset.title}
                      className="h-12 w-12 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-red-200 bg-red-50 text-xs font-bold text-red-600 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
                      PDF
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-stone-100">
                      {asset.title}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-stone-500">
                      {CATEGORY_LABELS[asset.category] ?? asset.category}
                      {asset.property_name ? ` · ${asset.property_name}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => void handleSend(asset.id, asset.title)}
                    disabled={sending === asset.id}
                    className="shrink-0 rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                  >
                    {sending === asset.id ? "Enviando…" : "Enviar"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
