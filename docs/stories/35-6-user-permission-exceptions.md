# Story 35-6: Exceções de Permissão por Usuário

## Status
InReview

## Complexity
M (Medium) — nova tabela DB + 3 server actions + cache granular por usuário + UI com estado otimista em modal existente

## Executor Assignment
```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run typecheck", "npm run lint"]
```

## Story

**As a** administrador do sistema,
**I want** poder definir exceções de permissão individuais para cada usuário (módulos adicionados ou removidos além do seu perfil base),
**so that** usuários no mesmo perfil possam ter acesso diferenciado a módulos específicos sem precisar criar um perfil dedicado para cada variação.

## Acceptance Criteria

1. Existe uma tabela `user_permission_exceptions` no Supabase com colunas: `id uuid DEFAULT gen_random_uuid() PRIMARY KEY`, `org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE`, `user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `module text NOT NULL`, `can_access boolean NOT NULL`, `created_at timestamptz DEFAULT now()`. Constraint UNIQUE em `(user_id, module)`. RLS: SELECT aberto para membros da mesma org (`org_id = public.user_org_id()`); INSERT/UPDATE/DELETE apenas para admins (`public.is_admin()`).

2. A função `getUserPermissions(userId, orgId)` em `packages/web/src/lib/permissions.ts` aplica as exceções APÓS resolver as permissões do perfil base. Para cada exceção encontrada em `user_permission_exceptions` para aquele `user_id`, o valor `can_access` da exceção sobrescreve o valor do perfil base naquele módulo. Exceções têm prioridade absoluta sobre o perfil.

3. Existem três server actions exportadas de `packages/web/src/lib/permissions.ts` (marcadas com `"use server"` interno):
   - `setUserException(userId: string, module: string, canAccess: boolean): Promise<{success: boolean; error?: string}>` — upsert na tabela (INSERT ... ON CONFLICT (user_id, module) DO UPDATE).
   - `removeUserException(userId: string, module: string): Promise<{success: boolean; error?: string}>` — DELETE onde `user_id = userId AND module = module`.
   - `getUserExceptions(userId: string): Promise<Array<{module: string; can_access: boolean}>>` — SELECT de todas as exceções do usuário.

4. O `UserEditModal` ganha uma nova aba `"exceptions"` (label: "Exceções") além das abas "edit" e "password" existentes. Esta aba só aparece quando `isOwnAccount === false`. Os dados de exceções e permissões base são buscados **lazily via Server Action** quando a aba é aberta (ver Dev Notes — Opção B).

5. Na aba "exceptions", todos os 17 módulos de `ALL_MODULES` são listados. Cada módulo exibe:
   - O estado base do perfil (ícone de perfil + label "Herdado do perfil") em texto cinza
   - Se há exceção ATIVA (`can_access: true` na tabela): badge verde com "+" e label "Acesso forçado"
   - Se há exceção BLOQUEADA (`can_access: false` na tabela): badge vermelho com "−" e label "Acesso bloqueado"
   - Dois botões de ação: `[+ Forçar acesso]` e `[− Bloquear]` — o botão correspondente ao estado atual fica desabilitado
   - Botão `[Remover exceção]` (ícone X) — visível apenas quando há exceção ativa para aquele módulo; volta ao padrão do perfil

6. As ações na aba "exceptions" são otimistas: o estado local é atualizado imediatamente, e a server action é chamada em background. Em caso de erro, o estado é revertido e uma mensagem de erro é exibida inline (não alert).

7. Ao salvar/remover uma exceção com sucesso, a cache de permissões do usuário afetado é invalidada via `revalidateTag(`permissions-user-${userId}`)`. Para isto, `getUserPermissions` deve ser modificado para aceitar cache com tag específica por usuário.

8. `npm run typecheck` e `npm run lint` passam sem erros após a implementação.

## Dev Notes

### Arquitetura de cache de exceções

`getUserPermissions` atualmente usa `unstable_cache` com a tag `permissions-${orgId}`. Com exceções por usuário, o cache precisa ser mais granular. Solução:

```typescript
// Cache de exceções por usuário — tag separada para invalidação precisa
const exceptions = await unstable_cache(
  async () => { /* SELECT user_permission_exceptions WHERE user_id = userId */ },
  [`user-exceptions-${userId}`],
  { tags: [`permissions-user-${userId}`], revalidate: 60 }
)()

