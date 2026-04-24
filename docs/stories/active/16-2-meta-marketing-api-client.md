---
epic: 16
story: 16.2
title: Meta Marketing API Client (Shared Lib)
status: Done
priority: P1-ALTO
created_at: 2026-04-24
created_by: River (@sm)
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: [rate_limit_validation, retry_logic, type_safety, error_handling]
complexity: G
estimated_hours: 5
depends_on: [16.1]
---

# Story 16.2 — Meta Marketing API Client (Shared Lib)

## Contexto

Story 16.1 (Migration) está em produção. As tabelas `meta_campaigns`, `meta_adsets`,
`meta_ads` e `meta_insights_daily` existem no banco. Para que os crons de sync (16.4, 16.5)
e o UI de autenticação (16.3) possam chamar a Meta Marketing API, precisamos de um
client tipado e robusto em `packages/shared`.

Esta story cria o pacote `packages/shared/src/meta/` com client HTTP, rate limiter,
tipos TypeScript e tratamento de erros — reutilizável por todas as stories seguintes.

## Story Statement

**Como** desenvolvedor do Trifold CRM,
**Quero** um client tipado e robusto para a Meta Marketing API em `@trifold/shared`,
**Para que** os crons de sync, o handler de webhook e o UI de configuração possam
fazer chamadas à Meta API sem duplicar lógica de rate limiting, retry e error handling.

## Acceptance Criteria

- [ ] **AC1:** Arquivo `packages/shared/src/meta/client.ts` criado com função `metaFetch()` — wrapper tipado sobre `fetch` para `https://graph.facebook.com/v21.0/`, injetando `access_token` como query param, parseando resposta JSON, e lançando `MetaAPIError` em caso de erro
- [ ] **AC2:** Arquivo `packages/shared/src/meta/rate-limiter.ts` criado com `RateLimiter` class que:
  - Lê header `X-Business-Use-Case-Usage` da resposta Meta API
  - Mantém estado de `call_count` e `total_cputime` em memória
  - Ativa circuit breaker quando qualquer métrica ultrapassa 75%
  - Expõe `isThrottled(): boolean` e `getUsage(): MetaRateUsage`
- [ ] **AC3:** Arquivo `packages/shared/src/meta/types.ts` criado com interfaces TypeScript para:
  - `MetaCampaign` (id, name, objective, status, daily_budget, lifetime_budget, start_time, stop_time)
  - `MetaAdSet` (id, name, campaign_id, status, optimization_goal, daily_budget)
  - `MetaAd` (id, name, adset_id, status, creative)
  - `MetaInsight` (date_start, date_stop, spend, impressions, reach, clicks, ctr, cpc, cpm, frequency, actions)
  - `MetaLeadData` (id, field_data: Array<{name, values}>)
  - `MetaPagination` (cursors: {before, after}, next?)
  - `MetaPagedResponse<T>` (data: T[], paging: MetaPagination)
  - `MetaRateUsage` (call_count, total_cputime, total_time, type, estimated_time_to_regain_access)
- [ ] **AC4:** Arquivo `packages/shared/src/meta/errors.ts` criado com classes:
  - `MetaAPIError extends Error` — erro base com `code`, `subcode`, `message`, `type`
  - `MetaOAuthException extends MetaAPIError` — token inválido/expirado (type=OAuthException)
  - `MetaRateLimitError extends MetaAPIError` — rate limit atingido (code=4 ou code=17)
  - `MetaPermissionError extends MetaAPIError` — permissões insuficientes (code=200-299)
  - Função `parseMetaError(response: unknown): MetaAPIError` — detecta tipo pelo `error.type` ou `error.code`
- [ ] **AC5:** Backoff exponencial implementado em `client.ts` para erros `429` e `MetaRateLimitError`:
  - Sequência: `1s → 2s → 4s → 8s → 16s` com jitter aleatório de ±20%
  - Máximo de 5 tentativas
  - Não faz retry em `MetaOAuthException` (token inválido não melhora com retry)
  - Não faz retry em `MetaPermissionError` (permissão negada não melhora com retry)
