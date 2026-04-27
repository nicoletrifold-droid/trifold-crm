---
epic: 16
story: 16.4
title: Cron Sync — Hierarquia Campanhas/AdSets/Ads
status: Ready for Review
priority: P1-ALTO
created_at: 2026-04-24
created_by: River (@sm)
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: [cron_reliability, upsert_logic, rate_limit_compliance, pagination]
complexity: M
estimated_hours: 3
depends_on: [16.1, 16.2, 16.3]
---

# Story 16.4 — Cron Sync: Hierarquia Campanhas/AdSets/Ads

## Contexto

Stories 16.1 (Migration), 16.2 (Client) e 16.3 (Auth UI) estão em produção.
As tabelas `meta_campaigns`, `meta_adsets`, `meta_ads` existem no banco. O
`metaFetch()` está disponível em `@trifold/shared` com rate limiting, retry e
backoff. O token e ad_account_id estão armazenados em `meta_ad_accounts`.

Esta story cria o cron `/api/cron/meta-sync-entities` que roda a cada 4h e
sincroniza a hierarquia completa de campanhas → conjuntos de anúncios → anúncios
via Meta Marketing API, fazendo upsert nas tabelas correspondentes e logando
execuções em `meta_sync_log`.

## Story Statement

**Como** sistema Trifold CRM,
**Quero** sincronizar automaticamente a hierarquia de campanhas/AdSets/Ads da
Meta Marketing API a cada 4 horas,
**Para que** o dashboard de campanhas e o cálculo de ROAS tenham dados atualizados
sem intervenção manual.

## Acceptance Criteria

- [ ] **AC1:** Endpoint `GET /api/cron/meta-sync-entities` criado em
  `packages/web/src/app/api/cron/meta-sync-entities/route.ts`:
  - Protegido por `Authorization: Bearer {CRON_SECRET}` — retorna 401 se inválido
  - Busca todas as `meta_ad_accounts` com `status = 'active'` para a org
  - Executa sync completo (campanhas → adsets → ads) para cada conta ativa

- [ ] **AC2:** Sync de campanhas via `metaFetch()`:
  - `GET /act_{id}/campaigns?fields=id,name,objective,status,daily_budget,lifetime_budget,start_time,stop_time`
  - Paginação completa via `paging.next` até não haver mais páginas
  - Upsert em `meta_campaigns` com `onConflict: 'org_id,meta_campaign_id'`
  - Campos: `meta_campaign_id, name, objective, status, daily_budget, lifetime_budget, start_time, stop_time, synced_at`

- [ ] **AC3:** Sync de AdSets via `metaFetch()`:
  - `GET /act_{id}/adsets?fields=id,name,campaign_id,status,optimization_goal,daily_budget`
  - Paginação completa
  - Upsert em `meta_adsets` com `onConflict: 'org_id,meta_adset_id'`
  - Resolve `campaign_id` (UUID do banco) a partir do `campaign_id` da Meta usando lookup local

- [ ] **AC4:** Sync de Ads via `metaFetch()`:
  - `GET /act_{id}/ads?fields=id,name,adset_id,status,creative`
  - Paginação completa
  - Upsert em `meta_ads` com `onConflict: 'org_id,meta_ad_id'`
  - Resolve `adset_id` (UUID do banco) a partir do `adset_id` da Meta usando lookup local

- [ ] **AC5:** Log de execução em `meta_sync_log`:
  - Inserir registro com `started_at` antes de começar
  - Atualizar com `finished_at`, `status` ('success' | 'error'), `records_synced`, `api_calls_made`, `error_message`
  - Em caso de erro parcial: logar `status = 'error'` com `error_message` descritivo (schema só aceita 'running' | 'success' | 'error' — verificado em migration 015)

- [ ] **AC6:** Cron registrado em `vercel.json`:
  - `{"path": "/api/cron/meta-sync-entities", "schedule": "0 */4 * * *"}`
  - Roda às 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC

- [ ] **AC7:** `MetaOAuthException` tratado graciosamente:
  - Se token inválido: atualizar `meta_ad_accounts.status = 'error'`, logar em `meta_sync_log`, retornar 200 (não 5xx — Vercel não deve retentar por auth error)
  - Demais erros da Meta API: logar e retornar 500 para que Vercel alerte

- [ ] **AC8:** Zero erros de TypeScript (`npm run type-check` passa). Sem `any` explícito nas funções públicas.

## Scope

### IN (o que esta story implementa)
- `GET /api/cron/meta-sync-entities` — sync campanhas + adsets + ads
- Paginação completa para cada entidade
- Upsert idempotente (seguro para rodar múltiplas vezes)
- Log em `meta_sync_log`
- Registro do cron em `vercel.json`
- Tratamento de `MetaOAuthException` sem crash

