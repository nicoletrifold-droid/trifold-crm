---
name: Epic 35 QA Patterns (Roles & Permissions)
description: QA patterns and validations for Epic 35 stories in Trifold (roles & permissions matrix)
type: project
---

# Epic 35 — Roles & Permissions (Trifold)

Epic que substitui guards hardcoded por matriz de permissões no banco.

**Why:** Stories 35-1..35-5 transformaram regras de acesso de hardcoded para data-driven. QA precisa validar consistência entre seed, fallback, e usage sites.

**How to apply:**

## Validações Padrão para Stories deste Epic

1. **Migração da função permissions.ts** — sempre verificar se novas funções reusam `getUserPermissions` em vez de duplicar a lógica de fetch role → permissions.
2. **Cache discipline** — `getUserPermissions` é cacheado via `unstable_cache` com TTL 60s por (userId, orgId). Helpers novos NÃO devem chamar supabase diretamente — devem reusar `getUserPermissions`.
3. **Fallback hardcoded** — `getHardcodedPermissions(role)` em `permissions.ts` (Story 35-2) é o safety net. Espelha o seed da migration 047. NUNCA modificar sem atualizar o seed (Story 35-1) e vice-versa.
4. **Default-deny semantics** — helpers tipo `canAccess` devem retornar `false` se módulo ausente do mapa (`?? false`).

## Lista de 17 Módulos Canônicos (migration 047)

`agenda, alertas, analytics, atividades, brindes, campanhas, configuracoes, conversas, corretores, dashboard, imoveis, leads, mensagens, obras, pipeline, sistema, treinamento`

ALL_MODULES em `permissions.ts` exporta a lista. Story 35-3 (UI matrix) usa essa lista para renderizar toggles.

## Roles Seed e Permissões por Default

- `admin` → todos true (fullMatrix)
- `supervisor` → todos true EXCETO `configuracoes` e `sistema`
- `broker` → apenas `pipeline, leads, imoveis, conversas, agenda, alertas, atividades, treinamento`
- `obras` → apenas `obras, brindes`

## Patterns de Guard Migrados (Story 35-5)

**Guard de redirect:**
```ts
if (!(await canAccess(user.id, user.orgId, "<module>"))) {
  redirect("/dashboard")
}
```

**UI conditional:**
```ts
const isAdmin = await canAccess(user.id, user.orgId, "sistema")
// usar como gate de admin powers intra-página
```

**Exceção permitida:** `configuracoes/perfil-acesso/page.tsx` MANTÉM `user.role !== "admin"` hardcoded (fora do escopo do Epic).

## Grep para Validar Migração Completa

```bash
# Pages que deveriam ter sido migradas:
grep -rn "user\.role" packages/web/src/app/dashboard/ --include="*.tsx"
# Esperado: apenas
#   - layout.tsx (display via prop SidebarNav)
#   - perfil-acesso/page.tsx (guard hardcoded por design)

# Variáveis de role helper esquecidas:
grep -rln "isObras\|isAdminOrSupervisor" packages/web/src/app/dashboard/
# Esperado: vazio (foram removidas)

# Confirmação positiva de uso de canAccess:
grep -rln "canAccess" packages/web/src/app/dashboard/
# Esperado: ~28 arquivos
```

## Pitfalls Conhecidos

1. **`properties/[id]/page.tsx` foi omitido da Story 35-5** — usar como teste de regressão em stories futuras que ampliem permissions.
2. **AC:10 da Story 35-5** tem ambiguidade: texto sugere `obras` vê Config, mas seed da migration 047 não dá `configuracoes` para `obras`. A interpretação correta foi seguir o seed (data-driven > literal). Em stories futuras, alinhar seed e ACs antes de validar.
3. **Erro pré-existente `Cannot find module zod`** em `packages/shared/src/types/commercial-rules.ts` é herdado e NÃO bloqueia gates do Epic 35.
4. **6 warnings de lint pré-existentes** em `email-automations`, `email-blasts`, `cron/enrich-leads`, `campaigns/meta/[campaign_id]`, `campaigns/page` — herdados, não bloqueiam.

## Comandos Padrão de Validação

```bash
pnpm --filter @trifold/web run type-check
pnpm --filter @trifold/web run lint
```

Esperado em estado limpo do Epic 35: 1 erro de type-check pré-existente (zod) + 0 lint errors + 6 lint warnings pré-existentes.
