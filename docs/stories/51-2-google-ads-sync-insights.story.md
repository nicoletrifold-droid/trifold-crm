# Story 51-2 — Google Ads: Cron Sync Diário de Insights

## Metadata
- **Epic:** 51 — Google Ads Marketing API Integration
- **Story:** 51-2
- **Status:** Ready
- **Priority:** P1 — depende de 51-1
- **Complexity:** M (~6h)
- **Created:** 2026-06-08
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[cron_reliability, upsert_idempotency, api_error_handling, rate_limit_compliance]`

---

## User Story

**Como** sistema de sincronização do Trifold CRM,
**Quero** um cron job diário que busca insights de spend do Google Ads API e os persiste em `google_ads_insights_daily`,
**Para que** a pergunta "quanto gastamos no Google Ads na semana X?" seja respondível via query SQL — mesmo nível de funcionalidade que temos hoje no Meta Ads.

---

## Context

Esta story implementa o equivalente Google Ads do cron `/api/cron/meta-sync-insights/route.ts` (Meta Ads).

**Pré-requisito obrigatório:** Story 51-1 completa (migration `076_google_ads_schema.sql` aplicada).

### Google Ads API — Como buscar insights

A Google Ads API v17+ usa **GAQL (Google Ads Query Language)** via endpoint REST:

```
POST https://googleads.googleapis.com/v17/customers/{customer_id}/googleAds:searchStream
Authorization: Bearer {access_token}
developer-token: {developer_token}

Body:
{
  "query": "SELECT campaign.id, campaign.name, campaign.status, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.conversions, metrics.cost_per_conversion, segments.date FROM campaign WHERE segments.date = '2026-06-07' AND campaign.status != 'REMOVED'"
}
```

Headers obrigatórios:
- `Authorization: Bearer {access_token}` (obtido via refresh_token)
- `developer-token: {developer_token}` (env var `GOOGLE_ADS_DEVELOPER_TOKEN`)

### Obtenção do access_token via refresh_token

```
POST https://oauth2.googleapis.com/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&client_id={client_id}
&client_secret={client_secret}
&refresh_token={refresh_token}
```

Resposta inclui `access_token` (válido por ~1h) e novo `expires_in`.
Implementar como função utilitária `getGoogleAdsAccessToken(orgConfig)`.

### Convenção monetária (CRÍTICO)

Google Ads retorna `metrics.cost_micros` (1 BRL = 1.000.000 micros).
Ao persistir em `google_ads_insights_daily.spend`: dividir por `1_000_000`.

```typescript
const spendBrl = Number(row.metrics.costMicros ?? 0) / 1_000_000
```

### Padrão de referência (Meta Ads)

Arquivos do Meta a usar como base:
- `packages/web/src/app/api/cron/meta-sync-insights/route.ts` — estrutura do handler
- Padrão: auth check `CRON_SECRET`, admin supabase client, log em `*_sync_log`, upsert com `onConflict`

### Vercel Cron

Adicionar entrada em `packages/web/vercel.json`:
```json
{
  "path": "/api/cron/google-ads-sync-insights",
  "schedule": "0 10 * * *"
}
```
`0 10 * * *` = 10h UTC = 07h BRT (D-1 consolidado após 24h)

---

## Acceptance Criteria

- [ ] **AC1:** Rota `POST /api/cron/google-ads-sync-insights` existe em `packages/web/src/app/api/cron/google-ads-sync-insights/route.ts`
- [ ] **AC2:** Handler valida `Authorization: Bearer {CRON_SECRET}` — retorna 401 se ausente ou inválido
- [ ] **AC3:** Handler itera sobre organizações onde `organizations.google_ads_config IS NOT NULL AND organizations.google_ads_config->>'status' = 'connected'` — esta é a **fonte canônica** de "conta conectada"; `google_ads_accounts.status` é um espelho secundário
- [ ] **AC4:** Para cada org com config válida, obtém `access_token` via `refresh_token` do campo `organizations.google_ads_config` (usando `getGoogleAdsAccessToken`)
- [ ] **AC5:** Query GAQL busca métricas do dia anterior com `WHERE segments.date = '{YYYY-MM-DD de ontem em UTC}'` no nível `campaign`: `cost_micros`, `impressions`, `clicks`, `ctr`, `average_cpc`, `conversions`, `cost_per_conversion` — GAQL não suporta `date_preset`; a data deve ser calculada no servidor como `new Date(Date.now() - 86400000).toISOString().split('T')[0]` em UTC
- [ ] **AC6:** Valores monetários (`cost_micros`, `average_cpc`, `cost_per_conversion`) são convertidos de micros para BRL (÷ 1.000.000) antes do upsert — `average_cpc` retorna em micros conforme Google Ads API v17 (`metrics.average_cpc`); `ctr` é ratio decimal (0.015 = 1,5%) e NÃO é dividido por 1.000.000
- [ ] **AC7:** Upsert em `google_ads_insights_daily` usa `onConflict: "org_id,level,entity_id,date"` — re-execução no mesmo dia não duplica rows
- [ ] **AC8:** Log de execução registrado em `google_ads_sync_log`: `started_at`, `finished_at`, `records_synced`, `api_calls_made`, `status` (success/error), `error_message` se falhar
- [ ] **AC9:** Erros de autenticação (401 da Google API) são capturados e registrados em `google_ads_sync_log.error_message` — cron retorna HTTP 200 com body de erro (não explode o Vercel)
- [ ] **AC10:** Entrada `{ "path": "/api/cron/google-ads-sync-insights", "schedule": "0 10 * * *" }` adicionada em `packages/web/vercel.json`
- [ ] **AC11:** TypeScript compila sem erros; ESLint passa

---

## Tasks / Subtasks

- [ ] **T1** — Criar utilitário de autenticação Google OAuth (AC4)
  - [ ] T1.1 — Criar `packages/web/src/lib/google-ads/auth.ts` com função `getGoogleAdsAccessToken(config: GoogleAdsOAuthConfig): Promise<string>`
  - [ ] T1.2 — Função faz `POST https://oauth2.googleapis.com/token` com `grant_type=refresh_token`
  - [ ] T1.3 — Tipar `GoogleAdsOAuthConfig` com `client_id`, `client_secret`, `refresh_token`
  - [ ] T1.4 — Erros de auth retornam `GoogleAdsAuthError` (classe customizada)

