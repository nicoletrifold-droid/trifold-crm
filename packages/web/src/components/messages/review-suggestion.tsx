"use client"

/**
 * Story 83-2 (Epic 83) — caixa de sugestão da revisão ortográfica.
 * Compartilhada entre o chat do lead (BrokerMessageInput) e o portal
 * (admin-chat-feed). O humano SEMPRE decide: corrigida ou como escreveu.
 */

interface ReviewSuggestionProps {
  corrected: string
  onAcceptCorrected: () => void
  onSendOriginal: () => void
  disabled?: boolean
}

export function ReviewSuggestion({
  corrected,
  onAcceptCorrected,
  onSendOriginal,
  disabled = false,
}: ReviewSuggestionProps) {
  return (
    <div
      className="mb-2 rounded-lg border border-amber-400/50 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10"
      role="alert"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
        Revisão sugerida
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800 dark:text-stone-100">
        {corrected}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAcceptCorrected}
          disabled={disabled}
          className="rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50"
        >
          Enviar corrigida
        </button>
        <button
          type="button"
          onClick={onSendOriginal}
          disabled={disabled}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          Enviar como escrevi
        </button>
        <span className="text-[11px] text-gray-400 dark:text-stone-500">
          ou continue editando sua mensagem
        </span>
      </div>
    </div>
  )
}
