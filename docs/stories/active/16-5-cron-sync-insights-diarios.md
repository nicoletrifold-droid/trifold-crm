---
epic: 16
story: 16.5
title: Cron Sync — Insights Diários (Meta Ads)
status: Done
priority: P1-ALTO
created_at: 2026-04-27
created_by: River (@sm)
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: [async_report_handling, data_completeness, idempotency, actions_extraction]
complexity: G
estimated_hours: 5
depends_on: [16.1, 16.2, 16.3, 16.4]
---

# Story 16.5 — Cron Sync: Insights Diários (Meta Ads)

## Contexto

Stories 16.1–16.4 estão em produção. As tabelas `meta_campaigns`, `meta_adsets`, `meta_ads` e
`meta_insights_daily` existem no banco. O `metaFetch()` está disponível em `@trifold/shared`.
A hierarquia de entidades já é sincronizada a cada 4h pelo cron 16.4.

Esta story cria o cron `/api/cron/meta-sync-insights` que roda diariamente às 09h UTC (06h BRT) e
sincroniza métricas de performance do dia anterior (D-1) para os três níveis: campanha, adset e ad.
Os dados alimentam o dashboard de campanhas (Story 16.8) e o cálculo de ROAS (Story 16.10).

## Story Statement

**Como** sistema Trifold CRM,
**Quero** sincronizar automaticamente as métricas de performance Meta Ads (spend, leads, CPL, etc.)
do dia anterior a cada manhã,
**Para que** o dashboard de campanhas e o ROAS imobiliário tenham dados atualizados com D-1 de latência.

## Acceptance Criteria

- [x] **AC1:** Endpoint `GET /api/cron/meta-sync-insights` criado em
  `packages/web/src/app/api/cron/meta-sync-insights/route.ts`:
  - Protegido por `Authorization: Bearer {CRON_SECRET}` — retorna 401 se inválido
  - Busca todas as `meta_ad_accounts` com `status = 'active'` via `createAdminClient()`
  - Executa sync de insights (campaign → adset → ad) para cada conta ativa

- [x] **AC2:** Sync de insights a nível **campaign**:
  - `GET /act_{id}/insights?level=campaign&date_preset=yesterday&fields=campaign_id,spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,cost_per_action_type,date_start,date_stop`
  - Paginação completa via cursor
  - Upsert em `meta_insights_daily` com `onConflict: 'org_id,level,entity_id,date'`
  - Campos: `level='campaign'`, `entity_id=insight.campaign_id`, `date=insight.date_start`

- [x] **AC3:** Sync de insights a nível **adset**:
  - `GET /act_{id}/insights?level=adset&date_preset=yesterday&fields=adset_id,spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,cost_per_action_type,date_start,date_stop`
  - Paginação completa via cursor
  - Upsert em `meta_insights_daily` com `level='adset'`, `entity_id=insight.adset_id`

- [x] **AC4:** Sync de insights a nível **ad**:
  - `GET /act_{id}/insights?level=ad&date_preset=yesterday&fields=ad_id,spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,cost_per_action_type,date_start,date_stop`
  - Paginação completa via cursor
  - Upsert em `meta_insights_daily` com `level='ad'`, `entity_id=insight.ad_id`

- [x] **AC5:** Extração de actions do array `actions[]`:
  - `leads`: `actions.find(a => a.action_type === 'lead')?.value` (default 0)
  - `messaging_conversations_started`: `action_type === 'onsite_conversion.messaging_conversation_started_7d'`
  - `cost_per_lead`: `cost_per_action_type.find(a => a.action_type === 'lead')?.value` (default null)
  - Campo `actions` (JSONB): armazenar o array completo original

- [x] **AC6:** Valores numéricos convertidos corretamente:
  - `spend`, `ctr`, `cpc`, `cpm`, `frequency`, `cost_per_lead` → `parseFloat()` (NUMERIC no DB)
  - `impressions`, `reach`, `clicks`, `leads`, `messaging_conversations_started` → `parseInt()` (BIGINT/INT no DB)
  - Campos com valor `"0"` ou ausentes → `0` (não `null`) para métricas de contagem

- [x] **AC7:** Log de execução em `meta_sync_log`:
  - Inserir registro com `sync_type: 'insights'`, `started_at` antes de começar
  - Atualizar com `finished_at`, `status` ('success' | 'error'), `records_synced`, `api_calls_made`
  - Sem campo `account_id` (não existe em `meta_sync_log` — verificado em migration 015)

