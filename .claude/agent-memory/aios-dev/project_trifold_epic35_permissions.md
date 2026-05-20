---
name: Trifold Epic 35 — Permissions Architecture
description: Server-layer permissions module (packages/web/src/lib/permissions.ts) backed by roles + role_permissions tables. Consumed by stories 35-3/35-4/35-5.
type: project
---

Trifold CRM Epic 35 moves the hardcoded role permission matrix (admin/supervisor/broker/obras × 17 modules) from app code into the `roles` and `role_permissions` Supabase tables (migration `supabase/migrations/047_roles_permissions.sql`).

**Why:** Lets admins edit access via UI without redeploys. Story 35-2 created the abstraction layer; stories 35-3 (admin UI), 35-4 (sidebar consumption), 35-5 (guards) consume it.

**How to apply (for stories 35-3 and beyond):**
- Server module lives at `packages/web/src/lib/permissions.ts`. Public API: `getOrgRoles(orgId)`, `getRolePermissions(roleId)`, `getOrgPermissionsMatrix(orgId)`, `getUserPermissions(userId, orgId)`, `revalidateOrgPermissions(orgId)`, server action `updatePermission(roleId, module, canAccess)`.
- Cache: `unstable_cache` with TTL=60s. Tags: `permissions-{orgId}` (org-wide) and `permissions-role-{roleId}` (per-role).
- Cache-tag pattern with dynamic IDs: wrap the cached function **inline** and invoke with `()` — putting `unstable_cache(...)` at module level captures tags at definition time and breaks revalidation.
- `"use server"` is an **inline directive on `updatePermission` only**, NOT at the top of `permissions.ts` — top-of-file would expose `getOrgRoles` etc. as Server Actions.
- 17 canonical modules (lowercase ids in DB): agenda, alertas, analytics, atividades, brindes, campanhas, configuracoes, conversas, corretores, dashboard, imoveis, leads, mensagens, obras, pipeline, sistema, treinamento. The display labels (Dashboard, Pipeline, Configurações) are UI-only — at the data layer always use lowercase ids without accents.
- `SYSTEM_ROLES` fallback uses **fictitious IDs prefixed `system-`** (e.g. `system-admin`). Consumers that need a real role_id must detect this prefix.
- `getUserPermissions` queries `users.id` (PK), NOT `auth_id` — different from `api-auth.ts`/`auth.ts` which use `auth_id`. Caller passes `appUser.id` from `getServerUser()`, not `auth.uid()`.
- All reads use `createClient()` from `@web/lib/supabase/server` (RLS-aware via cookies). DO NOT use `createAdminClient()` (service_role) for permission reads — RLS handles admin gate via `is_admin()` SQL function.
- After any mutation that affects an org's permissions, call `revalidateOrgPermissions(orgId)` to invalidate the cache.

**Quality gate scripts in `packages/web/package.json`:**
- `pnpm --filter @trifold/web run type-check` (NOT `typecheck` — hyphenated)
- `pnpm --filter @trifold/web run lint`
- Pre-existing baseline (as of 2026-05-20): 6 type errors in generated `.next/dev/types/` (ignore — not real source errors), 6 lint warnings, 0 lint errors.

**Files NOT to touch (per 35-2 scope OUT):** `packages/web/src/lib/api-auth.ts`, `packages/web/src/lib/supabase/server.ts`, `packages/web/src/lib/auth.ts`. The legacy hardcoded matrix display at `packages/web/src/app/dashboard/configuracoes/perfil-acesso/page.tsx` is replaced by 35-3.