// Aplicar exceções sobre permissões base
for (const exc of exceptions) {
  finalPerms[exc.module] = exc.can_access
}
```

### Estrutura da aba "exceptions" no UserEditModal

O `UserEditModal` é um Client Component (`"use client"`). A aba de exceções deve receber os dados como props (buscados no server) e gerenciar estado otimista localmente com `useState`.

Props adicionais necessárias:
```typescript
userExceptions?: Array<{ module: string; can_access: boolean }>
userRolePermissions?: Record<string, boolean>
```

### Busca de dados no server (usuarios/page.tsx)

Para cada usuário listado, buscar exceções e permissões de perfil é caro se feito para todos. A solução é **lazy**: os dados só são buscados quando o modal é aberto. Para Next.js App Router com Server Components, isso significa:

**Opção A (recomendada):** Criar um Server Component `UserExceptionsLoader` que busca os dados e passa para `UserEditModal`. Renderizar via `<Suspense>` dentro do modal quando a aba "exceptions" é acessada. Mas como o modal é client-side, isso requer um endpoint ou Server Action de fetch.

**Opção B (mais simples):** Buscar os dados de TODOS os usuários na page.tsx de uma vez, ou fazer um fetch client-side via Server Action quando o usuário abre a aba. Usar Server Action `getUserExceptions(userId)` diretamente do client component.

**Decisão: Usar Opção B** — chamar `getUserExceptions(userId)` do cliente quando a aba "exceptions" é aberta (`useEffect` na mudança de `tab === "exceptions"`). Isso evita buscar dados desnecessários e não requer mudanças na estrutura da page.

Portanto `UserEditModal` não precisa de props `userExceptions` e `userRolePermissions` — ele busca diretamente via Server Action. **AC 4 deve ser ignorado** — a busca é lazy via Server Action.

Para as permissões base do perfil do usuário (para mostrar "herdado do perfil"), buscar via `getUserPermissions(userId, orgId)` também como Server Action quando a aba abre.

### Tabela de módulos com labels (reutilizar de permissions-matrix.tsx)

Os labels dos módulos estão definidos em `packages/web/src/app/dashboard/configuracoes/perfil-acesso/permissions-matrix.tsx` na constante `MODULE_LABELS`. Para evitar duplicação, **mover** `MODULE_LABELS` e `MODULE_DESCRIPTIONS` para `packages/web/src/lib/permissions.ts` e exportá-los. O `permissions-matrix.tsx` passa a importá-los de lá.

### Migration SQL

```sql
-- Migration 049: tabela user_permission_exceptions
CREATE TABLE IF NOT EXISTS user_permission_exceptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module text NOT NULL,
  can_access boolean NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT user_permission_exceptions_user_module_unique UNIQUE (user_id, module)
);

ALTER TABLE user_permission_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_read_exceptions" ON user_permission_exceptions
  FOR SELECT TO authenticated
  USING (org_id = public.user_org_id());

CREATE POLICY "admins_manage_exceptions" ON user_permission_exceptions
  FOR ALL TO authenticated
  USING (public.is_admin() AND org_id = public.user_org_id())
  WITH CHECK (public.is_admin() AND org_id = public.user_org_id());
