# Story 53-2 — Nicole: API CRUD para agent_prompts + RLS Hardening

## Metadata
- **Epic:** 53 — Nicole Prompts Configuráveis via Admin
- **Story:** 53-2
- **Status:** Ready for Review
- **Priority:** P1 — habilita a edição via UI (Story 53-3); o endurecimento de RLS é requisito de segurança do produto
- **Complexity:** S (2-3h)
- **Created:** 2026-06-13
- **Author:** @sm (River)

### Executor Assignment
- **Executor Principal:** @dev (Dex) — criação das rotas de API
- **Tarefa paralela:** @data-engineer (Dara) — migration de RLS (pode ser executada antes ou junto)
- **Quality Gate:** @architect (Aria)
- **Quality Gate Tools:** `[typecheck, lint, manual-curl-test]`
- **Autossuficiente:** sim — não depende da Story 53-1 (pode ser desenvolvida em paralelo; porém para testar o fluxo completo, 53-1 deve estar mergeada)

---

## User Story

**Como** admin do painel Trifold,
**Quero** ter endpoints de API para visualizar e editar cada prompt individual da Nicole (`agent_prompts`), com garantia de acesso exclusivo para role `admin` tanto na aplicação quanto no banco de dados,
**Para que** a interface de edição (Story 53-3) tenha uma API segura para chamar e que o RLS impeça qualquer acesso não-autorizado independentemente da camada de aplicação.

---

## Context

### Estado atual

- `PATCH /api/agent-config/route.ts` já existe e já tem `requireRole(["admin"])` — cobre os 3 campos de `agent_config` (`personality_prompt`, `greeting_message`, `out_of_hours_message`)
- **API para `agent_prompts` NÃO existe** — nenhuma rota em `packages/web/src/app/api/` serve esta tabela
- **RLS permissiva**: `agent_config_manage` e `agent_prompts_manage` em `supabase/migrations/004_rls_policies.sql` (linhas 204-214) usam `public.is_admin_or_supervisor()`, mas o requisito do produto é **somente admin**
  - A função `public.is_admin()` já existe (criada em `supabase/migrations/047_roles_permissions.sql`)
  - A API existente (`/api/agent-config`) já tem `requireRole(["admin"])` — mas a RLS está mais permissiva que a API. Isto é tecnicamente inofensivo (a API bloqueia supervisores antes do DB) mas viola o princípio de defense-in-depth

### Padrão de rota existente

A rota `/api/admin/properties/route.ts` serve de referência:
- `requireAuth()` de `@web/lib/api-auth`
- Verificação de role inline: `if (!ALLOWED_ROLES.includes(appUser.role))`
- Para esta story: `ALLOWED_ROLES = ["admin"]` (somente admin)

### Slugs válidos (fixos, não criáveis via API)

Os 7 slugs existentes após seed (`scripts/seed-prompts.ts`):
| Slug | Nome | Tipo |
|------|------|------|
| `system-personality` | Personalidade Nicole | system |
| `guardrails` | Guardrails da IA | guardrail |
| `qualification-flow` | Fluxo de Qualificacao | qualification |
| `property-presentation` | Apresentacao de Empreendimentos | system |
| `visit-scheduling` | Agendamento de Visitas | system |
| `handoff-summary` | Resumo para Corretor | handoff |
| `off-hours` | Mensagem Fora do Horario | system |

A API desta story permite **apenas UPDATE de `content`** — criação e deleção de slugs são operações de infra (via `scripts/seed-prompts.ts`), não disponíveis via API pública.

---

## Acceptance Criteria

1. `GET /api/admin/agent-prompts` retorna todos os registros de `agent_prompts` da org autenticada (campos: `id`, `slug`, `name`, `type`, `content`, `is_active`), com status 200. Retorna 403 se o usuário não for admin. Retorna 401 se não autenticado.

2. `GET /api/admin/agent-prompts/[slug]` retorna o registro individual pelo slug, com status 200. Retorna 404 se o slug não existe na org. Retorna 403 se não for admin.

3. `PUT /api/admin/agent-prompts/[slug]` aceita `{ content: string }` no body, valida que `content` é string não-vazia (mínimo 10 caracteres), atualiza `content` do registro e retorna o registro atualizado com status 200. Retorna 404 se slug não existe. Retorna 400 se body inválido. Retorna 403 se não for admin.

