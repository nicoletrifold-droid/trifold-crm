-- 084_is_admin_or_supervisor_gerente_comercial
-- Adiciona 'gerente-comercial' à função is_admin_or_supervisor().
-- Sem isso, a RLS de leads bloqueia o gerente-comercial de ver
-- leads atribuídos a outros corretores (filtro de pipeline retorna 0).
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_id = auth.uid()
      AND role IN ('admin', 'supervisor', 'obras', 'gerente-comercial')
  )
$$;
