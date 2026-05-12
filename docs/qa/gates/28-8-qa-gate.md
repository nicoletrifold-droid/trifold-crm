# QA Gate — Story 28.8

**Story:** Housekeeping: deletar `logo-Trifold-laranja.webp` duplicado
**Date:** 2026-05-12
**Reviewer:** Quinn (@qa)
**Verdict:** PASS

## Checks

| # | Check | Result |
|---|-------|--------|
| 1 | Arquivo deletado do working tree (`ls` → no such file) | OK |
| 2 | Deleção staged no git (`D  logo-Trifold-laranja.webp`) | OK |
| 3 | Canonical `packages/web/public/logo-trifold.webp` intacto | OK |
| 4 | `sidebar-nav.tsx` linhas 45 e 101 referenciam `/logo-trifold.webp` | OK |
| 5 | Zero refs em `*.ts`/`*.tsx`/`*.json` | OK |
| 6 | `pnpm --filter @trifold/web build` exit 0, sem warnings de asset | OK |

**Próximo passo:** `@devops *push`
