-- 125_fix_stage_change_trigger_user_fk.sql
-- HOTFIX URGENTE — mudança de etapa quebrada para TODOS os usuários logados.
--
-- Bug (introduzido na migration 124 / Story 75-72):
-- o trigger log_lead_stage_change() gravava `activities.user_id = auth.uid()`.
-- Mas `auth.uid()` devolve o ID de `auth.users` (claim `sub` do JWT), enquanto
-- `activities.user_id` tem FK para `public.users(id)`. Em `public.users`,
-- `id` ≠ `auth_id` — logo o INSERT violava `activities_user_id_fkey`, o trigger
-- AFTER UPDATE estourava e o UPDATE de `leads.stage_id` era revertido inteiro.
-- Resultado: qualquer corretor/gerente/admin arrastando um card no kanban via
-- client (JWT do usuário) tinha a mudança desfeita. Só passavam ações via
-- service-role (auth.uid() = null), por isso 0 eventos `stage_change` reais.
--
-- Correção: usar public_user_id() — mapeia auth.uid() → public.users.id, e
-- devolve NULL em contexto service-role (cron/admin server), preservando o
-- comportamento desejado para ações automatizadas.

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
    public_user_id(),                 -- auth.uid() → public.users.id; NULL em service-role
    'stage_change',
    'Etapa alterada de "' || COALESCE(from_name, 'Nenhuma') || '" para "' || COALESCE(to_name, '?') || '"',
    jsonb_build_object(
      'from_stage', CASE WHEN OLD.stage_id IS NULL THEN NULL
                         ELSE jsonb_build_object('id', OLD.stage_id, 'name', from_name) END,
      'to_stage',   jsonb_build_object('id', NEW.stage_id, 'name', to_name),
      'from_stage_id', OLD.stage_id,
      'to_stage_id',   NEW.stage_id
    )
  );

  RETURN NEW;
END;
$$;
