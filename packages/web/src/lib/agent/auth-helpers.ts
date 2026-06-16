import type { AppUser } from "@web/lib/api-auth"

/**
 * Verifica se o usuario possui role admin estrito.
 *
 * Contrato para Story 52-2 (injecao de contexto CRM):
 * - Parametro: `user` — objeto AppUser retornado por requireAuth() de `@web/lib/api-auth`.
 * - Retorno: `true` somente se `user.role === 'admin'`; `false` para qualquer outro role.
 * - Fonte do role: `appUser.role`, lido da coluna `role` da tabela `users` pelo fluxo
 *   de autenticacao existente (requireAuth seleciona `id, name, role, org_id`).
 * - Verificacao ESTRITA de string. NAO delega para `canAccess()` nem usa a funcao SQL
 *   ampla `is_admin_or_supervisor()` (que aceita admin/supervisor/obras/gerente-comercial).
 *
 * Uso na 52-2 (context-builder.ts):
 *   import { isAdmin } from "@web/lib/agent/auth-helpers"
 *   const admin = isAdmin(appUser)
 *   if (admin) {
 *     // injetar contexto CRM (PII / funil / conversas)
 *   } else {
 *     // retornar contexto apenas de midia (sem dados sensiveis do pipeline)
 *   }
 *
 * @param user Objeto AppUser autenticado (de requireAuth()).
 * @returns true se o role for exatamente 'admin'; caso contrario, false.
 */
export function isAdmin(user: AppUser): boolean {
  return user.role === "admin"
}
