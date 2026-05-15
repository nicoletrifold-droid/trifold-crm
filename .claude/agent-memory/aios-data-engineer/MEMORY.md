# Memory Index — @data-engineer (Dara) — Trifold CRM

## Project
- [project_migration_tracking_drift.md](project_migration_tracking_drift.md) — Story 29.1 resolved 6 unregistered migrations + version 027 NULL name on remote (2026-05-12)
- [project_story_29_3_done.md](project_story_29_3_done.md) — Story 29.3 done: 9 composite hot indexes applied via Management API in 16s (2026-05-14); Q B leads -69% Limit cost, Sort eliminated
- [project_story_29_6_done.md](project_story_29_6_done.md) — Story 29.6 done 2026-05-14: meta_campaign_roas view→matview, -97% cost & exec time, ~50 ops → 2 (Index Scan)
- [project_story_29_7_done.md](project_story_29_7_done.md) — Story 29.7 done 2026-05-14: pg_cron 1.6.4 instalada + 5 jobs agendados (4 cleanups + refresh ROAS); Epic 29 implementação 100%
- [project_story_30_5_fase1.md](project_story_30_5_fase1.md) — Story 30.5 FASE 1 (RPC) entregue 2026-05-14; mig 037 + função SECURITY INVOKER + tracking; FASE 2 (@dev page.tsx) pendente
- [project_story_30_9_fase1.md](project_story_30_9_fase1.md) — Story 30.9 FASE 1 (RPC) entregue 2026-05-14; mig 039 + get_admin_mensagens_paginated (7 args, GROUP BY+DISTINCT ON+LIMIT/OFFSET); FASE 2 (@dev route.ts) pendente
- [project_story_30_1_fase1.md](project_story_30_1_fase1.md) — Story 30.1 FASE 1 entregue 2026-05-14; append em 037 com get_analytics_summary(uuid,timestamptz); EXPLAIN 3.8ms; FASE 2 (@dev page.tsx+4 rotas) pendente
- [project_story_30_8_fase1.md](project_story_30_8_fase1.md) — Story 30.8 FASE 1 entregue 2026-05-14; append em 037 com get_system_events_summary(uuid,int); EXPLAIN 14.86ms; tracking 4->6 stmts; FASE 2 (@dev route.ts) pendente
- [project_story_30_2_fase1.md](project_story_30_2_fase1.md) — Story 30.2 FASE 1 (ultima Epic 30) entregue 2026-05-14; mig 038 + col preview/role + trigger AFTER INSERT em messages + backfill 27 conv; FASE 2 (@dev page.tsx) pendente
- [project_story_31_2_done.md](project_story_31_2_done.md) — Story 31.2 done 2026-05-15: mig 043 (DDL CommercialRules v2) aplicada — CHECK constraint permissivo + DEFAULT jsonb + COMMENT; 12/12 ACs PASS; baseline 2 rows preservado

## Feedback
- [feedback_remote_only_pattern.md](feedback_remote_only_pattern.md) — Pattern for SQL applied via Studio (CONCURRENTLY indexes etc.): ghost migration `NNN_*_remote_only.sql` + manual INSERT in `supabase_migrations.schema_migrations`
- [feedback_properties_smoke_test_required_columns.md](feedback_properties_smoke_test_required_columns.md) — INSERT em `properties` para smoke tests precisa de address/city/state (NOT NULL avaliado antes do CHECK, confunde error code 23502 vs 23514)

## Reference
- [reference_supabase_management_api_tx.md](reference_supabase_management_api_tx.md) — Multi-statement transactions work via Management API; `text[]` arrays via PG dollar-quoted strings ($MIG_X$...$MIG_X$)
- [reference_pgvector_ivfflat.md](reference_pgvector_ivfflat.md) — IVFFlat constraints (no CONCURRENTLY), lists calibration, planner choice in small datasets, probes tuning (Story 29.4)
- [reference_partial_indexes_queues.md](reference_partial_indexes_queues.md) — Story 29.5: planner usa partial mesmo com volume baixo quando partial elimina Sort vs full em col diferente
- [reference_management_api_dollar_quotes.md](reference_management_api_dollar_quotes.md) — Dollar-quotes ($$...$$) via Management API: usar curl --data-binary @file.json (heredoc 'EOF'); Python urllib falha com 403 cf-ray 1010
