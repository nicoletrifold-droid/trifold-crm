# Story 25.1 — Backend: Endpoint de Ações em Campanhas Meta

## Status
Done

## Executor Assignment
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: ["api_security_review", "write_operation_validation", "audit_log_check", "migration_review"]

## Story
**As a** gestor de tráfego do Trifold (role: admin),
**I want** um endpoint que execute ações de escrita em campanhas Meta (pausar, retomar, ajustar budget) diretamente pelo CRM,
**so that** eu possa reagir rapidamente a alertas sem precisar abrir o Business Manager da Meta.

## Contexto

**Epic 25 — Meta Ads Campaign Actions**

O painel Meta Ads (`/dashboard/campaigns/meta`) já exibe todas as métricas via integração completa do Epic 16 + Epic 19. Toda a integração é somente leitura. Esta story adiciona as primeiras operações de escrita na Meta Graph API.

**Arquivos relevantes:**
- `packages/shared/src/meta/client.ts` — `metaFetch()` já suporta `method: 'POST'` com retry e backoff exponencial
- `packages/shared/src/meta/errors.ts` — `MetaOAuthException`, `MetaPermissionError` para tratamento tipado de erros
- `packages/web/src/app/api/meta-ads/campaigns/[campaign_id]/route.ts` — padrão de endpoint: `requireAuth()`, query `meta_campaigns` por `meta_campaign_id + org_id`
- `packages/web/src/lib/api-auth.ts` — `requireAuth()` + `requireRole(appUser, allowedRoles)` → retorna 403 se não autorizado
- `packages/web/src/app/api/cron/meta-sync-entities/route.ts` — padrão de leitura do token: query `meta_ad_accounts.access_token` via `createAdminClient()`
- `supabase/migrations/015_meta_marketing_api.sql` — schema atual do `meta_sync_log` (ver Dev Notes)

**Schema `meta_ad_accounts` relevante:**
- `id UUID`, `org_id UUID`, `meta_account_id TEXT`, `access_token TEXT`, `status TEXT`
- Token para chamadas à API: `account.access_token`

**Schema `meta_campaigns` relevante:**
- `id UUID`, `org_id UUID`, `meta_campaign_id TEXT`, `name TEXT`, `status TEXT`, `daily_budget NUMERIC`

## Acceptance Criteria

1. `POST /api/meta-ads/campaigns/[campaign_id]/action` existe e aceita body `{ action: 'pause' | 'resume' | 'set_budget', value?: number }`.

2. `action: 'pause'` → `POST /{meta_campaign_id}` com `{ status: 'PAUSED' }` na Meta Graph API v21.0; retorna 200 com `{ success: true, action: 'pause', campaign_id, new_status: 'PAUSED', executed_at }`.

3. `action: 'resume'` → `POST /{meta_campaign_id}` com `{ status: 'ACTIVE' }`; retorna 200 com `new_status: 'ACTIVE'`.

4. `action: 'set_budget'` → `POST /{meta_campaign_id}` com `{ daily_budget: value }` (value em centavos); retorna 200 com `new_budget: value`.

5. Validações de entrada:
   - `action` inválido → 400 `{ error: 'INVALID_ACTION' }`
   - `set_budget` sem `value` ou `value < 100` (< R$1,00) → 400 `{ error: 'INVALID_BUDGET', message: 'Budget mínimo: R$1,00 (100 centavos)' }`
   - Campanha não encontrada para o `org_id` do usuário → 404 `{ error: 'CAMPAIGN_NOT_FOUND' }`

6. Guard de role: usuário sem role `admin` → 403 `{ error: 'Forbidden' }`. Usa `requireRole(appUser, ['admin'])`.

7. Guard de propriedade (anti-IDOR): campanha buscada com `meta_campaign_id = [campaign_id] AND org_id = appUser.org_id`. Nunca usa apenas o parâmetro de URL.

8. Cada ação bem-sucedida registrada em `meta_sync_log` com:
   - `sync_type: 'campaign_action'` (requer migration — ver Dev Notes)
   - `org_id`, `status: 'success'`, `started_at`, `finished_at`, `records_synced: 1`
   - `details JSONB`: `{ action, campaign_id, campaign_name, old_value, new_value, executed_by: userId }`

