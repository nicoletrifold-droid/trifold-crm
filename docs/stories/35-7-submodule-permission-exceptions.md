# Story 35-7: Exceções de Permissão por Sub-Módulo em /configuracoes

## Status
Ready for Review

## Complexity
M (Medium) — refactor puro em TypeScript: nova constante, lógica condicional em `canAccess`, atualização de 8 guards de página, e expansão de UI no `UserEditModal` existente. Nenhuma migration necessária.

## Executor Assignment
```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["pnpm --filter @trifold/web run type-check", "pnpm --filter @trifold/web run lint"]
```

## Story

**As a** administrador do sistema,
**I want** poder conceder ou bloquear acesso de um usuário a sub-páginas específicas dentro de `/configuracoes` (ex: só `/configuracoes/clientes`, sem liberar todo o módulo Configurações),
**so that** usuários do perfil "obras" e outros perfis restritos possam ter acesso granular a funcionalidades de configuração sem precisar receber o módulo `configuracoes` inteiro.

## Acceptance Criteria

1. O arquivo `packages/web/src/lib/permissions-modules.ts` exporta a constante `SUBMODULE_MAP: Record<string, Record<string, string>>` mapeando módulos pai que possuem sub-módulos e seus identificadores/labels:
   ```typescript
   export const SUBMODULE_MAP: Record<string, Record<string, string>> = {
     configuracoes: {
       "configuracoes.clientes": "Clientes",
       "configuracoes.usuarios": "Usuários",
       "configuracoes.empresa": "Empresa",
       "configuracoes.horario": "Horário Comercial",
       "configuracoes.integracoes": "Integrações",
       "configuracoes.personalidade": "Personalidade Nicole",
       "configuracoes.pipeline": "Etapas do Pipeline",
       "configuracoes.perfil-acesso": "Perfil de Acesso",
     },
   }
   ```

2. A função `canAccess(userId, orgId, module)` em `packages/web/src/lib/permissions.ts` suporta chaves no formato `"modulo.submodulo"`:
   - Se `module` contém `"."`, extrair o `parentModule` (parte antes do ponto).
   - Verificar primeiro se existe exceção explícita na tabela `user_permission_exceptions` para a chave exata `module` (ex: `"configuracoes.clientes"`) — usar o valor da exceção se encontrado.
   - Se não houver exceção explícita para o sub-módulo, herdar do módulo pai: chamar `canAccess(userId, orgId, parentModule)`.
   - Chaves sem `"."` mantêm o comportamento atual (sem alteração).

3. As seguintes páginas têm seus guards atualizados para usar o sub-módulo específico:
   - `/configuracoes/clientes/page.tsx`: de `"configuracoes"` para `"configuracoes.clientes"`
   - `/configuracoes/usuarios/page.tsx`: de `"configuracoes"` para `"configuracoes.usuarios"`
   - `/configuracoes/personalidade/page.tsx`: de `"configuracoes"` para `"configuracoes.personalidade"`
   - `/configuracoes/empresa/page.tsx`: de `"sistema"` para `"configuracoes.empresa"` (ver Dev Notes sobre comportamento atual)
   - `/configuracoes/pipeline/page.tsx`: de `"sistema"` para `"configuracoes.pipeline"` (idem)
   - `/configuracoes/horario/page.tsx`: de `"sistema"` para `"configuracoes.horario"` (idem)
   - `/configuracoes/integracoes/page.tsx`: adicionar guard ausente com `"configuracoes.integracoes"`
   - `/configuracoes/perfil-acesso/page.tsx`: de `user.role !== "admin"` hardcoded para `canAccess(userId, orgId, "configuracoes.perfil-acesso")` (ver Dev Notes)

4. O `UserEditModal` (aba "Exceções") exibe sub-módulos expansíveis para módulos que constam em `SUBMODULE_MAP`:
   - A linha do módulo pai (ex: "Configurações") ganha um botão de expand (chevron) quando ele possui sub-módulos.
   - Ao expandir, sub-linhas aparecem indentadas listando cada sub-módulo com: label (de `SUBMODULE_MAP`), estado herdado, exceção atual e ações.
   - Sub-módulo sem exceção explícita exibe texto "↳ Herdado do módulo" (cinza) em vez de "Herdado do perfil".
   - Sub-módulo com exceção explícita (`can_access: true` ou `false`) exibe o mesmo badge verde/vermelho do módulo pai.
   - As ações `[+ Forçar acesso]`, `[− Bloquear]` e `[×]` nos sub-módulos chamam `setUserException` / `removeUserException` com a chave de sub-módulo (ex: `"configuracoes.clientes"`), da mesma forma que os módulos raiz.