- [x] **AC8:** Cron registrado em `vercel.json`:
  - `{"path": "/api/cron/meta-sync-insights", "schedule": "0 9 * * *"}`
  - Roda às 09:00 UTC = 06:00 BRT (D-1 consolidado pela Meta após meia-noite)

- [x] **AC9:** `MetaOAuthException` tratado graciosamente:
  - Token inválido: atualizar `meta_ad_accounts.status = 'error'`, logar em `meta_sync_log`, retornar 200
  - Demais erros: logar e retornar 500 para que Vercel alerte

- [x] **AC10:** Zero erros de TypeScript (`npm run type-check` passa). Sem `any` explícito nas funções públicas.

## Scope

### IN (o que esta story implementa)
- `GET /api/cron/meta-sync-insights` — sync insights D-1 nos 3 níveis
- Paginação completa para cada nível
- Extração de `leads`, `messaging_conversations_started`, `cost_per_lead` de `actions[]`
- Upsert idempotente em `meta_insights_daily`
- Log em `meta_sync_log` com `sync_type: 'insights'`
- Registro do cron em `vercel.json`
- Tratamento de `MetaOAuthException` sem crash

### OUT (fora desta story)
- Async report jobs para períodos > 7 dias (→ Story 16.7 backfill histórico)
- Dashboard de campanhas (→ Story 16.8)
- ROAS Calculator (→ Story 16.10)
- Backfill histórico (→ Story 16.7)
- Alertas de falha de sync (→ Story 16.13)

## Dev Notes

### Estrutura de arquivo a criar

```
packages/web/src/app/api/cron/meta-sync-insights/
└── route.ts    # GET handler do cron
```

### Padrão de cron existente (replicar exatamente)

Ver `packages/web/src/app/api/cron/keep-alive/route.ts` e
`packages/web/src/app/api/cron/meta-sync-entities/route.ts` — mesma estrutura:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { metaFetch, MetaOAuthException } from "@trifold/shared"

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // ...
}
```

### Tipos locais necessários (Meta API não usa MetaInsight de types.ts para insights paginados)

```typescript
interface InsightWithCampaignId {
  campaign_id: string
  spend: string
  impressions: string
  reach: string
  clicks: string
  ctr: string
  cpc: string
  cpm: string
  frequency: string
  date_start: string
  date_stop: string
  actions?: Array<{ action_type: string; value: string }>
  cost_per_action_type?: Array<{ action_type: string; value: string }>
}

interface InsightWithAdsetId extends Omit<InsightWithCampaignId, 'campaign_id'> {
  adset_id: string
}

interface InsightWithAdId extends Omit<InsightWithCampaignId, 'campaign_id'> {
  ad_id: string
}
```

### Reutilizar fetchAllPages de meta-sync-entities

A função `fetchAllPages<T>` é idêntica à da Story 16.4 — copiar o mesmo padrão:

```typescript
async function fetchAllPages<T>(
  path: string,
  token: string,
  params: Record<string, string>,
): Promise<{ data: T[]; apiCalls: number }> {
  const results: T[] = []
  let cursor: string | undefined
  let apiCalls = 0
  do {
    const response = await metaFetch<MetaPagedResponse<T>>(path, token, {
      params: { ...params, ...(cursor ? { after: cursor } : {}), limit: '100' },
    })
    apiCalls++
    results.push(...response.data)
    cursor = response.paging?.next ? response.paging.cursors.after : undefined
  } while (cursor)
  return { data: results, apiCalls }
}
```

Importar `MetaPagedResponse` de `@trifold/shared`.

### Extração de actions — helper recomendado

```typescript
function extractActionValue(
  arr: Array<{ action_type: string; value: string }> | undefined,
  type: string,
): number {
  return Math.round(parseFloat(arr?.find(a => a.action_type === type)?.value ?? '0'))
}

