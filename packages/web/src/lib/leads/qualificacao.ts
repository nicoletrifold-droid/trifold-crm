// Story 84-2 (Epic 84) — "Qualificação Comercial": avaliação manual da qualidade do lead
// (perfil, capacidade de compra, validade de contato). Espelha o enum
// `qualificacao_comercial` do banco (bom|regular|ruim|invalido, nullable); "none" é só do
// filtro = ainda sem avaliação (NULL). Independente do "Calor do Lead" (interest_level).
// Helper puro (mesmo padrão de lib/leads/calor.ts) para o Server Component e o filtro client
// lerem a MESMA whitelist — valor fora dela nunca chega à query.

export const QUALIFICACAO_VALUES = ["bom", "regular", "ruim", "invalido", "none"] as const
export type QualificacaoValue = (typeof QUALIFICACAO_VALUES)[number]

export const QUALIFICACAO_LABELS: Record<QualificacaoValue, string> = {
  bom: "Bom",
  regular: "Regular",
  ruim: "Ruim",
  invalido: "Inválido",
  none: "Não definido",
}

/** Devolve o valor só se estiver na whitelist; qualquer outra coisa → null. */
export function parseQualificacao(raw?: string | null): QualificacaoValue | null {
  return QUALIFICACAO_VALUES.includes(raw as QualificacaoValue) ? (raw as QualificacaoValue) : null
}
