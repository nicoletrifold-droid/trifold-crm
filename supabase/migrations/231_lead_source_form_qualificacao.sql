-- =============================================================================
-- 231_lead_source_form_qualificacao.sql — Story 75-330 (Epic 89)
-- =============================================================================
-- O formulário público de qualificação (/formulario/[token]) cria lead próprio.
-- `leads.source` é o ENUM `lead_source` (001_base_schema.sql:22) — valor fora do
-- enum NÃO degrada: estoura o INSERT com 22P02. Foi exatamente o que derrubou o
-- link público da imobiliária em 21/07 (ver 181_lead_source_imob_link.sql): o
-- parceiro via "Não foi possível registrar o cliente" e ninguém sabia por quê.
--
-- Origem PRÓPRIA, e não `meta_ads`, de propósito: o webhook do Meta Lead Forms
-- (app/api/webhooks/meta-ads/route.ts:53) já grava `meta_ads`, e o
-- /api/analytics/sources agrupa por `source` cru. Reaproveitar o valor fundiria
-- os dois funis e tornaria o formulário impossível de medir — que é a razão de
-- ele existir (Epic 89 §1).
--
-- Migration ISOLADA das tabelas (232) de propósito: `ALTER TYPE ... ADD VALUE`
-- e o USO do valor novo não convivem na mesma transação.
-- =============================================================================

ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'form_qualificacao';
