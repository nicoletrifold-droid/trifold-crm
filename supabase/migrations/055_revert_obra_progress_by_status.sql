-- Migration 055: Reverte 052 — remove trigger de status automático e restaura cálculo ponderado por duração

-- 1. Remove trigger BEFORE que sobrescrevia progress_pct pela status
DROP TRIGGER IF EXISTS trigger_fase_sync_progress_status ON obra_fases;
DROP FUNCTION IF EXISTS sync_fase_progress_from_status();

-- 2. Restaura recalculate_obra_progress ponderado por duração de fases (versão original de 051)
CREATE OR REPLACE FUNCTION recalculate_obra_progress(p_obra_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_progress integer;
BEGIN
  SELECT
    GREATEST(0, LEAST(100,
      CASE
        WHEN SUM(
          CASE
            WHEN expected_start_date IS NOT NULL AND expected_end_date IS NOT NULL
            THEN GREATEST(expected_end_date - expected_start_date, 1)
            ELSE 1
          END
        ) = 0 THEN 0
        ELSE ROUND(
          SUM(
            progress_pct * (
              CASE
                WHEN expected_start_date IS NOT NULL AND expected_end_date IS NOT NULL
                THEN GREATEST(expected_end_date - expected_start_date, 1)
                ELSE 1
              END
            )
          )::numeric /
          SUM(
            CASE
              WHEN expected_start_date IS NOT NULL AND expected_end_date IS NOT NULL
              THEN GREATEST(expected_end_date - expected_start_date, 1)
              ELSE 1
            END
          )
        )
      END
    ))
  INTO v_progress
  FROM obra_fases
  WHERE obra_id = p_obra_id;

  UPDATE obras
  SET progress_pct = COALESCE(v_progress, 0)
  WHERE id = p_obra_id;
END;
$$;

-- 3. Recalcula todas as obras com a função restaurada
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM obras LOOP
    PERFORM recalculate_obra_progress(r.id);
  END LOOP;
END;
$$;
