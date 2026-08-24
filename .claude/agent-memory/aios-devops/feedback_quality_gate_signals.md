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

**How to apply:** When running pre-push/pre-deploy quality gates for trifold-crm, run `cd /Users/marcos/trifold-crm/packages/web && NODE_OPTIONS="--max-old-space-size=8192" pnpm build` and trust that result. If lint/type-check fail but `next build` passes, the deploy will succeed. Report all three but only block on `next build`. The `--max-old-space-size=8192` flag is needed — without it, tsc crashes with exit 137 (OOM SIGKILL) on this codebase.

**Limite conhecido deste sinal (2026-08-24):** `pnpm build` local verde NÃO garante deploy verde. O build da Vercel usa `rootDirectory: packages/web` e respeita `packages/web/.vercelignore` (que exclui `docs`, `scripts`, `bin`, `.claude`), então um `import` que atravessa a fronteira do pacote compila local (o arquivo existe no working tree) e explode na Vercel. Caso real (resolvido em 2026-08-24 pela 900-14b): [[incidente-deploy-900-14b]]. Ao pushar, confira também o check `Vercel – trifold-crm` do PR, não só o CI do GitHub.

**Desde 2026-08-23 o repo tem CI de verdade** (`.github/workflows/ci.yml`, Story 900-1): job `type-check · lint · test` bloqueante + `gate de tenancy` não-bloqueante. O pre-push gate local deve espelhar os três comandos do job (`pnpm type-check`, `pnpm lint`, `pnpm test`) para não descobrir falha só no PR.

**Duas armadilhas do gate local, aprendidas em 2026-08-24 (PR #492):**
- `turbo build` pode responder do cache e devolver verde sem compilar nada. Quando o build é a
  evidência que se vai reportar, rode **`npx turbo build --force`** e confira `Cached: 0 cached` na
  saída. O mesmo vale para `pnpm type-check` via turbo — `npx tsc --noEmit` direto em
  `packages/web` é o sinal sem intermediário.
- `pnpm gate:tenancy` **escreve** `docs/audits/gate-tenancy-report.json` (troca `geradoEm` e
  `fonte: management-api` → `snapshot`). Rodar o gate suja o working tree; descarte com
  `git checkout --` antes de commitar, senão o churn entra no PR como ruído fora de escopo.