9. Erros da Meta API mapeados para respostas tipadas:
   - `MetaOAuthException` → 502 `{ error: 'API_ERROR', code: 'OAUTH_EXCEPTION', message }`
   - `MetaPermissionError` → 502 `{ error: 'API_ERROR', code: 'PERMISSION_DENIED', message }`
   - Outros erros → 502 `{ error: 'API_ERROR', message }`

10. `pnpm run type-check` e `pnpm run lint` passam sem erros.

## Estimativa
**Complexidade:** M (Medium) — 3–4h. Migration simples + 1 novo endpoint + sem UI.

## Fora do Escopo (OUT)
- UI de ações (Story 25.2)
- Alerta Telegram ao pausar/retomar (pode ser adicionado em story futura)
- Ações em AdSets ou Ads individuais (apenas campanhas por ora)
- Undo/reverter ação (o histórico em meta_sync_log permite auditoria manual)

## Riscos
- **`sync_type` CHECK constraint:** `meta_sync_log.sync_type` aceita apenas `('entities', 'insights', 'backfill')`. A migration desta story adiciona `'campaign_action'` ao constraint. Se migration falhar, logar ação em `details` de um tipo existente como fallback temporário.
- **Token sem permissão `ads_management`:** Verificar antes de implementar: `POST /act_{id}/campaigns?fields=id` com o token deve retornar 200. Se falhar com `MetaPermissionError`, a feature não funciona — escalar para configurar System User com permissão correta no Business Manager.
- **Meta API retorna `success: false`:** A Graph API pode retornar HTTP 200 com `{ success: false }` para algumas operações. Verificar o campo `success` na resposta além do status HTTP.

## Tasks / Subtasks

- [x] **Task 1 — Migration: Atualizar `meta_sync_log`** (AC: 8)
  - [x] 1.1 Criar `supabase/migrations/028_meta_campaign_actions.sql` (número sequencial correto era 028)
  - [x] 1.2 Alterar CHECK constraint de `sync_type`: inclui `'campaign_action'` e `'intelligence_alert'`
  - [x] 1.3 Adicionar coluna `executed_by UUID REFERENCES public.users(id) ON DELETE SET NULL` (nullable — FK para public.users conforme should-fix do PO)
  - [x] 1.4 Adicionar coluna `details JSONB` (nullable)
  - [x] 1.5 Aplicar migration: via Supabase Management API (supabase db push bloqueado por conflito de versão 021)

- [x] **Task 2 — Endpoint `POST /api/meta-ads/campaigns/[campaign_id]/action`** (AC: 1–9)
  - [x] 2.1 Criar arquivo `packages/web/src/app/api/meta-ads/campaigns/[campaign_id]/action/route.ts`
  - [x] 2.2 Implementar `requireAuth()` + `requireRole(appUser, ['admin'])` → 403 se não admin
  - [x] 2.3 Parse e validar body: `action` obrigatório, `value` obrigatório se `set_budget`, `value >= 100` se `set_budget`
  - [x] 2.4 Buscar campanha via `meta_campaign_id + org_id` → 404 se não encontrado
  - [x] 2.5 Buscar token via `meta_ad_accounts` → 502 se não encontrado
  - [x] 2.6 Mapear `action → body Meta API`
  - [x] 2.7 Chamar `metaFetch` com try/catch para `MetaOAuthException` e `MetaPermissionError`
  - [x] 2.8 Verificar `response.success === false`
  - [x] 2.9 Registrar em `meta_sync_log` com `sync_type: 'campaign_action'`, `executed_by`, `details`
  - [x] 2.10 Retornar `{ success: true, action, campaign_id, new_status?, new_budget?, executed_at }`

- [x] **Task 3 — Verificação de tipos e lint** (AC: 10)
  - [x] 3.1 `pnpm run type-check` — 8/8 tasks successful, zero erros
  - [x] 3.2 `pnpm run lint` — zero erros no `action/route.ts`; erros pré-existentes em outros arquivos (não relacionados a esta story)

