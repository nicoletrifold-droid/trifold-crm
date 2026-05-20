# Story 35-4: UI — Criar e excluir perfis customizados

## Status
Ready for Review

## Executor Assignment
```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run typecheck", "npm run lint"]
```

## Story

**As a** administrador do sistema,
**I want** criar novos perfis de acesso customizados e excluir os que não são mais necessários diretamente na interface,
**so that** eu possa adaptar o controle de acesso às necessidades do negócio sem intervenção técnica ou deploy.

## Acceptance Criteria

1. Um botão "+ Novo Perfil" é exibido no canto superior direito do heading da página `/dashboard/configuracoes/perfil-acesso`, visível apenas quando `user.role === "admin"`.
2. Clicar no botão "+ Novo Perfil" abre o modal `CreateRoleModal` definido em `create-role-modal.tsx` no mesmo diretório da page.
3. O modal contém três campos: **Nome interno** (`name`), **Label** (display) e **Cor**.
4. O campo Nome interno aceita apenas letras minúsculas, números e hífens — sem espaços, sem maiúsculas, sem caracteres especiais. Validação ocorre client-side antes do submit.
5. A seleção de cor é feita por botões coloridos com 6 opções fixas: `purple`, `blue`, `green`, `yellow`, `orange`, `gray`. O botão da cor selecionada exibe um indicador visual de seleção (anel/borda).
6. Ao submeter o modal, a Server Action `createRole(orgId, { name, label, color })` é invocada. O modal exibe feedback de loading durante a chamada e é fechado após sucesso.
7. `createRole` cria o role na tabela `roles` com `is_system = false` e insere 17 entradas em `role_permissions` (uma por módulo de `ALL_MODULES`) com `can_access = false`. Ao final, chama `revalidateOrgPermissions(orgId)`.
8. Se o nome já existir na org (violação de constraint UNIQUE em `roles.name + roles.org_id`), o modal permanece aberto e exibe mensagem de erro inline: *"Este nome de perfil já está em uso."*
9. O novo perfil aparece como uma nova coluna na matriz de permissões (via revalidação do cache — sem manipulação de estado local no modal).
10. Cada coluna de role com `is_system = false` na `PermissionsMatrix` exibe um ícone de lixeira (SVG ou `🗑`) no header da coluna, ao lado do nome do perfil.
11. Roles com `is_system = true` não exibem o ícone de lixeira — nunca.
12. Ao clicar no ícone de lixeira, é exibido `window.confirm("Excluir o perfil '{label}'? Esta ação não pode ser desfeita.")`. Se o usuário confirmar, a Server Action `deleteRole(roleId)` é invocada.
13. `deleteRole` verifica que `is_system = false` antes de prosseguir (rejeita com erro se tentar deletar role de sistema). Resolve o `org_id` via SELECT em `roles` antes de deletar. Faz DELETE em `roles` (a FK com ON DELETE CASCADE em `role_permissions` cuida das permissões automaticamente). Chama `revalidateOrgPermissions(orgId)`.
14. Após exclusão bem-sucedida, a coluna do role deletado é removida do estado local da `PermissionsMatrix` (optimistic: remover imediatamente, sem aguardar reload completo da página).
15. Em caso de erro na exclusão, o estado local é preservado e uma mensagem de erro é exibida via `alert()`.
16. Todos os elementos novos (botão, modal, ícone lixeira) funcionam em dark mode com classes `dark:` Tailwind, seguindo o padrão visual do projeto.

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled in `core-config.yaml`.
> Quality validation will use manual review process only.
> To enable, set `coderabbit_integration.enabled: true` in core-config.yaml

## Tasks / Subtasks

