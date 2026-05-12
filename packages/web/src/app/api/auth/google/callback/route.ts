import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { exchangeCodeForTokens } from "@web/lib/google"
import { createAdminClient } from "@web/lib/supabase/admin"

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { appUser } = auth

  const forbidden = requireRole(appUser, ["admin"])
  if (forbidden) return forbidden

  const code = request.nextUrl.searchParams.get("code")
  if (!code) {
    return NextResponse.redirect(
      new URL(
        "/dashboard/configuracoes/integracoes?google=error&reason=no_code",
        request.url
      )
    )
  }

  try {
    const tokens = await exchangeCodeForTokens(code)

    const supabase = createAdminClient()

    await supabase
      .from("organizations")
      .update({ google_oauth_tokens: tokens })
      .eq("id", appUser.org_id)

    return NextResponse.redirect(
      new URL(
        "/dashboard/configuracoes/integracoes?google=connected",
        request.url
      )
    )
  } catch (error) {
    console.error("Google OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        "/dashboard/configuracoes/integracoes?google=error&reason=token_exchange",
        request.url
      )
    )
  }
}
