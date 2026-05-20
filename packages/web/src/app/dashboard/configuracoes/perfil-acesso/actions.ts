"use server"

import {
  createRole as createRoleImpl,
  deleteRole as deleteRoleImpl,
  updatePermission as updatePermissionImpl,
  type OrgRole,
} from "@web/lib/permissions"

/**
 * Re-export das Server Actions de `@web/lib/permissions` para garantir uma
 * fronteira limpa server/client. O módulo `@web/lib/permissions` mistura
 * código server-only (cookies, supabase server client) com as actions —
 * importá-lo diretamente num Client Component pode quebrar o bundler.
 * Este arquivo é o ponto de entrada isolado para os Client Components
 * (`PermissionsMatrix`, `CreateRoleModal`).
 */
export async function updatePermission(
  roleId: string,
  module: string,
  canAccess: boolean
): Promise<{ success: boolean; error?: string }> {
  return updatePermissionImpl(roleId, module, canAccess)
}

export async function createRole(
  orgId: string,
  data: { name: string; label: string; color: string }
): Promise<{ success: boolean; role?: OrgRole; error?: string }> {
  return createRoleImpl(orgId, data)
}

export async function deleteRole(
  roleId: string
): Promise<{ success: boolean; error?: string }> {
  return deleteRoleImpl(roleId)
}