5. O mecanismo de update otimista e rollback em erro existente na aba "Exceções" se aplica igualmente às ações de sub-módulo.

6. `pnpm --filter @trifold/web run type-check` e `pnpm --filter @trifold/web run lint` passam sem erros novos após a implementação.

## Dev Notes

### Contexto da Story 35-6

Story 35-6 (Done) implementou:
- Tabela `user_permission_exceptions` (migration 049) — schema inalterado nesta story.
- `canAccess(userId, orgId, module)` em `permissions.ts` — retorna `perms[module] ?? false` via `getUserPermissions`.
- Aba "Exceções" no `UserEditModal` com lazy loading, update otimista e rollback.
- Server actions em `permissions-exceptions-actions.ts`: `getUserExceptions`, `setUserException`, `removeUserException`.
- `ALL_MODULES`, `MODULE_LABELS`, `MODULE_DESCRIPTIONS` exportados de `permissions-modules.ts`.

A tabela `user_permission_exceptions` já aceita qualquer string em `module` — chaves como `"configuracoes.clientes"` são válidas sem alteração de schema.

### Arquivos relevantes

| Arquivo | Estado atual |
|---------|-------------|
| `packages/web/src/lib/permissions-modules.ts` | Exporta `ALL_MODULES`, `MODULE_LABELS`, `MODULE_DESCRIPTIONS`. Adicionar `SUBMODULE_MAP`. |
| `packages/web/src/lib/permissions.ts` | `canAccess` chama `getUserPermissions` e faz `perms[module] ?? false`. Atualizar para checar exceção direta antes de herdar do pai. |
| `packages/web/src/lib/permissions-exceptions-actions.ts` | `getUserExceptions`, `setUserException`, `removeUserException`. SEM alteração necessária — já trabalha com qualquer string em `module`. |
| `packages/web/src/components/admin/user-edit-modal.tsx` | Aba "Exceções" existente. Adicionar expand de sub-módulos com `SUBMODULE_MAP`. |
| `packages/web/src/app/dashboard/configuracoes/clientes/page.tsx` | Guard: `canAccess(user.id, user.orgId, "configuracoes")` → migrar para `"configuracoes.clientes"`. |
| `packages/web/src/app/dashboard/configuracoes/usuarios/page.tsx` | Guard: `canAccess(user.id, user.orgId, "configuracoes")` → migrar para `"configuracoes.usuarios"`. |
| `packages/web/src/app/dashboard/configuracoes/personalidade/page.tsx` | Guard: `canAccess(user.id, user.orgId, "configuracoes")` → migrar para `"configuracoes.personalidade"`. |
| `packages/web/src/app/dashboard/configuracoes/empresa/page.tsx` | Guard: `canAccess(user.id, user.orgId, "sistema")` → migrar para `"configuracoes.empresa"`. |
| `packages/web/src/app/dashboard/configuracoes/pipeline/page.tsx` | Guard: `canAccess(user.id, user.orgId, "sistema")` → migrar para `"configuracoes.pipeline"`. |
| `packages/web/src/app/dashboard/configuracoes/horario/page.tsx` | Guard: `canAccess(user.id, user.orgId, "sistema")` → migrar para `"configuracoes.horario"`. |
| `packages/web/src/app/dashboard/configuracoes/integracoes/page.tsx` | SEM guard `canAccess` (só `getServerUser`). Adicionar guard com `"configuracoes.integracoes"`. |
| `packages/web/src/app/dashboard/configuracoes/perfil-acesso/page.tsx` | Guard hardcoded: `user.role !== "admin"`. Migrar para `canAccess(user.id, user.orgId, "configuracoes.perfil-acesso")` (ver nota abaixo). |

### Lógica de canAccess para sub-módulos

