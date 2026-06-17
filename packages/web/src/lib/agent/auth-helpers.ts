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

/**
 * Verifica se o usuario possui role admin, supervisor ou gerente-comercial.
 *
 * Contrato para Story 52-6 (analise de criativo no agente):
 * - Parametro: `user` — objeto AppUser retornado por requireAuth() de `@web/lib/api-auth`.
 * - Retorno: `true` para role === 'admin', 'supervisor' ou 'gerente-comercial';
 *            `false` para qualquer outro role (incluindo 'broker', 'cliente', 'obras').
 * - Fonte do role: `appUser.role` (coluna `role` da tabela `users`).
 * - Verificacao ESTRITA de string. NAO delega para `canAccess()` nem para SQL.
 * - Diferente de `isAdmin`: acesso ampliado (nao inclui pipeline CRM — apenas criativo).
 *
 * O role 'obras' e deliberadamente excluido aqui, apesar de a funcao SQL
 * `is_admin_or_supervisor()` (migration 084) o incluir. O stakeholder especificou
 * "admin + supervisores/gerentes-comerciais" para acesso ao criativo. A RLS SQL e a
 * 2a camada (defense in depth); a verificacao TS e mais restrita que a SQL.
 *
 * Uso na 52-6 (chat/route.ts):
 *   import { isAdminOrSupervisor } from "@web/lib/agent/auth-helpers"
 *   const adminOrSupervisor = isAdminOrSupervisor(appUser)
 *   if (adminOrSupervisor && requiresCreative(message)) { ... }
 *
 * @param user Objeto AppUser autenticado (de requireAuth()).
 * @returns true se o role for 'admin', 'supervisor' ou 'gerente-comercial'; false caso contrario.
 */
export function isAdminOrSupervisor(user: AppUser): boolean {
  return (
    user.role === "admin" ||
    user.role === "supervisor" ||
    user.role === "gerente-comercial"
  )
}
