import { Bot, UserCheck } from "lucide-react"

interface AiStatusBannerProps {
  /**
   * `true` quando o corretor/humano está no atendimento (takeover implícito por
   * envio recente OU handoff manual de admin). `false` = Nicole atendendo
   * automaticamente. Derivado em `ConversationThread` via `deriveBrokerActive`.
   */
  brokerActive: boolean
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
export function AiStatusBanner({ brokerActive }: AiStatusBannerProps) {
  if (brokerActive) {
    // Estado B — corretor/humano no atendimento.
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 dark:border-green-800 dark:bg-green-900/20"
      >
        <UserCheck className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
        <span className="text-sm font-medium text-green-800 dark:text-green-200">
          Você está no atendimento
        </span>
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
