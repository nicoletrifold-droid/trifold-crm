import { updateSession } from "@web/lib/supabase/middleware"
import type { NextRequest } from "next/server"

export async function proxy(request: NextRequest) {
  try {
    return await updateSession(request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[proxy] updateSession threw:", msg, err instanceof Error ? err.stack : "")
    throw err
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
