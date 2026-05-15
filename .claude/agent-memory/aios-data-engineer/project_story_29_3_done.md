---
name: Story 29.3 done — 9 composite hot indexes applied
description: Story 29.3 (Epic 29 Database Performance Blitz) — 9 índices compostos hot aplicados via Management API single-statement em 16s (2026-05-14)
type: project
---

Story 29.3 concluída em 2026-05-14 12:18 UTC. 9 índices compostos criados via Management API single-statement (16 segundos wall-clock) com tracking version 032 (`composite_indexes_hot_remote_only`, 9 statements).

Índices criados (todos com `indisvalid=true, indisready=true`):
- `messages`: idx_messages_conv_created (conversation_id, created_at DESC)
- `conversations`: idx_conversations_org_last_msg, idx_conversations_lead_last_msg, idx_conversations_active_last_msg (partial WHERE is_ai_active)
- `leads`: idx_leads_org_active_updated (partial WHERE is_active), idx_leads_org_stage_active
- `appointments`: idx_appointments_completed_org (partial WHERE status='completed')
- `system_events`: idx_system_events_org_level_created, idx_system_events_org_category_created

EXPLAIN ANALYZE proof:
- Query B leads (Seq Scan + top-N heapsort → Index Scan using idx_leads_org_active_updated): Limit cost 18.86 → 5.79 (-69%), Sort node eliminado.
- Query A messages: planner mantém índice simples + Sort de 2 rows em tabela ~300 rows (comportamento esperado, precedente 29.2/29.4 aceito).

Análise de redundância: índices simples pré-existentes (idx_messages_conversation, idx_conversations_lead, idx_conversations_org, idx_leads_org_id, idx_leads_stage, idx_appointments_org, idx_appointments_scheduled, idx_system_events_category, idx_system_events_level) foram MANTIDOS — servem queries sem ORDER BY. system_events compostos novos têm org_id como PRIMEIRO campo, superior aos existentes para queries multi-tenant.

**Why:** Story 29.3 fechou o terceiro entregável do Epic 29 (after 29.1 reconciliação tracking + 29.2 FK indexes + 29.4 vector). Stories restantes do epic: 29.5 (partial indexes queues, story file já existe), 29.6 (materializar meta_campaign_roas), 29.7 (pg_cron cleanup), 29.8.

**How to apply:** Para próximas stories de índices (29.5+) seguir o mesmo padrão Management API single-statement + ghost migration + tracking INSERT manual. Quando trabalhar em query Q B-like (org + filter + ORDER BY) em produção, conferir se composto cobre — pode haver oportunidade de eliminar Sort.