- [ ] **AC6:** Função `metaBatch(requests: MetaBatchRequest[]): Promise<MetaBatchResponse[]>` implementada em `client.ts` para batching de até 50 operações em uma chamada via `POST /v21.0/` com `batch` param (Meta Batch API)
- [ ] **AC7:** Arquivo `packages/shared/src/meta/index.ts` criado exportando tudo de client, rate-limiter, types e errors. `packages/shared/src/index.ts` atualizado com `export * from "./meta"`
- [ ] **AC8:** Zero erros de TypeScript (`npm run type-check` passa). Todos os tipos são strict — sem `any` explícito nas interfaces públicas

## Scope

### IN (o que esta story implementa)
- `packages/shared/src/meta/` completo: client.ts, rate-limiter.ts, types.ts, errors.ts, index.ts
- Exportação via `@trifold/shared`
- Backoff exponencial com jitter
- Circuit breaker baseado em `X-Business-Use-Case-Usage`
- Batch API support

### OUT (fora desta story)
- UI de configuração de token (→ Story 16.3)
- Crons que usam o client (→ Stories 16.4, 16.5)
- Testes de integração contra Meta API real (→ Story 16.6)
- Criptografia do token em banco (→ Story 16.3)
- Funções específicas de endpoint (ex: `getCampaigns()`) — apenas o client base

## Dev Notes

### Estrutura de arquivos a criar

```
packages/shared/src/meta/
├── index.ts          # re-exporta tudo
├── client.ts         # metaFetch(), metaBatch(), backoff
├── rate-limiter.ts   # RateLimiter class, circuit breaker
├── types.ts          # interfaces Meta API
└── errors.ts         # MetaAPIError hierarchy
```

### Base URL e versionamento

```typescript
const META_BASE = 'https://graph.facebook.com/v21.0'
// Injetar access_token como query param (padrão Meta API)
// GET /v21.0/{id}?fields=name,status&access_token={token}
```

### Padrão de metaFetch

```typescript
export async function metaFetch<T>(
  path: string,
  token: string,
  options?: { params?: Record<string, string>; method?: 'GET' | 'POST'; body?: Record<string, unknown> }
): Promise<T>
```

- Adicionar `access_token` nos params automaticamente
- Timeout de 30s com `AbortSignal.timeout(30_000)`
- Em caso de `response.ok === false`: parsear `error` do JSON e lançar erro tipado via `parseMetaError()`
- Chamar `rateLimiter.update(response.headers)` após cada resposta bem-sucedida

### Padrão do header de rate limit

```
X-Business-Use-Case-Usage: {"act_123456789": [{"call_count": 45, "total_cputime": 23, "total_time": 30, "type": "ads_management", "estimated_time_to_regain_access": 0}]}
```

O JSON é keyed por ad account ID. `RateLimiter` deve parsear todos os valores e usar o maior `call_count` como referência.

### Backoff com jitter

```typescript
const delay = (attempt: number) => {
  const base = Math.min(1000 * Math.pow(2, attempt), 16_000)
  const jitter = base * 0.2 * (Math.random() * 2 - 1) // ±20%
  return base + jitter
}
```

### Meta Batch API

```typescript
// POST https://graph.facebook.com/v21.0/
// Body: access_token={token}&batch=[{"method":"GET","relative_url":"/{id}?fields=name"},...]
// Max 50 requests por batch
```

### Referências de código existente

- **Padrão de retry existente:** `packages/web/src/app/api/webhooks/meta-ads/route.ts` — `fetchWithRetry()` (linha ~200)
- **Padrão de fetch com timeout:** mesmo arquivo — `AbortSignal.timeout(10_000)`
- **Padrão de shared lib:** `packages/shared/src/index.ts` — estrutura simples de re-exportação

### Env vars

Nenhuma env var nova nesta story — o client recebe o token como parâmetro.
Env vars (`META_SYSTEM_USER_TOKEN`, `META_AD_ACCOUNT_ID`) são injetadas pelas
stories consumidoras (16.3, 16.4, 16.5).

### TypeScript strict

O projeto usa TypeScript strict. Garantir:
- Sem `as any` nas interfaces públicas
- `MetaPagedResponse<T>` genérico
- Retornos tipados em `metaFetch<T>()`

