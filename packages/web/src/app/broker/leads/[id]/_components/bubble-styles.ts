/**
 * Story 63-2 (Epic 63) — Padrão canônico de bolhas do chat do corretor.
 *
 * Helper puro que define cores, posição e rótulo de cada mensagem com base no
 * `role`. Usado por `page.tsx` (tela de detalhe) e `lead-detail-drawer.tsx`
 * para eliminar a divergência visual entre as duas UIs.
 *
 * Ponto de vista é sempre o do CORRETOR:
 * - `broker`    = o próprio corretor → DIREITA, laranja, "Você"
 * - `user`      = o lead             → ESQUERDA, cinza, "Lead"
 * - `assistant` = a Nicole (IA)      → ESQUERDA, roxo, "Nicole"
 * - `system`    = evento do sistema  → CENTRO, sem bolha
 */

export type BubbleSide = "left" | "right" | "center"

export interface BubbleStyle {
  /** Lado em que a bolha é renderizada. */
  side: BubbleSide
  /** Classe de alinhamento do container flex (justify-*). */
  containerClass: string
  /** Classes de cor/fundo da bolha. */
  bubbleClass: string
  /** Rótulo de autor exibido junto à bolha (vazio = não exibir). */
  label: string
}

export function getBubbleStyle(role: string): BubbleStyle {
  switch (role) {
    case "broker":
      return {
        side: "right",
        containerClass: "justify-end",
        bubbleClass:
          "bg-orange-100 text-orange-900 dark:bg-orange-900/30 dark:text-orange-100",
        label: "Você",
      }
    case "user":
      return {
        side: "left",
        containerClass: "justify-start",
        bubbleClass:
          "bg-stone-100 text-stone-900 dark:bg-stone-800 dark:text-stone-100",
        label: "Lead",
      }
    case "assistant":
      return {
        side: "left",
        containerClass: "justify-start",
        bubbleClass:
          "bg-purple-100 text-purple-900 dark:bg-purple-900/30 dark:text-purple-100",
        label: "Nicole",
      }
    case "system":
      return {
        side: "center",
        containerClass: "justify-center",
        bubbleClass: "text-stone-500 text-xs italic dark:text-stone-400",
        label: "",
      }
    default:
      // role desconhecido → default neutro à esquerda, sem rótulo (graceful)
      return {
        side: "left",
        containerClass: "justify-start",
        bubbleClass:
          "bg-stone-100 text-stone-900 dark:bg-stone-800 dark:text-stone-100",
        label: "",
      }
  }
}
