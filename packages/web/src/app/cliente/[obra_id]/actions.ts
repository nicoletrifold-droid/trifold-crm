"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@web/lib/supabase/server"
import { createAdminClient } from "@web/lib/supabase/admin"

const POLICY_VERSION = "2026-05-26"

export async function acceptPrivacy(): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  // Busca o users.id (PK) a partir do auth_id
  const { data: userRow } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", user.id)
    .single()

  if (!userRow) {
    return { error: "Usuário não encontrado" }
  }

  // Usa adminClient para bypassar a RLS de UPDATE em users
  // (a policy users_update_admin bloqueia clientes de atualizar o próprio registro)
  const adminClient = createAdminClient()

  const { error: updateError } = await adminClient
    .from("users")
    .update({ privacy_accepted_at: new Date().toISOString() })
    .eq("id", userRow.id)

  if (updateError) {
    return { error: "Erro ao registrar aceite. Tente novamente." }
  }

  // Log imutável de auditoria LGPD — INSERT sem possibilidade de DELETE/UPDATE
  await adminClient.from("privacy_consents").insert({
    user_id: userRow.id,
    accepted_at: new Date().toISOString(),
    policy_version: POLICY_VERSION,
  })

  revalidatePath("/cliente", "layout")
  return { ok: true }
}
