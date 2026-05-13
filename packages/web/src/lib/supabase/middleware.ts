import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Reads the user's role.
 *
 * Primary source: `user.app_metadata.role` (set by `setClienteRoleMetadata`
 * on cliente creation, or by Supabase Studio for legacy admin/supervisor/broker).
 * Fallback: query `public.users.role` by auth_id. This handles users created
 * before the role-metadata convention existed.
 *
 * Returns `undefined` if neither source has a role (the middleware then
 * treats the request as unrouted and falls through to its default flow).
 */
async function getUserRole(
  supabase: SupabaseClient,
  user: { id: string; app_metadata?: Record<string, unknown> }
): Promise<string | undefined> {
  const metaRole = user.app_metadata?.role
  if (typeof metaRole === "string" && metaRole.length > 0) {
    return metaRole
  }
  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("auth_id", user.id)
    .single()
  return (data?.role as string | undefined) ?? undefined
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // Use || (not ??) so empty strings also fall through to the next source.
  // Bracket notation prevents Turbopack from statically inlining these values.
  // NEXT_PUBLIC_ vars get inlined as undefined in the proxy bundle during Vercel builds,
  // so SUPABASE_URL (private) is the primary source.
  const env = process.env
  const supabaseUrl = (
    env["SUPABASE_URL"] ||
    env["NEXT_PUBLIC_SUPABASE_URL"] ||
    ""
  ).trim()
  const supabaseAnonKey = (
    env["SUPABASE_ANON_KEY"] ||
    env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ||
    ""
  ).trim()
  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // ===== Public routes (no auth required) =====
  // - `/login`        — admin/broker/supervisor login
  // - `/cliente`      — cliente portal login (Story 20.2 will provide the UI)
  // - `/api/*`        — webhooks/cron use service-role keys; auth handled per-route
  // - `/auth/*`       — OAuth/OTP callbacks (token exchange, story 23.1)
  // - `/reset-senha`  — password reset form after verifyOtp (story 23.1)
  const isPublicRoute =
    pathname === "/login" ||
    pathname === "/cliente" ||
    pathname === "/cliente/offline" ||
    pathname === "/politica-de-privacidade" ||
    pathname === "/reset-senha" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/")

  if (isPublicRoute) {
    // Logged in user on /login → bounce to their home (legacy behavior, only for /login)
    if (user && pathname === "/login") {
      const url = request.nextUrl.clone()
      url.pathname = "/dashboard"
      return NextResponse.redirect(url)
    }
    // /cliente while logged in is intentionally NOT redirected here:
    // the post-login redirect in `login/actions.ts` already routes the cliente
    // to /cliente/{obra_id} or /cliente/sem-obra. Letting them re-visit /cliente
    // is harmless (it shows the cliente login UI; if their session is still valid,
    // a refresh from there will trigger a re-login flow). This keeps the middleware
    // simple and avoids a DB roundtrip on every /cliente hit.
    return supabaseResponse
  }

  // ===== Unauthenticated =====
  // For protected /cliente/* paths, redirect to /cliente (the cliente login).
  // For everything else, redirect to /login (admin/broker login).
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.startsWith("/cliente/") ? "/cliente" : "/login"
    return NextResponse.redirect(url)
  }

  // ===== Authenticated: enforce role boundaries =====
  const role = await getUserRole(supabase, user)

  // Cliente trying to access admin/broker areas → bounce to /cliente
  if (
    role === "cliente" &&
    (pathname.startsWith("/dashboard") || pathname.startsWith("/broker"))
  ) {
    const url = request.nextUrl.clone()
    url.pathname = "/cliente"
    return NextResponse.redirect(url)
  }

  // Obras role: restricted to /dashboard/obras and /dashboard/brindes only
  if (
    role === "obras" &&
    pathname.startsWith("/dashboard") &&
    !pathname.startsWith("/dashboard/obras") &&
    !pathname.startsWith("/dashboard/brindes")
  ) {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard/obras"
    return NextResponse.redirect(url)
  }

  // Admin/broker/supervisor (or any non-cliente, non-empty role) trying to
  // access cliente portal pages → bounce to /login. We require `role` to be
  // defined here: if it's undefined (no app_metadata + no users row) we don't
  // block, because the existing user shape in this codebase guarantees a row
  // — but defending against the missing case prevents a soft lockout.
  if (
    role !== undefined &&
    role !== "cliente" &&
    pathname.startsWith("/cliente/")
  ) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
