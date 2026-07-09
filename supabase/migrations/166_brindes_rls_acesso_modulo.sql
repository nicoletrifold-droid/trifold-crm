-- 166: brindes — RLS de escrita alinhada ao ACESSO AO MÓDULO (completa o PR #163).
--
-- Contexto: o PR #163 trocou o gate de APP das rotas de brindes de requireRole([...])
-- para canAccess("brindes"), mas a RLS de escrita das tabelas de brindes seguia exigindo
-- is_admin_or_supervisor() — que NÃO cobre todos os perfis com acesso ao módulo (ex.:
-- imob/consultoria, roles customizados, ou acesso via exceção individual). Resultado:
-- esses usuários passavam no app e apanhavam na RLS (escrita falhava em silêncio).
--
-- Correção ADITIVA (ninguém que já escrevia perde acesso): a policy de escrita passa a
-- permitir `is_admin_or_supervisor() OR has_module_access('brindes')`.
--
-- has_module_access() espelha o canAccess do app lendo a MESMA fonte de verdade
-- (role_permissions + user_permission_exceptions; admin = acesso total). SECURITY DEFINER
-- para ler as tabelas de permissão sem recursão de RLS.

CREATE OR REPLACE FUNCTION public.has_module_access(p_module text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN u.role = 'admin' THEN true                       -- admin: acesso total (= fullMatrix)
      WHEN exc.can_access IS NOT NULL THEN exc.can_access    -- exceção individual tem prioridade
      ELSE COALESCE(rp.can_access, false)                    -- senão, permissão do perfil
    END
    FROM public.users u
    LEFT JOIN public.user_permission_exceptions exc
      ON exc.user_id = u.id AND exc.module = p_module
    LEFT JOIN public.roles r
      ON r.name = u.role AND r.org_id = u.org_id
    LEFT JOIN public.role_permissions rp
      ON rp.role_id = r.id AND rp.module = p_module
    WHERE u.auth_id = auth.uid()
    LIMIT 1
  ), false)
$$;

DROP POLICY IF EXISTS brindes_tipos_write ON public.brindes_tipos;
CREATE POLICY brindes_tipos_write ON public.brindes_tipos FOR ALL
  USING (org_id = user_org_id() AND (is_admin_or_supervisor() OR has_module_access('brindes')));

DROP POLICY IF EXISTS brindes_dest_write ON public.brindes_destinatarios;
CREATE POLICY brindes_dest_write ON public.brindes_destinatarios FOR ALL
  USING (org_id = user_org_id() AND (is_admin_or_supervisor() OR has_module_access('brindes')));

DROP POLICY IF EXISTS brindes_ent_write ON public.brindes_entregas;
CREATE POLICY brindes_ent_write ON public.brindes_entregas FOR ALL
  USING (org_id = user_org_id() AND (is_admin_or_supervisor() OR has_module_access('brindes')));

DROP POLICY IF EXISTS datas_com_write ON public.datas_comemorativas;
CREATE POLICY datas_com_write ON public.datas_comemorativas FOR ALL
  USING (org_id = user_org_id() AND (is_admin_or_supervisor() OR has_module_access('brindes')));
