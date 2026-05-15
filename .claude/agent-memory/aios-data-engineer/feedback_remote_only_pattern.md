---
name: remote_only ghost migration pattern
description: When SQL must be applied outside transaction (e.g., CREATE INDEX CONCURRENTLY) or via Studio, create local stub + manually register tracking
type: feedback
---

For SQL that cannot pass through `supabase db push` (which wraps each file in a transaction):
- `CREATE INDEX CONCURRENTLY` — Postgres rejects inside transaction (`SQLSTATE 25001`)
- `ALTER TYPE ADD VALUE` followed by use of that value in the SAME migration — `SQLSTATE 55P04` ("unsafe use of new enum value")
- Anything operationally applied via Studio when CLI is blocked

**Pattern:**

1. Apply SQL via Studio SQL Editor (or split into two migrations for enum case).
2. Create local file `NNN_descriptive_name_remote_only.sql` with EXACT SQL applied + header documenting:
   - Remote tracking version and name
   - Date applied
   - Reason for ghost migration (CONCURRENTLY, ad-hoc Studio, etc.)
3. Register manually in tracking:
   ```sql
   INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
   VALUES ('NNN', 'descriptive_name', ARRAY[$MIG$ <full SQL> $MIG$])
   ON CONFLICT (version) DO NOTHING;
   ```

**Why:** Without the ghost migration + tracking, `supabase migration list --linked` shows drift and future `supabase db push` may skip the local SQL silently. The `_remote_only` suffix conventionally signals "this file's purpose is documentation/parity, not for CLI to apply."

**How to apply:** Whenever a new migration in this repo needs to use CONCURRENTLY (Stories 29.2-29.5 all do) or when emergency hotfix is applied via Studio, follow this exact pattern. Convention formalized in `supabase/migrations/README.md` (Story 29.1, 2026-05-12).
