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

/**
 * A Qualificação Comercial está REALMENTE mudando neste PATCH?
 *
 * Os formulários de lead reenviam o valor atual em TODO save (quem mexe só no
 * telefone manda `qualificacao_comercial` junto). O gate de capability da Story
 * 84-1 olhava apenas a PRESENÇA do campo, então qualquer perfil sem
 * `leads.qualificacao` levava 403 ao salvar qualquer coisa — foi o que travou o
 * perfil imob (que herda `leads = false`) na ficha do lead do mundo IMOB, em
 * 31/08/2026. Mesmo raciocínio que o carimbo do calor já usa (75-237): só age
 * quando o valor muda.
 *
 * `undefined` = campo ausente do payload → não está mudando. String vazia conta
 * como null (é o que o form manda para "Não definido").
 */
export function qualificacaoEstaMudando(atual: string | null | undefined, novo: unknown): boolean {
  if (novo === undefined) return false
  return normalizar(atual) !== normalizar(novo)
}

/** "não definido" tem três grafias na prática: null, undefined e "" (o que o form manda). */
function normalizar(valor: unknown): string | null {
  return typeof valor === "string" && valor !== "" ? valor : null
}
