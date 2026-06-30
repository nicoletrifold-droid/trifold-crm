-- Story 76-6 — gerente-relacionamento herda o mesmo acesso de DADOS que o perfil obras.
-- A Samara (perfil Gerente de Relacionamento, ex-obras) precisa enxergar/gerir Obras
-- exatamente como o perfil obras. O acesso de obras (e suas sub-tabelas: fotos, docs,
-- fases, clientes, mensagens) vem da função is_admin_or_supervisor(), que hoje inclui
-- admin/supervisor/obras/gerente-comercial. Adicionamos gerente-relacionamento.
-- Observação: o que cada perfil VÊ continua governado pelos módulos (canAccess) — a RLS
-- só destrava os dados; a navegação segue restrita ao módulo de cada perfil.
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_id = auth.uid()
      AND role IN ('admin', 'supervisor', 'obras', 'gerente-comercial', 'gerente-relacionamento')
  )
$function$;