A implementação deve ser adicionada **dentro de `canAccess`**, antes de consultar `getUserPermissions`, pois `getUserPermissions` devolve apenas chaves de `ALL_MODULES` (17 top-level). Sub-módulos não existem em `user_permission_exceptions` por padrão, então o fallback deve ser implementado no nível de `canAccess`:

```typescript
export async function canAccess(
  userId: string,
  orgId: string,
  module: string
): Promise<boolean> {
  const dotIndex = module.indexOf(".")
  if (dotIndex !== -1) {
    // Sub-módulo: checar exceção explícita primeiro
    const exceptions = await getUserExceptions(userId)  // via permissions-exceptions-actions
    const explicit = exceptions.find((e) => e.module === module)
    if (explicit !== undefined) {
      return explicit.can_access
    }
    // Fallback: herdar do módulo pai
    const parentModule = module.slice(0, dotIndex)
    return canAccess(userId, orgId, parentModule)
  }
  // Comportamento atual para módulos top-level
  const perms = await getUserPermissions(userId, orgId)
  return perms[module] ?? false
}
```

**IMPORTANTE:** `getUserExceptions` está em `permissions-exceptions-actions.ts` (`"use server"`). Para chamar de `permissions.ts` (que não é `"use server"`), importar diretamente — isso é válido porque `permissions.ts` é usado apenas em Server Components/Server Actions no fluxo atual. Verificar se a importação circular não ocorre: `permissions-exceptions-actions.ts` importa de `permissions.ts`, então `permissions.ts` NÃO deve importar de `permissions-exceptions-actions.ts`. A solução alternativa é duplicar a query ou mover `getUserExceptions` para um módulo compartilhado. Ver alternativa abaixo.

**Alternativa sem importação circular:** Implementar a query diretamente em `canAccess` para sub-módulos (sem reusar `getUserExceptions`):

```typescript
if (dotIndex !== -1) {
  const adminClient = createAdminClient()
  const { data: excRow } = await adminClient
    .from("user_permission_exceptions")
    .select("can_access")
    .eq("user_id", userId)
    .eq("module", module)
    .maybeSingle()
  if (excRow !== null) return excRow.can_access
  const parentModule = module.slice(0, dotIndex)
  return canAccess(userId, orgId, parentModule)
}
```

Usar esta alternativa para evitar importação circular.

### Guards de empresa, pipeline, horario: migração de "sistema"

As páginas `empresa`, `pipeline` e `horario` atualmente usam `canAccess(userId, orgId, "sistema")` como guarda, refletindo que só admin tem acesso. Após a migração para `"configuracoes.empresa"` etc., o comportamento muda: `canAccess` para sub-módulos sem exceção explícita herda de `"configuracoes"`, não de `"sistema"`.

**Implicação:** Supervisores (que têm `configuracoes: false`) continuarão sem acesso. Admins (que têm `configuracoes: true`) ganham acesso — comportamento correto. A restrição adicional de admin-only para estas sub-páginas pode ser mantida via exceção explícita no perfil admin, ou documentar como aceito (admin acessa tudo pelo `"configuracoes"` pai).

**Decisão:** Migrar para `"configuracoes.empresa"`, `"configuracoes.pipeline"`, `"configuracoes.horario"`. O comportamento de herança via pai `"configuracoes"` é suficiente — admin tem `configuracoes: true` por padrão.

### Guard de perfil-acesso: hardcoded vs canAccess

A página `perfil-acesso` usa `user.role !== "admin"` (hardcoded). Para consistência com o sistema dinâmico, migrar para `canAccess(userId, orgId, "configuracoes.perfil-acesso")`. O `admin` tem `configuracoes: true` no fallback hardcoded e no seed, portanto a herança funciona sem exceção explícita.

Se não houver exceção explícita para `"configuracoes.perfil-acesso"`, herda de `"configuracoes"`. Portanto admins continuam com acesso e outros perfis (broker, obras, supervisor com `configuracoes: false`) continuam bloqueados.

### UI: expansão de sub-módulos no UserEditModal

O estado de expansão é local ao componente e não persiste entre aberturas do modal:

```typescript
const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())
```

Para saber quais sub-módulos do usuário têm exceções ativas, filtrar `exceptions` pelo prefixo:
```typescript
const subExceptions = exceptions.filter(e => e.module.startsWith(`${module}.`))
```