- [ ] **T2** — Criar cliente REST Google Ads (AC5)
  - [ ] T2.1 — Criar `packages/web/src/lib/google-ads/client.ts` com função `googleAdsSearch(customerId, query, accessToken): Promise<GaqlRow[]>`
  - [ ] T2.2 — Headers obrigatórios: `Authorization: Bearer {token}`, `developer-token: {GOOGLE_ADS_DEVELOPER_TOKEN}`
  - [ ] T2.3 — Endpoint: `POST https://googleads.googleapis.com/v17/customers/{customer_id}/googleAds:searchStream`
  - [ ] T2.4 — Tratar resposta como stream de JSON objects (searchStream retorna linhas separadas, não array)
  - [ ] T2.5 — Tipar `GaqlRow` com campos usados: `campaign.id`, `campaign.name`, `metrics.*`, `segments.date`

- [ ] **T3** — Criar query GAQL de insights diários (AC5)
  - [ ] T3.1 — Definir constante `DAILY_INSIGHTS_QUERY` em `packages/web/src/lib/google-ads/queries.ts`
  - [ ] T3.2 — Query: SELECT campaign.id, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.conversions, metrics.cost_per_conversion, segments.date FROM campaign WHERE segments.date = '{YYYY-MM-DD de ontem em UTC}' AND campaign.status != 'REMOVED' — calcular a data como `new Date(Date.now() - 86400000).toISOString().split('T')[0]` (GAQL não suporta `date_preset`)
  - [ ] T3.3 — Parametrizar `{yesterday}` como `YYYY-MM-DD`

