---
name: Epic 29 Migration Convention (post Story 29.1)
description: Convention formalized in supabase/migrations/README.md after Story 29.1 reconciled tracking drift. Required for Stories 29.2-29.7 quality gates.
type: project
---

Epic 29 migration convention ratified on 2026-05-12 via Story 29.1 PASS:

- **Numbering:** 3 digits zero-padded (`031_*`, NOT `0031_*`). 4 digits breaks lexicographic ordering with existing 33 migrations.
- **Conflicts of same number:** suffix `a`/`b`/`c` (e.g., `028a_*`, `028b_*`). Supabase CLI orders by full string — letter suffix is safe.
- **Next free prefix as of 2026-05-12:** `031`.
- **CREATE INDEX CONCURRENTLY pattern (Epic 29 stories 29.2-29.5):** Apply via Supabase Studio SQL Editor (cannot run in CLI transaction) + create ghost migration `NNN_name_remote_only.sql` with real SQL + manually INSERT into `supabase_migrations.schema_migrations`.
- **DDL destrutivo pattern (Story 29.6 — materializar view):** Aplicar 3 statements serialmente via Management API (DROP VIEW CASCADE + CREATE MATERIALIZED VIEW WITH DATA + CREATE UNIQUE INDEX), registrar timestamps de início/fim, calcular downtime SQL puro (soma das durações reais — gap entre invocações curl não conta). Pré-requisito de Spike: confirmar zero views dependentes via pg_depend + relkind atual + grep de consumidores. Handler do consumidor DEVE ter graceful fallback (try/catch ou .maybeSingle()) para tolerar a janela DROP→CREATE.
- **Never rename a migration already applied in remote** — CLI matches by `version`+`name`; rename breaks tracking.
- **Validation query** (use in every QA gate touching migrations): `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version` via Management API token at `~/.supabase/access-token`. Expect post-29.1 baseline: 33 rows, zero NULL names.

**Why:** Story 29.1 spike revealed that migrations 021-030 had been applied via Studio without tracking, plus 3 files in slot `021`. Reconciliation registered 6 missing rows (`024b`, `028a`, `028b`, `029a`, `029b`, `030`), fixed v027 NULL name, and populated 2 empty stubs with real SQL.

**How to apply:** When reviewing Stories 29.2-29.7 quality gates, verify (1) prefix is sequential from 031, (2) for CONCURRENTLY migrations, ghost `_remote_only.sql` exists alongside Studio application + tracking INSERT, (3) post-application Management API query returns expected new row.

**Drift to remember:** local `021_phone_normalization_part1.sql` is tracked as v024 in remote, `021_phone_normalization_part2.sql` as v025. Both files carry NOTA DE TRACKING headers — never rename them.

Gate file reference: `docs/qa/gates/29-1-architect-gate.md`.
Convention doc: `supabase/migrations/README.md`.
