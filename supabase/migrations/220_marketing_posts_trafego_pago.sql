-- 220_marketing_posts_trafego_pago.sql
-- Story 75-294 — "Pedir à Lídia" v2: pedido para TRÁFEGO PAGO.
-- marketing_posts ganha o destino do post (orgânico continua o default e o
-- comportamento atual), o objetivo do anúncio e a copy de anúncio estruturada
-- (primary text ≤125 + headline ≤27, limites do Meta Ads validados na rota).
-- Idempotente (IF NOT EXISTS); nenhuma linha/coluna existente muda.

ALTER TABLE marketing_posts
  ADD COLUMN IF NOT EXISTS destino text NOT NULL DEFAULT 'organico'
    CHECK (destino IN ('organico', 'pago')),
  ADD COLUMN IF NOT EXISTS objetivo text
    CHECK (objetivo IS NULL OR objetivo IN ('leads', 'visita', 'reconhecimento')),
  ADD COLUMN IF NOT EXISTS ad_primary_text text,
  ADD COLUMN IF NOT EXISTS ad_headline text;