- [ ] **T4** — Criar handler do cron (AC1-AC3, AC7-AC9)
  - [ ] T4.1 — Criar `packages/web/src/app/api/cron/google-ads-sync-insights/route.ts` espelhando estrutura de `meta-sync-insights/route.ts`
  - [ ] T4.2 — Validar `CRON_SECRET` no header Authorization
  - [ ] T4.3 — Buscar orgs via `SELECT id, google_ads_config FROM organizations WHERE google_ads_config IS NOT NULL AND google_ads_config->>'status' = 'connected'` (fonte canônica — AC3)
  - [ ] T4.4 — Para cada org: auth → query GAQL → transform → upsert insights → upsert campanhas
  - [ ] T4.5 — Transform: converter `cost_micros` → BRL (÷ 1.000.000 para `spend`), `average_cpc` → BRL (÷ 1.000.000 para `cpc`), `cost_per_conversion` → BRL (÷ 1.000.000); `ctr` permanece como decimal (AC6)
  - [ ] T4.6 — Upsert em `google_ads_insights_daily` com `onConflict: "org_id,level,entity_id,date"` (AC7)
  - [ ] T4.7 — **Upsert leve em `google_ads_campaigns`** quando GAQL retornar `campaign.name` — campos mínimos: `org_id`, `account_id` (via lookup em `google_ads_accounts`), `google_campaign_id` (= `campaign.id`), `name` (= `campaign.name`), `status` (= `campaign.status`), `synced_at` (NOW()) — usar `onConflict: "org_id,google_campaign_id"` (AC novo — necessário para Story 51-3 mostrar nomes em vez de IDs)
  - [ ] T4.8 — Registrar log em `google_ads_sync_log` ao início e fim (AC8)
  - [ ] T4.9 — Captura de erros: try/catch por org, continuar para outras orgs se uma falhar

- [ ] **T5** — Atualizar `vercel.json` (AC10)
  - [ ] T5.1 — Adicionar entrada de cron `{ "path": "/api/cron/google-ads-sync-insights", "schedule": "0 10 * * *" }` em `packages/web/vercel.json`

- [ ] **T6** — QA pre-commit (AC11)
  - [ ] T6.1 — `pnpm type-check` em `packages/web`
  - [ ] T6.2 — `pnpm lint src/app/api/cron/google-ads-sync-insights/`
  - [ ] T6.3 — `pnpm lint src/lib/google-ads/`

---

## Dev Notes

### Arquivos de referência obrigatórios
```
packages/web/src/app/api/cron/meta-sync-insights/route.ts    ← espelhar estrutura
packages/web/src/app/api/cron/meta-sync-entities/route.ts    ← referência de upsert pattern
packages/web/vercel.json                                      ← adicionar entrada de cron
```

### Arquivos a criar
```
packages/web/src/lib/google-ads/auth.ts        ← getGoogleAdsAccessToken
packages/web/src/lib/google-ads/client.ts      ← googleAdsSearch
packages/web/src/lib/google-ads/queries.ts     ← DAILY_INSIGHTS_QUERY
packages/web/src/app/api/cron/google-ads-sync-insights/route.ts
```

### Variáveis de ambiente

Env vars globais (Vercel):
```bash
GOOGLE_ADS_DEVELOPER_TOKEN=    # Do Manager Account Google Ads (obrigatório em todos os requests)
CRON_SECRET=                   # Já existe — mesmo secret usado por todos os crons
```

Credenciais por organização (salvas em `organizations.google_ads_config` JSONB, criado em Story 51-1):
```typescript
interface GoogleAdsOAuthConfig {
  customer_id: string     // ex: "123-456-7890" (com hífens)
  refresh_token: string   // obtido no fluxo OAuth
  client_id: string       // do Google Cloud Console
  client_secret: string   // do Google Cloud Console
}
```

### Google Ads API — searchStream vs search

A Google Ads API tem dois endpoints:
- `googleAds:search` — retorna página única com `nextPageToken`
- `googleAds:searchStream` — streaming, sem paginação, preferido para relatórios

