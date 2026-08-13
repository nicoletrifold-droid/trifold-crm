// Story 75-105 — gate do módulo Pastas.
// Story 75-302 (Perfis de Acesso 2.0, F3-1): a lista hardcoded
// PASTA_MANAGER_ROLES (admin/supervisor/gerente-comercial/imob) virou a
// capability `pastas.gerenciar` — o seed da mig 225 espelha exatamente aqueles
// 4 roles (diff conferido), matriz e exceções passam a valer, e o módulo
// LIGADO passa a valer para roles customizados via herança (caso Silmara /
// auxadministrativo — mudança INTENCIONAL aprovada pelo Marcos em 13/08).
// O perfil revisor dedicado ("Deferido") continua futuro.

import { can } from "@web/lib/permissions"

/** Gate único do módulo Pastas (rotas, páginas e imobiliariasGuard). */
export async function canManagePastas(
  userId: string,
  orgId: string
): Promise<boolean> {
  return can(userId, orgId, "pastas.gerenciar")
}
