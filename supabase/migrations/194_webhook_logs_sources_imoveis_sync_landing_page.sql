-- 194: webhook_logs.source — aceitar 'landing_page' e 'imoveis_sync' [Story 75-224]
--
-- Bug confirmado em prod (28/07): o webhook de landing page insere
-- source='landing_page' desde a criação, mas o CHECK da mig 015 só aceita
-- ('meta_ads','whatsapp','google_forms','other') → todos os inserts rejeitados
-- silenciosamente (prod: 367 linhas meta_ads, 0 landing_page).
-- Também habilita o log persistido do webhook imoveis-sync (REM).
--
-- Nome da constraint conferido em prod via pg_constraint: webhook_logs_source_check

ALTER TABLE webhook_logs DROP CONSTRAINT IF EXISTS webhook_logs_source_check;

ALTER TABLE webhook_logs ADD CONSTRAINT webhook_logs_source_check
  CHECK (source IN ('meta_ads', 'whatsapp', 'google_forms', 'landing_page', 'imoveis_sync', 'other'));
