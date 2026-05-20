# Epic 35 — Sistema de Controle de Acesso Dinâmico

## Status: Draft

## Objetivo

Transformar o sistema de permissões do Trifold CRM de hardcoded para dinâmico: permissões salvas no Supabase, editáveis pelo admin via UI com toggle switches, suporte a criação de novos perfis customizados, e sidebar/guards lendo do banco em tempo real.

## Contexto de Negócio

Hoje os 4 roles (admin, supervisor, broker, obras) têm permissões hardcoded em ~25 arquivos do codebase. Isso impede que admins adaptem o acesso às necessidades do negócio sem deploy. Um supervisor que precisa de acesso ao Sistema, ou um corretor que deve ver Analytics para uma campanha específica, requer mudança de código.

A story 34-1 criou a página `/dashboard/configuracoes/perfil-acesso` como read-only. Este epic a torna totalmente funcional: editável, persistida, e com efeito real no sistema.

## Referência de Design

- Tabela de permissões com linha por módulo e coluna por perfil (toggle switches)
- Botão "+ Novo Perfil" para criar roles customizados além dos 4 fixos
- Busca por módulo
- Perfis do sistema (admin, supervisor, broker, obras) não podem ser excluídos mas podem ter permissões editadas

## Módulos Cobertos (17 módulos)

`dashboard`, `pipeline`, `leads`, `imoveis`, `corretores`, `conversas`, `agenda`, `alertas`, `atividades`, `analytics`, `campanhas`, `treinamento`, `obras`, `brindes`, `mensagens`, `configuracoes`, `sistema`

## Stories

| Story | Título | Agente | Prioridade | Estimativa | Status |
|-------|--------|--------|------------|------------|--------|
| 35-1 | Schema: tabelas `roles` e `role_permissions` + seed | @data-engineer | P0 — Core | 3h | Draft |
| 35-2 | Server layer: funções `getOrgPermissions` + cache | @dev | P0 — Core | 4h | Draft |
| 35-3 | UI: Matriz de permissões editável com toggle switches | @dev | P0 — Core | 6h | Draft |
| 35-4 | UI: Criar e excluir perfis customizados | @dev | P1 — Enhancement | 4h | Draft |
| 35-5 | Guards e Sidebar dinâmicos lendo do banco | @dev | P0 — Core | 5h | Draft |

**Total estimado:** ~22h | **Sequência obrigatória:** 35-1 → 35-2 → 35-3 + 35-4 (paralelo) → 35-5

## Descrição das Stories

### Story 35-1 — Schema: tabelas `roles` e `role_permissions` + seed
**Agente:** @data-engineer

Criar no Supabase:
- Tabela `roles` (id UUID, org_id UUID, name TEXT, label TEXT, color TEXT, is_system BOOLEAN, created_at)
- Tabela `role_permissions` (id UUID, org_id UUID, role_id UUID FK→roles.id, module TEXT, can_access BOOLEAN, created_at, UNIQUE(role_id, module))
- RLS: apenas usuários da mesma `org_id` podem ler; apenas `admin` pode escrever
- Seed: popular com os 4 roles fixos e as permissões atuais (estado atual do codebase como baseline)
- Index em `role_permissions(role_id, module)` para lookup rápido

### Story 35-2 — Server layer: funções `getOrgPermissions` + cache
**Agente:** @dev

Criar em `packages/web/src/lib/permissions.ts`:
- `getOrgRoles(orgId)` — lista todos os roles de uma org
- `getRolePermissions(roleId)` — retorna `Record<module, boolean>` para um role
- `getOrgPermissionsMatrix(orgId)` — retorna matriz completa `Record<roleId, Record<module, boolean>>`
- Cache com `unstable_cache` do Next.js (TTL: 60s) para evitar N queries por request
- Tag de revalidação `permissions-{orgId}` para invalidar após edição
- Fallback para permissões hardcoded se banco vazio (compatibilidade com orgs sem seed)

### Story 35-3 — UI: Matriz de permissões editável com toggle switches
**Agente:** @dev

Refatorar `packages/web/src/app/dashboard/configuracoes/perfil-acesso/page.tsx`:
- Server component carrega dados via `getOrgPermissionsMatrix(orgId)`
- Client component `PermissionsMatrix` com toggles por módulo × role
- Toggle chama Server Action `updatePermission(roleId, module, canAccess)` (otimistic UI)
- Após salvar, revalida cache com `revalidateTag('permissions-{orgId}')`
- Campo de busca filtra módulos em tempo real (client-side, sem fetch)
- Skeleton loading enquanto carrega
- Toast de confirmação após salvar

### Story 35-4 — UI: Criar e excluir perfis customizados
**Agente:** @dev

Adicionar à página `perfil-acesso`:
- Botão "+ Novo Perfil" no topo direito
- Modal: campos Nome (interno), Label (display), Cor (color picker simples: 6 opções)
- Ao criar: Server Action `createRole(orgId, data)` + seed de permissões como todas `false`
- Badge "Customizado" nos roles criados pelo admin (is_system = false)
- Botão excluir (ícone trash) nos roles customizados apenas
- Confirmação antes de excluir: "Usuários com este perfil serão movidos para 'broker'"
- Server Action `deleteRole(roleId)` atualiza `users.role` antes de excluir

### Story 35-5 — Guards e Sidebar dinâmicos lendo do banco
**Agente:** @dev

Substituir guards hardcoded por consulta ao banco:
- Criar utility `canAccess(user: AppUser, module: string): Promise<boolean>` em `lib/permissions.ts`
- Atualizar `dashboard/layout.tsx`: construir navItems consultando permissões do banco ao invés de lógica hardcoded
- Criar HOF `withPermissionGuard(module, page)` para pages simples
- Atualizar as ~20 pages com `user.role` guards para usar `canAccess()`
- Manter fallback hardcoded para roles do sistema em caso de erro de DB (fail-safe)
- Testes: verificar que cada módulo respeita a permissão configurada

## Critérios de Sucesso do Epic

- [ ] Admin edita toggle de um módulo → usuário afetado perde/ganha acesso sem deploy
- [ ] Admin cria novo perfil "Marketing" e atribui a um usuário → sidebar reflete as permissões configuradas
- [ ] Roles do sistema (admin, supervisor, broker, obras) não podem ser excluídos
- [ ] Cache de permissões garante máximo 1 query ao banco por request
- [ ] Fallback hardcoded funciona se banco estiver indisponível
- [ ] Todos os guards de página usam `canAccess()` ao invés de `user.role`

## Riscos e Mitigações

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Performance: permissões em todo request | Alta | Cache Next.js com TTL 60s + tag revalidation |
| Admin bloqueia a si mesmo | Média | Role `admin` sempre tem acesso total (não editável) |
| Usuários com role customizado excluído | Baixa | Story 35-4 migra usuários antes de excluir role |
| Incompatibilidade com sistema de auth | Baixa | `AppUser.role` mantém o valor original, permissões são consultadas separadamente |

## Dependências Técnicas

- Story 34-1 já criou `/dashboard/configuracoes/perfil-acesso` (base da UI)
- Supabase migration 047+ para `roles` e `role_permissions`
- `unstable_cache` do Next.js 14 para cache de permissões
- Nenhuma mudança na tabela `users` (role continua como string, lookup separado)

## Sequência de Implementação

```
35-1 (schema) → 35-2 (server layer) → [35-3 + 35-4] (UI em paralelo) → 35-5 (guards)
```

## Change Log

| Data | Agente | Ação |
|------|--------|------|
| 2026-05-20 | @pm (Morgan) | Epic criado com 5 stories — baseado em análise do codebase |
