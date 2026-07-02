-- 153_lead_source_broker_sponsored.sql
-- Story 75-111 — Origem no cadastro do corretor + nova origem "Patrocinado Corretor".
--
-- 1) Adiciona 'broker_sponsored' ao enum lead_source (lead vindo de anúncio/patrocínio
--    pago pelo próprio corretor) — nova opção pedida pelo dono.
-- 2) Adiciona 'google_ads' — fecha bug latente: a tela do admin (/dashboard/leads/new)
--    já oferecia "Google Ads" como origem, mas o valor NÃO existia no enum → o cadastro
--    com essa origem quebrava (erro de enum) desde sempre.
--
-- IMPORTANTE: ALTER TYPE ... ADD VALUE não pode ser usado na MESMA transação em que o
-- valor é criado. Esta migration só adiciona valores ao enum (idempotente via IF NOT EXISTS),
-- não usa os novos valores em seguida — seguro rodar sozinha (mesmo padrão da migration 013).

ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'broker_sponsored';
ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'google_ads';
