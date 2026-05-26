-- Migration 063: Documentação de design — users.role é TEXT flexível (não enum)
--
-- A migration 062 converteu users.role de ENUM para TEXT intencionalmente
-- para suportar roles customizadas criadas em Configurações → Perfil de Acesso
-- (ex: gerente-comercial, coordenador, etc.).
--
-- POR ISSO não existe CHECK constraint com lista fixa de valores.
-- A integridade é garantida pela camada de aplicação:
--
--   1. Middleware (src/lib/supabase/middleware.ts):
--      role = 'cliente' → redireciona /dashboard/* para /cliente
--
--   2. APIs admin (ALLOWED_ROLES): apenas admin/supervisor/broker/obras
--      acessam endpoints administrativos; 'cliente' é explicitamente excluído
--
--   3. getHardcodedPermissions (src/lib/permissions.ts):
--      roles desconhecidos recebem emptyMatrix() — zero acesso a módulos
--
--   4. RLS (Supabase): cliente_obra_ids() isola dados do portal por obra vinculada
--
-- Roles de sistema (sempre presentes): admin, supervisor, broker, obras, cliente
-- Roles customizados (criados pelo admin): qualquer string válida
--
-- INVARIANTE CRÍTICA: role = 'cliente' → acesso exclusivo a /cliente/*
-- Esta invariante é garantida pelo middleware, não por constraint SQL.

COMMENT ON COLUMN public.users.role IS
  'Perfil do usuário. Roles de sistema: admin, supervisor, broker, obras, cliente.
   Roles customizados são suportados (ex: gerente-comercial).
   INVARIANTE: role=cliente tem acesso exclusivo ao portal do cliente (/cliente/).
   A coluna é TEXT para suportar roles customizados via Configurações > Perfil de Acesso.';
