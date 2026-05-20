-- Função de recálculo do progresso geral da obra ponderado por duração de fases
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

-- Trigger function
CREATE OR REPLACE FUNCTION trigger_recalculate_obra_progress()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_obra_progress(OLD.obra_id);
  ELSE
    PERFORM recalculate_obra_progress(NEW.obra_id);
  END IF;
  RETURN NULL;
END;
$$;

-- Trigger na tabela obra_fases
DROP TRIGGER IF EXISTS trigger_obra_fases_progress ON obra_fases;
CREATE TRIGGER trigger_obra_fases_progress
  AFTER INSERT OR UPDATE OR DELETE ON obra_fases
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recalculate_obra_progress();

-- Seed: recalcular todas as obras existentes
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM obras LOOP
    PERFORM recalculate_obra_progress(r.id);
  END LOOP;
END;
$$;