- [x] **Task 4 — Teste manual** (todos os ACs)
  - [x] 4.1 `pause` → 200 `{ success: true, action: 'pause', new_status: 'PAUSED' }` ✅
  - [x] 4.2 `resume` → 200 `{ success: true, action: 'resume', new_status: 'ACTIVE' }` ✅
  - [x] 4.3 `set_budget value=2500` → 200 `{ success: true, new_budget: 2500 }` ✅
  - [x] 4.4 Registro em `meta_sync_log` com `sync_type = 'campaign_action'`, `details` completo, `executed_by` correto ✅
  - [x] 4.5 Usuário broker → 403 `{ error: 'Forbidden' }` ✅
  - [x] 4.6 `campaign_id` inexistente (admin) → 404 `{ error: 'CAMPAIGN_NOT_FOUND' }` ✅
  - [x] Sem autenticação → 401 `{ error: 'Unauthorized' }` ✅
  - [x] `action: 'delete'` → 400 `{ error: 'INVALID_ACTION' }` ✅
  - [x] `set_budget` sem value → 400 `{ error: 'INVALID_BUDGET' }` ✅
  - [x] `set_budget value: 50` (< R$1,00) → 400 `{ error: 'INVALID_BUDGET' }` ✅

- [x] **Task 5 — Aplicar fixes pós-gate (Aria CONCERNS V1.3)**
  - [x] 5.1 I-1: audit log com error handling em route.ts
  - [x] 5.2 I-6: log estruturado de sucesso
  - [x] 5.3 I-2: rollback plan inline em 028_meta_campaign_actions.sql

## Dev Notes

**Padrão de endpoint a replicar:**
`packages/web/src/app/api/meta-ads/campaigns/[campaign_id]/route.ts` — mesma estrutura de auth, query de campanha por `meta_campaign_id + org_id`, retorno tipado.

**Padrão de auth e role:**
```typescript
const auth = await requireAuth()
if (auth.error) return auth.error
const { supabase, user, appUser } = auth

const forbidden = requireRole(appUser, ['admin'])
if (forbidden) return forbidden
```

**Padrão de leitura do token (de meta-sync-entities/route.ts):**
```typescript
const { data: account } = await supabase
  .from('meta_ad_accounts')
  .select('access_token')
  .eq('org_id', appUser.org_id)
  .eq('status', 'active')
  .single()
if (!account?.access_token) return NextResponse.json({ error: 'No active Meta account configured' }, { status: 502 })
```

**Chamada de escrita via metaFetch (padrão do client.ts):**
```typescript
import { metaFetch, MetaOAuthException, MetaPermissionError } from '@trifold/shared'

try {
  await metaFetch(campaign.meta_campaign_id, account.access_token, {
    method: 'POST',
    body: actionBody,
  })
} catch (err) {
  if (err instanceof MetaOAuthException) {
    return NextResponse.json({ error: 'API_ERROR', code: 'OAUTH_EXCEPTION', message: err.message }, { status: 502 })
  }
  if (err instanceof MetaPermissionError) {
    return NextResponse.json({ error: 'API_ERROR', code: 'PERMISSION_DENIED', message: err.message }, { status: 502 })
  }
  return NextResponse.json({ error: 'API_ERROR', message: String(err) }, { status: 502 })
}
```

**Meta API verifica `success`:**
```typescript
// Meta Graph API pode retornar HTTP 200 com { success: false }
// metaFetch retorna o body parseado — verificar:
const result = await metaFetch<{ success?: boolean }>(...)
if (result.success === false) {
  return NextResponse.json({ error: 'API_ERROR', message: 'Meta API returned success: false' }, { status: 502 })
}
```

**Migration — número correto:**
Verificar a última migration em `supabase/migrations/` e usar o próximo número sequencial. Atualmente o último é `018_*` (verificar antes de criar).

**Nota sobre `details JSONB`:**
`meta_sync_log` atualmente não tem coluna `details`. A migration adiciona essa coluna. Verificar se outros crons precisam ser atualizados para passar `details: null` (campo nullable, sem impacto nos usos existentes).

**Padrão de log existente (não quebrar):**
```typescript
// Padrão atual em meta-sync-entities/route.ts:
await supabase.from('meta_sync_log').insert({
  org_id: account.org_id,
  sync_type: 'entities',
  started_at: new Date().toISOString(),
  status: 'running',
})
// Após execução: UPDATE com finished_at, records_synced, status
// Para campaign_action: INSERT direto com status 'success' (sem running intermediário)
```