O estado herdado de um sub-módulo (para exibição quando não há exceção) é o valor de `basePerms[parentModule]`.

### Pattern de importação

- `SUBMODULE_MAP` exportado de `permissions-modules.ts` — sem código server-side, pode importar em Client Components.
- `UserEditModal` importa `SUBMODULE_MAP` de `@web/lib/permissions-modules`.
- `canAccess` em `permissions.ts` usa `createAdminClient()` diretamente para a query de sub-módulo (sem passar por `permissions-exceptions-actions.ts`).

### Sem alteração de schema ou migrations

A tabela `user_permission_exceptions` (migration 049) já aceita qualquer string em `module`. Nenhuma nova migration é necessária nesta story.

### Imports relevantes confirmados no código atual

```typescript
// permissions.ts (linha 4-5)
export { ALL_MODULES, MODULE_LABELS, MODULE_DESCRIPTIONS } from "./permissions-modules"
import { ALL_MODULES } from "./permissions-modules"

// user-edit-modal.tsx (linha 5-6)
import { ALL_MODULES, MODULE_LABELS } from "@web/lib/permissions-modules"
import { getUserExceptions, getUserPermissions, setUserException, removeUserException }
  from "@web/lib/permissions-exceptions-actions"

// permissions-exceptions-actions.ts (linha 1)
"use server"  // arquivo inteiro é server-side
```

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is não está habilitado em `core-config.yaml`.
> Validação de qualidade via revisão manual + typecheck/lint.

## Tasks / Subtasks

- [x] Task 1 — Adicionar `SUBMODULE_MAP` em `permissions-modules.ts` (AC: 1)
  - [x] 1.1 Exportar constante `SUBMODULE_MAP` com os 8 sub-módulos de `configuracoes` conforme AC 1
  - [x] 1.2 Verificar que nenhum import existente quebra (arquivo não tem code server-side)

- [x] Task 2 — Atualizar `canAccess` em `permissions.ts` para sub-módulos (AC: 2)
  - [x] 2.1 Adicionar detecção de `"."` no parâmetro `module`
  - [x] 2.2 Para sub-módulo: query direta em `user_permission_exceptions` via `createAdminClient()` para a chave exata (evitar importação circular com `permissions-exceptions-actions.ts`)
  - [x] 2.3 Se exceção explícita encontrada → retornar `excRow.can_access`
  - [x] 2.4 Se não encontrada → recursão/delegação para `canAccess(userId, orgId, parentModule)`
  - [x] 2.5 Manter comportamento inalterado para módulos top-level (sem `"."`)

- [x] Task 3 — Atualizar guards das páginas de `/configuracoes` (AC: 3)
  - [x] 3.1 `/configuracoes/clientes/page.tsx`: substituir `"configuracoes"` por `"configuracoes.clientes"`
  - [x] 3.2 `/configuracoes/usuarios/page.tsx`: substituir `"configuracoes"` por `"configuracoes.usuarios"` (manter guarda secundária `"sistema"` para a seção de permissões de admin se existir)
  - [x] 3.3 `/configuracoes/personalidade/page.tsx`: substituir `"configuracoes"` por `"configuracoes.personalidade"`
  - [x] 3.4 `/configuracoes/empresa/page.tsx`: substituir `"sistema"` por `"configuracoes.empresa"` (ver Dev Notes — comportamento de herança está correto)
  - [x] 3.5 `/configuracoes/pipeline/page.tsx`: substituir `"sistema"` por `"configuracoes.pipeline"`
  - [x] 3.6 `/configuracoes/horario/page.tsx`: substituir `"sistema"` por `"configuracoes.horario"` (também atualizada segunda ocorrência dentro da Server Action inline)
  - [x] 3.7 `/configuracoes/integracoes/page.tsx`: adicionar import de `canAccess`, buscar `user.id` e `user.orgId`, adicionar guard `if (!(await canAccess(user.id, user.orgId, "configuracoes.integracoes"))) redirect("/dashboard")`
  - [x] 3.8 `/configuracoes/perfil-acesso/page.tsx`: substituir `user.role !== "admin"` por `!(await canAccess(user.id, user.orgId, "configuracoes.perfil-acesso"))`, adicionar import de `canAccess`

