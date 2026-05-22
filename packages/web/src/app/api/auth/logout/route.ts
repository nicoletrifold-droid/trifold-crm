import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@web/lib/supabase/server"
import { getRequestIp, logAudit } from "@web/lib/audit"

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: appUser } = await supabase
      .from("users")
      .select("id, name, role, org_id")
      .eq("auth_id", user.id)
      .maybeSingle()
    if (appUser) {
      void logAudit({
        org_id: appUser.org_id,
        user_id: appUser.id,
        user_name: appUser.name,
        action: "session.logout",
        entity_type: "session",
        ip_address: getRequestIp(request.headers),
      })
    }
  }

  await supabase.auth.signOut()
  const origin = request.headers.get("origin") || request.nextUrl.origin
  return NextResponse.redirect(new URL("/login", origin))
}