4. Nenhuma rota aceita `POST` (criação) ou `DELETE` (remoção) de registros de `agent_prompts` — slugs são gerenciados via seed script, não via API pública. Responder 405 Method Not Allowed para esses métodos.

5. Migration `095_harden_rls_agent_prompts_admin_only.sql` (ou o próximo slot livre confirmado — ver Dev Notes) é criada e pode ser aplicada sem erros. Ela substitui as políticas `agent_config_manage` e `agent_prompts_manage` para usar `public.is_admin()` em vez de `public.is_admin_or_supervisor()`. As políticas de SELECT (`agent_config_select`, `agent_prompts_select`) **não são alteradas** — supervisores continuam podendo ler os dados.

6. Após a migration aplicada, um usuário com role `supervisor` não consegue realizar `UPDATE` ou `INSERT` na tabela `agent_config` ou `agent_prompts` diretamente pelo Supabase (tentativa resulta em violação de RLS). Supervisores ainda conseguem fazer `SELECT` (leitura).

---

## Tasks / Subtasks

- [x] **Task 1 — Rota GET/PUT list: `packages/web/src/app/api/admin/agent-prompts/route.ts`** (AC: 1, 4)
  - [x] Criar arquivo `route.ts` com handler `GET`
  - [x] `GET`: `requireAuth()` → verificar `appUser.role === "admin"` (401/403) → query `agent_prompts` com `.eq("org_id", appUser.org_id)` → retornar `{ data: prompts }`
  - [x] Garantir que `POST` retorna 405 (pode ser omitido para 405 automático do Next.js ou handler explícito)

- [x] **Task 2 — Rota GET/PUT individual: `packages/web/src/app/api/admin/agent-prompts/[slug]/route.ts`** (AC: 2, 3, 4)
  - [x] Criar arquivo `route.ts` dentro do segmento dinâmico `[slug]`
  - [x] `GET`: `requireAuth()` → check admin → `const { slug } = await params` (Next.js 16 — params é Promise, ver Dev Notes) → `.eq("slug", slug).maybeSingle()` → 404 se null → retornar `{ data: prompt }`
  - [x] `PUT`: `requireAuth()` → check admin → `const { content } = await request.json()` → validar `typeof content === "string" && content.trim().length >= 10` (retornar 400 caso contrário) → `.update({ content }).eq("org_id", ...).eq("slug", ...)` → `.maybeSingle()` → 404 se não encontrado → retornar `{ data: updatedPrompt }`
  - [x] `DELETE` e `POST` implicitamente 405 pelo Next.js App Router (não exportar handlers para esses métodos)

- [x] **Task 3 — Migration de RLS: `supabase/migrations/096_harden_rls_agent_prompts_admin_only.sql`** (@data-engineer)
  - [x] **CRÍTICO — escolher slot livre:** confirmado via `git log --all --name-only | grep 'migrations/0'` — o slot 095 JÁ ESTÁ OCUPADO (`095_knowledge_base_null_empreendimento_global.sql` em `origin/main`, commit e3ca5bc). Nenhum slot 096+ existe. **Slot escolhido: 096** (próximo livre real). NÃO reutilizados 087/088/095.
  - [x] Criar arquivo de migration com:
    ```sql
    -- Drop existing permissive policies
    DROP POLICY IF EXISTS "agent_config_manage" ON agent_config;
    DROP POLICY IF EXISTS "agent_prompts_manage" ON agent_prompts;

    -- Recreate with admin-only write access
    CREATE POLICY "agent_config_manage" ON agent_config
      FOR ALL USING (org_id = public.user_org_id() AND public.is_admin());

    CREATE POLICY "agent_prompts_manage" ON agent_prompts
      FOR ALL USING (org_id = public.user_org_id() AND public.is_admin());
    ```
  - [x] Confirmar que `public.is_admin()` está disponível no remote (função criada em `047_roles_permissions.sql`)
  - [ ] ~~Aplicar via `supabase db push` ou MCP~~ — **NÃO APLICADA**. Por instrução explícita do usuário, apenas o arquivo foi criado. Aplicação manual via Management API fica pendente de autorização do usuário (deploy posterior). SELECT policies preservadas no SQL (não tocadas).

