---
name: role-source-user-role-not-jwt
description: Para RLS/funções que checam role admin, usar public.user_role() (lê users.role), NÃO auth.jwt() -> app_metadata -> role
metadata:
  type: feedback
---

Em RLS de tabelas/views e em funções SQL que verificam `role = 'admin'`, usar **`public.user_role() = 'admin'`** (definida em `004_rls_policies.sql`, lê `public.users.role`). NÃO usar `auth.jwt() -> 'app_metadata' ->> 'role'`.

**Why:** Confirmado no código (`packages/web/src/lib/supabase/admin-helpers.ts`, `auto-vincular-cliente-obra.ts`, `middleware.ts`) que `app_metadata.role` só é populado para usuários externos `role='cliente'` (portal de obras). Usuários internos (admin/supervisor/broker) têm `app_metadata.role = NULL`. Uma policy/função que cheque o JWT app_metadata retornaria SEMPRE FALSE/0-rows para admins reais — quebra silenciosa. Stories do Epic 52 (52-1, 52-4) sugeriam o padrão JWT; foi substituído por `user_role()` por isso.

**How to apply:** Sempre que uma story pedir verificação de role via JWT/app_metadata neste projeto, trocar por `public.user_role()` (role) e `public.user_org_id()` (tenant) e documentar a decisão no Change Log. É o padrão consolidado em todas as 95+ migrations. Para admin-strict (sem supervisor), NÃO usar `is_admin_or_supervisor()` (amplo demais — inclui obras/gerente-comercial). Ver [[reference_management_api_dollar_quotes]] para aplicação de DDL quando não há CLI.