- [x] **Task 1 — Server Actions: `createRole` e `deleteRole` em `permissions.ts`** (AC: 7, 8, 13)
  - [x] 1.1 Adicionar `createRole(orgId: string, data: { name: string; label: string; color: string })` após a seção de Server Actions existente
    - Adicionar `"use server"` no corpo da função
    - Autenticar via `supabase.auth.getUser()` + verificar `appUser.role === "admin"` (mesmo padrão de `updatePermission`)
    - INSERT em `roles`: `{ org_id: orgId, name: data.name, label: data.label, color: data.color, is_system: false }`
    - Capturar o `id` retornado pelo insert (`.select("id").single()`)
    - INSERT em `role_permissions`: iterar sobre `ALL_MODULES` e inserir `{ org_id: orgId, role_id: newRole.id, module, can_access: false }` — pode usar insert de array para batch
    - Chamar `revalidateOrgPermissions(orgId)`
    - Retornar `{ success: true, role: OrgRole }` ou `{ success: false, error: string }`
    - Tratar erro de constraint UNIQUE (code `23505`) retornando mensagem específica: `"Este nome de perfil já está em uso."`
  - [x] 1.2 Adicionar `deleteRole(roleId: string)` após `createRole`
    - Adicionar `"use server"` no corpo da função
    - Autenticar via `supabase.auth.getUser()` + verificar `appUser.role === "admin"`
    - SELECT em `roles` para obter `{ org_id, is_system }` (usar `.maybeSingle()`)
    - Rejeitar se `is_system === true`: retornar `{ success: false, error: "Roles do sistema não podem ser excluídos." }`
    - DELETE em `roles` where `id = roleId` (cascade deleta `role_permissions` via FK)
    - Chamar `revalidateOrgPermissions(orgId)`
    - Retornar `{ success: true }` ou `{ success: false, error: string }`

- [x] **Task 2 — Criar `create-role-modal.tsx`** (AC: 2, 3, 4, 5, 6, 8, 16)
  - [x] 2.1 Criar arquivo `packages/web/src/app/dashboard/configuracoes/perfil-acesso/create-role-modal.tsx`
  - [x] 2.2 Adicionar `"use client"` no topo
  - [x] 2.3 Props: `{ orgId: string; isOpen: boolean; onClose: () => void }`
  - [x] 2.4 Estado interno: `name`, `label`, `selectedColor` (default: `"blue"`), `isSubmitting`, `nameError`
  - [x] 2.5 Implementar validação do campo `name`: regex `/^[a-z0-9-]+$/` — ao blur e antes do submit; definir `nameError` com mensagem se inválido
  - [x] 2.6 Implementar seletor de cor: array de 6 opções `["purple", "blue", "green", "yellow", "orange", "gray"]` renderizado como botões com `className` calculado (background da cor + anel de seleção `ring-2 ring-offset-1` quando selecionado)
  - [x] 2.7 Implementar `handleSubmit`:
    - Validar `name` antes de prosseguir
    - Setar `isSubmitting = true`
    - Chamar `createRole(orgId, { name, label, color: selectedColor })`
    - Se `success`: limpar form, fechar modal (`onClose()`)
    - Se `!success && error === "Este nome de perfil já está em uso."`: setar `nameError` com essa mensagem, manter modal aberto
    - Se outro erro: exibir `alert(result.error)`, manter modal aberto
    - Setar `isSubmitting = false` ao finalizar
  - [x] 2.8 Renderizar modal como overlay com `z-50`, fundo semitransparente, painel centralizado. Fechar ao clicar no overlay ou no botão "Cancelar"
  - [x] 2.9 Garantir dark mode em todos os elementos (overlay, painel, inputs, botões)

