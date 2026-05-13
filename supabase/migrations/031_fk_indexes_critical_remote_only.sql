-- =============================================================================
-- 031_fk_indexes_critical_remote_only.sql
-- =============================================================================
-- Remote tracking: version='031', name='fk_indexes_critical_remote_only'
-- Applied via Supabase Studio SQL Editor / Management API (CONCURRENTLY requires
-- non-transactional context). Story 29.2 — Epic 29 Database Performance Blitz.
--
-- See: supabase/migrations/README.md — padrão CREATE INDEX CONCURRENTLY (Epic 29)
-- Date applied: 2026-05-12
-- Executed by: @data-engineer (Dara)
--
-- SPIKE NOTES (2026-05-12, via Management API against project dsopqkqjkmhytudaaolv):
-- 3 índices originais REMOVIDOS do escopo por colunas ausentes no remote:
--   * idx_conversation_state_lead    -> conversation_state.lead_id NÃO EXISTE
--                                       (tabela usa conversation_id -> conversations)
--   * idx_visit_feedback_appointment -> visit_feedback.appointment_id NÃO EXISTE
--   * idx_visit_feedback_org         -> visit_feedback.org_id NÃO EXISTE
-- Total: 26 índices criados (originalmente 29 no relatório de auditoria).
--
-- Tabelas alvo: todas <500 kB conforme spike. Janela de execução: <30s estimada.
-- =============================================================================

-- conversation_state (1 — lead_id ausente, apenas current_property_id)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversation_state_property
  ON conversation_state(current_property_id);

-- leads (2)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_property_interest
  ON leads(property_interest_id) WHERE property_interest_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_utm_campaign
  ON leads(org_id, utm_campaign) WHERE utm_campaign IS NOT NULL;

-- appointments (1)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_property
  ON appointments(property_id);

-- unit_sales, units (3)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_unit_sales_lead ON unit_sales(lead_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_unit_sales_broker ON unit_sales(broker_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_units_reserved_lead
  ON units(reserved_by_lead_id) WHERE reserved_by_lead_id IS NOT NULL;

-- lead_property_interest (2)
-- Nota: UNIQUE constraint (lead_id, property_id) já existe, mas índice simples por coluna é distinto.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_property_interest_lead
  ON lead_property_interest(lead_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_property_interest_property
  ON lead_property_interest(property_id);

-- visit_feedback (3 FKs — appointment_id e org_id AUSENTES no remote)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visit_feedback_lead ON visit_feedback(lead_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visit_feedback_property ON visit_feedback(property_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visit_feedback_broker ON visit_feedback(broker_id);

-- broker_assignments (1)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_broker_assignments_property
  ON broker_assignments(property_id);

-- obra_mensagens (2)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_obra_mensagens_sender ON obra_mensagens(sender_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_obra_mensagens_cliente ON obra_mensagens(cliente_id);

-- obra_fotos (2)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_obra_fotos_fase ON obra_fotos(fase_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_obra_fotos_uploaded_by ON obra_fotos(uploaded_by);

-- obra_documentos (1)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_obra_documentos_uploaded_by ON obra_documentos(uploaded_by);

-- follow_up_log (3)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_log_org ON follow_up_log(org_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_log_rule ON follow_up_log(rule_id);
-- Composto para o cron de followup: lookup por lead + type + ordenação temporal
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_log_lead_type_created
  ON follow_up_log(lead_id, type, created_at DESC);

-- email_logs (2)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_logs_template ON email_logs(template_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_logs_org_status_sent
  ON email_logs(org_id, status, sent_at DESC);

-- email_blasts (1)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_blasts_template ON email_blasts(template_id);

-- email_automations (1)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_automations_template ON email_automations(template_id);

-- system_events (1)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_events_resolved_by
  ON system_events(resolved_by) WHERE resolved_by IS NOT NULL;

-- =============================================================================
-- ROLLBACK PLAN (executar manualmente via Supabase Studio SQL Editor se necessário):
-- DROP INDEX CONCURRENTLY IF EXISTS idx_conversation_state_property;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_leads_property_interest;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_leads_utm_campaign;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_appointments_property;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_unit_sales_lead;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_unit_sales_broker;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_units_reserved_lead;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_lead_property_interest_lead;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_lead_property_interest_property;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_visit_feedback_lead;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_visit_feedback_property;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_visit_feedback_broker;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_broker_assignments_property;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_obra_mensagens_sender;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_obra_mensagens_cliente;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_obra_fotos_fase;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_obra_fotos_uploaded_by;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_obra_documentos_uploaded_by;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_followup_log_org;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_followup_log_rule;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_followup_log_lead_type_created;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_email_logs_template;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_email_logs_org_status_sent;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_email_blasts_template;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_email_automations_template;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_system_events_resolved_by;
-- =============================================================================
