import { createClient } from "@supabase/supabase-js"

// Use private vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) that Turbopack does NOT inline,
// falling back to NEXT_PUBLIC_ vars for local dev compatibility.
// NEXT_PUBLIC_ vars get inlined as undefined in the proxy bundle during Vercel builds.
export function createAdminClient() {
  const supabaseUrl = (
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    ""
  ).trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim()

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
