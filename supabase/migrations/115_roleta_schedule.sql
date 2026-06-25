-- 115_roleta_schedule.sql
-- Story 75-58 — Agenda comercial flexível POR DIA DA SEMANA.
-- Substitui (conceitualmente) os campos business_days + business_hour_* +
-- weekend_hour_* (um par só) da roleta_config por 7 linhas/org (Seg–Dom), cada
-- uma com aberto?/abre/fecha. Fonte da verdade da agenda, consumida pelo motor
-- (business-time.ts) tanto na distribuição quanto na contagem por dia (75-57).
--
-- weekday: 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb (igual a business_days).
-- A migração SEMEIA as 7 linhas a partir da roleta_config atual → ZERO mudança
-- de comportamento no deploy (prod hoje = todos os dias 08–20).
-- Feriados: fase posterior (fora desta migração).

CREATE TABLE IF NOT EXISTS public.roleta_schedule (
  org_id     uuid    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  weekday    smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  is_open    boolean NOT NULL DEFAULT true,
  open_time  time    NOT NULL DEFAULT '08:00',
  close_time time    NOT NULL DEFAULT '20:00',
  PRIMARY KEY (org_id, weekday)
);

ALTER TABLE public.roleta_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roleta_schedule_org" ON public.roleta_schedule;
CREATE POLICY "roleta_schedule_org" ON public.roleta_schedule
  USING (org_id = user_org_id());

-- Seed: 7 linhas por org a partir da config atual (preserva comportamento).
INSERT INTO public.roleta_schedule (org_id, weekday, is_open, open_time, close_time)
SELECT
  c.org_id,
  d.weekday,
  (d.weekday = ANY (c.business_days))                                          AS is_open,
  CASE WHEN d.weekday IN (0, 6)
            AND c.weekend_hour_start IS NOT NULL AND c.weekend_hour_start <> ''
       THEN c.weekend_hour_start::time
       ELSE c.business_hour_start END                                         AS open_time,
  CASE WHEN d.weekday IN (0, 6)
            AND c.weekend_hour_end IS NOT NULL AND c.weekend_hour_end <> ''
       THEN c.weekend_hour_end::time
       ELSE c.business_hour_end END                                           AS close_time
FROM public.roleta_config c
CROSS JOIN (SELECT generate_series(0, 6) AS weekday) d
ON CONFLICT (org_id, weekday) DO NOTHING;
