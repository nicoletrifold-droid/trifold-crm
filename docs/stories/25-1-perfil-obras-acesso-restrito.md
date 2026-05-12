# Story 25.1 — Perfil "Obras": Acesso Restrito ao Módulo de Obras

## Status: Ready for Review

## Story

**Como** administrador do Trifold CRM,
**Quero** criar um perfil de acesso chamado "Obras" que restrinja o usuário exclusivamente ao módulo de Obras com permissão total (criar, editar, excluir),
**Para que** membros da equipe de acompanhamento de obras (engenheiros, mestres de obra) tenham acesso operacional sem ver dados de vendas, leads ou configurações do CRM.

## Contexto

O módulo de Obras (`/dashboard/obras`) já existe e funciona. Hoje só `admin` e `supervisor` podem acessá-lo. Precisamos de um novo role `obras` que:
- Vê **somente** o item "Obras" na sidebar
- Tem CRUD completo dentro do módulo (fases, fotos, docs, clientes vinculados)
- É redirecionado para `/dashboard/obras` ao logar (não para `/dashboard`)
- Recebe 403/redirect se tentar acessar qualquer outra rota protegida do dashboard

**Atenção — dois pontos críticos confirmados na base de código:**

1. **RLS**: A função `public.is_admin_or_supervisor()` em `supabase/migrations/004_rls_policies.sql` usa `role IN ('admin', 'supervisor')`. Todas as policies de `obras`, `obra_fases`, `obra_fotos`, `obra_documentos` e `obra_mensagens` dependem dessa função para INSERT/UPDATE/DELETE. Sem atualizar a função, o role `obras` consegue ver a UI mas recebe erro de permissão em toda escrita. O padrão de extensão de enum já existe — ver migration `019_portal_cliente_enum.sql` (`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'cliente'`).

2. **Login redirect**: O redirect pós-login **não** está em `getRoleRedirect()` em `auth.ts` — está diretamente em `src/app/login/actions.ts` (bloco if/else nas linhas ~45–67). O `else` final manda qualquer role desconhecido para `/dashboard`. Sem adicionar `else if (appUser?.role === 'obras')`, o usuário `obras` será redirecionado para o dashboard e não verá nada útil.

Arquivos principais afetados:
- `src/lib/auth.ts` — tipo `AppUser.role`
- `src/app/login/actions.ts` — redirect pós-login (crítico)
- `src/lib/supabase/middleware.ts` — proteção de rotas durante navegação
- `src/app/dashboard/layout.tsx` — nav items condicionais
- `src/app/dashboard/obras/page.tsx` e `obras/[obra_id]/page.tsx` — guard de acesso
- `src/app/api/users/route.ts` — validação de role no POST
- `src/app/api/admin/obras/route.ts` e `obras/[obra_id]/route.ts` — guards de API
- `src/components/admin/role-dropdown.tsx` — opção "Obras" no dropdown
- `src/app/dashboard/configuracoes/usuarios/novo/page.tsx` — opção "Obras" no select
- DB: migration para `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'obras'` + atualizar `is_admin_or_supervisor()`

## Acceptance Criteria

### Role e Autenticação
- [ ] AC1: Role `obras` é aceito como valor válido em `public.users.role` no banco (migration se necessário para enum)
- [ ] AC2: `AppUser` type em `auth.ts` inclui `"obras"` no union type do campo `role`
- [ ] AC3: `getUserRole()` no middleware retorna `"obras"` corretamente via `app_metadata.role` ou fallback por query

### Roteamento Pós-Login
- [ ] AC4: Usuário com role `obras` é redirecionado para `/dashboard/obras` após o login — adicionar `else if (appUser?.role === 'obras') { destination = '/dashboard/obras' }` em `src/app/login/actions.ts` antes do bloco `else` final
- [ ] AC5: Usuário `obras` que acessa `/dashboard` (raiz) é redirecionado para `/dashboard/obras`
- [ ] AC6: Usuário `obras` que tenta acessar qualquer rota `/dashboard/*` que NÃO seja `/dashboard/obras*` recebe redirect para `/dashboard/obras`

### Sidebar — Navegação Restrita
- [ ] AC7: Usuário `obras` vê apenas o item "Obras" na sidebar — todos os outros itens (Dashboard, Pipeline, Leads, Imóveis, Corretores, Conversas, Agenda, Alertas, Atividades, Analytics, Campanhas, Treinamento, Config, Mensagens, Email, Sistema) ficam ocultos
- [ ] AC8: O item "Obras" aparece sem badge nem contador de alertas pendentes para role `obras`