- [x] **Task 3 — Modificar `page.tsx`: botão "+ Novo Perfil" + modal** (AC: 1, 2, 9)
  - [x] 3.1 Converter o heading section para incluir botão "+ Novo Perfil" no flex-between
    - A section do heading passa a ser `<div className="flex items-start justify-between">` com o bloco de título à esquerda e o botão à direita
  - [x] 3.2 O botão é um elemento `"use client"` — dado que `page.tsx` é Server Component, extrair o botão + modal para um pequeno wrapper Client Component `ProfileActionsHeader` inline ou em arquivo separado
    - **[AUTO-DECISION]** Criar `profile-actions-header.tsx` como Client Component separado (não inline) — mantém `page.tsx` limpo como Server Component puro e facilita coordenação com a Story 35-3 que também modifica `page.tsx`. Razão: separação clara de responsabilidades, evita transformar `page.tsx` em Client Component.
  - [x] 3.3 `ProfileActionsHeader` recebe `orgId: string` como prop, gerencia o estado `isModalOpen` e renderiza o botão + `<CreateRoleModal>`
  - [x] 3.4 O botão "+ Novo Perfil" só é renderizado (ou habilitado) quando o componente recebe `orgId` — que por sua vez só é passado quando `user.role === "admin"` (a verificação de role continua no Server Component, antes de passar `orgId`)

- [x] **Task 4 — Modificar `permissions-matrix.tsx`: ícone lixeira + exclusão** (AC: 10, 11, 12, 13, 14, 15)
  - [x] 4.1 Adicionar import de `deleteRole` de `@web/lib/permissions`
  - [x] 4.2 No `<thead>`, para cada coluna de role onde `role.is_system === false`, renderizar ícone de lixeira ao lado do nome:
    ```tsx
    <button
      onClick={() => handleDeleteRole(role)}
      aria-label={`Excluir perfil ${role.label}`}
      className="ml-1 text-gray-400 hover:text-red-500 dark:text-stone-500 dark:hover:text-red-400 transition-colors"
    >
      {/* SVG trash icon ou ícone do heroicons */}
    </button>
    ```
  - [x] 4.3 Implementar `handleDeleteRole(role: OrgRole)`:
    - Exibir `window.confirm(...)` com a mensagem do AC 12
    - Se confirmado: chamar `deleteRole(role.id)`
    - Se sucesso: remover o role do estado local `roles` (optimistic) e remover a coluna correspondente de `optimisticMatrix`
    - Se erro: `alert(result.error)`
  - [x] 4.4 Ajustar o tipo das props do componente para aceitar `roles` como estado mutável (não readonly) — pode requerer que `roles` seja estado local inicializado da prop, similar ao `optimisticMatrix`

- [x] **Task 5 — Quality gate** (AC: todos)
  - [x] 5.1 `npm run typecheck` — zero erros em `packages/web` (apenas erro pré-existente em `packages/shared` com `zod`, não relacionado à 35-4)
  - [x] 5.2 `npm run lint` — zero warnings/errors nos arquivos modificados
  - [ ] 5.3 Verificar manualmente: criar novo perfil via modal → coluna aparece na matriz com todos os toggles desligados *(pendente para @qa)*
  - [ ] 5.4 Verificar: excluir perfil customizado → coluna desaparece imediatamente *(pendente para @qa)*
  - [ ] 5.5 Verificar: roles do sistema (admin, supervisor, broker, obras) não exibem ícone de lixeira *(pendente para @qa)*
  - [ ] 5.6 Verificar: tentar criar perfil com nome duplicado → mensagem de erro inline no modal, modal não fecha *(pendente para @qa)*
  - [ ] 5.7 Verificar dark mode no browser para modal e ícone lixeira *(pendente para @qa)*

## Dev Notes

### Contexto de Stories Anteriores

**Story 35-1** (schema — Done): Criou tabelas `roles` e `role_permissions` com migration `047_roles_permissions.sql`. Campo `is_system BOOLEAN NOT NULL DEFAULT false`. FK `role_permissions.role_id → roles.id ON DELETE CASCADE` (a cascade está garantida — `deleteRole` não precisa deletar `role_permissions` manualmente).

**Story 35-2** (server layer — Done): Criou `packages/web/src/lib/permissions.ts` com `getOrgRoles`, `getOrgPermissionsMatrix`, `updatePermission`, `revalidateOrgPermissions`, `ALL_MODULES`, `OrgRole`. Esta story **adiciona** `createRole` e `deleteRole` ao mesmo arquivo — não cria novo arquivo.

