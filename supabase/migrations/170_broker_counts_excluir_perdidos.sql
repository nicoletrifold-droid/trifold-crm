-- 170_broker_counts_excluir_perdidos.sql
-- Story 75-153 — Corretor: contagens NÃO contam Perdido / Não Qualificado.
--
-- Problema: o mundo do corretor decidia "perdido" só por `lost_reason IS NULL`, mas um lead pode
-- estar NA ETAPA Perdido/Não Qualificado com `lost_reason` NULL (arrastar o card no kanban só muda a
-- etapa; "Não Qualificado" nunca grava lost_reason). Nesses casos o lead vazava para as contagens
-- do dashboard do corretor (ex.: card "Total Leads Sem Tarefas = 12" eram 12 leads em "Perdido").
--
-- Correção: alinhar o corretor à regra de perdidos do admin — o critério de verdade passa a ser a
-- ETAPA. CREATE OR REPLACE IDÊNTICO à versão da mig 136 (mesma assinatura, SECURITY DEFINER, mesmas
-- 6 contagens, mesmo v_aguardando_stage_id / janela America/Sao_Paulo), apenas ADICIONANDO em cada
-- um dos 6 SELECT ... INTO a exclusão por etapa (PERDIDO_STAGE_IDS = Perdido + Não Qualificado).
-- Todos os demais filtros permanecem (segmento='principal', is_active, lost_reason IS NULL, org, broker).
--
-- ACERVO (Corretores Antigos / Represamento) está FORA DE ESCOPO: NÃO é excluído aqui (decisão do
-- diretor) — por isso usamos apenas os 2 UUIDs de PERDIDO, não EM_ATENDIMENTO_EXCLUDED_IDS.
-- UUIDs literais (a função Postgres não enxerga o TS de stage-filters.ts):
--   '00000000-0000-0000-0001-000000000008' = Perdido
--   '95327bd7-3e88-4038-aa16-250a74ab085c' = Não Qualificado

CREATE OR REPLACE FUNCTION public.get_broker_dashboard_counts(p_org_id uuid, p_broker_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_aguardando_stage_id uuid := '00000000-0000-0000-0001-000000000001';
  v_today_start timestamptz; v_tomorrow_start timestamptz;
  v_total integer; v_novos integer; v_sem_tarefas integer; v_atrasadas integer; v_para_hoje integer; v_futuras integer;
BEGIN
  v_today_start := date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  v_tomorrow_start := v_today_start + INTERVAL '1 day';
  SELECT COUNT(*)::integer INTO v_total FROM leads l
   WHERE l.org_id = p_org_id AND l.segmento = 'principal' AND l.is_active = true AND l.lost_reason IS NULL
     AND l.stage_id NOT IN ('00000000-0000-0000-0001-000000000008','95327bd7-3e88-4038-aa16-250a74ab085c')
     AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id);
  SELECT COUNT(*)::integer INTO v_novos FROM leads l
   WHERE l.org_id = p_org_id AND l.segmento = 'principal' AND l.is_active = true AND l.lost_reason IS NULL
     AND l.stage_id NOT IN ('00000000-0000-0000-0001-000000000008','95327bd7-3e88-4038-aa16-250a74ab085c')
     AND l.stage_id = v_aguardando_stage_id AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id);
  SELECT COUNT(*)::integer INTO v_sem_tarefas FROM leads l
   WHERE l.org_id = p_org_id AND l.segmento = 'principal' AND l.is_active = true AND l.lost_reason IS NULL
     AND l.stage_id NOT IN ('00000000-0000-0000-0001-000000000008','95327bd7-3e88-4038-aa16-250a74ab085c')
     AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id)
     AND NOT EXISTS (SELECT 1 FROM lead_tasks lt WHERE lt.lead_id = l.id AND lt.completed_at IS NULL);
  SELECT COUNT(DISTINCT l.id)::integer INTO v_atrasadas FROM leads l JOIN lead_tasks lt ON lt.lead_id = l.id
   WHERE l.org_id = p_org_id AND l.segmento = 'principal' AND l.is_active = true AND l.lost_reason IS NULL
     AND l.stage_id NOT IN ('00000000-0000-0000-0001-000000000008','95327bd7-3e88-4038-aa16-250a74ab085c')
     AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id)
     AND lt.completed_at IS NULL AND lt.due_at < v_today_start;
  SELECT COUNT(DISTINCT l.id)::integer INTO v_para_hoje FROM leads l JOIN lead_tasks lt ON lt.lead_id = l.id
   WHERE l.org_id = p_org_id AND l.segmento = 'principal' AND l.is_active = true AND l.lost_reason IS NULL
     AND l.stage_id NOT IN ('00000000-0000-0000-0001-000000000008','95327bd7-3e88-4038-aa16-250a74ab085c')
     AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id)
     AND lt.completed_at IS NULL AND lt.due_at >= v_today_start AND lt.due_at < v_tomorrow_start;
  SELECT COUNT(DISTINCT l.id)::integer INTO v_futuras FROM leads l JOIN lead_tasks lt ON lt.lead_id = l.id
   WHERE l.org_id = p_org_id AND l.segmento = 'principal' AND l.is_active = true AND l.lost_reason IS NULL
     AND l.stage_id NOT IN ('00000000-0000-0000-0001-000000000008','95327bd7-3e88-4038-aa16-250a74ab085c')
     AND (p_broker_id IS NULL OR l.assigned_broker_id = p_broker_id)
     AND lt.completed_at IS NULL AND lt.due_at >= v_tomorrow_start;
  RETURN jsonb_build_object('total', v_total, 'novos', v_novos, 'trabalhados', v_total - v_novos,
    'sem_tarefas', v_sem_tarefas, 'atrasadas', v_atrasadas, 'para_hoje', v_para_hoje, 'futuras', v_futuras);
END;
$function$;
