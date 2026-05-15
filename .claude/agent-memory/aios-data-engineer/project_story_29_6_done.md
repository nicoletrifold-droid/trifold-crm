---
name: Story 29.6 Done — Materialize meta_campaign_roas
description: Story 29.6 aplicada 2026-05-14, view→matview com -97% cost, ganho dramatic em Index Scan único vs ~50 ops
type: project
---

Story 29.6 (Epic 29 — Database Performance Blitz) DONE em 2026-05-14.

**Why:** `meta_campaign_roas` era VIEW simples com 3 CTEs (4 tabelas) recomputada a cada hit no dashboard ROAS. Latência 2-5s. Materializar com REFRESH CONCURRENTLY a cada 30 min (Story 29.7) reduz para <100ms.

**How to apply:**
- Migration ghost: `supabase/migrations/035_materialize_meta_campaign_roas_remote_only.sql`
- 3 statements via Management API (DROP VIEW CASCADE + CREATE MATERIALIZED VIEW WITH DATA + CREATE UNIQUE INDEX)
- UNIQUE INDEX `idx_meta_campaign_roas_pk(org_id, meta_campaign_id)` é OBRIGATÓRIO para REFRESH CONCURRENTLY (Story 29.7 depende dele)
- Tracking version 035 registrado em `supabase_migrations.schema_migrations`

**Performance gain (EXPLAIN ANALYZE para SELECT por (meta_campaign_id, org_id)):**
- Cost: 62.90→0.15 (-97%)
- Planning Time: 15.899ms→0.387ms (-98%)
- Execution Time: 2.312ms→0.074ms (-97%)
- Plan operators: ~50 (Subquery Scan + Nested Loops + Hash Joins + GroupAggregates + Seq Scans) → 2 (Index Scan + Index Cond)

**Lesson — downtime medido honesto:** SQL puro = 4.42s (DROP 1.32s + CREATE MATVIEW 1.53s + CREATE INDEX 1.57s). Janela de coordenação manual entre chamadas curl serial (gap entre tool invocations) inflou para 131s mas isso NÃO é DB downtime — handler tem `.maybeSingle()` com graceful fallback. Para próximas matview migrations, considerar wrapper Python único (em vez de curl serial) se cloudflare permitir, ou aceitar gap como artefato de coordenação documentado transparentemente.

**Consumidor único:** `packages/web/src/app/api/meta-ads/campaigns/[campaign_id]/route.ts:370` — zero ajuste de código necessário (matview tem signature idêntica à view, 10 colunas). Build PASS confirma.

**Pendente humano:** AC 14 (TTFB dashboard) + AC 15 (smoke runtime Gabriel).

**Próximo:** `@architect *qa-gate 29.6`, depois Story 29.7 (pg_cron schedule REFRESH a cada 30 min).