**Story 35-3** (UI matriz — em progresso paralelo): Cria `permissions-matrix.tsx` e refatora `page.tsx`. Esta story modifica os mesmos arquivos. O @dev deve aplicar ambas as stories no mesmo working tree sem conflito. A Story 35-3 é responsável pela estrutura base; esta story adiciona elementos ao topo (botão/modal) e às colunas (lixeira).

**[AUTO-DECISION]** Sobre migração de usuários ao excluir role: a descrição do epic menciona "Usuários com este perfil serão movidos para 'broker'" mas o escopo desta story, conforme definido pelo PM, é simplificado — apenas excluir o role sem migração de usuários. Usuários com role inválido ficam temporariamente em estado inconsistente até a Story 35-5 (guards dinâmicos) tratar isso com fallback. Razão: manter escopo desta story focado; migração de usuários é responsabilidade de 35-5.

### Tipos e Funções já Disponíveis em `@web/lib/permissions`

```typescript
// Tipos exportados (disponíveis para importar):
export interface OrgRole {
  id: string
  name: string
  label: string
  color: string
  is_system: boolean
}

export const ALL_MODULES: readonly string[]  // 17 módulos — usar para seed de role_permissions

// Funções já existentes (não modificar):
export async function getOrgRoles(orgId: string): Promise<OrgRole[]>
export async function getOrgPermissionsMatrix(orgId: string): Promise<PermissionsMatrix>
export async function updatePermission(roleId, module, canAccess): Promise<{success, error?}>
export function revalidateOrgPermissions(orgId: string): void

// A ADICIONAR nesta story:
export async function createRole(orgId: string, data: {name: string; label: string; color: string}): Promise<{success: boolean; role?: OrgRole; error?: string}>
export async function deleteRole(roleId: string): Promise<{success: boolean; error?: string}>
```

### Pattern de Server Action (seguir exatamente o padrão de `updatePermission`)

```typescript
export async function createRole(...) {
  "use server"

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Unauthorized" }

  const { data: appUser } = await supabase
    .from("users")
    .select("role, org_id")
    .eq("auth_id", user.id)
    .maybeSingle()

  if (!appUser || appUser.role !== "admin") return { success: false, error: "Unauthorized" }

  // ... lógica de negócio ...
}
```

Nota: `appUser.org_id` do `public.users` pode ser usado como alternativa ao parâmetro `orgId` para double-check de segurança.

### Constraint UNIQUE em `roles`

A migration 047 define `UNIQUE(org_id, name)` em `roles`. O erro do PostgreSQL para violação de UNIQUE é o código `23505`. O Supabase retorna isso em `error.code`. Trate assim:

```typescript
if (insertError) {
  if (insertError.code === "23505") {
    return { success: false, error: "Este nome de perfil já está em uso." }
  }
  return { success: false, error: insertError.message }
}
```

### Cores dos Perfis — Mapeamento para Classes Tailwind

As 6 cores fixas do modal devem mapear visualmente para o mesmo sistema de badges usado na `PermissionsMatrix` e em `usuarios/page.tsx`:

```typescript
const COLOR_STYLES: Record<string, { bg: string; text: string; button: string }> = {
  purple: { bg: "bg-purple-500", text: "text-white", button: "bg-purple-100 dark:bg-purple-500/15" },
  blue:   { bg: "bg-blue-500",   text: "text-white", button: "bg-blue-100 dark:bg-blue-500/15" },
  green:  { bg: "bg-green-500",  text: "text-white", button: "bg-green-100 dark:bg-green-500/15" },
  yellow: { bg: "bg-yellow-400", text: "text-gray-900", button: "bg-yellow-100 dark:bg-yellow-500/15" },
  orange: { bg: "bg-orange-500", text: "text-white", button: "bg-orange-100 dark:bg-orange-500/15" },
  gray:   { bg: "bg-gray-400",   text: "text-white", button: "bg-gray-100 dark:bg-stone-700/50" },
}
```

