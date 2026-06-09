-- =============================================================================
-- 087_perf_indexes_remote_only.sql
-- =============================================================================
-- Remote tracking: version='087', name='perf_indexes_remote_only'
-- Applied via Supabase Studio SQL Editor / Management API (CONCURRENTLY requires
-- non-transactional context — `supabase db push` envolve cada migration em
-- BEGIN..COMMIT, o que dispara 25001 com CREATE INDEX CONCURRENTLY).
--
-- See: supabase/migrations/README.md — padrão CREATE INDEX CONCURRENTLY (Epic 29)
-- Date authored: 2026-06-08 (banco em crash loop OOM — NÃO aplicado ainda)
-- Authored by: @data-engineer (Dara)
-- Origem: Auditoria de performance /tmp/trifold-prod-audit-db-report.md (Achados #2, #4)
--
-- =============================================================================
-- NOTA DE RECONCILIAÇÃO (CRÍTICA — ler antes de aplicar) — Article IV / No Invention
-- =============================================================================
-- Ao verificar as migrations existentes ANTES de criar índices (regra do projeto:
-- "grep duplicados antes"), constatei que QUASE TODOS os índices propostos no
-- relatório de auditoria JÁ EXISTEM no schema, criados pela Epic 29 (Database
-- Performance Blitz, migrations 031/032/057). O relatório foi escrito por análise
-- estática sem cruzar 031/032/057; esta migration corrige esse engano.
--
-- Mapeamento proposta -> estado real (confirmado lendo as migrations):
--
--   PROPOSTA (relatório)                     ESTADO REAL
--   ----------------------------------------  --------------------------------------
--   idx_brokers_user_id ON brokers(user_id)   REDUNDANTE. brokers.user_id é
--                                             `NOT NULL REFERENCES users(id) UNIQUE`
--                                             (002_property_schema.sql). A constraint
--                                             UNIQUE cria um índice btree único
--                                             implícito em brokers(user_id) — equality
--                                             lookups (WHERE user_id = X) JÁ usam esse
--                                             índice. O "seq scan em brokers" descrito
--                                             no Achado #2 NÃO ocorre. Criar um segundo
--                                             índice seria desperdício de RAM/escrita.
--                                             -> NÃO criar. (verificar abaixo)
--
--   idx_leads_history_sync                    JÁ EXISTE como
--   leads(org_id, supremo_history_synced_at)  idx_leads_supremo_history_synced_at
--                                             ON leads(supremo_history_synced_at
--                                             NULLS FIRST) WHERE supremo_id IS NOT NULL
--                                             (057_supremo_history_synced_at.sql).
--                                             Cobre o ORDER BY do history-sync. O prefixo
--                                             org_id da minha proposta é marginal (org
--                                             única no cron). -> NÃO recriar.
--
--   idx_conversations_enrich                  JÁ EXISTE como
--   conversations(last_message_at)            idx_conversations_active_last_msg
--   WHERE is_ai_active = true                 ON conversations(last_message_at DESC)
--                                             WHERE is_ai_active = true
--                                             (032_composite_indexes_hot). Idêntico ao
--                                             índice do enrich-leads. -> NÃO recriar.
--
--   idx_conversations_org_last_msg            JÁ EXISTE (032), com NULLS LAST.
--                                             -> NÃO recriar.
--
--   idx_leads_org_stage                       JÁ EXISTE como idx_leads_org_stage_active
--   leads(org_id, stage_id)                   ON leads(org_id, stage_id, is_active) (032).
--                                             -> NÃO recriar.
--
--   idx_messages_conv_created                 JÁ EXISTE (032), idêntico. -> NÃO recriar.
--   messages(conversation_id, created_at)
--
-- CONCLUSÃO: os seq scans que o relatório atribuía a índices faltando já estão
-- cobertos pela Epic 29. Esta migration NÃO cria nenhum índice novo. O ganho de
-- performance esperado vem da migration 088 (otimização das funções/policies RLS),
-- não de novos índices.
--
-- Esta migration permanece como artefato de RASTREABILIDADE (documenta a decisão de
-- não criar índices) e como NET DE SEGURANÇA idempotente: as verificações abaixo
-- usam IF NOT EXISTS, então se algum ambiente (staging/local sem Epic 29) não tiver
-- esses índices, aplicá-la os cria sem efeito colateral em produção (no-op lá).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SAFETY-NET (idempotente). Em produção todos já existem -> no-op.
-- Em ambientes sem Epic 29 (ex.: local recriado do zero) cria o que faltar.
-- NÃO inclui idx_brokers_user_id (redundante com a UNIQUE constraint).
-- -----------------------------------------------------------------------------

-- enrich-leads: conversations com Nicole ativa, ordenadas por atividade (Achado #4b)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_active_last_msg
  ON conversations(last_message_at DESC) WHERE is_ai_active = true;

-- dashboard/inbox: conversas por org ordenadas por atividade recente (Achado #4c)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_org_last_msg
  ON conversations(org_id, last_message_at DESC NULLS LAST);

-- kanban/pipeline: leads por org + stage (Achado #4d)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_org_stage_active
  ON leads(org_id, stage_id, is_active);

-- enrich-leads N+1: últimas msgs por conversa (Achado #4f)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conv_created
  ON messages(conversation_id, created_at DESC);

-- history-sync: ORDER BY supremo_history_synced_at ASC NULLS FIRST (Achado #4a)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_supremo_history_synced_at
  ON leads(supremo_history_synced_at NULLS FIRST) WHERE supremo_id IS NOT NULL;

-- NOTA: idx_brokers_user_id NÃO é criado de propósito. A constraint
--   user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE
-- (002_property_schema.sql) já mantém um índice btree único em brokers(user_id).
-- Se uma auditoria futura PROVAR (via EXPLAIN ANALYZE com o banco vivo) que o
-- planner ainda faz seq scan em brokers dentro de user_broker_id(), descomentar:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brokers_user_id ON brokers(user_id);
-- (atualmente improvável — a UNIQUE já cobre o lookup por igualdade.)

-- =============================================================================
-- PÓS-APLICAÇÃO (registro manual de tracking, conforme README.md):
-- INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
-- VALUES (
--   '087',
--   'perf_indexes_remote_only',
--   ARRAY[
--     'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_active_last_msg ON conversations(last_message_at DESC) WHERE is_ai_active = true',
--     'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_org_last_msg ON conversations(org_id, last_message_at DESC NULLS LAST)',
--     'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_org_stage_active ON leads(org_id, stage_id, is_active)',
--     'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at DESC)',
--     'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_supremo_history_synced_at ON leads(supremo_history_synced_at NULLS FIRST) WHERE supremo_id IS NOT NULL'
--   ]
-- )
-- ON CONFLICT (version) DO NOTHING;
-- =============================================================================

-- =============================================================================
-- ROLLBACK PLAN (executar manualmente via Studio SQL Editor / Management API):
-- ATENÇÃO: estes índices foram criados pela Epic 29 (031/032/057). Só dropar se
-- esta migration foi a primeira a criá-los (ambiente sem Epic 29). NÃO dropar em
-- produção sem confirmar a origem — dropar regrediria a Epic 29.
-- DROP INDEX CONCURRENTLY IF EXISTS idx_conversations_active_last_msg;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_conversations_org_last_msg;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_leads_org_stage_active;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_messages_conv_created;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_leads_supremo_history_synced_at;
-- =============================================================================
