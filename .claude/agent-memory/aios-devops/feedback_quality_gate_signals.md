---
name: feedback-quality-gate-signals
description: For trifold-crm Next 16 deploys, next build is the canonical pre-deploy gate — lint and tsc standalone produce noise
metadata:
  type: feedback
---

For trifold-crm, treat `cd packages/web && pnpm build` (i.e. `next build`) as the canonical pre-deploy quality gate. Lint and `tsc --noEmit` standalone produce false-positive signal that does not reflect what Vercel will do.

**Why:**
- `packages/web/next.config.ts` has `typescript.ignoreBuildErrors: false` (TS errors DO block build) but the ESLint config was removed from NextConfig in Next 16 — so `pnpm lint` errors do NOT block `next build`.
- `pnpm type-check` (which runs `tsc --noEmit`) emits errors from `.next/types/validator.ts` (stale dev-server artifacts) and from any `.tsx` files in `src/app/` even if they are unimported orphans. The Vercel build does a fresh `.next/` build, so the `.next/types/*` errors vanish there.
- Result: lint may show 5 errors and tsc may show 8+ errors that NEVER show up in the actual Vercel build. Running `next build` locally is the only honest signal.

**How to apply:** When running pre-push/pre-deploy quality gates for trifold-crm, run `cd /Users/lucasprado/trifold-crm/packages/web && NODE_OPTIONS="--max-old-space-size=8192" pnpm build` and trust that result. If lint/type-check fail but `next build` passes, the deploy will succeed. Report all three but only block on `next build`. The `--max-old-space-size=8192` flag is needed — without it, tsc crashes with exit 137 (OOM SIGKILL) on this codebase.
