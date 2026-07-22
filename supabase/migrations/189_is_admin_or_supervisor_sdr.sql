-- =============================================================================
-- 189_is_admin_or_supervisor_sdr.sql — Story 75-204
-- =============================================================================
-- Perfil SDR humano (Thielly): mesmos poderes de DADOS do gerente-comercial —
-- vê leads/conversas de toda a equipe, move cards, transfere corretor. O gate
-- amplo de dados é is_admin_or_supervisor(); adicionamos 'sdr' à lista (mesmo
-- caminho usado p/ gerente-relacionamento na mig 111).
--
-- Observação de escopo (igual já vale p/ gerente-comercial): a função destrava
-- DADOS além dos módulos do perfil (obras/clientes etc.) — a navegação continua
-- governada pela matriz de módulos (role_permissions), onde o sdr só tem
-- dashboard/pipeline/leads/imoveis/conversas/agenda/alertas/analytics/
-- materiais/chamados.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_id = auth.uid()
      AND role IN ('admin', 'supervisor', 'obras', 'gerente-comercial', 'gerente-relacionamento', 'sdr')
  )
$function$;
