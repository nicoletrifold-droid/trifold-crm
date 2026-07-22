-- =============================================================================
-- 187_leads_rls_imob_segmento.sql — Story 75-201
-- =============================================================================
-- Perfil imob (Daiana) não conseguia MOVER card no pipeline IMOB: o drag do
-- KanbanBoard persiste via browser client, e as policies de leads (mig 085) só
-- contemplam is_admin_or_supervisor() ou o corretor dono (via brokers) — role
-- 'imob' fica de fora e o UPDATE silenciosamente afeta 0 linhas (card volta).
--
-- Decisão: NÃO mexer em is_admin_or_supervisor() (destravaria obras/clientes/etc
-- inteiros p/ o imob). Policies dedicadas, ESCOPADAS ao mundo IMOB:
--   • imob/consultoria leem e editam APENAS leads segmento='imob';
--   • WITH CHECK (default = USING) impede tirar o lead do mundo imob no update.
-- Policies são permissivas (OR) — nada muda p/ os demais perfis.
--
-- DO block defensivo: no-op onde leads.segmento não existe (dev DB está sem o
-- módulo IMOB — catch-up pendente; mesma situação da mig 184).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_imob_profile()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_id = auth.uid()
      AND role IN ('imob', 'consultoria')
  )
$function$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'segmento'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "leads_select_imob" ON leads';
    EXECUTE $pol$
      CREATE POLICY "leads_select_imob" ON leads
        FOR SELECT USING (
          org_id = user_org_id()
          AND segmento = 'imob'
          AND is_imob_profile()
        )
    $pol$;

    EXECUTE 'DROP POLICY IF EXISTS "leads_update_imob" ON leads';
    EXECUTE $pol$
      CREATE POLICY "leads_update_imob" ON leads
        FOR UPDATE USING (
          org_id = user_org_id()
          AND segmento = 'imob'
          AND is_imob_profile()
        )
    $pol$;
  END IF;
END $$;
