// Story 75-267 — fonte ÚNICA e client-safe dos roles que podem iniciar
// atendimento (abrir conversa via template) em lead de qualquer corretor.
//
// 75-310 (Perfis de Acesso 2.0): o GATE REAL virou can("conversas.abrir_template")
// no servidor (opening-context/start-whatsapp). Esta lista permanece SÓ como dica
// de exibição em client components (drawer) — e está CONGELADA ao seed da
// capability por teste (capabilities.test.ts); divergir quebra a suíte.
//
// Vivia em opening-context.ts, que é server-only (importa createAdminClient) e
// por isso não podia entrar em client component (drawer/menu). O
// opening-context.ts re-exporta daqui — importar a fonte, nunca reproduzir o
// valor em array inline.

export const OPENING_PRIVILEGED_ROLES = [
  "admin",
  "supervisor",
  "gerente-comercial",
  "sdr",
  "gerente-relacionamento",
]

/**
 * Gate de exibição do menu de abertura ("Iniciar atendimento") nas superfícies
 * de UI (drawer, composer): role privilegiado abre lead de qualquer corretor;
 * corretor (`broker`) só o próprio lead — o mesmo contrato que a API impõe em
 * `loadOpeningContext` (opening-context.ts:40-41).
 *
 * O check de dono vale APENAS para `broker` (AC5): perfis fora da lista (ex.:
 * `imob`, que pode ser o responsável do lead no mundo imob) não veem o botão.
 */
export function canShowOpeningMenu(
  role: string | null | undefined,
  isLeadOwner: boolean
): boolean {
  if (role && OPENING_PRIVILEGED_ROLES.includes(role)) return true
  return role === "broker" && isLeadOwner
}
