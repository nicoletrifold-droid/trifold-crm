import { unstable_cache, revalidateTag } from "next/cache"
import { createClient } from "@web/lib/supabase/server"

// ============================================================================
// Tipos
// ============================================================================

export interface OrgRole {
  id: string
  name: string
  label: string
  color: string
  is_system: boolean
}

export type PermissionsMatrix = Record<string, Record<string, boolean>>

// ============================================================================
// Constantes — espelham o seed do banco (migration 047_roles_permissions.sql)
// ============================================================================

/**
 * Lista canônica dos 17 módulos do sistema, em ordem alfabética dos identificadores
 * usados na tabela `role_permissions.module`.
 */
export const ALL_MODULES: readonly string[] = [
  "agenda",
  "alertas",
  "analytics",
  "atividades",
  "brindes",
  "campanhas",
  "configuracoes",
  "conversas",
  "corretores",
  "dashboard",
  "imoveis",
  "leads",
  "mensagens",
  "obras",
  "pipeline",
  "sistema",
  "treinamento",
] as const

/**
 * Roles do sistema (fallback quando uma org não tem seed de `roles`).
 * Os IDs são fictícios (prefixo `system-`) — chamadores que dependem de
 * id real para queries devem detectar esse prefixo e tratar como hardcoded.
 */
export const SYSTEM_ROLES: readonly OrgRole[] = [
  { id: "system-admin", name: "admin", label: "Administrador", color: "purple", is_system: true },
  { id: "system-broker", name: "broker", label: "Corretor", color: "green", is_system: true },
  { id: "system-obras", name: "obras", label: "Obras", color: "yellow", is_system: true },
  { id: "system-supervisor", name: "supervisor", label: "Supervisor", color: "blue", is_system: true },
] as const

// ============================================================================
// Matriz hardcoded — fallback para roles desconhecidos / orgs sem seed
// Espelha exatamente o seed da migration 047 (Story 35-1 AC21).
// ============================================================================

function emptyMatrix(): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const m of ALL_MODULES) out[m] = false
  return out
}

function fullMatrix(): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const m of ALL_MODULES) out[m] = true
  return out
}

/**
 * Retorna a matriz hardcoded de permissões para um role.
 * Usado como fallback quando a query ao banco falha ou retorna vazio.
 */
function getHardcodedPermissions(role: string): Record<string, boolean> {
  switch (role) {
    case "admin":
      return fullMatrix()

    case "supervisor":
      return {
        ...fullMatrix(),
        configuracoes: false,
        sistema: false,
      }

    case "broker":
      return {
        ...emptyMatrix(),
        pipeline: true,
        leads: true,
        imoveis: true,
        conversas: true,
        agenda: true,
        alertas: true,
        atividades: true,
        treinamento: true,
      }

    case "obras":
      return {
        ...emptyMatrix(),
        obras: true,
        brindes: true,
      }

    default:
      return emptyMatrix()
  }
}

// ============================================================================
// getOrgRoles — lista todos os roles de uma org (com cache)
// ============================================================================

/**
 * Retorna todos os roles de uma org, ordenados por `name`.
 * Cacheado com TTL de 60s e tag `permissions-{orgId}`.
 * Se a org não tiver seed (array vazio), retorna `SYSTEM_ROLES` como fallback.
 */
export async function getOrgRoles(orgId: string): Promise<OrgRole[]> {
  return unstable_cache(
    async () => {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("roles")
        .select("id, name, label, color, is_system")
        .eq("org_id", orgId)
        .order("name")

      if (error || !data?.length) {
        return [...SYSTEM_ROLES]
      }
      return data as OrgRole[]
    },
    [`org-roles-${orgId}`],
    { tags: [`permissions-${orgId}`], revalidate: 60 }
  )()
}

// ============================================================================
// getRolePermissions — mapa { module: canAccess } para um role (com cache)
// ============================================================================

/**
 * Retorna o mapa `{ module: canAccess }` para um role.
 * Cacheado com TTL de 60s e tag `permissions-role-{roleId}`.
 * Se a query falhar ou retornar vazio, retorna `{}` — quem chama decide o fallback.
 */
export async function getRolePermissions(
  roleId: string
): Promise<Record<string, boolean>> {
  return unstable_cache(
    async () => {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("role_permissions")
        .select("module, can_access")
        .eq("role_id", roleId)

      if (error || !data?.length) {
        return {}
      }

      return (data as Array<{ module: string; can_access: boolean }>).reduce<
        Record<string, boolean>
      >((acc, row) => {
        acc[row.module] = row.can_access
        return acc
      }, {})
    },
    [`role-permissions-${roleId}`],
    { tags: [`permissions-role-${roleId}`], revalidate: 60 }
  )()
}

// ============================================================================
// getOrgPermissionsMatrix — matriz completa (roleId → module → canAccess)
// ============================================================================

