/**
 * Constantes compartilhadas de status de obras entre o painel admin e o portal do cliente.
 * Manter em único lugar evita divergência visual entre os dois ambientes.
 */

export const STATUS_LABEL: Record<string, string> = {
  em_andamento: "Em andamento",
  concluida: "Concluída",
  pausada: "Pausada",
}

/**
 * Classes Tailwind para badges de status de obras.
 * Suportam light mode e dark mode nativamente.
 */
export const STATUS_BADGE: Record<string, string> = {
  em_andamento:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  concluida:
    "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  pausada:
    "bg-gray-100 text-gray-700 dark:bg-stone-700/50 dark:text-stone-200",
}

/**
 * Classes Tailwind para badges de status de FASES (mais granular que status de obra).
 * Paleta calibrada para o portal escuro (bg-stone-950).
 */
export const FASE_STATUS_BADGE: Record<string, string> = {
  pendente: "bg-stone-700/60 text-stone-300",
  a_iniciar: "bg-stone-700/60 text-stone-300",
  em_andamento: "bg-amber-500/20 text-amber-300",
  pausada: "bg-stone-700/50 text-stone-200",
  concluida: "bg-green-500/20 text-green-300",
}

export const FASE_STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  a_iniciar: "A iniciar",
  em_andamento: "Em andamento",
  pausada: "Pausada",
  concluida: "Concluída",
}

/**
 * Classes Tailwind para badges de status de chamados.
 */
export const CHAMADO_STATUS_BADGE: Record<string, string> = {
  aberto:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  em_analise:
    "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  resolvido:
    "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
}

export const CHAMADO_STATUS_LABEL: Record<string, string> = {
  aberto: "Aberto",
  em_analise: "Em análise",
  resolvido: "Resolvido",
}
