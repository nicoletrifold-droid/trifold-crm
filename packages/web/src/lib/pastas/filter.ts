// Story 75-137 — filtro client-side da listagem de pastas. Função pura/testável.
import type { PastaStatus } from "./status"

export interface FilterablePasta {
  nome: string
  corretorNome: string | null
  imobiliaria: string | null
  empreendimento: string | null
  status: PastaStatus
  createdAt: string // ISO
}

export interface PastaFilters {
  search: string
  status: "" | PastaStatus
  empreendimento: string
  corretor: string
  imobiliaria: string
  dateFrom: string // yyyy-mm-dd ("" = sem limite)
  dateTo: string // yyyy-mm-dd ("" = sem limite)
}

export const EMPTY_FILTERS: PastaFilters = {
  search: "",
  status: "",
  empreendimento: "",
  corretor: "",
  imobiliaria: "",
  dateFrom: "",
  dateTo: "",
}

export function hasActiveFilters(f: PastaFilters): boolean {
  return Boolean(f.search || f.status || f.empreendimento || f.corretor || f.imobiliaria || f.dateFrom || f.dateTo)
}

export function filterPastas<T extends FilterablePasta>(rows: T[], f: PastaFilters): T[] {
  const q = f.search.trim().toLowerCase()
  return rows.filter((p) => {
    if (q) {
      const hay = [p.nome, p.corretorNome, p.imobiliaria].filter(Boolean).join(" ").toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (f.status && p.status !== f.status) return false
    if (f.empreendimento && (p.empreendimento ?? "") !== f.empreendimento) return false
    if (f.corretor && (p.corretorNome ?? "") !== f.corretor) return false
    if (f.imobiliaria && (p.imobiliaria ?? "") !== f.imobiliaria) return false
    const day = (p.createdAt ?? "").slice(0, 10) // yyyy-mm-dd (comparável lexicograficamente)
    if (f.dateFrom && day < f.dateFrom) return false
    if (f.dateTo && day > f.dateTo) return false
    return true
  })
}

/** Valores distintos (não vazios), ordenados, para popular os selects. */
export function distinctValues<T extends FilterablePasta>(rows: T[], key: "empreendimento" | "corretorNome" | "imobiliaria"): string[] {
  const set = new Set<string>()
  for (const r of rows) {
    const v = r[key]
    if (v) set.add(v)
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"))
}
