import { updateSession } from "@web/lib/supabase/middleware"
import type { NextRequest } from "next/server"

export async function proxy(request: NextRequest) {
  try {
    return await updateSession(request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? (err.stack ?? "") : ""
    console.error("[proxy] updateSession threw:", msg, stack)
    return new Response(`Proxy error: ${msg}\n${stack}`, { status: 500 })
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
