"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@web/lib/supabase/admin"
import { createClient } from "@web/lib/supabase/server"

export async function markChamadosResponsesSeen() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: appUser } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", user.id)
    .single()

  if (!appUser) return

  await createAdminClient()
    .from("chamados")
    .update({ reporter_seen_response_at: new Date().toISOString() })
    .eq("reporter_id", appUser.id)
    .not("admin_response", "is", null)
    .is("reporter_seen_response_at", null)

  revalidatePath("/dashboard", "layout")
}
