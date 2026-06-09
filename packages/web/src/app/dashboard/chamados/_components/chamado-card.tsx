"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { X, ChevronLeft, ChevronRight, MessageSquare, CheckCircle2, Clock } from "lucide-react"
import { CHAMADO_STATUS_BADGE, CHAMADO_STATUS_LABEL } from "@web/lib/status-badge"

interface ChamadoCardProps {
  chamado: {
    id: string
    description: string
    reason: string
    image_url: string | null
    image_urls?: string[] | null
    status: string
    reporter_name: string
    created_at: string
    admin_response?: string | null
    responded_at?: string | null
  }
  isAdmin?: boolean
  onStatusChange?: (id: string, updates: { status: string; admin_response?: string | null }) => void
  showReporter?: boolean
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  })
}

export function ChamadoCard({ chamado, isAdmin = false, onStatusChange, showReporter = false }: ChamadoCardProps) {
  const router = useRouter()
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [responseText, setResponseText] = useState(chamado.admin_response ?? "")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const badgeClass = CHAMADO_STATUS_BADGE[chamado.status] ?? CHAMADO_STATUS_BADGE.aberto
  const label = CHAMADO_STATUS_LABEL[chamado.status] ?? chamado.status

  const urls =
    chamado.image_urls && chamado.image_urls.length > 0
      ? chamado.image_urls
      : chamado.image_url
      ? [chamado.image_url]
      : []

  async function applyUpdate(status: string, response?: string) {
    setSaving(true)
    setSaveError(null)
    try {
      const body: Record<string, unknown> = { status }
      if (typeof response === "string") body.admin_response = response

      const res = await fetch(`/api/admin/chamados/${chamado.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setSaveError(json.error ?? "Erro ao salvar"); return }

      onStatusChange?.(chamado.id, {
        status,
        admin_response: json.chamado?.admin_response ?? null,
      })
      setExpanded(false)
      router.refresh() // revalida o layout server component → atualiza badge do menu
    } catch {
      setSaveError("Erro de conexão")
    } finally {
      setSaving(false)
    }
  }

  const handleEmAnalise = () => applyUpdate("em_analise")
  const handleResolver = () => applyUpdate("resolvido", responseText)
  const handleReabrir = () => applyUpdate("aberto")

  return (
    <>
      <div className="rounded-xl border border-stone-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-stone-800 dark:bg-stone-900">
        {/* Card body */}
        <div className="flex items-start gap-4 p-4">
          {/* Thumbnails */}
          {urls.length > 0 && (
            <div className="flex flex-shrink-0 flex-col gap-1">
              {urls.slice(0, 3).map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  className="relative h-16 w-16 overflow-hidden rounded-lg border border-stone-200 transition-opacity hover:opacity-80 dark:border-stone-700"
                >
                  <Image src={url} alt={`Screenshot ${i + 1}`} fill className="object-cover" sizes="64px" />
                </button>
              ))}
              {urls.length > 3 && (
                <span className="text-center text-[10px] text-stone-400">+{urls.length - 3}</span>
              )}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-stone-500 dark:text-stone-400">{formatDate(chamado.created_at)}</span>
                {showReporter && (
                  <span className="text-xs font-medium text-stone-600 dark:text-stone-300">{chamado.reporter_name}</span>
                )}
              </div>
              <span className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${badgeClass}`}>
                {label}
              </span>
            </div>

            <p className="mb-1 line-clamp-3 text-sm text-stone-700 dark:text-stone-300">{chamado.description}</p>

            <div className="mt-2 rounded-md bg-stone-50 px-3 py-2 dark:bg-stone-800/60">
              <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-stone-400">Motivo</p>
              <p className="line-clamp-2 text-xs text-stone-600 dark:text-stone-400">{chamado.reason}</p>
            </div>

            {/* Resposta do admin (visível para todos) */}
            {chamado.admin_response && (
              <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  <MessageSquare className="h-3 w-3" /> Resposta
                </p>
                <p className="text-xs text-emerald-800 dark:text-emerald-300">{chamado.admin_response}</p>
                {chamado.responded_at && (
                  <p className="mt-0.5 text-[10px] text-emerald-500 dark:text-emerald-500">
                    {formatDate(chamado.responded_at)}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Ações do admin */}
        {isAdmin && chamado.status !== "resolvido" && (
          <div className="border-t border-stone-100 px-4 py-2 dark:border-stone-800">
            {!expanded ? (
              <div className="flex gap-2">
                {chamado.status === "aberto" && (
                  <button
                    onClick={handleEmAnalise}
                    disabled={saving}
                    className="flex items-center gap-1 rounded-md bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/20"
                  >
                    <Clock className="h-3 w-3" /> Em análise
                  </button>
                )}
                <button
                  onClick={() => setExpanded(true)}
                  className="flex items-center gap-1 rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                >
                  <CheckCircle2 className="h-3 w-3" /> Resolver
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder="Escreva uma resposta para o solicitante (opcional)..."
                  rows={3}
                  autoFocus
                  className="w-full resize-none rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:border-stone-400 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
                />
                {saveError && <p className="text-xs text-red-500">{saveError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={handleResolver}
                    disabled={saving}
                    className="flex flex-1 items-center justify-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {saving ? "Salvando..." : <><CheckCircle2 className="h-3 w-3" /> Marcar resolvido</>}
                  </button>
                  <button
                    onClick={() => setExpanded(false)}
                    disabled={saving}
                    className="rounded-md bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Reabrir (se resolvido) */}
        {isAdmin && chamado.status === "resolvido" && (
          <div className="border-t border-stone-100 px-4 py-2 dark:border-stone-800">
            <button
              onClick={handleReabrir}
              disabled={saving}
              className="text-xs text-stone-400 hover:text-stone-600 disabled:opacity-50 dark:text-stone-600 dark:hover:text-stone-400"
            >
              Reabrir ticket
            </button>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && urls[lightboxIndex] && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <img
              src={urls[lightboxIndex]}
              alt={`Screenshot ${lightboxIndex + 1}`}
              className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain shadow-2xl"
            />
            <button
              onClick={() => setLightboxIndex(null)}
              className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-lg hover:bg-stone-100 dark:bg-stone-800 dark:hover:bg-stone-700"
              aria-label="Fechar"
            >
              <X className="h-4 w-4 text-stone-700 dark:text-stone-200" />
            </button>
            {urls.length > 1 && (
              <>
                <button
                  onClick={() => setLightboxIndex((i) => ((i ?? 0) - 1 + urls.length) % urls.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow hover:bg-white dark:bg-stone-800/90"
                  aria-label="Anterior"
                >
                  <ChevronLeft className="h-4 w-4 text-stone-700 dark:text-stone-200" />
                </button>
                <button
                  onClick={() => setLightboxIndex((i) => ((i ?? 0) + 1) % urls.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow hover:bg-white dark:bg-stone-800/90"
                  aria-label="Próxima"
                >
                  <ChevronRight className="h-4 w-4 text-stone-700 dark:text-stone-200" />
                </button>
                <p className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">
                  {lightboxIndex + 1} / {urls.length}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