### RLS — Permissões de Banco de Dados
- [ ] AC17: A função `public.is_admin_or_supervisor()` em `supabase/migrations/004_rls_policies.sql` é atualizada para `role IN ('admin', 'supervisor', 'obras')` via nova migration — garantindo que INSERT/UPDATE/DELETE em `obras`, `obra_fases`, `obra_fotos`, `obra_documentos` e `obra_mensagens` funcione para o role `obras`
- [ ] AC18: Nova migration criada com padrão `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'obras'` + `CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor()` com o role `obras` incluído

### Acesso ao Módulo de Obras (CRUD Completo)
- [ ] AC9: Usuário `obras` acessa `/dashboard/obras` (listagem de obras) normalmente
- [ ] AC10: Usuário `obras` acessa `/dashboard/obras/[obra_id]` (detalhes) normalmente
- [ ] AC11: Usuário `obras` pode criar, editar e excluir obras, fases, fotos e documentos — CRUD completo funciona no banco (RLS liberada via AC17/AC18)
- [ ] AC12: Guarda de acesso em `obras/page.tsx` e `obras/[obra_id]/page.tsx` aceita role `obras` (além de `admin` e `supervisor`)

### Criação e Gestão de Usuários "Obras"
- [ ] AC13: Na página "Novo Usuário" (`/dashboard/configuracoes/usuarios/novo`), o select de perfil inclui opção "Obras — acesso exclusivo ao módulo de obras"
- [ ] AC14: API `POST /api/users` aceita `obras` como role válido na validação
- [ ] AC15: No `RoleDropdown` da tabela de usuários, a opção "Obras" aparece e pode ser selecionada pelo admin
- [ ] AC16: Labels e cores do role na tabela de usuários: label `"Obras"`, cor `bg-yellow-100 text-yellow-700`

## Escopo

**IN:**
- Novo role `obras` com acesso restrito
- Sidebar condicional para role `obras`
- Redirect pós-login e proteção de rotas
- CRUD completo em todas as sub-páginas de Obras
- Opção de criação/edição de usuário com role `obras`
- Migration DB se role for enum tipado

**OUT:**
- Permissões granulares dentro do módulo de Obras (ex.: somente leitura dentro de Obras)
- Auditoria de ações do usuário `obras`
- Notificações ou alertas para role `obras`

## Dev Notes

### DB — Migration (fazer PRIMEIRO, bloqueia tudo)
- `public.users.role` é enum `user_role` em PostgreSQL — confirmado em `supabase/migrations/001_base_schema.sql`
- Padrão de extensão já estabelecido: ver `supabase/migrations/019_portal_cliente_enum.sql` (`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'cliente'`)
- Nova migration deve conter **duas** operações:
  1. `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'obras';`
  2. `CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor() RETURNS boolean AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE auth_id = auth.uid() AND role IN ('admin', 'supervisor', 'obras')) $$ LANGUAGE sql SECURITY DEFINER STABLE;`
- A função `is_admin_or_supervisor()` está em `supabase/migrations/004_rls_policies.sql` mas deve ser **redefinida** na nova migration `030_role_obras.sql` (não editar migrations antigas)

### Login Redirect — `src/app/login/actions.ts` (crítico)
- O redirect pós-login NÃO está em `getRoleRedirect()` — está inline em `login/actions.ts` (~linha 45)
- Estrutura atual: `if (role === 'broker') ... else if (role === 'cliente') ... else { destination = '/dashboard' }`
- Adicionar antes do `else` final: `else if (appUser?.role === 'obras') { destination = '/dashboard/obras' }`
- `getRoleRedirect` em `auth.ts` também deve ser atualizado para consistência (usado em outros lugares potencialmente)

### Middleware — `src/lib/supabase/middleware.ts`
- Adicionar proteção de rota: após o bloco que redireciona `cliente` para `/cliente`, adicionar:
  ```typescript
  if (role === 'obras' && pathname.startsWith('/dashboard') && !pathname.startsWith('/dashboard/obras')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard/obras'
    return NextResponse.redirect(url)
  }
  ```
- Nota: `obras` NÃO é `broker` (não usa `/broker`), não é `cliente` (não usa `/cliente`) — é um dashboard user restrito

### Layout Sidebar — `src/app/dashboard/layout.tsx`
- `isAdminOrSupervisor` não inclui `obras` (correto — obras não vê todo o dashboard)
- Adicionar: `const isObras = user.role === 'obras'`
- Adicionar à lista de navItems: `...(isObras ? [NAV_ITEM_OBRAS] : [])`
- Role `obras` não precisa de queries de badge (alertas, mensagens) — o `Promise.all` de counts pode ser condicional ou retornar 0

### Guards de Página e API
- `obras/page.tsx` linha ~30: mudar de `user.role !== 'admin' && user.role !== 'supervisor'` para incluir `obras`
- `obras/[obra_id]/page.tsx`: mesma verificação
- `src/app/api/admin/obras/route.ts` e `src/app/api/admin/obras/[obra_id]/route.ts`: auditar guards e incluir `obras`

