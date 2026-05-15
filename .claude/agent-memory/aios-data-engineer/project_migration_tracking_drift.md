---
name: Story 29.1 migration tracking reconciliation
description: Drift fixed 2026-05-12 between local migrations and remote supabase_migrations.schema_migrations — 6 INSERTs and 1 UPDATE
type: project
---

Story 29.1 (Epic 29 — Database Performance Blitz) reconciled severe drift between local `supabase/migrations/` and remote `supabase_migrations.schema_migrations` table in project `dsopqkqjkmhytudaaolv`.

**Root cause:** Multiple migrations applied via Supabase Studio SQL Editor without prior `supabase db push`, so the CLI tracking table never registered them. Compounded by version-number conflicts (multiple files sharing prefix `028`, `029`, etc.) and one row with `name=NULL`.

**Fix executed via Management API (`POST /v1/projects/{ref}/database/query`):**

1. `UPDATE` version 027: set `name = 'property_id_obras'` (was NULL)
2. `INSERT` 6 new rows with `statements` populated from local file contents:
   - `024b` ← `024_mensagens_sender_display_name.sql`
   - `028a` ← `028_fix_v_mensagens_admin_grant.sql`
   - `028b` ← `028_meta_campaign_actions.sql`
   - `029a` ← `029_cliente_id_obra_mensagens.sql`
   - `029b` ← `029_privacy_acceptance.sql`
   - `030` ← `030_role_obras.sql`

**Local file renames (via `git mv`):**
- `024_mensagens_sender_display_name.sql` → `024b_*`
- `028_fix_v_mensagens_admin_grant.sql` → `028a_*`
- `028_meta_campaign_actions.sql` → `028b_*`
- `029_cliente_id_obra_mensagens.sql` → `029a_*`
- `029_privacy_acceptance.sql` → `029b_*`

**Stubs replaced with real SQL:**
- `024_remote_only.sql` (deleted) → `024_phone_normalization_part1_remote_only.sql` (created, content of `021_phone_normalization_part1.sql`)
- `025_remote_only.sql` (deleted) → `025_phone_normalization_part2_remote_only.sql`

**Why:** Without this fix, Stories 29.2-29.7 (creating migrations `031-036`) would `supabase db push` against an inconsistent state — CLI could skip migrations silently or fail with "already applied".

**How to apply:** Reference this approach when future drift is detected. The pattern: query remote tracking, compare to schema reality, decide per-migration whether to register tracking only (object exists) or apply SQL + register tracking (object missing). Always use a transaction with a final `SELECT ... ORDER BY version` for verification.

**Final state:** 33 entries in tracking table, all with `name NOT NULL`.
