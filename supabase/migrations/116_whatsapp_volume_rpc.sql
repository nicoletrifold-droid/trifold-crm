-- 116_whatsapp_volume_rpc.sql
-- Story 75-61 — Volume de mensagens de WhatsApp (Passo 1 do contador).
-- Conta mensagens da tabela `messages` das conversas de WhatsApp do org, por
-- janela (24h / 7d / 30d), separando recebidas (role 'user') de enviadas
-- (role 'assistant'|'broker'). Uma varredura (últimos 30 dias). SECURITY DEFINER
-- + escopo por p_org_id (mesmo padrão de get_system_events_summary).

CREATE OR REPLACE FUNCTION public.get_whatsapp_volume_summary(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH msgs AS (
    SELECT m.role, m.created_at
    FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE c.org_id = p_org_id
      AND c.channel = 'whatsapp'
      AND m.created_at >= now() - interval '30 days'
  )
  SELECT jsonb_build_object(
    'h24', jsonb_build_object(
      'recebidas', count(*) FILTER (WHERE role = 'user'                    AND created_at >= now() - interval '24 hours'),
      'enviadas',  count(*) FILTER (WHERE role IN ('assistant','broker')   AND created_at >= now() - interval '24 hours'),
      'total',     count(*) FILTER (WHERE created_at >= now() - interval '24 hours')
    ),
    'd7', jsonb_build_object(
      'recebidas', count(*) FILTER (WHERE role = 'user'                    AND created_at >= now() - interval '7 days'),
      'enviadas',  count(*) FILTER (WHERE role IN ('assistant','broker')   AND created_at >= now() - interval '7 days'),
      'total',     count(*) FILTER (WHERE created_at >= now() - interval '7 days')
    ),
    'd30', jsonb_build_object(
      'recebidas', count(*) FILTER (WHERE role = 'user'),
      'enviadas',  count(*) FILTER (WHERE role IN ('assistant','broker')),
      'total',     count(*)
    )
  )
  FROM msgs;
$$;

GRANT EXECUTE ON FUNCTION public.get_whatsapp_volume_summary(uuid) TO authenticated;