```

### Arquivos a criar/modificar

| Arquivo | Operação |
|---------|----------|
| `supabase/migrations/049_user_permission_exceptions.sql` | CRIAR |
| `packages/web/src/lib/permissions.ts` | MODIFICAR — adicionar `getUserExceptions`, `setUserException`, `removeUserException`; atualizar `getUserPermissions` para aplicar exceções; mover `MODULE_LABELS`/`MODULE_DESCRIPTIONS` para cá |
| `packages/web/src/components/admin/user-edit-modal.tsx` | MODIFICAR — adicionar aba "Exceções" com lista de módulos |
| `packages/web/src/app/dashboard/configuracoes/perfil-acesso/permissions-matrix.tsx` | MODIFICAR — importar `MODULE_LABELS`/`MODULE_DESCRIPTIONS` de `permissions.ts` em vez de defini-los localmente |

### Referências

- `packages/web/src/lib/permissions.ts` — getUserPermissions (linha ~234), ALL_MODULES (linha ~27)
- `packages/web/src/components/admin/user-edit-modal.tsx` — estrutura atual com abas "edit"/"password"
- `supabase/migrations/047_roles_permissions.sql` — referência de padrão RLS e funções `is_admin()`, `user_org_id()`

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> Quality validation via manual review + typecheck/lint.

## Tasks / Subtasks

- [x] Task 1 — Migration: criar tabela `user_permission_exceptions` (AC: 1)
  - [x] 1.1 Criar arquivo `supabase/migrations/049_user_permission_exceptions.sql` com DDL, RLS e policies conforme Dev Notes
  - [x] 1.2 Aplicar migration via Supabase MCP (project_id: dsopqkqjkmhytudaaolv)

- [x] Task 2 — Mover `MODULE_LABELS` e `MODULE_DESCRIPTIONS` para `permissions.ts` (Dev Notes)
  - [x] 2.1 Mover as constantes `MODULE_LABELS` e `MODULE_DESCRIPTIONS` de `permissions-matrix.tsx` para `permissions.ts` e exportá-las
  - [x] 2.2 Em `permissions-matrix.tsx`, importar as constantes de `@web/lib/permissions` e remover as definições locais

- [x] Task 3 — Server actions de exceções em `permissions.ts` (AC: 3)
  - [x] 3.1 Implementar `getUserExceptions(userId)` — SELECT com `createAdminClient()`, sem cache (dados frescos)
  - [x] 3.2 Implementar `setUserException(userId, module, canAccess)` — upsert com `createClient()`, invalidar tag `permissions-user-${userId}`
  - [x] 3.3 Implementar `removeUserException(userId, module)` — DELETE com `createClient()`, invalidar tag `permissions-user-${userId}`

- [x] Task 4 — Atualizar `getUserPermissions` para aplicar exceções (AC: 2, 8)
  - [x] 4.1 Após resolver permissões do perfil base, chamar `getUserExceptions(userId)` (sem cache próprio — já é chamada dentro de `getUserPermissions` que tem cache por usuário)
  - [x] 4.2 Para cada exceção, sobrescrever o valor no mapa final: `finalPerms[exc.module] = exc.can_access`
  - [x] 4.3 Adicionar tag `permissions-user-${userId}` ao cache de `getUserPermissions` além da tag existente, para que `revalidateTag(`permissions-user-${userId}`)` invalide o cache daquele usuário específico

- [x] Task 5 — UI: aba "Exceções" no `UserEditModal` (AC: 5, 6, 7)
  - [x] 5.1 Adicionar estado `tab: "edit" | "password" | "exceptions"` (ampliar o union type)
  - [x] 5.2 Adicionar aba "Exceções" no header de tabs (visível apenas quando `!isOwnAccount`)
  - [x] 5.3 Adicionar estado `exceptions: Array<{module: string; can_access: boolean}>`, `basePerms: Record<string, boolean>`, `exceptionsLoading: boolean`
  - [x] 5.4 `useEffect` que dispara quando `tab === "exceptions"`: chama `getUserExceptions(userId)` e `getUserPermissions`-via-action para popular os estados acima
  - [x] 5.5 Renderizar lista de módulos com 3 colunas: nome do módulo, estado base (herdado), estado de exceção
  - [x] 5.6 Botões `[+ Forçar acesso]` e `[− Bloquear]` por módulo chamam `setUserException` com update otimista
  - [x] 5.7 Botão `[×]` (remover exceção) por módulo chama `removeUserException` com update otimista
  - [x] 5.8 Exibir erros inline (não window.alert) em caso de falha nas actions

- [x] Task 6 — Validação final (AC: 9)
  - [x] 6.1 Executar `pnpm --filter @trifold/web run type-check` — 0 erros novos
  - [x] 6.2 Executar `pnpm --filter @trifold/web run lint` — 0 erros

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
- FK fix: tabela `orgs` não existe no schema — corrigido para `organizations`
- Lint fix: `revalidateTag` requer 2 argumentos no projeto (padrão `"max"`)
- Lint fix: `useEffect` estava após early return `if (isOwnAccount)` — movido antes; setState movido para `useCallback` para satisfazer `react-hooks/set-state-in-effect`

### Completion Notes
- Migration 049 aplicada via MCP com sucesso (FK para `organizations`, RLS com `user_org_id()` e `is_admin()`)
- `MODULE_LABELS` e `MODULE_DESCRIPTIONS` movidos de `permissions-matrix.tsx` para `permissions.ts` (exportados)
- Exceções aplicadas dentro de `getUserPermissions` via `unstable_cache` com tag `permissions-user-${userId}`
- `UserEditModal` ganhou aba "Exceções" com lazy loading via `useCallback` + `useEffect`, update otimista com rollback em erro
- Zero erros novos em typecheck; zero erros em lint (6 warnings pré-existentes)

### File List
- `supabase/migrations/049_user_permission_exceptions.sql` — CRIADO
- `packages/web/src/lib/permissions.ts` — MODIFICADO (MODULE_LABELS, MODULE_DESCRIPTIONS exportados; getUserPermissions aplica exceções; getUserExceptions, setUserException, removeUserException adicionados)
- `packages/web/src/components/admin/user-edit-modal.tsx` — MODIFICADO (aba Exceções + prop orgId)
- `packages/web/src/app/dashboard/configuracoes/perfil-acesso/permissions-matrix.tsx` — MODIFICADO (importa MODULE_LABELS/DESCRIPTIONS de permissions.ts)
- `packages/web/src/app/dashboard/configuracoes/usuarios/page.tsx` — MODIFICADO (passa orgId ao UserEditModal)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-05-20 | Story criada | @sm River |
| 2026-05-20 | AC 4 removido (contradição com Dev Notes — lazy loading é a abordagem correta); ACs 5-9 renumerados para 4-8; Complexidade M adicionada; Status Draft → Ready | @po Pax |
