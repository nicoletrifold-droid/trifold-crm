"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@web/lib/supabase/admin"
import { createClient } from "@web/lib/supabase/server"

// Story 75-8 — marca "Meus Leads" como visto, zerando o badge de novos leads.
export async function markLeadsSeen() {
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
    .update({ leads_notifications_seen_at: new Date().toISOString() })
    .eq("id", appUser.id)

  revalidatePath("/broker", "layout")
}
