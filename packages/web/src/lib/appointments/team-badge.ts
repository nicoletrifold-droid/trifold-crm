// Story 81-2 (Epic 81) — identidade visual das EQUIPES da agenda (HOUSE × IMOB).
// HOUSE mantém a cara atual da agenda (paleta laranja/stone); IMOB ganha VIOLETA
// em tudo (badge + acento de borda) para bater o olho e distinguir.
// Classes com `dark:` — as duas agendas (dashboard e broker) usam esse padrão.

import type { AppointmentTeam } from "./governance"

export interface TeamBadge {
  label: "HOUSE" | "IMOB"
  /** Chip (badge) do card no day view. */
  chip: string
  /** Acento de borda esquerda do card. */
  accent: string
}

const BADGES: Record<AppointmentTeam, TeamBadge> = {
  house: {
    label: "HOUSE",
    chip: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
    accent: "border-l-4 border-l-orange-400",
  },
  imob: {
    label: "IMOB",
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    accent: "border-l-4 border-l-violet-500",
  },
}

/** Badge da equipe; valor desconhecido/ausente cai em HOUSE (default do banco). */
export function teamBadge(team: string | null | undefined): TeamBadge {
  return BADGES[(team === "imob" ? "imob" : "house") as AppointmentTeam]
}
