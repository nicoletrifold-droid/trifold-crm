"use client"

import { useState } from "react"
import { CheckCircle, Eye, ExternalLink, FileText, ImageIcon } from "lucide-react"
import { RejeitarModal } from "./rejeitar-modal"

export interface AprovacaoItem {
  id: string
  tipo: "foto" | "documento"
  storage_path: string
  signed_url: string | null
  metadata: Record<string, unknown>
  enviado_por_nome: string
  created_at: string
  status: string
  motivo_rejeicao?: string | null
}

interface AprovacoesTabProps {
  obraId: string
  items: AprovacaoItem[]
  setItems: React.Dispatch<React.SetStateAction<AprovacaoItem[]>>
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function AprovacoesTab({ obraId, items, setItems }: AprovacoesTabProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [rejeitandoItem, setRejeitandoItem] = useState<AprovacaoItem | null>(null)
  const [toast, setToast] = useState<{ id: string; msg: string } | null>(null)

  function showToast(id: string, msg: string) {
    setToast({ id, msg })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleAprovar(item: AprovacaoItem) {
    setLoadingId(item.id)
    try {
      const res = await fetch(
        `/api/admin/obras/${obraId}/aprovacoes/${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "aprovar" }),
        }
      )
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? "Erro ao aprovar")
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id))
      showToast(item.id, "Upload aprovado e publicado.")
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao aprovar")
    } finally {
      setLoadingId(null)
    }
  }

  async function handleRejeitar(item: AprovacaoItem, motivo: string) {
    setLoadingId(item.id)
    try {
      const res = await fetch(
        `/api/admin/obras/${obraId}/aprovacoes/${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "rejeitar", motivo_rejeicao: motivo }),
        }
      )
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? "Erro ao rejeitar")
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id))
      setRejeitandoItem(null)
      showToast(item.id, "Upload rejeitado.")
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao rejeitar")
    } finally {
      setLoadingId(null)
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <CheckCircle className="mb-3 h-10 w-10 text-green-500 dark:text-green-400" />
        <p className="text-sm font-medium text-gray-700 dark:text-stone-300">
          Nenhum upload aguardando aprovação.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {toast && (
        <div className="rounded-lg bg-green-50 px-4 py-2.5 text-sm text-green-700 dark:bg-green-500/10 dark:text-green-300">
          {toast.msg}
        </div>
      )}

      {items.map((item) => {
        const isLoading = loadingId === item.id
        const meta = item.metadata as {
          caption?: string
          name?: string
        }
        const displayName =
          item.tipo === "foto"
            ? (meta.caption ?? "Foto sem legenda")
            : (meta.name ?? item.storage_path.split("/").pop() ?? "Documento")

        return (
          <div
            key={item.id}
            className="flex items-start gap-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
          >
            {/* Preview */}
            <div className="flex-shrink-0">
              {item.tipo === "foto" && item.signed_url ? (
                <button
                  type="button"
                  onClick={() => window.open(item.signed_url!, "_blank")}
                  className="group relative block h-16 w-16 overflow-hidden rounded-lg"
                  title="Abrir foto"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.signed_url}
                    alt={displayName}
                    className="h-16 w-16 object-cover transition-opacity group-hover:opacity-75"
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
                    <ExternalLink className="h-4 w-4 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100" />
                  </span>
                </button>
              ) : item.tipo === "foto" ? (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gray-100 dark:bg-stone-800">
                  <ImageIcon className="h-6 w-6 text-gray-400 dark:text-stone-500" />
                </div>
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gray-100 dark:bg-stone-800">
                  <FileText className="h-6 w-6 text-gray-400 dark:text-stone-500" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-stone-100">
                  {displayName}
                </p>
                <span
                  className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    item.tipo === "foto"
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                      : "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300"
                  }`}
                >
                  {item.tipo === "foto" ? "Foto" : "Documento"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-stone-400">
                Por <span className="font-medium">{item.enviado_por_nome}</span> · {formatDate(item.created_at)}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {item.tipo === "documento" && item.signed_url && (
                  <button
                    type="button"
                    onClick={() => window.open(item.signed_url!, "_blank")}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                  >
                    <Eye className="h-3 w-3" />
                    Visualizar
                  </button>
                )}
                <button
                  onClick={() => handleAprovar(item)}
                  disabled={isLoading}
                  className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {isLoading && loadingId === item.id ? "Aprovando..." : "Aprovar"}
                </button>
                <button
                  onClick={() => setRejeitandoItem(item)}
                  disabled={isLoading}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Rejeitar
                </button>
              </div>
            </div>
          </div>
        )
      })}

      {rejeitandoItem && (
        <RejeitarModal
          loading={loadingId === rejeitandoItem.id}
          onConfirm={(motivo) => handleRejeitar(rejeitandoItem, motivo)}
          onCancel={() => setRejeitandoItem(null)}
        />
      )}
    </div>
  )
}
