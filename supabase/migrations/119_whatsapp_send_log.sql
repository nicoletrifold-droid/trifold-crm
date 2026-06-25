-- 119_whatsapp_send_log.sql
-- (renumerado de 118 → 119: colisão com 118_fix_idx_cov_distrato_predicate mergeada em paralelo)
-- Story 75-62 (Passo 2) — Log de disparos de template de WhatsApp + tabela de
-- preços (Meta BR pesquisada) + RPC de custo estimado. Conta a partir do deploy.

-- 1) Log de disparos (cada envio de TEMPLATE pago grava 1 linha)
CREATE TABLE IF NOT EXISTS public.whatsapp_send_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template       text,
  category       text NOT NULL DEFAULT 'utility'
                   CHECK (category IN ('utility','marketing','authentication','service')),
  recipient_type text,
  to_phone       text,
  status         text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed')),
  error          text,
  wam_id         text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_send_log_org_created
  ON public.whatsapp_send_log(org_id, created_at DESC);

ALTER TABLE public.whatsapp_send_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_send_log_org" ON public.whatsapp_send_log;
CREATE POLICY "wa_send_log_org" ON public.whatsapp_send_log
  USING (org_id = user_org_id());

-- 2) Tabela de preços por categoria (editável; preços Meta Brasil 2026, por mensagem)
CREATE TABLE IF NOT EXISTS public.whatsapp_pricing (
  category  text PRIMARY KEY
              CHECK (category IN ('utility','marketing','authentication','service')),
  price_brl numeric(10,4) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_pricing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_pricing_read" ON public.whatsapp_pricing;
CREATE POLICY "wa_pricing_read" ON public.whatsapp_pricing FOR SELECT USING (true);

INSERT INTO public.whatsapp_pricing (category, price_brl) VALUES
  ('utility',        0.05),
  ('authentication', 0.17),
  ('marketing',      0.35),
  ('service',        0.00)
ON CONFLICT (category) DO NOTHING;

-- 3) RPC: disparos + custo estimado por janela (24h/7d/30d), só do org
CREATE OR REPLACE FUNCTION public.get_whatsapp_cost_summary(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH sends AS (
    SELECT l.category, l.created_at, COALESCE(p.price_brl, 0) AS price
    FROM public.whatsapp_send_log l
    LEFT JOIN public.whatsapp_pricing p ON p.category = l.category
    WHERE l.org_id = p_org_id
      AND l.status = 'sent'
      AND l.created_at >= now() - interval '30 days'
  )
  SELECT jsonb_build_object(
    'h24', jsonb_build_object(
      'disparos',  count(*) FILTER (WHERE created_at >= now() - interval '24 hours'),
      'custo_brl', COALESCE(round(sum(price) FILTER (WHERE created_at >= now() - interval '24 hours'), 2), 0)
    ),
    'd7', jsonb_build_object(
      'disparos',  count(*) FILTER (WHERE created_at >= now() - interval '7 days'),
      'custo_brl', COALESCE(round(sum(price) FILTER (WHERE created_at >= now() - interval '7 days'), 2), 0)
    ),
    'd30', jsonb_build_object(
      'disparos',  count(*),
      'custo_brl', COALESCE(round(sum(price), 2), 0),
      'por_categoria', (
        SELECT COALESCE(jsonb_object_agg(category, cnt), '{}'::jsonb)
        FROM (SELECT category, count(*) AS cnt FROM sends GROUP BY category) z
      )
    )
  )
  FROM sends;
$$;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_cost_summary(uuid) TO authenticated;
