// Hierarquia CUMULATIVA dos perfis comerciais (Story 75-90).
//
// corretor ⊂ gerente-comercial ⊂ supervisor ⊂ admin — cada nível herda TODAS as
// premissas do nível de baixo + mais. Ao desenhar permissão comercial nova, pensar
// de baixo pra cima e usar `commercialRoleAtLeast` em vez de listas soltas de role.
//
// Perfis NÃO-comerciais (obras, gerente-relacionamento) não entram nesta escala —
// são trilhas à parte e retornam sempre false aqui.
//
// Módulo PURO de propósito (sem deps server-side) para poder ser usado em componentes
// client e server. Não mover para permissions.ts (que é server-side).

export const COMMERCIAL_ROLE_RANK = {
  broker: 1,
  "gerente-comercial": 2,
  sdr: 2, // Story 75-204: SDR humano — mesmo nível de dados do gerente-comercial
  supervisor: 3,
  admin: 4,
} as const

export type CommercialRole = keyof typeof COMMERCIAL_ROLE_RANK

/**
 * true se `role` está no nível `min` ou ACIMA na hierarquia comercial.
 * Roles fora da escala (obras, gerente-relacionamento, null…) → false.
 */
export function commercialRoleAtLeast(
  role: string | null | undefined,
  min: CommercialRole,
): boolean {
  const rank = role ? (COMMERCIAL_ROLE_RANK as Record<string, number>)[role] : undefined
  return rank !== undefined && rank >= COMMERCIAL_ROLE_RANK[min]
}

/**
 * Capacidade: puxar lead do bolsão pelo DASHBOARD (Story 75-90).
 *
 * Política interna atual: ATIVO só p/ gerente-comercial — é ela quem atende pelo
 * dashboard. O corretor puxa pela própria área (`/broker/bolsao`).
 *
 * Supervisor e admin estão ACIMA na hierarquia e herdariam esta capacidade, mas
 * hoje dependem de perfil de corretor (`pegar_lead_bolsao` exige `brokers`+`is_available`)
 * e de aparecerem nos filtros de atendimento — follow-up. Quando resolvido, escalar aqui
 * é 1 linha:  return commercialRoleAtLeast(role, "gerente-comercial")
 */
export function canPullBolsaoDashboard(role: string | null | undefined): boolean {
  return role === "gerente-comercial"
}
