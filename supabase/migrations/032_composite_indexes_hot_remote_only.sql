-- =============================================================================
-- 032_composite_indexes_hot_remote_only.sql
-- =============================================================================
-- Remote tracking: version='032', name='composite_indexes_hot_remote_only'
-- Applied via Supabase Management API single-statement (CONCURRENTLY requires
-- non-transactional context). Story 29.3 — Epic 29 Database Performance Blitz.
--
-- See: supabase/migrations/README.md — padrão CREATE INDEX CONCURRENTLY (Epic 29)
-- Date applied: 2026-05-13
-- Executed by: @data-engineer (Dara)
--
-- SPIKE NOTES (2026-05-13, via Management API against project dsopqkqjkmhytudaaolv):
--   - Todas as 17 colunas confirmadas no remote.
--   - Nenhum dos 9 índices compostos propostos existe atualmente.
--   - Slot 032 LIVRE no tracking remote (Lucas não fez push de 032_user_theme.sql).
--   - Índices simples existentes (idx_messages_conversation, idx_conversations_lead,
--     idx_conversations_org, idx_messages_created_at, idx_leads_org_id, idx_leads_stage,
--     idx_appointments_org, idx_appointments_scheduled, idx_system_events_category,
--     idx_system_events_level) são COMPLEMENTARES — não removidos; nossos compostos
--     servem as queries com ORDER BY e os parciais cobrem hotpaths multi-tenant.
--   - system_events: idx_system_events_category e idx_system_events_level (sem org_id)
--     existem hoje; nossos compostos adicionam org_id como PRIMEIRO campo — superior
--     para queries multi-tenant (WHERE org_id = $1 AND level/category = $2 ORDER BY ...).
--
-- Tabelas alvo (todas < 500 kB conforme spike):
--   system_events 456 kB | messages 112 kB | leads 80 kB | conversations 8 kB | appointments 8 kB
-- Janela de execução: < 30s estimada total (9 índices CONCURRENTLY).
-- =============================================================================

-- messages: composto (conversation_id, created_at DESC)
-- Elimina Sort em memória na query mais frequente do pipeline WhatsApp
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conv_created
  ON messages(conversation_id, created_at DESC);

-- conversations: para listagens do dashboard (org + last_message_at)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_org_last_msg
  ON conversations(org_id, last_message_at DESC NULLS LAST);

-- conversations: para lookup por lead + ordenação (sidebar de conversas)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_lead_last_msg
  ON conversations(lead_id, last_message_at DESC NULLS LAST);

-- conversations: partial para filtro is_ai_active = true (badge de Nicole ativa)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_active_last_msg
  ON conversations(last_message_at DESC) WHERE is_ai_active = true;

-- leads: listagem do dashboard com filtro is_active + ordem cronológica
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_org_active_updated
  ON leads(org_id, updated_at DESC) WHERE is_active = true;

-- leads: filtro de kanban por stage dentro da org
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_org_stage_active
  ON leads(org_id, stage_id, is_active);

-- appointments: followup pós-visita (status completed, ordem cronológica)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_completed_org
  ON appointments(org_id, scheduled_at DESC) WHERE status = 'completed';

-- system_events: queries de log por org + nível (superior ao idx_system_events_level sem org_id)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_events_org_level_created
  ON system_events(org_id, level, created_at DESC);

-- system_events: queries de log por org + categoria (superior ao idx_system_events_category sem org_id)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_events_org_category_created
  ON system_events(org_id, category, created_at DESC);

-- =============================================================================
-- ROLLBACK PLAN (executar manualmente via Supabase Studio SQL Editor se necessário):
-- DROP INDEX CONCURRENTLY IF EXISTS idx_messages_conv_created;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_conversations_org_last_msg;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_conversations_lead_last_msg;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_conversations_active_last_msg;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_leads_org_active_updated;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_leads_org_stage_active;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_appointments_completed_org;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_system_events_org_level_created;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_system_events_org_category_created;
-- =============================================================================