function extractCostValue(
  arr: Array<{ action_type: string; value: string }> | undefined,
  type: string,
): number | null {
  const val = arr?.find(a => a.action_type === type)?.value
  return val != null ? parseFloat(val) : null
}
```

Action types importantes:
- Leads: `'lead'`
- Messaging: `'onsite_conversion.messaging_conversation_started_7d'`
- Cost per lead: `'lead'` em `cost_per_action_type`

### Schema meta_insights_daily — campos relevantes (verificado em migration 015)

```
level          TEXT    CHECK ('campaign', 'adset', 'ad')
entity_id      TEXT    -- meta_campaign_id | meta_adset_id | meta_ad_id (Meta ID, não UUID interno)
date           DATE    -- date_start da Meta API (formato YYYY-MM-DD)
spend          NUMERIC(12,2)
impressions    BIGINT
reach          BIGINT
clicks         BIGINT
ctr            NUMERIC(8,4)
cpc            NUMERIC(12,2)
cpm            NUMERIC(12,2)
frequency      NUMERIC(8,4)
leads          INT
messaging_conversations_started  INT
cost_per_lead  NUMERIC(12,2)
actions        JSONB   -- array completo original
```

UNIQUE constraint: `(org_id, level, entity_id, date)` → `onConflict: 'org_id,level,entity_id,date'`

**ATENÇÃO:** `entity_id` é o Meta ID (string como `"23855623456789"`), NÃO o UUID interno do banco.
Diferente da Story 16.4 onde usávamos UUIDs internos para as FKs de campaigns/adsets/ads.

### Campos params do endpoint insights

```typescript
const INSIGHT_FIELDS = [
  'spend', 'impressions', 'reach', 'clicks',
  'ctr', 'cpc', 'cpm', 'frequency',
  'actions', 'cost_per_action_type',
  'date_start', 'date_stop',
].join(',')

// Campaign level: adicionar 'campaign_id' aos fields
// Adset level: adicionar 'adset_id' aos fields
// Ad level: adicionar 'ad_id' aos fields

// Params base:
const baseParams = {
  date_preset: 'yesterday',
  fields: `campaign_id,${INSIGHT_FIELDS}`,  // substituir campaign_id por adset_id ou ad_id
}
```

### Log em meta_sync_log — schema verificado (migration 015)

Colunas disponíveis: `id, org_id, sync_type, status, started_at, finished_at, records_synced, api_calls_made, error_message, created_at`

**Sem `account_id`** — não incluir no insert (campo não existe).

```typescript
const { data: syncLog } = await supabase
  .from('meta_sync_log')
  .insert({
    org_id: account.org_id,
    sync_type: 'insights',       // ← 'insights', não 'entities'
    started_at: new Date().toISOString(),
    status: 'running',
  })
  .select('id')
  .single()
