"use client"

import { useState } from "react"
import { Bot, Loader2, RotateCcw, UserCheck } from "lucide-react"

interface AiStatusBannerProps {
  /**
   * `true` quando o corretor/humano está no atendimento (takeover implícito por
   * envio recente OU handoff manual de admin). `false` = Nicole atendendo
   * automaticamente. Derivado em `ConversationThread` via `deriveBrokerActive`.
   */
  brokerActive: boolean
  /**
   * Story 63-14 — callback opcional para devolver o atendimento à Nicole
   * (`POST /api/leads/[id]/resume-ai`). Quando definido, renderiza o botão
   * "Devolver para Nicole" no Estado B. Quando `undefined`, o banner permanece
   * read-only (backward compatible com a Story 63-8).
   */
  onResumeAi?: () => Promise<void>
}

/**
 * Story 63-8 (Epic 63) — Banner read-only de estado do atendimento.
 *
 * Indica, sem ambiguidade, se a Nicole ainda atende automaticamente (Estado A)
 * ou se o corretor já assumiu (Estado B). É PURAMENTE informativo: sem botão,
 * sem ação, sem chamada a endpoint e sem mutação de `is_ai_active` (CON-3).
 *
 * Paleta (decisão de design aceita pelo @po): roxo = AI/Nicole, verde = humano.
 * Laranja é reservado para ações/interação e não aparece aqui.
 *
 * a11y: `role="status"` + `aria-live="polite"` permitem que leitores de tela
 * anunciem a mudança de estado sem interromper o usuário.
 */
export function AiStatusBanner({
  brokerActive,
  onResumeAi,
}: AiStatusBannerProps) {
  const [loading, setLoading] = useState(false)

  async function handleResumeClick() {
    if (!onResumeAi || loading) return
    setLoading(true)
    try {
      await onResumeAi()
    } catch (err) {
      // Não lança: restaura o botão para nova tentativa (AC4).
      console.error("[AiStatusBanner] resume-ai failed:", err)
    } finally {
      setLoading(false)
    }
  }

  if (brokerActive) {
    // Estado B — corretor/humano no atendimento.
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-between gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 dark:border-green-800 dark:bg-green-900/20"
      >
        <div className="flex items-center gap-2">
          <UserCheck className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
          <span className="text-sm font-medium text-green-800 dark:text-green-200">
            Você está no atendimento
          </span>
        </div>
        {onResumeAi && (
          <button
            type="button"
            onClick={handleResumeClick}
            disabled={loading}
            aria-label={
              loading
                ? "Devolvendo atendimento para a Nicole..."
                : "Devolver atendimento para a Nicole"
            }
            aria-disabled={loading}
            className="flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded px-3 py-2 text-sm text-green-700 hover:bg-green-100 hover:text-green-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-green-300 dark:hover:bg-green-900/30"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            )}
            <span>Devolver para Nicole</span>
          </button>
        )}
      </div>
    )
  }

  // Estado A — Nicole atendendo automaticamente.
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-2 rounded-md border border-purple-200 bg-purple-50 px-3 py-2 dark:border-purple-800 dark:bg-purple-900/20"
    >
      <Bot className="mt-0.5 h-4 w-4 shrink-0 text-purple-600" aria-hidden="true" />
      <div className="flex flex-col">
        <span className="text-sm font-medium text-purple-800 dark:text-purple-200">
          Nicole está atendendo automaticamente
        </span>
        <span className="text-xs text-purple-600 dark:text-purple-400">
          Ao enviar sua primeira mensagem, você assume e a Nicole pausa
          imediatamente. Se ficar 24h sem responder ao lead, a Nicole reassume
          automaticamente.
        </span>
      </div>
    </div>
  )
}
