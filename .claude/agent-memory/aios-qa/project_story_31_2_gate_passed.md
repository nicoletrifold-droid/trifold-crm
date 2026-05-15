---
name: story_31_2_gate_passed
description: Story 31.2 (migration 043 commercial_rules CHECK) — gate PASS. Patterns para validar DDL JSON CHECK constraints em produção.
type: project
---

Story 31.2 (Epic 31) — primeira migration de produção do Epic Nicole Data Layer Refactor. Gate executado 2026-05-15 — verdict PASS (34/35).

**Why:** primeira story do Epic 31 que tocou DB de produção; precedente para Stories 31.3 (backfill) e 31.5 (API + Zod validation).

**How to apply (patterns para futuros gates de CHECK constraint em jsonb):**

1. **Sempre revalidar AC independentemente** via Management API. Token em `~/.supabase/access-token` (formato JSON `{"access_token": "..."}`), endpoint `POST https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query`. Não confiar só no log do executor.

2. **Validar `convalidated=true`** em `pg_constraint` — confirma que a constraint foi avaliada retroativamente contra dados existentes (não foi marcada NOT VALID por engano).

3. **3 tentativas negativas obrigatórias** para CHECK em jsonb:
   - Numérico out-of-range (esperado: bloqueado)
   - Enum-like com valor inválido (geralmente aceito se SQL só valida `jsonb_typeof`, gap esperado se enum-validation é app-layer)
   - Valor negativo onde o range é `>= 0` (esperado: bloqueado)

4. **Schema permissivo por design ≠ gap:** se a CHECK constraint só valida `jsonb_typeof = 'array'` (não enum values), e a arquitetura documenta que enum-validation é Zod/UI, então NEG-2 aceitar `["pix"]` é CONCERN-mediano-escopado, não FAIL.

5. **Post-rollback verification obrigatória:**
   - `SELECT * FROM properties WHERE slug LIKE '__test_%' OR slug LIKE '__qa_%'` → deve retornar zero.
   - `SELECT count(*) FROM properties` → deve bater com baseline pré-migration.

6. **Vind/Yarden integrity check** (Trifold-specific): `SELECT commercial_rules FROM properties WHERE slug IN ('vind-residence','yarden')` — comparar byte-a-byte vs. baseline documentada na story.

7. **Drift tracking inter-epic:** se diferentes equipes usam diferentes convenções de `schema_migrations.version` (numeric `'043'` vs. timestamp `'20260515134909'`), `ORDER BY version DESC` desordena lexicograficamente. Não bloqueia gate — flag como CONCERN para @architect.

8. **Smoke test template para CHECK em `properties`:**
   ```sql
   BEGIN;
   INSERT INTO properties (org_id, name, slug, status, address, city, state, commercial_rules)
   VALUES ((SELECT org_id FROM properties WHERE slug='vind-residence'),
           '__qa_X__', '__qa_X__', 'selling', 'Test', 'Test', 'SP',
           '<payload>'::jsonb)
   RETURNING name, commercial_rules;
   ROLLBACK;
   ```
   Sem `address/city/state` o INSERT falha em NOT NULL antes da CHECK (Dara learned this hard way em Story 31.2).

9. **Typecheck obrigatório em todos os pacotes** (`pnpm -r type-check`) — DDL change pode invalidar tipos de pacotes que consomem (no caso 31.2: `packages/ai/src/chat/pipeline.ts:1072-1142` lê `properties.commercial_rules`).
