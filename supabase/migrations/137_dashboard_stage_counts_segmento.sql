-- 137_dashboard_stage_counts_segmento.sql
-- Story 75-102 — Dashboard "espelho" do mundo IMOB.
--
-- get_dashboard_stage_counts ganha p_segmento (default 'principal'). O dashboard passa a
-- passar 'imob' quando o usuário é perfil imob/consultoria, refletindo o funil DELES.
-- Default preserva 100% das chamadas existentes (mundo principal) — backward-compatible.
--
-- ⚠️ Adicionar um parâmetro muda a ASSINATURA → CREATE OR REPLACE criaria uma SOBRECARGA
-- (ficariam 2 funções: (uuid) e (uuid,text)) e a chamada com 1 arg viraria ambígua
-- ("function is not unique"). Por isso dropamos a versão de 1 arg primeiro; depois só
-- existe a de 2 args, chamável com 1 arg via default → sem ambiguidade, sem quebrar o
-- código antigo durante o deploy.
DROP FUNCTION IF EXISTS public.get_dashboard_stage_counts(uuid);

CREATE OR REPLACE FUNCTION public.get_dashboard_stage_counts(
  p_org_id uuid,
  p_segmento text DEFAULT 'principal'
)
 RETURNS TABLE(stage_id uuid, total bigint)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT stage_id, COUNT(*)::bigint AS total
  FROM leads
  WHERE org_id = p_org_id
    AND segmento = p_segmento
    AND is_active = true
    AND lost_reason IS NULL
  GROUP BY stage_id;
$function$;