### OUT (fora desta story)
- Sync de insights diários (→ Story 16.5)
- UI de dashboard de campanhas (→ Story 16.8)
- Trigger manual via UI "Sincronizar agora" (→ Story 16.8)
- Backfill histórico (→ Story 16.7)
- Alertas de falha de sync (→ Story 16.13)

## Dev Notes

### Estrutura de arquivos a criar

```
packages/web/src/app/api/cron/meta-sync-entities/
└── route.ts    # GET handler do cron
```

### Padrão de cron existente (replicar exatamente)

```typescript
// packages/web/src/app/api/cron/keep-alive/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // ... lógica do cron
}
```

**Usar `createAdminClient()`** — o cron roda server-side sem contexto de usuário,
precisa do service role para contornar RLS.

### Paginação da Meta API

```typescript
// metaFetch retorna MetaPagedResponse<T> = { data: T[], paging: MetaPagination }
// MetaPagination = { cursors: { before, after }, next?: string }

async function fetchAllPages<T>(
  path: string,
  token: string,
  params: Record<string, string>
): Promise<T[]> {
  const results: T[] = []
  let cursor: string | undefined

  do {
    const response = await metaFetch<MetaPagedResponse<T>>(path, token, {
      params: { ...params, ...(cursor ? { after: cursor } : {}), limit: '100' }
    })
    results.push(...response.data)
    cursor = response.paging?.next ? response.paging.cursors.after : undefined
  } while (cursor)

  return results
}
```

### Lookup local para resolver UUIDs

Após buscar campanhas, criar Map para resolver `meta_campaign_id → UUID interno`:

```typescript
// Após upsert de campanhas, buscar os IDs internos
const { data: campaigns } = await supabase
  .from('meta_campaigns')
  .select('id, meta_campaign_id')
  .eq('org_id', account.org_id)

const campaignMap = new Map(campaigns?.map(c => [c.meta_campaign_id, c.id]) ?? [])

// Ao fazer upsert de adsets:
const adsetRows = adsets.map(adset => ({
  ...adset,
  campaign_id: campaignMap.get(adset.campaign_id), // resolve UUID
  org_id: account.org_id
}))
```

### Tipos da Meta API para campanhas

```typescript
interface MetaAPICampaign {
  id: string
  name: string
  objective: string
  status: string
  daily_budget?: string   // em centavos como string
  lifetime_budget?: string
  start_time?: string
  stop_time?: string
}

interface MetaAPIAdSet {
  id: string
  name: string
  campaign_id: string
  status: string
  optimization_goal?: string
  daily_budget?: string
}

interface MetaAPIAd {
  id: string
  name: string
  adset_id: string
  status: string
  creative?: Record<string, unknown>
}
```

### Estrutura do log em meta_sync_log

```typescript
// Inserir antes de começar
const { data: syncLog } = await supabase
  .from('meta_sync_log')
  .insert({
    org_id: account.org_id,
    // account_id NÃO existe em meta_sync_log — não incluir
    sync_type: 'entities',
    started_at: new Date().toISOString(),
    status: 'running',
  })
  .select('id')
  .single()

// Atualizar ao finalizar
await supabase
  .from('meta_sync_log')
  .update({
    finished_at: new Date().toISOString(),
    status: 'success',  // 'success' | 'error' | 'partial'
    records_synced: totalRecords,
    api_calls_made: totalApiCalls,
    error_message: null,
  })
  .eq('id', syncLog.id)
```

### Verificar schema de meta_sync_log

Verificado em migration 015 — colunas disponíveis:
`id, org_id, sync_type, status, started_at, finished_at, records_synced, api_calls_made, error_message, created_at`

**ATENÇÃO — campos que NÃO existem:**
- `account_id` — não está na tabela (remover do insert abaixo)
- `'partial'` como status — não é valor válido, usar `'error'` com error_message descritivo

### vercel.json — adicionar ao array crons existente

```json
{
  "path": "/api/cron/meta-sync-entities",
  "schedule": "0 */4 * * *"
}
```

### Env vars

- `CRON_SECRET` — já existe (usada em todos os crons)
- Token e account_id lidos de `meta_ad_accounts` (banco) — não de env vars

### Idempotência

O upsert com `onConflict` garante que rodar múltiplas vezes não duplica dados.
`synced_at` é atualizado a cada sync, permitindo detectar entidades "stale".

### Tratamento de erros

```typescript
import { MetaOAuthException } from '@trifold/shared'

try {
  // sync logic
} catch (err) {
  if (err instanceof MetaOAuthException) {
    // Token inválido — não retentar, atualizar status
    await supabase.from('meta_ad_accounts')
      .update({ status: 'error' })
      .eq('id', account.id)
    // Logar e retornar 200 (Vercel não deve retentar)
    return NextResponse.json({ ok: false, error: 'token_invalid' })
  }
  // Outros erros: retornar 500 (Vercel tentará novamente)
  throw err
}
```

