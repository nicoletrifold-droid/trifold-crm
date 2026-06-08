"use server"

import { createAdminClient } from "@web/lib/supabase/admin"
import { createClient } from "@web/lib/supabase/server"

export async function markAlertasSeen() {
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
    .from("users")
    .update({ alertas_notifications_seen_at: new Date().toISOString() })
    .eq("id", appUser.id)
}
