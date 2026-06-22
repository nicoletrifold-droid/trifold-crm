"use client"

import { useState } from "react"
import type { ProvenanceStatus } from "@web/lib/agent/context-builder"

// ─── SyncStatusBanner ─────────────────────────────────────────────────────────
// Aviso não-modal de staleness/erro de sync dos dados Meta Ads (Story 76-3).
// - Renderiza nada quando dados frescos E sync ok (AC4) ou quando dispensado.
// - Erro tem prioridade visual sobre staleness (vermelho > âmbar).
// - Dispensável via X (AC5). O dismiss guarda a REFERÊNCIA do `status` dispensado;
//   como o hook produz um novo objeto a cada poll, o aviso reaparece no próximo
//   refresh de 5 min (derivado, sem setState dentro de effect).
// - Ícones inline (o codebase evita lucide neste módulo — ver agent-chat-panel.tsx).

const STALE_TEXT =
  "Dados de Meta Ads possivelmente desatualizados — última sincronização há mais de 36h."
const ERROR_TEXT =
  "Falha na última sincronização com a Meta. Os dados podem estar incompletos."

export function SyncStatusBanner({ status }: { status: ProvenanceStatus | null }) {
  const [dismissedFor, setDismissedFor] = useState<ProvenanceStatus | null>(null)
  const dismissed = dismissedFor === status

  if (!status || (!status.isStale && !status.isError) || dismissed) return null

  const isError = status.isError
  const text = isError ? ERROR_TEXT : STALE_TEXT
  const palette = isError
    ? "bg-red-50 border-red-200 text-red-800 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300"
    : "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300"

  return (
    <div role="status" className={`flex items-start gap-2 border-b px-4 py-2 text-xs ${palette}`}>
      {/* AlertTriangle (inline SVG) */}
      <svg
        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className="mt-0.5 shrink-0" aria-hidden="true"
      >
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" />
      </svg>
      <span className="flex-1 leading-snug">{text}</span>
      <button
        onClick={() => setDismissedFor(status)}
        aria-label="Dispensar aviso"
        className="shrink-0 opacity-60 hover:opacity-100"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}
