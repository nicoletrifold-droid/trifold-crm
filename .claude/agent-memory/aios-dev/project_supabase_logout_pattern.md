---
name: Supabase logout must use server action, not browser client
description: Browser supabase.auth.signOut() does not clear httpOnly SSR cookies; always use the `logout` server action via <form action={logout}>
type: project
---

In this project, `supabase.auth.signOut()` called from the browser client (`@web/lib/supabase/client`) only clears localStorage tokens, **NOT** the httpOnly `sb-*-auth-token` cookies that `proxy.ts` (SSR) uses to authenticate requests. This causes silent logout failures where the UI thinks the user is logged out but `proxy.ts` still sees the session and redirects them back into the app.

**Always use the server action pattern:**

```tsx
import { logout } from "@web/app/login/actions"

<form action={logout}>
  <button type="submit">Sair</button>
</form>
```

The `logout` server action at `packages/web/src/app/login/actions.ts` calls `supabase.auth.signOut()` on the server client (with `cookies()` from `next/headers`), which DOES clear the httpOnly cookies, then `revalidatePath("/", "layout")` invalidates cached layouts, and `redirect("/login")` sends a server-side redirect.

**Why:** Lost a half-day in May 2026 because admin/broker LogoutButton was using the browser client. Cliente portal sidebar at `packages/web/src/app/cliente/[obra_id]/_components/sidebar.tsx` was already using the correct pattern — pattern was just inconsistent across components.

**How to apply:** ANY new logout UI (admin, broker, cliente, obras) must use `<form action={logout}>`. Never `onClick={() => supabase.auth.signOut()}`. Reference component: `packages/web/src/components/layout/logout-button.tsx` (post-fix). The same lesson applies to other auth state changes that need to persist server-side (login, password reset, session refresh) — use server actions, not browser-client mutations.