**Testing:**
- Projeto não tem suite de testes automatizados para rotas de API (padrão: type-check + lint + teste manual)
- Validar com conta real VIND (`act_324928230003186`) em campanha pausável/retomável
- ⚠️ Testar em campanha de baixo spend para evitar impacto acidental em campanhas ativas de alto volume

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled — qualidade via type-check + lint + revisão manual do @architect.

## File List

- `supabase/migrations/028_meta_campaign_actions.sql` — nova migration: ALTER CHECK constraint + ADD COLUMN executed_by (public.users FK) + ADD COLUMN details JSONB
- `packages/web/src/app/api/meta-ads/campaigns/[campaign_id]/action/route.ts` — novo endpoint POST: pause/resume/set_budget com role guard, anti-IDOR, audit log

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-11 | 1.0 | Story criada | River (@sm) |
| 2026-05-11 | 1.1 | Validação GO 9/10 — should-fix: verificar FK executed_by (auth.users vs public.users) antes da migration | Pax (@po) |
| 2026-05-11 | 1.2 | Implementação completa: migration 028, endpoint POST, todos os 10 ACs testados com token real | Dex (@dev) |
| 2026-05-12 | 1.3 | Quality gate: **CONCERNS** — 10/10 ACs cumpridos, segurança/anti-IDOR/role-guard OK. Issue medium-high I-1 (audit log sem error handling) e 5 issues menores documentadas. Não bloqueia push. Gate file em `docs/qa/gates/25-1-architect-gate.md` | Aria (@architect) |
| 2026-05-12 | 1.3 | Fixes pós-gate Aria CONCERNS V1.3: I-1 audit log err handling, I-6 log success, I-2 rollback inline | Dex (@dev) |
| 2026-05-12 | 1.4 | Re-review PASS — fixes aplicados validados | Aria (@architect) |

## QA Results

**Reviewer:** Aria (@architect)
**Data:** 2026-05-12
**Verdict:** CONCERNS (não bloqueia push)
**Gate file:** `/Users/ogabrielhr/trifold-crm/docs/qa/gates/25-1-architect-gate.md`

### Resumo

Implementação cumpre todos os 10 ACs, segue padrões do projeto fielmente (auth, anti-IDOR, role guard, metaFetch tipado), e foi validada com testes manuais reais contra a conta Vind. Migration é idempotente e usa FK em `public.users` conforme should-fix do PO V1.1.

### 7 Quality Checks

| Check | Resultado |
|-------|-----------|
| 1. Code review | pass |
| 2. Tests (manual) | n/a — cobertura manual adequada |
| 3. Acceptance criteria | pass (10/10) |
| 4. No regressions | pass |
| 5. Performance | pass |
| 6. Security | pass com ressalvas (anti-IDOR OK, role guard OK, token não vaza; audit log fragility documentada) |
| 7. Documentation | pass |

### Issues (resumo — detalhes no gate file)

| ID | Severity | Resumo |
|----|----------|--------|
| I-1 | medium-high | INSERT em `meta_sync_log` (linha 136) sem error handling — falha silenciosa quebraria AC 8 sem alarme. Recommended fix: capturar `{ error: logError }` e logar em `console.error`. |
| I-2 | low | Rollback da migration não documentado inline. |
| I-3 | low | Sem upper bound em `value` para `set_budget`. |
| I-4 | low | `metaResult` declarado `let` sem inicializador. |
| I-5 | low | INSERT em `meta_sync_log` depende implicitamente da RLS policy `org_isolation` — documentar dependência. |
| I-6 | info | Sem `console.log` estruturado de sucesso para correlação em incidente. |

### Decisão

**CONCERNS** (não FAIL): funcionalidade correta, ACs cumpridos, testes passam. Issues são hardening/defesa em profundidade, não bugs.

**Não bloqueia:**
- Push via `@devops *push` (pode prosseguir)
- `@pm *create-epic 27` (story 25.1 não bloqueia Epic 27)

---

Re-review V1.4: PASS — todos os 3 fixes (I-1, I-6, I-2) aplicados conforme recomendado. Status transita Ready for Review → Done. Próximo: `@devops *push`.

**Recomendação ao lead:** ou Opção A (push agora + story fast-follow 25.1.1 para I-1/I-2/I-6) ou Opção B (micro-iteração @dev em ~30min antes do push). Detalhes no gate file.