Para MVP usar `searchStream`. A resposta é um array de objetos JSON separados por newlines (NDJSON-like), cada um com campo `results`:
```json
[
  {"results": [{"campaign": {"id": "123", "name": "..."}, "metrics": {...}, "segments": {"date": "2026-06-07"}}]},
  ...
]
```

Parsear como: `response.json()` retorna array diretamente com a versão REST HTTP.

### Formato de `customer_id` na URL

Google Ads `customer_id` pode ter formato `123-456-7890` na UI, mas na URL da API **sem hífens**: `1234567890`.

```typescript
const customerId = config.customer_id.replace(/-/g, '')
// URL: https://googleads.googleapis.com/v17/customers/1234567890/googleAds:searchStream
```

### Campos GAQL e mapeamento para o banco

| Campo GAQL | Campo DB (insights) | Campo DB (campaigns) | Transformação |
|---|---|---|---|
| `campaign.id` | `entity_id` | `google_campaign_id` | string |
| `campaign.name` | _(não persiste em insights)_ | `name` | upsert leve em `google_ads_campaigns` (T4.7) |
| `campaign.status` | _(não persiste em insights)_ | `status` | upsert leve em `google_ads_campaigns` (T4.7) |
| `metrics.cost_micros` | `spend` | — | ÷ 1.000.000 → BRL |
| `metrics.impressions` | `impressions` | — | parseInt |
| `metrics.clicks` | `clicks` | — | parseInt |
| `metrics.ctr` | `ctr` | — | parseFloat (ratio decimal; NÃO dividir por 1.000.000) |
| `metrics.average_cpc` | `cpc` | — | ÷ 1.000.000 → BRL (em micros, confirmado Google API v17) |
| `metrics.conversions` | `conversions` | — | parseFloat |
| `metrics.cost_per_conversion` | `cost_per_conversion` | — | ÷ 1.000.000 → BRL (em micros) |
| `segments.date` | `date` | `synced_at` | string YYYY-MM-DD / NOW() |

**level:** para esta story, fixo como `'campaign'`.

### Upsert de campanhas (necessário para Story 51-3)

Ao processar cada row do GAQL, se `campaign.name` está presente, executar upsert em `google_ads_campaigns`:

```typescript
await supabase.from('google_ads_campaigns').upsert({
  org_id: orgId,
  account_id: accountId,          // FK para google_ads_accounts
  google_campaign_id: row.campaign.id,
  name: row.campaign.name,
  status: row.campaign.status,    // 'ENABLED' | 'PAUSED' | 'REMOVED'
  synced_at: new Date().toISOString(),
}, { onConflict: 'org_id,google_campaign_id' })
```

Sem este upsert, a Story 51-3 fará join com `google_ads_campaigns` vazia e exibirá `entity_id` numérico em vez do nome legível da campanha.

### Padrão de upsert (do Meta — replicar)

```typescript
const { error } = await supabase
  .from('google_ads_insights_daily')
  .upsert(rows, { onConflict: 'org_id,level,entity_id,date' })
```

### Tratamento de erro — não explodir o cron

O cron deve retornar HTTP 200 mesmo em caso de erro parcial, para não fazer Vercel marcar o cron como falho permanentemente:

```typescript
try {
  // sync
  await logSync({ status: 'success', ... })
  return NextResponse.json({ ok: true, records: N })
} catch (err) {
  await logSync({ status: 'error', error_message: String(err), ... })
  return NextResponse.json({ ok: false, error: String(err) }) // 200 mesmo em erro
}
```

### `average_cpc` também é em micros (DECISÃO CRAVADA)

Diferente de `ctr` (que é um ratio 0-1, ex: 0.015 = 1,5%), `average_cpc` e `cost_per_conversion` são em micros (Google Ads API v17 confirmado).
Ambos devem ser divididos por 1.000.000 ao persistir. NÃO há incerteza — R4 encerrado.

### Fonte canônica de "conta conectada"

O cron descobre quais orgs sincronizar via:

```sql
SELECT id, google_ads_config
FROM organizations
WHERE google_ads_config IS NOT NULL
  AND google_ads_config->>'status' = 'connected'
```

