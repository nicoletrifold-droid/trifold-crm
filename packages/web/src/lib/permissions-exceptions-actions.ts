"use server"

import { revalidateTag } from "next/cache"
import { createAdminClient } from "@web/lib/supabase/admin"
import { createClient } from "@web/lib/supabase/server"
import { getUserPermissions } from "./permissions"

export { getUserPermissions }

export async function getUserExceptions(
  userId: string
): Promise<Array<{ module: string; can_access: boolean }>> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("user_permission_exceptions")
    .select("module, can_access")
    .eq("user_id", userId)
  return (data ?? []) as Array<{ module: string; can_access: boolean }>
}

export async function setUserException(
  userId: string,
  module: string,
  canAccess: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { success: false, error: "Unauthorized" }

  const { data: appUser } = await supabase
    .from("users")
    .select("role, org_id")
    .eq("auth_id", user.id)
    .maybeSingle()

  if (!appUser || appUser.role !== "admin") {
    return { success: false, error: "Unauthorized" }
  }

  const { error } = await supabase.from("user_permission_exceptions").upsert(
    {
      user_id: userId,
      module,
      can_access: canAccess,
      org_id: appUser.org_id as string,
    },
    { onConflict: "user_id,module" }
  )

  if (error) return { success: false, error: error.message }

  revalidateTag(`permissions-user-${userId}`, "max")
  return { success: true }
}

export async function removeUserException(
  userId: string,
  module: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { success: false, error: "Unauthorized" }

  const { data: appUser } = await supabase
    .from("users")
    .select("role")
    .eq("auth_id", user.id)
    .maybeSingle()

  if (!appUser || appUser.role !== "admin") {
    return { success: false, error: "Unauthorized" }
  }

  const { error } = await supabase
    .from("user_permission_exceptions")
    .delete()
    .eq("user_id", userId)
    .eq("module", module)

  if (error) return { success: false, error: error.message }

  revalidateTag(`permissions-user-${userId}`, "max")
  return { success: true }
}
