-- 072_roleta_weekend_hours.sql
-- Adiciona horários específicos para finais de semana na roleta.
-- NULL = usar o mesmo horário dos dias úteis.

ALTER TABLE public.roleta_config
  ADD COLUMN IF NOT EXISTS weekend_hour_start text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS weekend_hour_end   text DEFAULT NULL;