Na `PermissionsMatrix` (Story 35-3), roles customizados já usam `OrgRole.color` para derivar badge. Verificar que o badge dos novos roles segue o mesmo padrão definido em 35-3.

### Coordenação com Story 35-3 — Modificações em Arquivos Compartilhados

**`page.tsx`** — a Story 35-3 remove as constantes hardcoded e adiciona `getOrgRoles + getOrgPermissionsMatrix`. Esta story adiciona:
- Import de `ProfileActionsHeader` (novo componente)
- Wrapper flex-between no heading
- `<ProfileActionsHeader orgId={user.orgId} />` dentro do heading

**`permissions-matrix.tsx`** — a Story 35-3 cria o componente com props `{ roles, matrix, modules }`. Esta story adiciona:
- Estado local para `roles` (inicializado da prop, mutável via exclusão)
- Ícone de lixeira no `<thead>` para roles com `is_system === false`
- `handleDeleteRole` function

Se as duas stories forem aplicadas no mesmo working tree, o @dev deve combinar as duas sem conflito — não há sobreposição de lógica, apenas adições em pontos distintos do arquivo.

### `getServerUser()` — Campo `orgId`

```typescript
// packages/web/src/lib/auth.ts
export interface AppUser {
  orgId: string  // camelCase — não usar org_id
  role: "admin" | "supervisor" | "broker" | "obras"
  // ...outros campos
}
```

### Estrutura de Arquivos

```
packages/web/src/app/dashboard/configuracoes/perfil-acesso/
  page.tsx                      ← MODIFICAR (adicionar botão/modal no heading)
  permissions-matrix.tsx        ← MODIFICAR (adicionar lixeira no thead + handleDeleteRole)
  create-role-modal.tsx         ← CRIAR (modal completo)
  profile-actions-header.tsx    ← CRIAR (Client Component wrapper para botão + modal)
```

### Padrão de Importação (obrigatório)

```typescript
// Correto:
import { createRole, deleteRole, ALL_MODULES, OrgRole } from "@web/lib/permissions"
import { getServerUser } from "@web/lib/auth"

// NUNCA usar caminho relativo:
// import { ... } from "../../lib/permissions"  // ERRADO
```

## Testing

**Framework:** Vitest (unit) + verificação manual no browser

**Abordagem:** Esta story é predominantemente de UI/integração. Não há lógica de negócio isolável para unit test — as Server Actions são testadas pelo comportamento end-to-end. O foco é validação funcional manual.

**Cenários de validação manual:**

- Clicar "+ Novo Perfil" → modal abre
- Preencher nome com espaço → validação client-side bloqueia submit, exibe erro
- Preencher todos os campos corretamente → submeter → modal fecha → coluna nova aparece na matriz com 17 toggles desligados
- Tentar criar perfil com nome já existente → modal permanece aberto com mensagem "Este nome de perfil já está em uso."
- Selecionar cor no picker → botão da cor selecionada exibe anel/borda de seleção
- Verificar que roles do sistema (admin, supervisor, broker, obras) não têm ícone de lixeira no header da coluna
- Clicar lixeira em role customizado → `window.confirm` aparece com mensagem correta
- Confirmar exclusão → coluna desaparece imediatamente (optimistic)
- Cancelar exclusão → nada acontece
- Verificar dark mode: modal, botões de cor, ícone lixeira
- Verificar que não-admin não vê o botão "+ Novo Perfil" (acessar como supervisor/broker)

**Typecheck e lint:**
```bash
npm run typecheck   # deve passar sem erros em packages/web
npm run lint        # deve passar sem warnings nos arquivos modificados
```

## Change Log

