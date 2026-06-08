-- Story 50-3 — Adiciona coluna leads.metadata (JSONB) para attribution Meta
--
-- Contexto:
--   - Comentário em 016_meta_campaign_roas_view.sql:34 declara que `leads.metadata`
--     "NÃO existe — branch removido vs. proposta original do epic"
--   - Porém o webhook Meta (`/api/webhooks/meta-ads/route.ts:206,223`) grava nesse
--     campo desde a Story 16.x, sem erro reportado.
--   - O webhook WhatsApp (`/api/webhook/whatsapp/route.ts:329-335`, hot-fix 21.1)
--     descarta o `referralData` por assumir coluna ausente.
--
-- Esta migration é IDEMPOTENTE (IF NOT EXISTS):
--   - Cenário A (coluna ausente nas migrations committed E no remote): cria coluna.
--   - Cenário B (coluna já existe via migration remote-only não committed): no-op
--     na coluna; pode criar o índice se ainda não existir.
--
-- Shape esperado de leads.metadata (documentação contextual):
--   {
--     "ad_id": "<meta_ad_id>",            -- chave usada pelo CreativeChip (Story 50-2)
--     "campaign_id": "<meta_campaign_id>",
--     "form_id": "<lead_form_id>",
--     "ad_group_id": "<adset_id>",
--     "leadgen_id": "<leadgen_event_id>",
--     "source_url": "<url do anúncio>",
--     "ctwa_clid": "<click ID do CTWA>",
--     "headline": "<criativo headline>",
--     "body": "<criativo body>",
--     "media_type": "image|video|...",
--     "ctwa_window_expires_at": "<ISO 8601, +72h da criação do lead>"
--   }

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

-- Índice parcial para lookup do CreativeChip (Story 50-2 fetchCreativesForLeads).
-- Pega apenas leads que efetivamente têm ad_id resolvido → economiza espaço.
CREATE INDEX IF NOT EXISTS idx_leads_metadata_ad_id
  ON leads ((metadata->>'ad_id'))
  WHERE metadata->>'ad_id' IS NOT NULL;

COMMENT ON COLUMN leads.metadata IS
  'JSONB com attribution Meta: { ad_id, campaign_id, form_id, ad_group_id, '
  'leadgen_id, source_url, ctwa_clid, headline, body, media_type, '
  'ctwa_window_expires_at }. Story 50-3 — Epic 50.';
