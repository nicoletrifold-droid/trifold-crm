status: Done

# Story 1.5 — Auth e Roles (Admin, Supervisor, Broker)

## Contexto
O sistema tem 3 tipos de usuario: admin (Alexandre — controle total), supervisor (Lucas/Marcao — monitora conversas, treina IA) e broker (corretores — ve apenas seus leads). O Supabase Auth com RLS garante que cada usuario so acessa o que deve. Sem auth, nao ha como proteger dados nem rotear usuarios para seus paineis.

## Acceptance Criteria
- [x] AC1: Supabase Auth habilitado com provider email/senha
- [x] AC2: Tabela `users` tem campo `role` com enum: `admin`, `supervisor`, `broker`
- [x] AC3: RLS habilitado em TODAS as tabelas (migration 004_rls_policies.sql)
- [x] AC4: Policy de `organizations`: usuario so ve dados da sua org
- [x] AC5: Policy de `leads`: admin/supervisor veem todos os leads da org; broker ve apenas leads onde `assigned_broker_id` = seu broker_id
- [x] AC6: Policy de `properties`: todos da org podem ler; apenas admin/supervisor podem escrever
- [x] AC7: Policy de `units`: todos da org podem ler; campo `price` so visivel para admin/supervisor/broker (NAO para funcoes de IA)
- [x] AC8: Pagina de login funcional em `/login` com email + senha
- [x] AC9: Middleware de auth no Next.js: redireciona para `/login` se nao autenticado
- [x] AC10: Middleware de role: admin/supervisor vao para `/dashboard`, broker vai para `/broker`
- [x] AC11: Hook `useUser()` retorna usuario logado com role
- [x] AC12: Funcao `getServerUser()` para Server Components retorna usuario autenticado

## Detalhes Tecnicos

### Arquivos a criar/modificar:
- `supabase/migrations/004_rls_policies.sql` — Todas as RLS policies
- `packages/web/src/app/login/page.tsx` — Pagina de login
- `packages/web/src/app/login/actions.ts` — Server action de login
- `packages/web/src/middleware.ts` — Auth + role redirect
- `packages/web/src/lib/auth.ts` — `getServerUser()`, helpers de auth
- `packages/web/src/hooks/use-user.ts` — Hook client-side
- `packages/db/src/server.ts` — Supabase server client (com cookies)

### RLS Policies exemplo:
```sql
-- Organizations: usuario so ve sua org
CREATE POLICY "users_own_org" ON organizations
  FOR SELECT USING (id = (SELECT org_id FROM users WHERE id = auth.uid()));

-- Leads: broker so ve seus leads
CREATE POLICY "broker_own_leads" ON leads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN brokers b ON b.user_id = u.id
      WHERE u.id = auth.uid()
      AND u.role = 'broker'
      AND leads.assigned_broker_id = b.id
    )
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'supervisor')
      AND u.org_id = leads.org_id
    )
  );
```

### Referencia agente-linda:
- Adaptar de `~/agente-linda/packages/web/src/app/login/`
- Adaptar middleware de `~/agente-linda/packages/web/src/middleware.ts`
- Adaptar RLS policies de `~/agente-linda/supabase/migrations/`

## Dependencias
- Depende de: 1.2 (schema), 1.4 (env vars com Supabase client)
- Bloqueia: 1.6 (seed precisa de usuarios), todo Bloco 5 (paineis), Bloco 4 (CRM)

## Estimativa
M (Media) — 2-3 horas

## File List

### Created/Modified
- `supabase/migrations/004_rls_policies.sql` — Todas as RLS policies
- `packages/web/src/app/login/page.tsx` — Pagina de login com email + senha
- `packages/web/src/app/login/actions.ts` — Server action de login
- `packages/web/src/middleware.ts` — Auth + role redirect middleware
- `packages/web/src/lib/auth.ts` — getServerUser() e helpers de auth
- `packages/web/src/hooks/use-user.ts` — Hook client-side useUser()
- `packages/db/src/server.ts` — Supabase server client (com cookies)

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