| Data       | Versão | Descrição                                                                  | Autor        |
|------------|--------|----------------------------------------------------------------------------|--------------|
| 2026-05-20 | 1.0    | Story criada                                                               | @sm (River)  |
| 2026-05-20 | 1.1    | Validação PO: GO (9/10). Status Draft → Ready. 10-point checklist passed.  | @po (Pax)    |
| 2026-05-20 | 1.2    | Implementação concluída em YOLO. Status Ready → Ready for Review.          | @dev (Dex)   |

---

## Dev Agent Record

### Agent Model Used
Opus 4.7 (1M context) — Claude Code AIOS Dev Agent (Dex/Builder persona)

### Debug Log References

- `pnpm --filter @trifold/web run type-check`: passou em todos os arquivos da Story 35-4. Erro pré-existente em `packages/shared/src/types/commercial-rules.ts` (módulo `zod` não encontrado) não está relacionado.
- `pnpm --filter @trifold/web run lint`: zero erros, zero warnings nos arquivos modificados/criados pela story. Warnings remanescentes (6) são pré-existentes em arquivos fora do escopo.
- Issue de tipo no `revalidateTag` (Next.js 16 mudou a assinatura para exigir o segundo parâmetro `profile`): erro pré-existente da Story 35-2. Corrigido em `revalidateOrgPermissions` adicionando `"max"` como profile (semântica stale-while-revalidate recomendada pelo Next 16 docs).

### Completion Notes List

- **Server Actions:** `createRole` e `deleteRole` adicionados em `packages/web/src/lib/permissions.ts` seguindo o mesmo padrão de `updatePermission` (auth → admin check → operação → revalidate). `createRole` faz double-check de `appUser.org_id === orgId` e cleanup em caso de falha no seed de `role_permissions` (deleta o role criado para evitar estado órfão). `deleteRole` faz double-check de `roleRow.org_id === appUser.org_id`.
- **Modal:** `CreateRoleModal` é Client Component standalone. Validação client-side via regex `/^[a-z0-9-]+$/` no campo `name` (executada em onBlur e antes do submit). Label tem validação de "não-vazio". Color picker com 6 botões coloridos circulares; selecionado indicado por `ring-2 ring-orange-500 ring-offset-2`. Submit invoca a Server Action `createRole` via `actions.ts`. Erro `UNIQUE` (code 23505) é traduzido em mensagem inline `"Este nome de perfil já está em uso."` — outros erros vão para `window.alert`. Modal não é fechável durante submit (`isSubmitting` bloqueia cancel/close).
- **Header wrapper:** `ProfileActionsHeader` é um pequeno Client Component que isola o estado `isModalOpen` e renderiza o botão `+ Novo Perfil` + o `<CreateRoleModal>`. Decisão tomada por separação de responsabilidades — `page.tsx` permanece Server Component puro (essa decisão foi documentada no AUTO-DECISION da Task 3.2).
- **Matriz — exclusão:** `roles` agora é estado local em `PermissionsMatrix` (inicializado da prop `initialRoles`) para permitir remoção otimista. Ícone de lixeira (SVG heroicons-style trash) renderizado apenas para `role.is_system === false`. `handleDeleteRole` usa snapshot para rollback em caso de erro/exceção. Estado `deletingRoleId` previne double-click. `aria-label`, `title` e o estado `disabled` durante o delete in-flight estão setados corretamente.
- **Re-exports:** `actions.ts` expandido para re-exportar `createRole` e `deleteRole` mantendo a fronteira limpa server/client (evita importar `@web/lib/permissions` diretamente em Client Components).
- **Bug fix incidental:** `revalidateOrgPermissions` agora chama `revalidateTag(tag, "max")` — corrigindo TS error pré-existente da Story 35-2 (assinatura mudou em Next.js 16).
- **Permission cleanup race:** O `createRole` faz cleanup best-effort do role se o INSERT de `role_permissions` falhar. Isso reduz o risco de roles "órfãos" sem linhas em `role_permissions`. Não há transação real (Supabase JS não expõe transações no client), então em casos extremos (e.g. timeout do cleanup) um role órfão pode existir — sistema mantém-se consistente porque `getOrgPermissionsMatrix` aplica fallback hardcoded por nome quando não encontra permissões.

