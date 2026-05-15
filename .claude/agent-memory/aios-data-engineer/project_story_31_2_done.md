---
name: story_31_2_done
description: Story 31.2 (migration 043 DDL CommercialRules v2) aplicada em produção 2026-05-15; CHECK constraint + DEFAULT + COMMENT; 12/12 ACs PASS
type: project
---

Story 31.2 — Migration 043: DDL CommercialRules v2 aplicada em produção 2026-05-15 14:54 UTC. Schema-only (zero alteração de dados). 12/12 ACs PASS.

**Why:** Primeira story do Epic 31 (Nicole Data Layer Refactor) que toca DB de produção. Adiciona DEFAULT jsonb neutro + CHECK constraint `commercial_rules_shape_check` (schema permissivo: valida tipos/ranges quando campos presentes, aceita IS NULL, aceita campos extras como `min_down_payment: 68000` do Vind). Documentação inline via COMMENT ON COLUMN apontando para o schema Zod em `packages/shared/src/types/commercial-rules.ts` (Story 31.1).

**How to apply:**
- Aplicado via Supabase Management API (POST /v1/projects/dsopqkqjkmhytudaaolv/database/query), 4 statements em batch único.
- Tracking inserido em `supabase_migrations.schema_migrations` com `version=043, name=043_property_commercial_rules_v2`.
- Smoke tests validaram CHECK (negativo `min_down_payment_pct=150` → ERROR 23514; positivo `{min_down_payment_pct:10,...}` aceito; NULL aceito), todos com ROLLBACK obrigatório — count baseline (2 rows: Vind + Yarden) preservado.
- Próximas stories do Epic 31:
  - **31.3** (backfill 044): UPDATE Vind/Yarden com novos campos `min_down_payment_pct`, `example_down_payment_brl`, `key_selling_points`, etc. Cleanup do campo legado `min_down_payment` (Vind) também deve sair daqui. Também limpar comment stale "Migration 040" no Zod (SF-1 da PO validation).
  - **31.4** (pipeline Nicole consumindo `commercial_rules`)
  - **31.5** (UI)
- Rollback completo documentado no story (3 ALTERs + DELETE em schema_migrations) — não executado.
- Status: InProgress → InReview. Próximo: @qa *qa-gate 31.2.
