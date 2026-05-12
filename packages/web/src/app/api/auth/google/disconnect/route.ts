import { NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { createAdminClient } from "@web/lib/supabase/admin"

export async function POST() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  const forbidden = requireRole(appUser, ["admin"])
  if (forbidden) return forbidden

  const supabase = createAdminClient()

  await supabase
    .from("organizations")
    .update({ google_oauth_tokens: null })
    .eq("id", appUser.org_id)

  return NextResponse.json({ status: "disconnected" })
}
