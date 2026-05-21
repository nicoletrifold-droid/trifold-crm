-- Migration 052: Progresso da obra calculado por status das fases
-- Substitui cálculo ponderado por duração por média simples de valores por status
--
-- Mapeamento de status → valor:
--   concluida     → 100
--   em_andamento  →  50
--   pausada       →  50
--   pendente      →   0
--   a_iniciar     →   0

-- 1. Trigger BEFORE: sincroniza progress_pct da fase com seu status automaticamente
CREATE OR REPLACE FUNCTION sync_fase_progress_from_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.progress_pct := CASE NEW.status
    WHEN 'concluida'    THEN 100
    WHEN 'em_andamento' THEN 50
    WHEN 'pausada'      THEN 50
    ELSE 0
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_fase_sync_progress_status ON obra_fases;
CREATE TRIGGER trigger_fase_sync_progress_status
  BEFORE INSERT OR UPDATE OF status ON obra_fases
  FOR EACH ROW
  EXECUTE FUNCTION sync_fase_progress_from_status();

-- 2. Atualiza função de recálculo: média simples dos status das fases
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
        WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND(
          AVG(
            CASE status
              WHEN 'concluida'    THEN 100
              WHEN 'em_andamento' THEN 50
              WHEN 'pausada'      THEN 50
              ELSE 0
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

-- 3. Sincroniza progress_pct de todas as fases existentes com seus status atuais
UPDATE obra_fases
SET progress_pct = CASE status
  WHEN 'concluida'    THEN 100
  WHEN 'em_andamento' THEN 50
  WHEN 'pausada'      THEN 50
  ELSE 0
END;

-- 4. Recalcula progresso de todas as obras existentes
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM obras LOOP
    PERFORM recalculate_obra_progress(r.id);
  END LOOP;
END;
$$;
