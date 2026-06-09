import { cache } from "react"
import { createClient } from "@web/lib/supabase/server"
import { redirect } from "next/navigation"

export interface AppUser {
  id: string
  authId: string
  orgId: string
  name: string
  email: string
  role: "admin" | "supervisor" | "broker" | "obras" | "gerente-comercial"
  avatarUrl: string | null
  theme: "light" | "dark" | "system"
}

/**
 * Resolve o usuário autenticado e seu registro em `public.users`.
 *
 * Envolto em React `cache()` (perf): o layout e a page chamam `getServerUser`
 * independentemente na mesma request — sem cache isso são 2× `auth.getUser()`
 * (GoTrue) + 2× `users` select. `cache()` deduplica para 1× por request-render.
 * O escopo do `cache()` do React é a própria request, então NÃO vaza entre
 * usuários/requests distintos.
 */
export const getServerUser = cache(async (): Promise<AppUser> => {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: appUser } = await supabase
    .from("users")
    .select("id, auth_id, org_id, name, email, role, avatar_url, theme")
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
    theme: (appUser.theme as AppUser["theme"]) ?? "system",
  }
})

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