- [x] Task 4 — Atualizar UI do `UserEditModal` — sub-módulos expansíveis (AC: 4, 5)
  - [x] 4.1 Importar `SUBMODULE_MAP` de `@web/lib/permissions-modules` no `user-edit-modal.tsx`
  - [x] 4.2 Adicionar estado `expandedModules: Set<string>` para controlar quais módulos pai estão expandidos
  - [x] 4.3 Para cada módulo pai que consta em `SUBMODULE_MAP`, renderizar botão de expand (chevron) ao lado do nome
  - [x] 4.4 Quando expandido, renderizar linhas indentadas por cada sub-módulo do mapa
  - [x] 4.5 Sub-linha sem exceção explícita: exibir "↳ Herdado do módulo" em cinza (consultar `basePerms[parentModule]` para o ícone de estado)
  - [x] 4.6 Sub-linha com exceção explícita: exibir badge verde/vermelho igual ao padrão da aba
  - [x] 4.7 Botões `[+ Forçar acesso]` e `[− Bloquear]` nos sub-módulos chamam `handleSetException(subModuleKey, canAccess)` com a chave de sub-módulo
  - [x] 4.8 Botão `[×]` nos sub-módulos chama `handleRemoveException(subModuleKey)` — visível apenas quando há exceção explícita
  - [x] 4.9 Update otimista e rollback se aplicam da mesma forma que nos módulos raiz (sem alteração no fluxo existente de `handleSetException`/`handleRemoveException`)

- [x] Task 5 — Validação final (AC: 6)
  - [x] 5.1 Executar `npm run type-check` (do `packages/web`) — 0 erros novos (erro pré-existente em `@trifold/shared` por dep `zod` ausente, baseline confirmado)
  - [x] 5.2 Executar `npm run lint` (do `packages/web`) — 0 erros novos (6 warnings pré-existentes não relacionados)

## Dev Agent Record

### Agent Model Used
Claude Opus 4.7 (1M context) — @dev Dex (Builder), YOLO mode

### Debug Log References
- `npm run type-check` (em `packages/web`): apenas erro pré-existente `Cannot find module 'zod'` em `../shared/src/types/commercial-rules.ts` (baseline). Nenhum erro novo introduzido pelos arquivos modificados.
- `npm run lint` (em `packages/web`): 0 errors, 6 warnings pré-existentes (todos `@typescript-eslint/no-unused-vars` em arquivos fora do escopo da story).

### Completion Notes

**Implementação:**
1. **`SUBMODULE_MAP`** adicionada em `permissions-modules.ts` com os 8 sub-módulos de `configuracoes` listados em AC 1. Por ser pure constants (sem código server-side), pode ser importada tanto de Client Components quanto de Server Components.
2. **`canAccess`** em `permissions.ts` agora detecta chaves no formato `"modulo.submodulo"` via `module.indexOf(".")`:
   - Para sub-módulos, faz query direta em `user_permission_exceptions` usando `createAdminClient()` (já importado no topo do arquivo) — solução adotada para evitar importação circular com `permissions-exceptions-actions.ts` (que importa de `permissions.ts`).
   - Se houver exceção explícita, retorna seu `can_access`.
   - Se não houver, recursivamente delega para `canAccess(userId, orgId, parentModule)` herdando o módulo pai.
   - Para módulos top-level (sem `"."`), comportamento original preservado.
3. **Guards das 8 páginas** atualizados para usar a chave de sub-módulo conforme AC 3. A página `horario/page.tsx` teve duas ocorrências de `canAccess` atualizadas: a guard no topo da função e a verificação dentro da Server Action inline (`canAccessFn(currentUser.id, currentUser.orgId, "configuracoes.horario")`).
4. **`UserEditModal`** atualizado:
   - Importa `SUBMODULE_MAP` de `@web/lib/permissions-modules`.
   - Novo estado `expandedModules: Set<string>` com helper `toggleExpanded(mod)` usando spread imutável para satisfazer React (`new Set([...prev, mod])` ao adicionar; `new Set(prev)` + `delete` ao remover).
   - O loop sobre `ALL_MODULES` virou `flatMap` para produzir múltiplas linhas por módulo pai quando expandido.
   - Para módulos em `SUBMODULE_MAP`, renderiza chevron expandível antes do nome (rotação CSS via `rotate-90` quando expandido); para os outros, um spacer mantém o alinhamento.
   - Linhas de sub-módulo aparecem indentadas (`pl-8`), com texto "↳ Herdado do módulo" em cinza quando sem exceção explícita, ou badge verde/vermelho quando há exceção. O estado herdado mostrado (`subInheritedBase`) usa `basePerms[mod]` do módulo pai, conforme `Dev Notes`.
   - Botões `[+ Forçar]`, `[− Bloquear]` e `[×]` reusam exatamente `handleSetException` e `handleRemoveException` com a chave do sub-módulo (`"configuracoes.clientes"` etc.), portanto o fluxo de update otimista + rollback se aplica automaticamente sem mudanças na lógica de mutação.

