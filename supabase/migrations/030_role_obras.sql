-- Migration 030: Novo role 'obras' com acesso restrito ao módulo de obras
-- Story 25.1

-- 1. Adicionar valor 'obras' ao enum user_role
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'obras';

-- 2. Atualizar is_admin_or_supervisor para incluir role 'obras'
-- Redefinida aqui (não em 004_rls_policies.sql) para preservar histórico de migrations.
-- Todas as policies de obras, obra_fases, obra_fotos, obra_documentos e obra_mensagens
-- dependem desta função para operações de escrita (INSERT/UPDATE/DELETE).
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_id = auth.uid()
    AND role IN ('admin', 'supervisor', 'obras')
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;
