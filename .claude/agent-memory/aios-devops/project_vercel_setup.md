---
name: project-vercel-setup
description: Vercel deployment configuration for trifold-crm — rootDirectory, build behavior, and known gotchas
metadata:
  type: project
---

Vercel project `trifold-s-projects/trifold-crm` (prj_s3ARh1fpDnzbx9ua4MYJf9iqdRhj) deploys this monorepo.

**Key config (confirmed via `vercel project inspect` on 2026-06-03):**
- Root Directory: `packages/web` (NOT repo root)
- Framework: Next.js 16.2.2
- Build Command: `cd ../.. && pnpm turbo build --filter=@trifold/web` (runs turbo from monorepo root)
- Install Command: `cd ../.. && pnpm install --no-frozen-lockfile`
- Node: 24.x
- Production URL: https://crm.trifold.eng.br

**Why:** Monorepo with rootDirectory at `packages/web` means a `.vercelignore` at repo root only covers files OUTSIDE `packages/web/`. To exclude files inside the web package from upload, the `.vercelignore` must live at `packages/web/.vercelignore`.

**How to apply:** When deploying, always run `vercel deploy` from repo root (the `.vercel/project.json` is there). Quality gate that mirrors what Vercel actually does is `cd packages/web && pnpm build` (i.e. `next build`) — NOT `pnpm lint` or `pnpm type-check` standalone.