## Tasks / Subtasks

- [x] **Task 1** — Criar tipos e erros base
  - Criar `packages/shared/src/meta/types.ts` com todas as interfaces (AC3)
  - Criar `packages/shared/src/meta/errors.ts` com hierarquia de erros (AC4)

- [x] **Task 2** — Criar rate limiter
  - Criar `packages/shared/src/meta/rate-limiter.ts` (AC2)
  - Parsear header `X-Business-Use-Case-Usage`
  - Circuit breaker em 75%

- [x] **Task 3** — Criar client principal
  - Criar `packages/shared/src/meta/client.ts` (AC1)
  - Implementar `metaFetch<T>()` com timeout e error handling
  - Implementar backoff exponencial com jitter (AC5)
  - Implementar `metaBatch()` (AC6)

- [x] **Task 4** — Exportar e validar
  - Criar `packages/shared/src/meta/index.ts` (AC7)
  - Atualizar `packages/shared/src/index.ts` com `export * from "./meta"`
  - Verificar `npm run type-check` sem erros (AC8)

## File List

### Arquivos a criar
- `packages/shared/src/meta/index.ts`
- `packages/shared/src/meta/client.ts`
- `packages/shared/src/meta/rate-limiter.ts`
- `packages/shared/src/meta/types.ts`
- `packages/shared/src/meta/errors.ts`

### Arquivos modificados
- `packages/shared/src/index.ts` — adicionar `export * from "./meta"`

## Testes

- [ ] `npm run type-check` passa sem erros
- [ ] `npm run lint` passa sem erros
- [ ] `metaFetch()` lança `MetaOAuthException` quando resposta tem `type=OAuthException`
- [ ] `metaFetch()` lança `MetaRateLimitError` quando resposta tem `code=17`
- [ ] `RateLimiter.isThrottled()` retorna `true` quando `call_count > 75`
- [ ] Backoff não executa retry para `MetaOAuthException`
- [ ] `metaBatch()` quebra array de 60 requests em 2 batches (50 + 10)

## 🤖 CodeRabbit Integration

**Story Type Analysis:**
- Primary Type: Shared Library (TypeScript)
- Complexity: Grande (5 arquivos, tipos genéricos, error hierarchy, async patterns)

**Specialized Agent Assignment:**
- Primary: `@dev` (implementação)
- Quality Gate: `@architect` (validar design do client, rate limiter, error hierarchy)

**Quality Gate Tasks:**
- [ ] Pre-Commit (`@dev`): `npm run type-check` sem erros
- [ ] Pre-PR (`@architect`): Revisar error hierarchy, rate limiter design, backoff logic

**CodeRabbit Focus Areas:**
- Type safety: sem `any` explícito nas interfaces públicas
- Error hierarchy: `parseMetaError()` cobre todos os casos conhecidos da Meta API
- Rate limiter: thread-safety (Node.js single-threaded — sem mutex necessário)
- Backoff: jitter correto, max retries respeitado, não retry em non-retriable errors
- Batch API: validação de max 50 requests por batch

## Change Log

| Data | Agente | Ação |
|---|---|---|
| 2026-04-24 | @sm (River) | Story criada — Draft |
| 2026-04-24 | @po (Pax) | Validação 10-point: 9.5/10 — GO. Status: Draft → Ready |
| 2026-04-24 | @dev (Dex) | Implementação completa — 5 arquivos criados, type-check ✅, lint ✅. Status: Ready → Ready for Review |
| 2026-04-24 | @qa (Quinn) | Review completo — verdict PASS. 3 concerns LOW documentados em gate file. |
| 2026-04-24 | @devops (Gage) | Push realizado — 16a92ad..08dddd7. Status: Done |

## Definition of Done

- [x] 5 arquivos criados em `packages/shared/src/meta/`
- [x] `packages/shared/src/index.ts` exporta o módulo meta
- [x] `npm run type-check` passa sem erros
- [x] `npm run lint` passa sem erros
- [x] @qa PASS (gate: `docs/qa/gates/16.2-meta-marketing-api-client.yml`)
- [x] @devops push realizado
