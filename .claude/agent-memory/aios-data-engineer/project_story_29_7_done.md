---
name: Story 29.7 done — pg_cron + epic 29 implementação 100%
description: 2026-05-14 — pg_cron 1.6.4 instalada via Management API, 5 jobs agendados (4 cleanups + refresh ROAS matview a cada 30 min). Implementação Epic 29 fechada 8/8.
type: project
---

Story 29.7 done em 2026-05-14, fechando IMPLEMENTAÇÃO do Epic 29 (8/8 stories).

**Why:** Última story do Epic 29 Database Performance Blitz — pg_cron necessário para fechar o ciclo: a matview `meta_campaign_roas` da Story 29.6 estava sem refresh automático (ficaria stale para sempre), e tabelas insert-heavy (`system_events`, `webhook_logs`, `follow_up_log`, `email_logs`) cresciam indefinidamente sem TTL.

**How to apply:**
- Pré-Story 29.7: pg_cron NÃO estava instalada no remote (spike confirmou `pg_extension` vazio para extname='pg_cron'); schema `cron` também ausente.
- `CREATE EXTENSION IF NOT EXISTS pg_cron` via Management API funcionou direto (não precisou habilitar via Dashboard primeiro). Versão instalada: 1.6.4.
- 5 jobs criados em sequência (jobids 1-5), todos `active=true`:
  - jobid 1: `cleanup-system-events` (`0 3 * * *`)
  - jobid 2: `cleanup-webhook-logs` (`0 4 * * *`)
  - jobid 3: `cleanup-follow-up-log` (`0 4 * * 0`)
  - jobid 4: `cleanup-email-logs` (`0 5 * * 0`)
  - jobid 5: `refresh-meta-campaign-roas` (`*/30 * * * *`)
- Pre-flight count revelou 274 system_events >30 dias (eventos operacionais 2026-04-02 a 2026-04-14: RAG_SUCCESS, CLAUDE_RESPONSE, etc.) — esperado para retention, sem dado crítico. Primeiro run às 3am UTC limpará naturalmente.
- Tracking version 036 registrado em `supabase_migrations.schema_migrations` com 6 statements.
- AC 8 (smoke runtime — aguardar 30 min para 1ª execução do refresh ROAS) PENDENTE HUMANO, não bloqueante (permissions já validadas com test-job-29-7).
- Epic 29 DoD: 3 checkboxes adicionais marcados (7 migrations no remote, pg_cron ativo com 5 jobs, matview com refresh auto). Próximo: `@architect *qa-gate 29.7` (último gate do epic).
- File: `supabase/migrations/036_pg_cron_cleanup_jobs_remote_only.sql`.