- [x] **Task 4 — Typecheck e lint** (AC: todos)
  - [x] `pnpm --filter @trifold/web type-check` — sem novos erros (os 4 erros existentes são pré-existentes em arquivos untracked de email-editor/visual-editor, não relacionados a esta story)
  - [x] `eslint` nos arquivos novos — zero erros
  - [ ] Teste manual com curl/Postman — pendente (requer servidor + tokens admin/supervisor; a ser executado pelo @architect no quality gate / após deploy)

---

## Dev Notes

### Importações e padrão de autenticação

```typescript
// packages/web/src/app/api/admin/agent-prompts/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (appUser.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  // ...
}
```

**Por que não usar `requireRole`?** A função `requireRole(appUser, ["admin"])` de `@web/lib/api-auth` é a opção preferida (mais idiomática). Verificar se ela retorna um `NextResponse` de erro (403) ou `null` quando OK. Se a assinatura for compatível, usar `requireRole` em vez do check manual — padrão idêntico ao `PATCH /api/agent-config`.

### Estrutura de diretórios

```
packages/web/src/app/api/admin/
├── agent-prompts/
│   ├── route.ts          ← GET (list)
│   └── [slug]/
│       └── route.ts      ← GET (detail) + PUT (update content)
```

### Parâmetro de rota dinâmica

```typescript
// packages/web/src/app/api/admin/agent-prompts/[slug]/route.ts
// IMPORTANTE: Next.js 16 — `params` é uma Promise e DEVE ser awaited.
// Padrão confirmado no repo (ex: api/brokers/[id]/route.ts):
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  // ...
}
```

### Validação de `content` no PUT

Mínimo 10 caracteres é uma heurística básica para evitar envio acidental de string vazia. O admin edita prompts completos que tipicamente têm centenas de caracteres. Sem validação de conteúdo semântico (isso é responsabilidade do admin).

### Sobre o slot de migration

**ATENÇÃO — slot 087 NÃO está livre.** A memória do @data-engineer registra drift de migrations: os arquivos 074-094 já foram aplicados em prod (deploy 2026-06-11, `docs/deploy/migrations-prod-checklist-2026-06-11.md`) e/ou existem nas branches `perf/reduce-db-load` e `security/remove-hardcoded-credentials` (incluindo `087`/`088` de performance). A branch atual (`feat/epic-51-*`) só tem até `073`/`085` em disco, mascarando os slots ocupados.

**Procedimento obrigatório antes de criar o arquivo:**
1. `git log --all --name-only | grep 'migrations/0'` — descobrir o maior número usado em QUALQUER branch (não apenas a atual).
2. `supabase migration list` — confirmar o maior número aplicado em prod.
3. Usar o próximo número acima do maior dos dois (provável `095`). Renomear AC/Task/File List de acordo.

**CRÍTICO:** Este projeto tem apenas 1 Supabase (produção). O padrão do projeto é aplicação MANUAL via Management API (NÃO `supabase db push`, por causa de colisões de numeração) — ver [[project_prod_deploy_migrations_074_094]]. A migration é idempotente (`DROP POLICY IF EXISTS`) e não-destrutiva. Confirmar com o usuário antes de aplicar.

**Rollback:** se a política admin-only causar problema, reaplicar a versão `is_admin_or_supervisor()` da `004_rls_policies.sql` (DROP POLICY + CREATE POLICY com a função antiga). Documentar esse SQL de rollback no cabeçalho da migration.

### Sem testes automatizados para esta story

A API é simples (CRUD direto, sem lógica de negócio). O teste manual com curl é suficiente. Se o projeto tiver testes de integração (E2E com Playwright), adicionar um caso mínimo.

---

## Testing

**Tipo:** Teste manual via curl / Postman

**Sequência de teste manual:**