### File List

**Modificados:**
- `packages/web/src/lib/permissions.ts` — adicionadas funções `createRole` e `deleteRole`; ajustado `revalidateOrgPermissions` para usar a nova assinatura do Next 16.
- `packages/web/src/app/dashboard/configuracoes/perfil-acesso/page.tsx` — adicionado import e uso de `ProfileActionsHeader` no heading.
- `packages/web/src/app/dashboard/configuracoes/perfil-acesso/permissions-matrix.tsx` — import de `deleteRole`; estado local `roles` + `deletingRoleId`; função `handleDeleteRole`; botão SVG de lixeira no `<thead>` (apenas para `!is_system`).
- `packages/web/src/app/dashboard/configuracoes/perfil-acesso/actions.ts` — re-exports de `createRole` e `deleteRole`.

**Criados:**
- `packages/web/src/app/dashboard/configuracoes/perfil-acesso/create-role-modal.tsx` — modal completo com inputs, color picker e validação.
- `packages/web/src/app/dashboard/configuracoes/perfil-acesso/profile-actions-header.tsx` — Client Component wrapper para botão + modal.

---

## QA Results

### Review Date: 2026-05-20

### Reviewed By: Quinn (Guardian/Test Architect)

### Scope da Revisão

Code review estático completo dos 6 arquivos do escopo (4 modificados + 2 criados), validação dos 16 ACs, type-check e lint. Validação manual em browser (tarefas 5.3-5.7) **não foi executada** — depende de sessão admin viva, recomendada como smoke test antes do deploy.

### AC-by-AC Validation (16/16 PASS)

| AC | Status | Evidência |
|----|--------|-----------|
| 1 (botão admin-only) | PASS | `page.tsx:36-38` faz `redirect("/dashboard")` para não-admin; `ProfileActionsHeader` só renderiza para admin |
| 2 (modal abre no click) | PASS | `profile-actions-header.tsx:21,27` |
| 3 (3 campos) | PASS | `create-role-modal.tsx:156-256` |
| 4 (regex name) | PASS | `/^[a-z0-9-]+$/` validada em blur + submit (linhas 21, 56-77) |
| 5 (6 cores fixas + anel) | PASS | `ROLE_COLORS` array linha 10-17; `ring-2 ring-orange-500 ring-offset-2` linha 250 |
| 6 (submit + loading + close) | PASS | `handleSubmit` linhas 73-122 |
| 7 (createRole + 17 perms + revalidate) | PASS | `permissions.ts:380-460` — insert role, iterate `ALL_MODULES` (17), batch insert, `revalidateOrgPermissions` |
| 8 (UNIQUE erro inline) | PASS | Código `23505` → "Este nome de perfil já está em uso." (permissions.ts:426-428, modal:102-104) |
| 9 (coluna aparece via cache) | PASS | Sem manipulação de estado local no modal — revalidação server-side |
| 10 (ícone lixeira em customs) | PASS | `permissions-matrix.tsx:347-372` — SVG heroicons trash, condicional `!role.is_system` |
| 11 (sem lixeira em sistema) | PASS | Condicional `{!role.is_system && (...)}` linha 347 |
| 12 (window.confirm) | PASS | Mensagem exata do AC em `permissions-matrix.tsx:265-267` |
| 13 (deleteRole + checks + cascade) | PASS | `permissions.ts:477-546` — auth, admin, org check, rejeita `is_system`, DELETE com cascade via FK (verificado em migration 047 linha 58 `ON DELETE CASCADE`) |
| 14 (optimistic remoção) | PASS | `setRoles(prev.filter(...))` + delete em `optimisticMatrix` antes da action (linhas 278-283) |
| 15 (rollback + alert em erro) | PASS | Snapshots `previousRoles`/`previousMatrix` + `window.alert` (linhas 287-307) |
| 16 (dark mode) | PASS | Classes `dark:` em todos elementos novos — overlay, painel, inputs, ícone, botões |

