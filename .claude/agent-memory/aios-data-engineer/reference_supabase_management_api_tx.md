---
name: Supabase Management API — transactions and text[] arrays
description: How to run multi-statement transactions with embedded text[] arrays against remote Supabase via Management API (no Docker)
type: reference
---

The Management API endpoint `POST /v1/projects/{ref}/database/query` accepts multi-statement SQL in the `query` field. Confirmed behavior:

- Multi-statement works; the response is the rows of the LAST statement only.
- `BEGIN; ... COMMIT;` is accepted but actually each call already runs inside an implicit transaction at the connection level, so explicit BEGIN/COMMIT can be omitted for atomic batches.
- `text[]` (`ARRAY[...]`) parameters: use PostgreSQL dollar-quoted strings to avoid quote-escape hell:
  ```sql
  INSERT INTO ... (statements)
  VALUES (ARRAY[$MIG_028A$ <multi-line SQL with single quotes> $MIG_028A$])
  ```
  Each `$TAG$ ... $TAG$` pair is treated as one string element. Use unique TAG per statement when batching.

**Auth:** Token at `~/.supabase/access-token` (JSON `{"access_token": "sbp_..."}`).

**Project ref:** `dsopqkqjkmhytudaaolv`

**Curl pattern:**
```bash
TOKEN=$(python3 -c "import json; print(json.load(open('/Users/ogabrielhr/.supabase/access-token'))['access_token'])")
curl -s -X POST "https://api.supabase.com/v1/projects/dsopqkqjkmhytudaaolv/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data @/tmp/payload.json
```

**Verified 2026-05-12 in Story 29.1**: 6 INSERTs + 1 UPDATE + final SELECT in one transaction succeeded, all 33 tracking rows verified.

**Pitfall:** The Management API returns the LAST statement's result. If you want to validate inserts mid-batch, end the SQL with `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;` so the response is the verification list.

**Verified 2026-05-13 in Story 29.2 — CONCURRENTLY works via Management API**:
Each `POST /database/query` call with a SINGLE `CREATE INDEX CONCURRENTLY ...` statement succeeds. Empty response `[]` means DDL OK. The implicit per-call transaction does NOT block CONCURRENTLY because each call runs at autocommit-equivalent level when the body contains exactly one DDL.
- DO NOT batch multiple CREATE INDEX CONCURRENTLY in one POST (the multi-statement transaction wrapper kicks in → error 25001).
- Loop one statement per call (~2s each for tiny tables). 26 indexes in Story 29.2 took ~49s total wall-clock.
- Compatible with `IF NOT EXISTS` for idempotency.