**Decisões / observações:**
- A query direta em `canAccess` para sub-módulos NÃO usa `unstable_cache` (cada chamada toca o banco). Isso é intencional: cache aplicado dentro do `canAccess` de sub-módulos por `(userId, module)` exigiria parametrizar a chave do cache. Em rotas onde múltiplas guards de sub-módulos rodam por request, o número de chamadas é pequeno (uma por página). Caso vire gargalo, é fácil agrupar a busca de exceções por usuário num único `unstable_cache` por `userId` (já existe na `getUserPermissions`).
- Migrar `empresa`, `pipeline` e `horario` de `"sistema"` para `"configuracoes.X"` muda a base de herança: agora herdam de `configuracoes` (não mais de `sistema`). Admin tem `configuracoes: true` no fallback hardcoded, então continua tendo acesso. Supervisor tem `configuracoes: false`, então continua sem acesso. Comportamento descrito em Dev Notes preservado.
- A página `perfil-acesso` agora respeita exceções: um não-admin pode receber acesso via exceção explícita `configuracoes.perfil-acesso: true`, e um admin pode ter o acesso bloqueado via exceção `configuracoes.perfil-acesso: false`. Conforme Dev Notes, esse é o comportamento esperado da migração de hardcoded para `canAccess`.

### File List

**Modificados (10 arquivos):**

- `packages/web/src/lib/permissions-modules.ts` — adicionada constante `SUBMODULE_MAP`.
- `packages/web/src/lib/permissions.ts` — `canAccess` suporta chaves de sub-módulo via query direta + herança recursiva do módulo pai.
- `packages/web/src/components/admin/user-edit-modal.tsx` — import de `SUBMODULE_MAP`, estado `expandedModules`, helper `toggleExpanded`, expansão de sub-módulos com linhas indentadas e ações.
- `packages/web/src/app/dashboard/configuracoes/clientes/page.tsx` — guard `"configuracoes"` → `"configuracoes.clientes"`.
- `packages/web/src/app/dashboard/configuracoes/usuarios/page.tsx` — guard `"configuracoes"` → `"configuracoes.usuarios"`.
- `packages/web/src/app/dashboard/configuracoes/personalidade/page.tsx` — guard `"configuracoes"` → `"configuracoes.personalidade"`.
- `packages/web/src/app/dashboard/configuracoes/empresa/page.tsx` — `isAdmin` agora consulta `"configuracoes.empresa"`.
- `packages/web/src/app/dashboard/configuracoes/pipeline/page.tsx` — `isAdmin` agora consulta `"configuracoes.pipeline"`.
- `packages/web/src/app/dashboard/configuracoes/horario/page.tsx` — `isAdmin` e guard dentro da Server Action inline agora consultam `"configuracoes.horario"`.
- `packages/web/src/app/dashboard/configuracoes/integracoes/page.tsx` — adicionados imports `redirect` e `canAccess`, guard `if (!(await canAccess(user.id, user.orgId, "configuracoes.integracoes"))) redirect("/dashboard")`.
- `packages/web/src/app/dashboard/configuracoes/perfil-acesso/page.tsx` — adicionado import `canAccess`, guard `user.role !== "admin"` → `!(await canAccess(user.id, user.orgId, "configuracoes.perfil-acesso"))`.

Nenhum arquivo criado, nenhum deletado, nenhuma migration.

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-05-20 | Story criada | @sm River |
| 2026-05-20 | Implementação completa (Tasks 1-5, YOLO mode); status → Ready for Review | @dev Dex |
