---
name: Epic 30 closure (2026-05-14, 9/9 stories Done)
description: Padrão de fechamento do Epic 30 (Over-fetch & N+1 Killers). 2 migrations, 3 RPCs novas, 1 trigger, 6 routes refatoradas. Composição multiplicativa com Epic 29.
type: project
---

Epic 30 fechado 2026-05-14 via gate Architect da Story 30.2 (última do epic).

**Why:** Próximo gargalo da plataforma DEPOIS de Epic 29 (35 índices) era a camada Next.js pedindo dados demais. Reescrever ANTES de cachear (Epic 31).

**How to apply:**

- Padrão de migration: `037_dashboard_rpcs_remote_only.sql` consolida 3 RPCs novas em 1 arquivo (reduz overhead de tracking) — preferir consolidação quando RPCs são para a mesma rota/feature área.
- Padrão de desnormalização: `038_conversations_last_message_preview_remote_only.sql` — coluna nova + trigger AFTER INSERT + backfill DISTINCT ON idempotente (`AND col IS NULL` no WHERE).
- Stories 30.1, 30.5, 30.8 (RPCs) capitalizaram nos índices compostos do Epic 29 (idx_leads_org_active_updated, idx_leads_org_stage_active, idx_system_events_org_level_created). Padrão multiplicativo: índice certo + agregação SQL = ganho composto.
- Trigger overhead em hot table: validar # de sites de INSERT antes (River mapeou 6 para messages). Single-row UPDATE em parent ~1ms é aceitável.
- Closure pattern: status Done + closed_at + closed_by + sumário consolidado (tabela com ganhos mensurados por story) + custos permanentes aceitos + próximo movimento sugerido. Tudo no epic file (sem doc separado).
- AC global do epic (EXPLAIN ANALYZE obrigatório, RLS preserved, idempotência em migrations) replicável em epics futuros.

**Ganhos consolidados Epic 30:**
- /dashboard/analytics: payload 190KB → 3KB (~98%); EXPLAIN 3.8ms (target <50ms)
- /api/system-events: 15 queries → 1
- /dashboard/page.tsx: 8+ queries → 1
- /dashboard/conversas: N+1 query em messages eliminada
- Bug crítico em produção (/api/dashboard/metrics) corrigido (Story 30.6)
- ~22 round-trips a menos por hit do dashboard

**Próximo:** Epic 31 (caching das RPCs novas), seguido de 33 (backend cron) e 27 (observability re-aberta para validar custos do trigger e RPCs).
