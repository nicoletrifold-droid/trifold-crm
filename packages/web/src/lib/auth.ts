import { createClient } from "@web/lib/supabase/server"
import { redirect } from "next/navigation"

export interface AppUser {
  id: string
  authId: string
  orgId: string
  name: string
  email: string
  role: "admin" | "supervisor" | "broker" | "obras"
  avatarUrl: string | null
}

export async function getServerUser(): Promise<AppUser> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: appUser } = await supabase
    .from("users")
    .select("id, auth_id, org_id, name, email, role, avatar_url")
    .eq("auth_id", user.id)
    .single()

  if (!appUser) {
    redirect("/login")
  }

  return {
    id: appUser.id,
    authId: appUser.auth_id,
    orgId: appUser.org_id,
    name: appUser.name,
    email: appUser.email,
    role: appUser.role,
    avatarUrl: appUser.avatar_url,
  }
}

export function getRoleRedirect(role: string): string {
  switch (role) {
    case "broker":
      return "/broker"
    case "obras":
      return "/dashboard/obras"
    case "admin":
    case "supervisor":
    default:
      return "/dashboard"
  }
}
