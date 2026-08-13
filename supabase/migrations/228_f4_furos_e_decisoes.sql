-- 228: Perfis de Acesso 2.0 — F4-1: furos de segurança do inventário + decisões do Marcos
-- (Story 75-314, 13/08/2026). Idempotente. Decisões aprovadas por pergunta direta:
--   (1) consultoria: módulo Obras DESLIGADO na matriz (era cosmético);
--   (2) leads.criar ganha gerente-comercial e sdr (a tela sempre aparentou permitir);
--   (3) god-gate: matriz manda (fatiado na mig 229 / Story 75-315);
--   (4) billing de plataforma: flag is_platform_admin, só o Marcos (marcos@trifold.com.br).

-- ────────────────────────────────────────────────────────────────────────────
-- 4a) Flag de PLATAFORMA (fora da matriz por design — admin de tenant não pode
--     se autoconceder; ver artifact do épico, seção "fora da matriz").
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

-- ⚠️ o login do Marcos no CRM é @trifold.com.br (o .eng.br é o e-mail corporativo)
UPDATE public.users SET is_platform_admin = true WHERE email = 'marcos@trifold.com.br' AND role = 'admin';

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT u.is_platform_admin FROM public.users u WHERE u.auth_id = auth.uid() LIMIT 1
  ), false)
$$;

-- Furo nº 2 (migs 164/171): billing interno legível por admin de QUALQUER org.
DROP POLICY IF EXISTS admin_only ON public.platform_services;
CREATE POLICY plataforma_only ON public.platform_services FOR ALL
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS admin_only ON public.service_billing_reminders;
CREATE POLICY plataforma_only ON public.service_billing_reminders FOR ALL
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS admin_only ON public.service_cost_snapshots;
CREATE POLICY plataforma_only ON public.service_cost_snapshots FOR ALL
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS admin_only ON public.billing_cost_alerts_sent;
CREATE POLICY plataforma_only ON public.billing_cost_alerts_sent FOR ALL
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS admin_only ON public.billing_monthly_summary_log;
CREATE POLICY plataforma_only ON public.billing_monthly_summary_log FOR ALL
  USING (public.is_platform_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- Furo nº 1 (mig 067): log LGPD sem filtro de org — e a CAUSA é que a tabela
-- NEM TEM org_id (só user_id). O escopo vem do JOIN com users: o leitor só vê
-- consentimentos de usuários DA SUA org, e leitura = trilha de auditoria
-- (has_capability('sistema.auditoria_ver')).
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS privacy_consents_select_admin ON public.privacy_consents;
CREATE POLICY privacy_consents_select_admin ON public.privacy_consents FOR SELECT
  USING (
    public.has_capability('sistema.auditoria_ver')
    AND EXISTS (
      SELECT 1 FROM public.users titular
      WHERE titular.id = privacy_consents.user_id
        AND titular.org_id = public.user_org_id()
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- Furo nº 3 (mig 128): bolsão expunha leads (com PII) a QUALQUER autenticado da
-- org. Agora: quem tem o módulo bolsao (dashboard) OU é corretor ativo (área /broker).
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS leads_select_bolsao ON public.leads;
CREATE POLICY leads_select_bolsao ON public.leads FOR SELECT
  USING (
    org_id = public.user_org_id()
    AND bolsao_em IS NOT NULL
    AND (
      public.has_module_access('bolsao')
      OR EXISTS (
        SELECT 1 FROM public.brokers b
        JOIN public.users u ON u.id = b.user_id
        WHERE u.auth_id = auth.uid() AND b.is_available IS NOT NULL
      )
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- Furo nº 4 (migs 047/048): policy DELETE dupla em roles — a de 048 (sem o guard
-- is_system) anulava a proteção da 047 por OR-permissividade. Admin não pode mais
-- apagar o perfil `admin`.
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS admins_delete_roles ON public.roles;

-- Furo nº 6 (mig 020): função morta executável por anon.
DROP FUNCTION IF EXISTS public.is_cliente();

-- ────────────────────────────────────────────────────────────────────────────
-- Decisão (1): consultoria — módulo Obras desligado (era cosmético: ações + RLS
-- já bloqueavam; a matriz para de mentir).
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.role_permissions rp SET can_access = false
FROM public.roles r
WHERE rp.role_id = r.id AND r.name = 'consultoria' AND rp.module = 'obras';

-- Decisão (2): leads.criar ganha gerente-comercial e sdr (mudança INTENCIONAL —
-- a tela de novo lead sempre exibiu o seletor de corretor para eles).
UPDATE public.role_permissions rp SET can_access = true
FROM public.roles r
WHERE rp.role_id = r.id AND r.name IN ('gerente-comercial', 'sdr')
  AND rp.module = 'leads.criar';