### 7 Quality Checks

1. **Code review** — PASS. Patterns consistentes com `updatePermission`. Double-check de `org_id` em ambas as actions, best-effort cleanup do role se seed de permissions falhar, snapshots para rollback, atributos `aria-*` corretos.
2. **Unit tests** — CONCERNS (low). Story declara "predominantemente UI/integração, sem unit tests" — validação funcional manual delegada para @qa. Aceitável dado o escopo, mas testes E2E (Playwright) seriam ideais para flows críticos como exclusão.
3. **Acceptance criteria** — PASS. 16/16 ACs implementados conforme spec.
4. **No regressions** — PASS. Não há mudanças em `updatePermission` nem em `getOrgPermissionsMatrix`. `revalidateOrgPermissions` corrigida para nova assinatura Next 16 (`"max"`) — corrige TS error pré-existente da 35-2 sem mudar semântica.
5. **Performance** — PASS. INSERT batch de 17 rows em single call. `Promise.all` no loader. Revalidação tag-based (não full refresh).
6. **Security** — PASS. Auth check (`getUser`), admin check (`appUser.role === "admin"`), double-check de `org_id` em ambas as actions, rejeição explícita de `is_system === true`. RLS herda da migration 047.
7. **Documentation** — PASS. JSDoc em todas as funções server-side; comentários explicando decisões (cleanup race, regex, Next 16 revalidate).

### Quality Gate Tools

- `pnpm --filter @trifold/web run type-check`: **PASS** para arquivos da Story 35-4. Único erro restante é pré-existente em `packages/shared/src/types/commercial-rules.ts` (módulo `zod`), não relacionado.
- `pnpm --filter @trifold/web run lint`: **0 errors, 6 warnings** — TODOS os warnings em arquivos fora do escopo da 35-4 (email-automations, email-blasts, enrich-leads, campaigns).

### Observações (não-bloqueantes)

- **[SEC-001 — low]** `createRole` aceita `data.label` sem trim/validate server-side. A migration 047 garante `NOT NULL` mas aceita string vazia. Defesa em profundidade recomendada: validar `data.label.trim().length > 0` na Server Action.
- **[TEST-001 — low]** Tarefas 5.3-5.7 (validação browser) não executadas — recomendação: smoke test logado como admin antes do deploy (criar perfil, duplicado, excluir, verificar sistema sem lixeira, dark mode).
- **[MNT-001 — low]** Erro pré-existente em `packages/shared` (zod) — tratar em story dedicada.

### Pontos Fortes

- **Double-check de org_id** em `createRole` e `deleteRole` — defesa em profundidade contra IDOR (Insecure Direct Object Reference).
- **Best-effort cleanup** em `createRole`: se o INSERT de `role_permissions` falhar, o role criado é removido para evitar estado órfão.
- **Snapshots para rollback** em `handleDeleteRole`: estado local restaurado em caso de erro/exceção, sem necessidade de re-fetch.
- **Decisão arquitetural** de extrair `ProfileActionsHeader` como Client Component standalone (mantém `page.tsx` puro Server Component) está bem documentada como `[AUTO-DECISION]` no story.
- **Acessibilidade**: `aria-pressed`, `aria-label`, `aria-modal`, `aria-labelledby`, `aria-invalid`, `aria-describedby` em todos elementos interativos.

### Gate Status

Gate: **PASS** → docs/qa/gates/35.4-ui-custom-profiles.yml

### Recomendação

**APPROVED** — Story pode prosseguir para deploy. Observações registradas são todas `low severity` e não bloqueiam. Recomenda-se smoke test em browser antes do `@devops *push` para validar comportamento dark mode e UX dos flows críticos.
