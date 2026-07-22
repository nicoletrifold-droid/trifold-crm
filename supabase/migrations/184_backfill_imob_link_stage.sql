-- =============================================================================
-- 184_backfill_imob_link_stage.sql — Story 75-196
-- =============================================================================
-- O link público /api/agendar/[token] criava o lead SEM stage_id (NULL) →
-- invisível no pipeline IMOB (as colunas consultam stage_id = <etapa>; NULL não
-- casa com nenhuma) e Etapa "—" na aba Leads. A rota foi corrigida (lead nasce
-- em "Novo" e avança para "Visita Agendada" após gravar a visita); esta
-- migration conserta os leads já presos.
--
-- Regra (mesma do helper advanceToVisitaAgendada):
--   • segmento='imob', stage_id NULL, lost_reason NULL
--   • com appointment futuro scheduled/confirmed → "Visita Agendada" (…0004)
--   • sem visita futura → "Novo" (…0001), só para ficar visível no pipeline
-- =============================================================================

UPDATE leads l
SET stage_id = '00000000-0000-0000-0001-000000000004' -- visita_agendada
WHERE l.segmento = 'imob'
  AND l.stage_id IS NULL
  AND l.lost_reason IS NULL
  AND EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.lead_id = l.id
      AND a.status IN ('scheduled', 'confirmed')
      AND a.scheduled_at >= now()
  );

UPDATE leads l
SET stage_id = '00000000-0000-0000-0001-000000000001' -- novo
WHERE l.segmento = 'imob'
  AND l.stage_id IS NULL
  AND l.lost_reason IS NULL;
