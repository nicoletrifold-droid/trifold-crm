-- 124_stage_change_activity_trigger.sql
-- Story 75-72 — Registrar TODA mudança de etapa do lead em `activities`.
--
-- Problema: o insert manual de stage_change no kanban (kanban-board.tsx) falhava
-- SILENCIOSAMENTE — `activities.org_id` é NOT NULL e a RLS exige
-- `org_id = user_org_id()`, mas o insert do cliente não passava `org_id`/`user_id`.
-- Resultado: 0 eventos `stage_change` em 30 dias, quebrando a timeline do lead e
-- qualquer métrica de movimentação.
--
-- Solução: um trigger no banco captura TODA alteração de `leads.stage_id`
-- (kanban, API, bulk, SQL), com fonte única e formato de metadata unificado.
-- SECURITY DEFINER para gravar em `activities` contornando a RLS (o owner do
-- trigger insere com `org_id` vindo da própria linha).

CREATE OR REPLACE FUNCTION log_lead_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  from_name text;
  to_name   text;
BEGIN
  SELECT name INTO from_name FROM kanban_stages WHERE id = OLD.stage_id;
  SELECT name INTO to_name   FROM kanban_stages WHERE id = NEW.stage_id;

  INSERT INTO activities (org_id, lead_id, user_id, type, description, metadata)
  VALUES (
    NEW.org_id,
    NEW.id,
    auth.uid(),                       -- null em ações via service-role (cron/admin server) — OK
    'stage_change',
    'Etapa alterada de "' || COALESCE(from_name, 'Nenhuma') || '" para "' || COALESCE(to_name, '?') || '"',
    jsonb_build_object(
      -- formato "objeto" (igual ao endpoint admin) …
      'from_stage', CASE WHEN OLD.stage_id IS NULL THEN NULL
                         ELSE jsonb_build_object('id', OLD.stage_id, 'name', from_name) END,
      'to_stage',   jsonb_build_object('id', NEW.stage_id, 'name', to_name),
      -- … e formato "id" (igual ao kanban): mantém ambos os leitores compatíveis.
      'from_stage_id', OLD.stage_id,
      'to_stage_id',   NEW.stage_id
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_lead_stage_change ON leads;
CREATE TRIGGER trg_log_lead_stage_change
AFTER UPDATE OF stage_id ON leads
FOR EACH ROW
WHEN (NEW.stage_id IS DISTINCT FROM OLD.stage_id)
EXECUTE FUNCTION log_lead_stage_change();