/**
 * Retorna a matriz completa de permissões da org no formato
 * `{ [roleId]: { [module]: canAccess } }`.
 * Internamente reusa `getOrgRoles` + `getRolePermissions` (ambos cacheados).
 * Também cacheia o resultado final com tag `permissions-{orgId}`.
 */
export async function getOrgPermissionsMatrix(
  orgId: string
): Promise<PermissionsMatrix> {
  return unstable_cache(
    async () => {
      const roles = await getOrgRoles(orgId)
      const entries = await Promise.all(
        roles.map(async (role) => {
          const perms = await getRolePermissions(role.id)
          // Se for um role hardcoded (id fictício) ou veio vazio do banco,
          // aplicar fallback hardcoded por nome para manter UI consistente.
          const finalPerms =
            Object.keys(perms).length > 0 ? perms : getHardcodedPermissions(role.name)
          return [role.id, finalPerms] as const
        })
      )
      const matrix: PermissionsMatrix = {}
      for (const [roleId, perms] of entries) {
        matrix[roleId] = perms
      }
      return matrix
    },
    [`org-permissions-matrix-${orgId}`],
    { tags: [`permissions-${orgId}`], revalidate: 60 }
  )()
}

// ============================================================================
// getUserPermissions — permissões efetivas de um usuário
// ============================================================================

/**
 * Retorna o mapa `{ module: canAccess }` para um usuário, com base no campo
 * `role` da tabela `public.users`.
 *
 * Fluxo:
 *  1. Busca o `role` do usuário em `public.users` por `id = userId`.
 *  2. Resolve o `roleId` em `roles` por `name = userRole` e `org_id = orgId`.
 *  3. Chama `getRolePermissions(roleId)`.
 *  4. Se qualquer etapa falhar ou retornar vazio, usa
 *     `getHardcodedPermissions(userRole ?? "")` como fallback.
 */
export async function getUserPermissions(
  userId: string,
  orgId: string
): Promise<Record<string, boolean>> {
  const supabase = await createClient()

  // 1. Buscar role do usuário
  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle()

  const userRole = userRow?.role as string | undefined

  if (userError || !userRole) {
    return getHardcodedPermissions(userRole ?? "")
  }

  // 2. Resolver role_id na org
  const { data: roleRow, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .eq("name", userRole)
    .eq("org_id", orgId)
    .maybeSingle()

  if (roleError || !roleRow?.id) {
    return getHardcodedPermissions(userRole)
  }

  // 3. Buscar permissões do role
  const perms = await getRolePermissions(roleRow.id as string)
  if (Object.keys(perms).length === 0) {
    return getHardcodedPermissions(userRole)
  }
  return perms
}

// ============================================================================
// Cache invalidation
// ============================================================================

/**
 * Invalida o cache de permissões de uma org. Deve ser chamada após qualquer
 * mutação em `roles` ou `role_permissions` da org.
 */
export function revalidateOrgPermissions(orgId: string): void {
  revalidateTag(`permissions-${orgId}`)
}

// ============================================================================
// Server Action — updatePermission
// ============================================================================

/**
 * Atualiza (upsert) uma permissão `(role_id, module)` em `role_permissions`.
 *
 * Requer que o usuário autenticado seja `admin` (validado via `public.users`).
 * Após upsert bem-sucedido, invalida o cache da org (`permissions-{orgId}`).
 *
 * Retorna `{ success: true }` em caso de sucesso, ou
 * `{ success: false, error: string }` em caso de falha — nunca lança exceção.
 */
export async function updatePermission(
  roleId: string,
  module: string,
  canAccess: boolean
): Promise<{ success: boolean; error?: string }> {
  "use server"

  const supabase = await createClient()

  // 1. Verificar autenticação
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "Unauthorized" }
  }

  // 2. Verificar que o usuário é admin
  const { data: appUser, error: appUserError } = await supabase
    .from("users")
    .select("role")
    .eq("auth_id", user.id)
    .maybeSingle()

  if (appUserError || !appUser || appUser.role !== "admin") {
    return { success: false, error: "Unauthorized" }
  }

  // 3. Resolver org_id do role
  const { data: roleRow, error: roleError } = await supabase
    .from("roles")
    .select("org_id")
    .eq("id", roleId)
    .maybeSingle()

  if (roleError) {
    return { success: false, error: roleError.message }
  }
  if (!roleRow?.org_id) {
    return { success: false, error: "Role not found" }
  }

  const orgId = roleRow.org_id as string

  // 4. Upsert da permissão
  const { error: upsertError } = await supabase.from("role_permissions").upsert(
    {
      role_id: roleId,
      module,
      can_access: canAccess,
      org_id: orgId,
    },
    { onConflict: "role_id,module" }
  )

  if (upsertError) {
    return { success: false, error: upsertError.message }
  }

  // 5. Invalidar cache da org
  revalidateOrgPermissions(orgId)

  return { success: true }
}