```bash
# 1. Obter token de admin (via Supabase Auth ou sessão existente)
TOKEN_ADMIN="..."
TOKEN_SUPERVISOR="..."

# 2. GET list — deve retornar 200 com array de 7 prompts
curl -H "Authorization: Bearer $TOKEN_ADMIN" \
  https://app.trifold.com.br/api/admin/agent-prompts

# 3. GET individual — deve retornar 200 com o prompt
curl -H "Authorization: Bearer $TOKEN_ADMIN" \
  https://app.trifold.com.br/api/admin/agent-prompts/system-personality

# 4. PUT update — deve retornar 200 com prompt atualizado
curl -X PUT -H "Authorization: Bearer $TOKEN_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"content": "Novo conteúdo de teste para o prompt (mais de 10 chars)"}' \
  https://app.trifold.com.br/api/admin/agent-prompts/system-personality

# 5. PUT com supervisor — deve retornar 403
curl -X PUT -H "Authorization: Bearer $TOKEN_SUPERVISOR" \
  -H "Content-Type: application/json" \
  -d '{"content": "Tentativa de supervisor"}' \
  https://app.trifold.com.br/api/admin/agent-prompts/guardrails

# 6. PUT com content vazio — deve retornar 400
curl -X PUT -H "Authorization: Bearer $TOKEN_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"content": ""}' \
  https://app.trifold.com.br/api/admin/agent-prompts/guardrails

# 7. GET slug inexistente — deve retornar 404
curl -H "Authorization: Bearer $TOKEN_ADMIN" \
  https://app.trifold.com.br/api/admin/agent-prompts/nao-existe
```

**Teste de RLS (após migration):**
No Supabase Studio ou via SQL, executar com service_role e depois simular um user supervisor:
```sql
-- Como usuário supervisor, tentar UPDATE (deve falhar com RLS violation)
UPDATE agent_prompts SET content = 'teste' WHERE slug = 'guardrails';
-- Esperado: ERROR: new row violates row-level security policy
```

---

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> `coderabbit_integration.enabled` não está configurado em `core-config.yaml`.
> Validação de qualidade via revisão manual com @architect.

---

## File List

**Arquivos criados:**
- `packages/web/src/app/api/admin/agent-prompts/route.ts`
- `packages/web/src/app/api/admin/agent-prompts/[slug]/route.ts`
- `supabase/migrations/096_harden_rls_agent_prompts_admin_only.sql` (slot 096 — 095 estava ocupado em `origin/main`; ver Dev Agent Record)

**Arquivos a NÃO modificar:**
- `packages/web/src/app/api/agent-config/route.ts` — já está correto (requireRole admin)
- `supabase/migrations/004_rls_policies.sql` — não editar arquivos de migration antigos (criar novo)
- Qualquer arquivo de pipeline ou UI

---

## Dev Agent Record

### Agent Model Used
- Opus 4.8 (1M context) — @dev (Dex)

### Completion Notes
- **Rotas de API criadas** seguindo o padrão confirmado do repo (`api/agent-config/route.ts` e `api/brokers/[id]/route.ts`): `requireAuth()` para 401, `requireRole(appUser, ["admin"])` para 403, `params` como `Promise` com `await` (Next.js modificado deste repo — ver `packages/web/AGENTS.md`).
- **GET list** (`route.ts`): retorna `{ data: [...] }` com campos `id, slug, name, type, content, is_active` filtrados por `org_id`, ordenados por `slug`.
- **GET individual** (`[slug]/route.ts`): `maybeSingle()` → 404 se não encontrado.
- **PUT** (`[slug]/route.ts`): valida `content` string com `trim().length >= 10` (400 caso contrário), `try/catch` no `request.json()` (400 em JSON inválido), atualiza só `content`, `maybeSingle()` → 404 se slug inexistente. Não expõe `POST`/`DELETE` → Next.js App Router responde 405 automaticamente (AC4).
- **Migration slot — decisão crítica:** o @po estimou 095, mas a verificação obrigatória mostrou que **095 já está ocupado** (`095_knowledge_base_null_empreendimento_global.sql` em `origin/main`, commit e3ca5bc). `git log --all --name-only | grep -E 'migrations/09[6-9]'` não retornou nenhum slot 096+. Portanto o próximo slot livre real é **096**. O cabeçalho da migration documenta a escolha e inclui o SQL de rollback comentado.
- **Migration NÃO aplicada em produção.** Apenas o arquivo foi criado, conforme instrução explícita. Aplicação manual via Management API fica pendente de autorização do usuário. Migration é idempotente (`DROP POLICY IF EXISTS`) e não-destrutiva; SELECT policies preservadas.
- **Validações:** `eslint` nos arquivos novos = 0 erros. `type-check` do pacote tem 4 erros pré-existentes (untracked: `email-editor-modal.tsx`, `visual-editor.tsx` / módulo `react-email-editor`), sem relação com esta story e não introduzidos por estas mudanças.
- **Teste manual via curl** não executado (requer servidor em execução + tokens admin/supervisor) — fica para o quality gate (@architect) / pós-deploy, conforme seção Testing.