Esta query é a **fonte canônica**. A tabela `google_ads_accounts.status` é um espelho para conveniência da UI — não é o critério de iteração do cron. Isto evita descompasso entre `google_ads_accounts` marcada como `active` mas `google_ads_config` nula ou revogada.

---

## Testing

### Abordagem
- Sem mock de API para MVP — testar via trigger manual do cron endpoint
- Idempotência: executar 2x no mesmo dia, verificar que `COUNT(*)` de `google_ads_insights_daily` não aumenta

### Cenários de teste
1. **Auth inválido:** `POST /api/cron/google-ads-sync-insights` sem header `Authorization` → 401
2. **Idempotência:** executar cron 2x no mesmo dia → segunda execução não duplica rows (AC7)
3. **Log de sync:** após execução bem-sucedida, verificar row em `google_ads_sync_log` com `status = 'success'`
4. **Conversão de micros:** verificar `spend` na tabela — se campanha gastou R$ 100,00, `cost_micros = 100000000`, `spend` deve ser `100.00`

### Não é escopo desta story
- Testes de UI (Story 51-3)
- Autenticação via fluxo OAuth UI (Story 51-3)
- Sync de nível `ad_group` ou `ad` (escopo de story futura se necessário)

---

## Riscos

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | Developer Token não aprovado | Este é o blocker externo do Epic; Basic Access geralmente rápido — iniciar antes desta story (ver Story 51-0) |
| R2 | `searchStream` retorna NDJSON em vez de JSON array | Testar com request manual (`curl`) antes de implementar o parser |
| R3 | `customer_id` com hífens na URL falha | Remover hífens antes de usar na URL — documentado em Dev Notes |
| R4 | ~~`average_cpc` em micros vs ratio~~ | **RESOLVIDO:** `average_cpc` retorna em micros (Google Ads API v17 confirmado). Divisão por 1.000.000 cravada em AC6 e tabela de mapeamento. Risco encerrado. |
| R5 | `organizations.google_ads_config` ainda NULL | Cron itera apenas orgs com `google_ads_config IS NOT NULL AND status = 'connected'` — orgs sem config são naturalmente excluídas da query (AC3) |

---

## Dependencies

- **Depende de:** Story 51-1 (migration `076_google_ads_schema.sql` aplicada)
- **Bloqueia:** Story 51-3 (UI precisa de dados para exibir)

---

## Definition of Done

- [ ] Todos os ACs marcados como completos
- [ ] `pnpm type-check` e `pnpm lint` passando
- [ ] Cron executado manualmente e `google_ads_insights_daily` populado
- [ ] Log em `google_ads_sync_log` com `status = 'success'`
- [ ] Idempotência confirmada (segunda execução não duplica rows)
- [ ] @qa executou quality gate com verdict >= PASS ou CONCERNS documentados
- [ ] @devops fez push do commit final

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-08 | 0.1 | Story drafted a partir do Epic 51 | @sm (River) |
| 2026-06-08 | 0.2 | PM review (AI-3/AI-4/AI-5/AI-6): AC5 corrigido (GAQL sem date_preset); average_cpc cravado em micros, R4 encerrado; T4.7 upsert leve em google_ads_campaigns adicionado; AC3 + fonte canônica padronizada como google_ads_config.status='connected' | @sm (River) |
| 2026-06-08 | 0.3 | Validated (10-point checklist, score 10/10), Draft → Ready | @po (Pax) |

---

## Dev Agent Record

### Agent Model Used
_(a ser preenchido pelo @dev durante implementação)_

### Debug Log References
_(a ser preenchido durante implementação)_

### Completion Notes List
_(a ser preenchido durante implementação)_

### File List

#### Created
- `packages/web/src/lib/google-ads/auth.ts`
- `packages/web/src/lib/google-ads/client.ts`
- `packages/web/src/lib/google-ads/queries.ts`
- `packages/web/src/app/api/cron/google-ads-sync-insights/route.ts`

#### Modified
- `packages/web/vercel.json` — adicionada entrada de cron

---

## QA Results
_(a ser preenchido pelo @qa)_
