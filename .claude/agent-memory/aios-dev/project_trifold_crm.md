---
name: Trifold CRM — module conventions
description: Conventions for the Trifold CRM Next.js codebase under packages/web — API auth, schema patterns, modal sub-form conventions
type: project
---

Trifold CRM is the project hosted at /Users/marcos/trifold-crm. The Next.js web app lives at packages/web and has its own AGENTS.md noting "This is NOT the Next.js you know" — APIs may differ from training data, so read node_modules/next/dist/docs when uncertain.

**Why:** Multi-package monorepo with custom Next.js conventions; pre-existing 6 lint warnings are baseline and should NOT be touched.

**How to apply:**
- API routes use `requireAuth()` + `requireRole(appUser, [...])` from `@web/lib/api-auth`
- `params` in route handlers is `Promise<{ id: string }>` — must be `await`ed
- API responses follow `{ data, error?, total?, page?, limit? }` shape
- Modal sub-forms (e.g. "Novo tipo de brinde" in destinatario-modal.tsx) follow a pattern: collapsible bordered panel with cancel/submit buttons, error inline, spinner via button text "Criando..."
- `clientes` table (migration 041) is a CRM entity SEPARATE from `users` with role='cliente' — no FK between them
- Migration files in `supabase/migrations/` are numbered; some have `_remote_only` suffix when applied directly via Management API (not via `supabase db push`)
- Lint script is `npm run lint` (not `lint:check`); type-check is `npm run type-check` (with hyphen) — `tsc --noEmit`
- Brindes module: `brindes_destinatarios.cliente_id` (migration 042) added as nullable FK with `ON DELETE SET NULL` and partial index `WHERE cliente_id IS NOT NULL`