### File List
- `packages/web/src/app/api/admin/agent-prompts/route.ts` (criado)
- `packages/web/src/app/api/admin/agent-prompts/[slug]/route.ts` (criado)
- `supabase/migrations/096_harden_rls_agent_prompts_admin_only.sql` (criado)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-13 | 1.0 | Draft inicial criado | @sm (River) |
| 2026-06-13 | 1.1 | Validação PO (GO 8/10 pós-correção). FIX slot de migration 087→095 (colisão confirmada: 074-094 já tomados em prod/branches) + procedimento de verificação + rollback. FIX params Next.js 16 (Promise + await). Status Draft → Ready | @po (Pax) |
| 2026-06-13 | 1.2 | Implementação: 2 rotas de API admin-only criadas + migration de RLS hardening. Slot de migration corrigido 095→096 (095 ocupado em origin/main). Migration NÃO aplicada (pendente autorização). Status Ready → Ready for Review | @dev (Dex) |
| 2026-06-13 | 1.3 | QA gate: CONCERNS. Código das rotas e migration corretos (todos os ACs); concern de regressão sobre business_hours em agent_config a verificar antes de aplicar 096. | @qa (Quinn) |

## QA Results

### Review Date: 2026-06-13
### Reviewed By: Quinn (Test Architect)

**Escopo revisado:** `route.ts` + `[slug]/route.ts` + migration `096_harden_rls_agent_prompts_admin_only.sql`. Funções de suporte verificadas: `requireAuth`/`requireRole` (api-auth.ts), `is_admin()` (047_roles_permissions.sql:28), policies originais (004_rls_policies.sql:201-214).

**7 Quality Checks:**
1. Code review — PASS. Padrão idêntico ao repo (requireAuth→401, requireRole→403, params Promise+await). Limpo.
2. Unit tests — N/A (CRUD direto; teste manual via curl conforme story).
3. Acceptance criteria — PASS (AC1-6 atendidos no código entregue; AC6 não verificável ao vivo pois migration não aplicada, mas o SQL está correto).
4. Regressions — CONCERNS (ver REG-001).
5. Performance — PASS.
6. Security — PASS (admin-only, org-scoped, content-only update, sem escalada).
7. Documentation — PASS (cabeçalho da migration documenta slot/rollback).

**Segurança (foco do gate):**
- PUT altera APENAS `content`: `.update({ content })`. slug vem da URL (filtro), org_id da sessão (filtro). Impossível alterar slug/type/is_active/org_id via body. CONFIRMADO.
- Org scoping: GET e PUT filtram `.eq("org_id", appUser.org_id)` derivado da sessão, nunca do input. Impossível editar prompt de outra org. CONFIRMADO.
- requireRole(["admin"]) em todos os 3 handlers → supervisor recebe 403 antes do banco. CONFIRMADO.
- Migration 096: `is_admin()` existe no schema (047), DROP IF EXISTS idempotente, SELECT policies preservadas, rollback documentado. CORRETO.
- Reliability: JSON malformado→400 (try/catch), content vazio/curto→400, erro DB→500. CONFIRMADO.

**Typecheck/lint:** type-check do pacote retorna só os 4 erros PRÉ-EXISTENTES (email-editor-modal.tsx / visual-editor.tsx / react-email-editor) — NENHUM dos arquivos da story. eslint nos 2 arquivos novos: exit 0.

**Issues:**
- REG-001 (medium): a migration 096 endurece o WRITE de TODA a tabela `agent_config` (FOR ALL), mas `agent_config.business_hours` é editado pela página `/dashboard/configuracoes/horario` cujo guard é `canAccess("configuracoes.horario")` e NÃO `role==admin`. Em orgs com role_permissions customizado (Epic 35) concedendo `configuracoes.horario` a não-admin, aplicar 096 quebraria silenciosamente o salvamento de horário (a Server Action de horario não trata o erro de `.update()`). No default hardcoded supervisor tem `configuracoes:false` (seguro). VERIFICAR role_permissions de prod antes de aplicar.
- SEC-002 (low): migration não aplicada → RLS do banco ainda permite supervisor escrever; guarda efetiva hoje é app-layer (presente e correta). Defense-in-depth completa ao aplicar 096. Estado intermediário aceitável.

### Gate Status

Gate: CONCERNS → docs/qa/gates/53.2-api-agent-prompts-rls.yml