### RoleDropdown e Formulário
- `src/components/admin/role-dropdown.tsx`: adicionar `obras` às opções
- `configuracoes/usuarios/novo/page.tsx`: adicionar `<option value="obras">Obras — acesso exclusivo ao módulo de obras</option>`
- `PATCH /api/users/[id]/route.ts` e `POST /api/users/route.ts`: incluir `'obras'` nos arrays de roles válidos

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Migration de enum falha se Supabase já tiver `obras` | Baixa | Usar `ADD VALUE IF NOT EXISTS` — idempotente |
| `is_admin_or_supervisor()` usada em outras tabelas além de obras | Média | Grep por `is_admin_or_supervisor` em todas as migrations antes de redefinir — confirmar escopo do impacto |
| Sub-pages de obras sem guard explícito de role | Média | Auditar todos os arquivos em `dashboard/obras/` para garantir cobertura do role `obras` |
| Componentes client-side verificam role e não incluem `obras` | Média | Grep em componentes `_components/` por `admin\|supervisor` para encontrar guards omissos |
| Login redireciona `obras` para `/dashboard` se Task 2b for esquecida | Alta — CONFIRMADO | Task 2b é obrigatória: `login/actions.ts` deve incluir `else if (role === 'obras')` |
| `is_admin_or_supervisor()` grant para `obra_mensagens` também precisa funcionar | Média | Migration 020 usa a mesma função para `obra_mensagens` — redefinição cobre automaticamente |

## Tasks

- [x] 1. Criar nova migration: `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'obras'` (enum já confirmado em `001_base_schema.sql`)
- [x] 2. Na mesma migration: `CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor()` incluindo `'obras'` no `role IN (...)` — isso libera INSERT/UPDATE/DELETE em `obras`, `obra_fases`, `obra_fotos`, `obra_documentos`, `obra_mensagens` para o novo role
- [x] 3. Atualizar `AppUser` type em `auth.ts` — adicionar `"obras"` ao union type do campo `role`; atualizar `getRoleRedirect` com case `'obras': return '/dashboard/obras'`
- [x] 4. Atualizar `src/app/login/actions.ts` — adicionar `else if (appUser?.role === 'obras') { destination = '/dashboard/obras' }` antes do bloco `else` final (linha ~62)
- [x] 5. Atualizar middleware `middleware.ts` — adicionar proteção de rota: `role === 'obras'` + `pathname.startsWith('/dashboard')` + `!pathname.startsWith('/dashboard/obras')` → redirect para `/dashboard/obras`
- [x] 6. Atualizar `dashboard/layout.tsx` — criar `isObras = user.role === 'obras'`; adicionar `NAV_ITEM_OBRAS` condicional; tornar queries de badge condicionais para evitar queries desnecessárias para role `obras`
- [x] 7. Atualizar guards de acesso em `obras/page.tsx` e `obras/[obra_id]/page.tsx` — incluir `obras` na verificação de role permitido
- [x] 8. Auditar e atualizar `src/app/api/admin/obras/route.ts` e `src/app/api/admin/obras/[obra_id]/route.ts` — incluir `obras` nos guards de role
- [x] 9. Atualizar `RoleDropdown`, página Novo Usuário, `POST /api/users` e `PATCH /api/users/[id]` — incluir `obras` como role válido com label "Obras" e cor `bg-yellow-100 text-yellow-700`
- [x] 10. Teste: criar usuário com role `obras`, fazer login, verificar sidebar (só Obras), testar CRUD completo (criar fase, upload foto, editar obra), tentar acessar `/dashboard/leads` (deve redirecionar), testar logout e relogin

## Estimativa: 5h

## Dependências

- Nenhuma — pode iniciar imediatamente

## File List

- `supabase/migrations/030_role_obras.sql` (nova migration)
- `packages/web/src/lib/auth.ts`
- `packages/web/src/app/login/actions.ts`
- `packages/web/src/lib/supabase/middleware.ts`
- `packages/web/src/app/dashboard/layout.tsx`
- `packages/web/src/app/dashboard/obras/page.tsx`
- `packages/web/src/app/dashboard/obras/[obra_id]/page.tsx`
- `packages/web/src/app/api/users/route.ts`
- `packages/web/src/app/api/users/[id]/route.ts`
- `packages/web/src/app/api/admin/obras/route.ts`
- `packages/web/src/app/api/admin/obras/[obra_id]/route.ts`
- `packages/web/src/components/admin/role-dropdown.tsx`
- `packages/web/src/app/dashboard/configuracoes/usuarios/novo/page.tsx`
