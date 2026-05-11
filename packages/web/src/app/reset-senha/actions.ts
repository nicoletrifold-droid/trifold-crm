"use server"

import { redirect } from "next/navigation"
import { createClient } from "@web/lib/supabase/server"

export async function resetPassword(
  formData: FormData
): Promise<{ error: string } | null> {
  const password = formData.get("password") as string
  const confirmPassword = formData.get("confirmPassword") as string

  if (!password || password.length < 8) {
    return { error: "A senha deve ter pelo menos 8 caracteres" }
  }

  if (password !== confirmPassword) {
    return { error: "As senhas não coincidem" }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    return { error: "Erro ao redefinir senha. O link pode ter expirado." }
  }

  redirect("/login?reset=success")
}
