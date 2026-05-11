"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@web/lib/supabase/server"

export async function acceptPrivacy(): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  const { error } = await supabase
    .from("users")
    .update({ privacy_accepted_at: new Date().toISOString() })
    .eq("auth_id", user.id)

  if (error) {
    return { error: "Erro ao registrar aceite. Tente novamente." }
  }

  revalidatePath("/cliente", "layout")
  return { ok: true }
}
