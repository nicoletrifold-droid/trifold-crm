/**
 * Story 75-156 — Atraso "humano" antes de a Nicole responder no WhatsApp.
 *
 * Portado do padrão já usado no Telegram
 * (`app/api/telegram/webhook/route.ts` → calculateTypingDelay): base 800–1200ms
 * + ~25ms/caractere, com teto de 3s no componente por caractere.
 *
 * Função PURA (sem imports `@web/*`/Supabase) para ser testável no vitest.
 */

/** Teto do componente proporcional ao tamanho do texto (ms). */
export const TYPING_CHAR_DELAY_CAP_MS = 3000

/**
 * Calcula o atraso (ms) para simular a Nicole "digitando" antes de enviar.
 *
 * @param text          Texto da resposta que será enviado ao lead.
 * @param randomImpl    Fonte de aleatoriedade (injetável para testes determinísticos).
 * @returns Atraso arredondado em milissegundos.
 */
export function calculateTypingDelay(
  text: string,
  randomImpl: () => number = Math.random
): number {
  const len = text?.length ?? 0
  const charDelay = Math.min(len * 25, TYPING_CHAR_DELAY_CAP_MS) // teto 3s
  const baseDelay = 800 + randomImpl() * 400 // 800–1200ms base
  return Math.round(baseDelay + charDelay)
}
