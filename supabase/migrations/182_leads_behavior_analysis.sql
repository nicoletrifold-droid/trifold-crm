-- =============================================================================
-- 182_leads_behavior_analysis.sql — Story 82-1 (Epic 82)
-- =============================================================================
-- Análise de Comportamento IA do lead: resultado estruturado (JSON) + data de
-- geração. Geração é ON-DEMAND (botão) — sem cron. A análise nunca altera
-- stage/score; estas são as ÚNICAS colunas que o fluxo escreve.
--
-- ⚠️ Numeração conferida contra supabase/migrations/ local (última: 181).
-- Antes de aplicar em PROD, conferir também o schema remoto (lição 75-188:
-- "LIVE" no dev ≠ prod).
-- =============================================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS behavior_analysis jsonb;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS behavior_analyzed_at timestamptz;

COMMENT ON COLUMN leads.behavior_analysis IS
  'Story 82-1: análise comportamental estruturada gerada por IA (Sonnet) sob demanda. Contrato: estagio_real, temperatura, sinais[], objecoes[], como_abordar, proxima_acao, dados_faltando[], resumo (+ _meta com modelo/versão).';
COMMENT ON COLUMN leads.behavior_analyzed_at IS
  'Story 82-1: quando a análise comportamental foi gerada (para aviso de staleness na UI).';
