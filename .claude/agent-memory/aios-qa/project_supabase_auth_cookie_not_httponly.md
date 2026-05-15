---
name: Supabase sb-*-auth-token cookie is NOT httpOnly in Trifold
description: Auth cookies in Trifold are JS-readable by design (Supabase SSR pattern). Briefs claiming "httpOnly" cookies are wrong.
type: project
---

The `sb-{ref}-auth-token` cookie in Trifold is **not httpOnly** — it is JS-readable (httpOnly=false, sameSite=Lax). This is by design from `@supabase/ssr`: the browser-side `createClient()` from `@web/lib/supabase/client` needs to read the same cookie to instantiate the browser session.

**Why:** During QA of the logout hotfix (fix/logout-middleware-and-server-action), I observed httpOnly=false on the auth cookie. The brief claimed the bug was about "httpOnly cookies the SSR uses" — that framing is technically inaccurate. The actual bug was that the previous browser-only `signOut()` did not propagate to the server-side cookie state via the `setAll` callback in `@web/lib/supabase/server.ts`. The fix (server action) is still correct.

**How to apply:**
- When validating logout, do NOT use httpOnly status as the success criterion. Check whether the cookie is **removed** (count → 0) after logout, not whether it's flagged httpOnly.
- If a future brief asserts "httpOnly sb-* cookies", correct the framing and verify the actual mechanism (server action vs browser client) instead.
- The cookie design path: `@supabase/ssr` → `setAll(cookiesToSet)` in `server.ts` → forwarded options determine flags. Trifold does not override.
