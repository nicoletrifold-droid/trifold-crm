"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@web/lib/supabase/server"

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
    .select("id, role")
    .eq("auth_id", user.id)
    .single()

  let destination: string

  if (appUser?.role === "broker") {
    destination = "/broker"
  } else if (appUser?.role === "cliente") {
    // Resolve the cliente's primary obra (or first available one).
    // Ordering by `is_primary DESC` puts the flagged primary obra first;
    // ties fall back to insertion order, which is acceptable for MVP.
    const { data: vinculo } = await supabase
      .from("cliente_obras")
      .select("obra_id")
      .eq("user_id", appUser.id)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle()

    destination = vinculo?.obra_id
      ? `/cliente/${vinculo.obra_id}`
      : "/cliente/sem-obra"
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
