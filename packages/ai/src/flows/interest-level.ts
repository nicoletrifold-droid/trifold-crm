// Story 75-332 (Epic 89) — a régua ÚNICA do calor do lead.
//
// Esta expressão vivia solta dentro do `haiku-enrichment.ts` (linha 253). A
// 75-332 precisava da mesma conta para o lead que vem do formulário — e um lead
// de formulário NUNCA passa pelo cron de enriquecimento, porque aquele cron
// itera sobre CONVERSAS com mensagens e esse lead não tem nenhuma.
//
// Reproduzir os números aqui criaria duas réguas que divergem no primeiro
// ajuste, e o mesmo lead teria calor diferente conforme o caminho que o criou.
// Por isso a expressão saiu de lá e virou esta função: os dois lugares importam
// a mesma.

/** Valores do enum `interest_level` no banco. */
export type InterestLevel = "hot" | "warm" | "cold"

/**
 * Calor derivado do `qualification_score` (0–100).
 *
 * Os cortes (70 / 40) são os que já rodavam em produção — a extração é
 * mecânica, sem recalibrar nada. Mudar um número aqui muda os dois caminhos de
 * uma vez, que é exatamente o ponto.
 */
export function interestLevelFromScore(score: number): InterestLevel {
  if (score >= 70) return "hot"
  if (score >= 40) return "warm"
  return "cold"
}