## Tasks / Subtasks

- [x] **Task 1** — Verificar schema de meta_sync_log
  - Ler `supabase/migrations/015_meta_marketing_api.sql` para confirmar colunas de `meta_sync_log`
  - Ajustar insert/update conforme colunas reais

- [x] **Task 2** — Criar cron handler
  - Criar `packages/web/src/app/api/cron/meta-sync-entities/route.ts`
  - Auth `CRON_SECRET` (padrão existente)
  - Buscar contas ativas de `meta_ad_accounts` via `createAdminClient()`

- [x] **Task 3** — Implementar sync com paginação
  - Função `fetchAllPages()` para paginação via cursor
  - Sync de campanhas com upsert (AC2)
  - Sync de adsets com lookup de campaign UUID (AC3)
  - Sync de ads com lookup de adset UUID (AC4)

- [x] **Task 4** — Logging e error handling
  - Insert em `meta_sync_log` antes do sync (AC5)
  - Update ao finalizar com status/records/calls
  - `MetaOAuthException` → status 'error' + return 200 (AC7)

- [x] **Task 5** — Registrar cron e validar
  - Adicionar entrada em `vercel.json` (AC6)
  - `npm run type-check` sem erros (AC8)
  - `npm run lint` sem erros

## File List

### Arquivos a criar
- `packages/web/src/app/api/cron/meta-sync-entities/route.ts`

### Arquivos modificados
- `vercel.json` — adicionar cron `meta-sync-entities` a cada 4h

## Testes

- [ ] `npm run type-check` passa sem erros
- [ ] `npm run lint` passa sem erros
- [ ] GET sem `Authorization` retorna 401
- [ ] GET com `Authorization: Bearer {CRON_SECRET}` inicia sync
- [ ] Upsert de campanhas é idempotente (segunda execução não duplica)
- [ ] `meta_sync_log` tem registro com `status='success'` após execução
- [ ] `MetaOAuthException` resulta em `meta_ad_accounts.status='error'` e retorno 200

## 🤖 CodeRabbit Integration

**Story Type Analysis:**
- Primary Type: Backend Cron / API Integration
- Complexity: Média (1 arquivo, paginação, upsert, error handling)

**Specialized Agent Assignment:**
- Primary: `@dev` (implementação)
- Quality Gate: `@architect` (validar paginação, idempotência, error handling)

**Quality Gate Tasks:**
- [ ] Pre-Commit (`@dev`): `npm run type-check` sem erros
- [ ] Pre-PR (`@architect`): Revisar paginação, upsert idempotente, tratamento de auth error

**CodeRabbit Focus Areas:**
- Paginação: loop correto com cursor, sem infinite loop possível
- Upsert: `onConflict` correto para cada tabela
- Auth error: `MetaOAuthException` não causa 5xx desnecessário
- Admin client: uso correto de `createAdminClient()` no cron
- Type safety: sem `any` nas interfaces de resposta Meta API

## QA Results

**Verdict:** PASS ✅
**Gate file:** `docs/qa/gates/16.4-cron-sync-entities.yml`
**Reviewer:** @qa (Quinn) — 2026-04-27

Todos os 8 ACs validados. Paginação correta, upserts idempotentes, MetaOAuthException sem 5xx.
1 achado MEDIUM não-bloqueante (M-001: syncLog insert sem verificação de erro — código defensivo previne crash).

AC1 ✅ AC2 ✅ AC3 ✅ AC4 ✅ AC5 ✅ AC6 ✅ AC7 ✅ AC8 ✅

Story pronta para @devops push.

## Change Log

| Data | Agente | Ação |
|---|---|---|
| 2026-04-24 | @sm (River) | Story criada — Draft |
| 2026-04-27 | @po (Pax) | Validação 10-point: 9/10 — GO. Correções: AC5 'partial'→'error' (constraint DB); Dev Notes account_id removido do insert (campo inexistente). Status: Draft → Ready |
| 2026-04-27 | @dev (Dex) | Implementação completa — route.ts criado + vercel.json atualizado. type-check ✅ lint ✅. Status: Ready → Ready for Review |
| 2026-04-27 | @qa (Quinn) | Review PASS — AC1-AC8 ✅, M-001 não-bloqueante documentado. Gate: docs/qa/gates/16.4-cron-sync-entities.yml |

## Definition of Done

- [x] `packages/web/src/app/api/cron/meta-sync-entities/route.ts` criado
- [x] `vercel.json` atualizado com cron a cada 4h
- [x] `npm run type-check` passa sem erros
- [x] `npm run lint` passa sem erros
- [x] Log em `meta_sync_log` funcionando
- [x] `MetaOAuthException` tratado sem crash
- [x] @qa PASS
- [ ] @devops push realizado
