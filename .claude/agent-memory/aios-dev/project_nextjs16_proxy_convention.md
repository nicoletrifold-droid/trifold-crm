---
name: Next.js 16 proxy convention (formerly middleware)
description: This project runs Next.js 16.2.2 where middleware.ts is renamed to proxy.ts and runs in Node.js runtime, not Edge
type: project
---

This project (packages/web) runs **Next.js 16.2.2** (confirmed in `packages/web/package.json`). Next.js 16 renamed the `middleware` file convention to `proxy`.

**Key facts:**
- The auth/SSR entry point is `packages/web/src/proxy.ts` (NOT `middleware.ts`).
- Function must be named `proxy`, not `middleware`. Default export is allowed but `export function proxy(...)` is the recommended named export.
- `proxy.ts` runs in **Node.js runtime** by default (NOT Edge). This is intentional — the Supabase SSR helpers in `lib/supabase/middleware.ts` use `node:async_hooks` which is unavailable in Edge runtime. Commit `abc607c` migrated specifically to fix `MIDDLEWARE_INVOCATION_FAILED` on Vercel Edge.
- The helper module name `lib/supabase/middleware.ts` is just internal naming — its `updateSession()` function is consumed by `proxy.ts`. Don't rename it; the Supabase docs use that name.
- Project documentation lives at `packages/web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` and `01-getting-started/16-proxy.md`. ALWAYS read these before touching the proxy file — Next.js 16 has breaking changes (params/cookies/headers are async, Turbopack default, no Edge in proxy, etc.).

**Why:** Auditors searching for `middleware.ts` will (incorrectly) report it as missing. The file exists as `proxy.ts`. Before assuming the file is missing or the auth flow is broken, grep for `proxy.ts` and check `lib/supabase/middleware.ts` (the helper).

**How to apply:** When working on auth, SSR cookies, or routing logic in `packages/web`, edit `packages/web/src/proxy.ts` directly (entry point) and `packages/web/src/lib/supabase/middleware.ts` (logic). Do NOT create a `middleware.ts` file — Next.js 16 will log deprecation warnings or ignore it depending on minor version.
