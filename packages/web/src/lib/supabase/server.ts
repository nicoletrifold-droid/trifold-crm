import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function createClient() {
  const cookieStore = await cookies()

  // Use || (not ??) so empty strings also fall through to the next source.
  // Bracket notation prevents Turbopack from statically inlining these values.
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

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from Server Component
          }
        },
      },
    }
  )
}
