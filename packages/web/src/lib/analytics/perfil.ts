/**
 * Story 75-184 — Agregação do "Perfil dos Leads" p/ o Analytics.
 *
 * Recebe as linhas de perfil dos leads criados no período (base ENTRADAS — todos,
 * inclusive perdidos: perfil demográfico independe do desfecho) e devolve as
 * contagens por dimensão, prontas p/ renderizar. Função pura (testável).
 *
 * Ordenação: dimensões de faixa (renda/idade/filhos) seguem a ORDEM NATURAL das
 * faixas (leitura de distribuição); profissão e demais, por contagem desc.
 */
import {
  RENDA_FAMILIAR_OPTIONS,
  FILHOS_OPTIONS,
  ESTADO_CIVIL_OPTIONS,
  FAIXA_ETARIA_OPTIONS,
  SITUACAO_MORADIA_OPTIONS,
  TEM_PET_OPTIONS,
} from "@web/lib/leads/enrich"

export interface PerfilRow {
  profissao: string | null
  renda_familiar: string | null
  filhos: string | null
  estado_civil: string | null
  faixa_etaria: string | null
  situacao_moradia: string | null
  tem_pet: string | null
}

export interface PerfilBreakdownItem {
  label: string
  count: number
}

export interface PerfilAggregate {
  /** Nº de leads com PELO MENOS um campo de perfil preenchido. */
  comPerfil: number
  /** Total de linhas recebidas (entradas do período). */
  total: number
  profissao: PerfilBreakdownItem[]
  renda: PerfilBreakdownItem[]
  faixaEtaria: PerfilBreakdownItem[]
  filhos: PerfilBreakdownItem[]
  estadoCivil: PerfilBreakdownItem[]
  moradia: PerfilBreakdownItem[]
  pet: PerfilBreakdownItem[]
}

const TOP_PROFISSOES = 8

/** Conta por valor e devolve na ordem das opções (faixas legíveis, sem zeros). */
function countInOptionOrder(
  rows: PerfilRow[],
  field: keyof PerfilRow,
  options: ReadonlyArray<{ value: string; label: string }>
): PerfilBreakdownItem[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const v = r[field]
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return options
    .filter((o) => o.value && (counts.get(o.value) ?? 0) > 0)
    .map((o) => ({ label: o.label, count: counts.get(o.value)! }))
}

export function aggregatePerfil(rows: PerfilRow[]): PerfilAggregate {
  // Profissão: texto livre → agrupa case-insensitive, exibe a grafia mais comum; top N.
  const profCounts = new Map<string, { label: string; count: number }>()
  for (const r of rows) {
    const p = r.profissao?.trim()
    if (!p) continue
    const key = p.toLowerCase()
    const cur = profCounts.get(key) ?? { label: p, count: 0 }
    cur.count++
    profCounts.set(key, cur)
  }
  const profissao = [...profCounts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, TOP_PROFISSOES)

  const comPerfil = rows.filter(
    (r) => r.profissao || r.renda_familiar || r.filhos || r.estado_civil || r.faixa_etaria || r.situacao_moradia || r.tem_pet
  ).length

  return {
    comPerfil,
    total: rows.length,
    profissao,
    renda: countInOptionOrder(rows, "renda_familiar", RENDA_FAMILIAR_OPTIONS),
    faixaEtaria: countInOptionOrder(rows, "faixa_etaria", FAIXA_ETARIA_OPTIONS),
    filhos: countInOptionOrder(rows, "filhos", FILHOS_OPTIONS),
    estadoCivil: countInOptionOrder(rows, "estado_civil", ESTADO_CIVIL_OPTIONS),
    moradia: countInOptionOrder(rows, "situacao_moradia", SITUACAO_MORADIA_OPTIONS),
    pet: countInOptionOrder(rows, "tem_pet", TEM_PET_OPTIONS),
  }
}
