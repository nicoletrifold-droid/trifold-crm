-- Converte users.role de ENUM (user_role) para TEXT
-- Permite armazenar roles customizadas criadas na tabela `roles` (ex: gerente-comercial)

-- Step 1: Drop todas as policies que usam ::user_role
DROP POLICY IF EXISTS users_insert_admin ON public.users;
DROP POLICY IF EXISTS users_update_admin ON public.users;
DROP POLICY IF EXISTS brokers_manage ON public.brokers;
DROP POLICY IF EXISTS whatsapp_config_manage ON public.whatsapp_config;
DROP POLICY IF EXISTS "Admins can read org events" ON public.system_events;
DROP POLICY IF EXISTS email_settings_upsert ON public.email_settings;
DROP POLICY IF EXISTS aprovacoes_update ON public.obra_upload_aprovacoes;
DROP POLICY IF EXISTS aprovacoes_delete ON public.obra_upload_aprovacoes;
DROP POLICY IF EXISTS audit_logs_select_admin ON public.audit_logs;

-- Step 2: Drop função user_role() que retornava o tipo ENUM
DROP FUNCTION IF EXISTS public.user_role();

-- Step 3: Converter coluna role de ENUM para TEXT
ALTER TABLE public.users ALTER COLUMN role TYPE TEXT USING role::TEXT;

-- Step 4: Recriar user_role() retornando TEXT
CREATE OR REPLACE FUNCTION public.user_role()
 RETURNS TEXT
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT role FROM public.users WHERE auth_id = auth.uid()
$function$;

-- Step 5: Recriar todas as policies sem cast ::user_role

CREATE POLICY users_insert_admin ON public.users
  FOR INSERT
  WITH CHECK ((org_id = user_org_id()) AND (user_role() = 'admin'));

CREATE POLICY users_update_admin ON public.users
  FOR UPDATE
  USING ((org_id = user_org_id()) AND (user_role() = 'admin'));

CREATE POLICY brokers_manage ON public.brokers
  FOR ALL
  USING ((org_id = user_org_id()) AND (user_role() = 'admin'));

CREATE POLICY whatsapp_config_manage ON public.whatsapp_config
  FOR ALL
  USING ((org_id = user_org_id()) AND (user_role() = 'admin'));

CREATE POLICY "Admins can read org events" ON public.system_events
  FOR SELECT
  USING (org_id IN (
    SELECT users.org_id FROM public.users
    WHERE users.auth_id = auth.uid() AND users.role = 'admin'
  ));

CREATE POLICY email_settings_upsert ON public.email_settings
  FOR ALL
  USING ((org_id = user_org_id()) AND (user_role() = 'admin'));

CREATE POLICY aprovacoes_update ON public.obra_upload_aprovacoes
  FOR UPDATE
  USING ((org_id = user_org_id()) AND (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.auth_id = auth.uid()
      AND users.role = ANY(ARRAY['admin', 'supervisor'])
  )));

CREATE POLICY aprovacoes_delete ON public.obra_upload_aprovacoes
  FOR DELETE
  USING ((org_id = user_org_id()) AND (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.auth_id = auth.uid()
      AND users.role = ANY(ARRAY['admin', 'supervisor'])
  )));

CREATE POLICY audit_logs_select_admin ON public.audit_logs
  FOR SELECT
  USING (
    (org_id = (SELECT users.org_id FROM public.users WHERE users.auth_id = auth.uid()))
    AND
    ((SELECT users.role FROM public.users WHERE users.auth_id = auth.uid()) = 'admin')
  );
