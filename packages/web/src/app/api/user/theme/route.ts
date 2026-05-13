import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

const VALID_THEMES = ["light", "dark", "system"] as const
type Theme = (typeof VALID_THEMES)[number]

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const theme = (body as Record<string, unknown>)?.theme
  if (!theme || !VALID_THEMES.includes(theme as Theme)) {
    return NextResponse.json({ error: "Invalid theme. Must be light, dark, or system." }, { status: 400 })
  }

  const { error } = await supabase
    .from("users")
    .update({ theme })
    .eq("id", appUser.id)

  if (error) {
    return NextResponse.json({ error: "Failed to update theme" }, { status: 500 })
  }

  return NextResponse.json({ theme })
}