```

### vercel.json — adicionar ao array crons existente

```json
{
  "path": "/api/cron/meta-sync-insights",
  "schedule": "0 9 * * *"
}
```

### Tratamento de erros (idêntico a 16.4)

```typescript
import { MetaOAuthException } from '@trifold/shared'

} catch (err) {
  if (err instanceof MetaOAuthException) {
    await supabase.from('meta_ad_accounts')
      .update({ status: 'error', updated_at: new Date().toISOString() })
      .eq('id', account.id)
    // logar em meta_sync_log + retornar 200 (Vercel não retenta)
    results.push({ account_id: account.id, status: 'token_invalid' })
    continue
  }
  // outros erros → throw (Vercel 500 + alerta)
  throw err
}
```

## Tasks / Subtasks

- [x] **Task 1** — Criar cron handler base
  - Criar `packages/web/src/app/api/cron/meta-sync-insights/route.ts`
  - Auth `CRON_SECRET` (padrão idêntico ao 16.4)
  - Buscar contas ativas via `createAdminClient()`
  - Definir tipos locais `InsightWithCampaignId`, `InsightWithAdsetId`, `InsightWithAdId`
  - Copiar `fetchAllPages<T>()` do padrão 16.4

- [x] **Task 2** — Implementar sync dos 3 níveis
  - Fetch + upsert `level=campaign` com `entity_id=insight.campaign_id` (AC2)
  - Fetch + upsert `level=adset` com `entity_id=insight.adset_id` (AC3)
  - Fetch + upsert `level=ad` com `entity_id=insight.ad_id` (AC4)
  - Helper `extractActionValue()` e `extractCostValue()` para `actions[]` (AC5)
  - Conversão correta de tipos: parseFloat vs parseInt por campo (AC6)

- [x] **Task 3** — Logging e error handling
  - Insert em `meta_sync_log` com `sync_type: 'insights'` antes do sync (AC7)
  - Update ao finalizar com status/records/calls
  - `MetaOAuthException` → status 'error' + return 200 (AC9)

- [x] **Task 4** — Registrar cron e validar
  - Adicionar entrada em `vercel.json` com `"0 9 * * *"` (AC8)
  - `npm run type-check` sem erros (AC10)
  - `npm run lint` sem erros

## File List

### Arquivos a criar
- `packages/web/src/app/api/cron/meta-sync-insights/route.ts`

### Arquivos modificados
- `vercel.json` — adicionar cron `meta-sync-insights` às 09h UTC

## Testes

- [ ] `npm run type-check` passa sem erros
- [ ] `npm run lint` passa sem erros
- [ ] GET sem `Authorization` retorna 401
- [ ] GET com `Authorization: Bearer {CRON_SECRET}` inicia sync
- [ ] `entity_id` armazena Meta ID (string), não UUID interno
- [ ] `leads` e contagens são inteiros (não floats)
- [ ] `spend`, `ctr`, `cpc`, `cpm` são floats
- [ ] `actions` JSONB armazena array completo
- [ ] Upsert idempotente (segunda execução não duplica, atualiza valores)
- [ ] `meta_sync_log` tem registro com `sync_type='insights'` e `status='success'`
- [ ] `MetaOAuthException` resulta em `meta_ad_accounts.status='error'` e retorno 200

## QA Results

**Verdict:** PASS ✅
**Gate file:** `docs/qa/gates/16.5-cron-sync-insights-diarios.yml`
**Reviewer:** @qa (Quinn) — 2026-04-27

Todos os 10 ACs validados. entity_id correto por nível (Meta ID, não UUID), conversão de tipos precisa, extração de actions[] com fallbacks corretos, MetaOAuthException sem 5xx.
2 achados MEDIUM não-bloqueantes: M-001 (syncLog insert sem check de erro — guards previnem crash), M-002 (mapeamento duplicado 3x — funcional, refatoração oportunista em 16.7).

AC1 ✅ AC2 ✅ AC3 ✅ AC4 ✅ AC5 ✅ AC6 ✅ AC7 ✅ AC8 ✅ AC9 ✅ AC10 ✅

Story pronta para @devops push.

## 🤖 CodeRabbit Integration

**Story Type Analysis:**
- Primary Type: Backend Cron / Data Pipeline
- Complexity: Grande (1 arquivo, 3 níveis de sync, extração de actions, type safety)

**Specialized Agent Assignment:**
- Primary: `@dev` (implementação)
- Quality Gate: `@architect` (validar extração de actions, conversão de tipos, idempotência)

**Quality Gate Tasks:**
- [ ] Pre-Commit (`@dev`): `npm run type-check` sem erros
- [ ] Pre-PR (`@architect`): Revisar extração actions[], conversão numérica, entity_id correto por nível

**CodeRabbit Focus Areas:**
- `entity_id`: deve ser Meta ID (não UUID) — diferente de 16.4
- Conversão de tipos: parseFloat vs parseInt por campo
- Actions extraction: sem magic strings não documentadas
- Upsert onConflict: `org_id,level,entity_id,date` correto
- Admin client: uso correto de `createAdminClient()` no cron
- Type safety: tipos locais sem `any`

## Change Log

| Data | Agente | Ação |
|---|---|---|
| 2026-04-27 | @sm (River) | Story criada — Draft |
| 2026-04-27 | @po (Pax) | Validação 10-point: 9/10 — GO. Sem correções necessárias. Status: Draft → Ready |
| 2026-04-27 | @dev (Dex) | Implementação completa — route.ts criado + vercel.json atualizado. type-check ✅ lint ✅. Status: Ready → Ready for Review |
| 2026-04-27 | @qa (Quinn) | Review PASS — AC1-AC10 ✅, M-001/M-002 não-bloqueantes documentados. Gate: docs/qa/gates/16.5-cron-sync-insights-diarios.yml |
| 2026-04-27 | @devops (Gage) | Push realizado — dace220..929caf7. Status: Ready for Review → Done |

## Definition of Done

- [x] `packages/web/src/app/api/cron/meta-sync-insights/route.ts` criado
- [x] `vercel.json` atualizado com cron às 09h UTC
- [x] `npm run type-check` passa sem erros
- [x] `npm run lint` passa sem erros
- [x] Insights upsertados corretamente nos 3 níveis
- [x] `meta_sync_log` com `sync_type='insights'` funcionando
- [x] `MetaOAuthException` tratado sem crash
- [x] @qa PASS
- [x] @devops push realizado
