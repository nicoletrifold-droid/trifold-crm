"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { createClient } from "@web/lib/supabase/server"
import { logAudit } from "@web/lib/audit"

export async function login(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get("email") as string
  const password = formData.get("password") as string

  if (!email || !password) {
    return { error: "Email e senha sao obrigatorios" }
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: "Email ou senha incorretos" }
  }

  // Get user role to redirect correctly
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Erro ao autenticar" }
  }

  // Need both the public.users.id (for cliente_obras lookup) and role.
  const { data: appUser } = await supabase
    .from("users")
    .select("id, name, role, org_id")
    .eq("auth_id", user.id)
    .single()

  // Log session.login — após auth bem-sucedido, antes do redirect.
  // Aguardamos para garantir que o insert complete antes do throw do redirect().
  if (appUser?.id && appUser?.org_id) {
    await logAudit({
      org_id: appUser.org_id,
      user_id: appUser.id,
      user_name: appUser.name ?? "unknown",
      action: "session.login",
      entity_type: "session",
      metadata: { role: appUser.role },
      // ip_address omitido — server action não expõe request object
    })
  }

  let destination: string

  if (appUser?.role === "broker") {
    destination = "/broker"
  } else if (appUser?.role === "cliente") {
    // Fetch up to 2 obras to decide: 1 → go directly, 2+ → selection screen.
    const { data: vinculos } = await supabase
      .from("cliente_obras")
      .select("obra_id")
      .eq("user_id", appUser.id)
      .order("is_primary", { ascending: false })
      .limit(2)

    const firstObra = vinculos?.[0]?.obra_id
    if (!vinculos || vinculos.length === 0 || !firstObra) {
      destination = "/cliente/sem-obra"
    } else if (vinculos.length === 1) {
      destination = `/cliente/${firstObra}`
    } else {
      destination = "/cliente/selecionar"
    }
  } else if (appUser?.role === "obras") {
    destination = "/dashboard/obras"
  } else {
    // admin, supervisor, or anything else: dashboard.
    destination = "/dashboard"
  }

  revalidatePath("/", "layout")
  redirect(destination)
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath("/", "layout")
  redirect("/login")
}

export async function requestPasswordReset(
  formData: FormData
): Promise<{ error: string } | { sent: true; email: string }> {
  const email = formData.get('email') as string
  if (!email) return { error: 'Email é obrigatório' }

  const headersList = await headers()
  const origin =
    headersList.get('origin') ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'http://localhost:3000'

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-senha`,
  })

  if (error) return { error: 'Erro ao enviar email de recuperação. Tente novamente.' }
  return { sent: true, email }
}
