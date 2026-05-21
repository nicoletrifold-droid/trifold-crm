-- Migration 056: Progresso da obra passa a ser manual
-- Remove o trigger que recalculava progress_pct automaticamente a partir das fases

DROP TRIGGER IF EXISTS trigger_obra_fases_progress ON obra_fases;
DROP FUNCTION IF EXISTS trigger_recalculate_obra_progress();
DROP FUNCTION IF EXISTS recalculate_obra_progress(uuid);
