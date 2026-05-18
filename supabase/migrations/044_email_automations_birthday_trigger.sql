-- Migration 044: Adiciona trigger 'client.birthday' ao CHECK constraint de email_automations
-- Story 18.10 — Automação de Aniversário para Clientes
--
-- O CHECK constraint foi criado inline em 018_email_central.sql, linha 74.
-- PostgreSQL gera automaticamente o nome: email_automations_trigger_event_check
-- Este ALTER é seguro: nenhum dado existente usa o novo valor.

ALTER TABLE email_automations
  DROP CONSTRAINT IF EXISTS email_automations_trigger_event_check;

ALTER TABLE email_automations
  ADD CONSTRAINT email_automations_trigger_event_check
  CHECK (trigger_event IN ('lead.created', 'lead.status_changed', 'cron.daily', 'client.birthday'));
