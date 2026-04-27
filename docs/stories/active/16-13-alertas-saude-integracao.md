---
epic: 16
story: 16.13
title: Alertas e Saúde da Integração Meta Ads
status: Done
priority: P2-MÉDIO
created_at: 2026-04-27
created_by: River (@sm)
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [alerting_correctness, token_expiry_detection, health_endpoint]
complexity: P
estimated_hours: 2
depends_on: [16.4, 16.5]
---

# Story 16.13 — Alertas e Saúde da Integração Meta Ads

## Contexto

Os crons `meta-sync-entities` (a cada 4h) e `meta-sync-insights` (diário às 06h BRT) já registram falhas em `meta_sync_log` e marcam `meta_ad_accounts.status = 'error'` quando detectam `MetaOAuthException`. Porém, **nenhum alerta ativo é enviado** — falhas passam silenciosas. O operador só descobrirá o problema ao verificar manualmente o dashboard.

Já existe na codebase um padrão completo de alerta Telegram em:
- `packages/web/src/app/api/cron/webhook-health/route.ts` — detecta silêncio de webhooks, envia alerta via `TELEGRAM_ADMIN_CHAT_ID`
- Pattern: `sendTelegramAdminAlert(message)` com guard de horário comercial BRT

Esta story fecha o loop de observabilidade da integração Meta Ads com:
1. Cron de health que detecta sync failures e token inválido → alerta Telegram
2. Health endpoint público para monitoramento externo
3. Expandir crons existentes para enviar alerta imediato ao detectar OAuthException

---

## Acceptance Criteria

### AC1 — Cron `meta-sync-health`: Detectar sync failure + alerta Telegram
**Dado** que existe o cron `GET /api/cron/meta-sync-health` autorizado por `CRON_SECRET`
**E** o cron roda a cada 4h (registrado em `vercel.json`)
**Quando** o cron executa durante horário comercial BRT (08h–20h)
**Então** ele verifica `meta_sync_log` para detectar:
  - Nenhum sync `entities` com `status = 'success'` nas últimas 6 horas → falha de sync de entidades
  - Nenhum sync `insights` com `status = 'success'` nas últimas 26 horas → falha de sync de insights
**E** se qualquer condição de falha for detectada, envia alerta Telegram para `TELEGRAM_ADMIN_CHAT_ID`
**E** a mensagem inclui: tipo de sync, último sucesso (ou "nunca"), status atual
**E** retorna `{ ok: true, alerts_sent: N, checks: [...] }` com HTTP 200 independente do resultado

### AC2 — Cron `meta-sync-health`: Detectar token inválido + alerta Telegram
**Dado** que `meta_ad_accounts` tem alguma conta com `status = 'error'`
(esse status é setado pelos crons 16.4/16.5 quando detectam `MetaOAuthException`)
**Quando** o cron `meta-sync-health` executa
**Então** detecta contas com `status = 'error'` em `meta_ad_accounts`
**E** envia alerta Telegram: "⚠️ Token Meta Ads inválido ou expirado — renovar no painel de configurações"
**E** inclui o `meta_account_id` da conta afetada na mensagem

### AC3 — Expandir crons existentes com alerta Telegram imediato
**Dado** que `meta-sync-entities` ou `meta-sync-insights` detectam `MetaOAuthException` durante execução
**Quando** o erro é capturado no `catch` de `MetaOAuthException`
**Então** além do log existente (`console.error`) e update de status em `meta_ad_accounts`, enviam alerta Telegram imediato:
  `"🔴 [Meta Sync] Token inválido para conta {meta_account_id} — sync interrompido. Acesse /dashboard/configuracoes/integracoes para renovar."`
**E** a função `sendTelegramAdminAlert` é reutilizada (importada de `@web/lib/telegram` — extrair helper compartilhado)

### AC4 — Endpoint `GET /api/health/meta-sync`
**Dado** que o endpoint existe em `packages/web/src/app/api/health/meta-sync/route.ts`
**E** não requer autenticação (health check público, sem dados sensíveis)
**Quando** `GET /api/health/meta-sync` é chamado
**Então** retorna JSON com:
```json
{
  "status": "healthy" | "degraded" | "error",
  "checks": {
    "entities_sync": { "status": "ok" | "stale" | "error", "last_success_at": "ISO" | null, "hours_since_sync": N },
    "insights_sync": { "status": "ok" | "stale" | "error", "last_success_at": "ISO" | null, "hours_since_sync": N },
    "token_status": { "status": "ok" | "error", "accounts_with_error": N }
  },
  "timestamp": "ISO"
}
```
**E** HTTP 200 se `status = 'healthy'`
**E** HTTP 503 se `status = 'degraded'` ou `'error'`
**Limites de staleness:** entities > 6h = stale, insights > 26h = stale

### AC5 — Helper `sendTelegramAdminAlert` extraído para lib compartilhada
**Dado** que o mesmo padrão de envio Telegram existe em `webhook-health/route.ts`
**Quando** a story é implementada
**Então** a função é extraída para `packages/web/src/lib/telegram.ts`:
```typescript
export async function sendTelegramAdminAlert(message: string): Promise<void>
```
**E** `webhook-health/route.ts` atualizado para importar de `@web/lib/telegram`
**E** os novos arquivos (`meta-sync-health/route.ts`, `meta-sync-entities/route.ts`) importam de `@web/lib/telegram`
**E** sem duplicação da função em múltiplos arquivos

---

## Scope

### IN
- Novo cron `GET /api/cron/meta-sync-health`
- Novo endpoint `GET /api/health/meta-sync`
- Novo helper `packages/web/src/lib/telegram.ts` com `sendTelegramAdminAlert`
- Refactor de `webhook-health/route.ts` para importar de `@web/lib/telegram`
- Expandir catch de `MetaOAuthException` em `meta-sync-entities/route.ts` e `meta-sync-insights/route.ts` para enviar alerta Telegram
- Registrar `meta-sync-health` em `vercel.json` (schedule: `0 */4 * * *`)

### OUT
- Rate limit proximity warning (o `rateLimiter` é in-memory no serverless — reseta entre invocações; não é possível ter threshold confiável sem persistência. Tech debt para story futura se necessário)
- UI de health no dashboard (fora do escopo P)
- Alerta de rate limit baseado em `meta_sync_log.api_calls_made` (não há baseline definido)
- Testes de alertas de outros sources (apenas Meta Ads)
- Modificar a lógica de sync (apenas adicionar notificações)

---

## Dev Notes

### Padrão de horário comercial BRT (reusar de webhook-health)

```typescript
function isBusinessHoursBRT(): boolean {
  // BRT = UTC-3 — 08h–20h BRT = 11h–23h UTC
  const hourUTC = new Date().getUTCHours()
  return hourUTC >= 11 && hourUTC < 23
}
```

O cron de health **só envia alertas fora de horário comercial** (mesmo padrão de webhook-health). Retorna `{ ok: true, skipped: 'outside_business_hours' }` fora do horário.

### Novo arquivo: `packages/web/src/lib/telegram.ts`

```typescript
export async function sendTelegramAdminAlert(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID

  if (!token || !chatId) {
    console.warn("[TELEGRAM] Admin not configured — alert suppressed:", message)
    return
  }

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "Markdown" }),
      signal: AbortSignal.timeout(10000),
    })
  } catch (err) {
    console.error("[TELEGRAM] Failed to send admin alert:", err)
  }
}
```

### Lógica do cron `meta-sync-health`

```typescript
// Verificar entities (última 6h)
const entitiesThreshold = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
const { data: lastEntities } = await supabase
  .from("meta_sync_log")
  .select("id, finished_at, status")
  .eq("sync_type", "entities")
  .eq("status", "success")
  .order("finished_at", { ascending: false })
  .limit(1)
  .single()

// Verificar insights (últimas 26h — sync diário)
const insightsThreshold = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString()
const { data: lastInsights } = await supabase
  .from("meta_sync_log")
  .select("id, finished_at, status")
  .eq("sync_type", "insights")
  .eq("status", "success")
  .order("finished_at", { ascending: false })
  .limit(1)
  .single()

// Verificar token status
const { data: errorAccounts } = await supabase
  .from("meta_ad_accounts")
  .select("id, meta_account_id")
  .eq("status", "error")
```

### Expandir MetaOAuthException catch em crons existentes

Em `meta-sync-entities/route.ts` linha ~217 e equivalente em `meta-sync-insights/route.ts`, adicionar após o log existente:

```typescript
if (err instanceof MetaOAuthException) {
  // Código existente — manter
  await supabase.from("meta_ad_accounts")
    .update({ status: "error", updated_at: new Date().toISOString() })
    .eq("id", account.id)
  // ... update syncLog ...
  console.error(`[META_SYNC] Token invalid for account ${account.id}`)

  // NOVO: alerta imediato
  await sendTelegramAdminAlert(
    `🔴 *[Meta Sync] Token inválido*\n\nConta: \`${account.meta_account_id}\`\n\nO sync foi interrompido. Acesse as configurações para renovar o token.`
  )

  results.push({ account_id: account.id, status: "token_invalid" })
  continue
}
```

### Health endpoint — lógica de status

```
"healthy"  → entities OK + insights OK + token OK
"degraded" → entities stale OU insights stale (mas nenhum erro de token)
"error"    → qualquer token com status "error" OU entities/insights sem nenhum sync histórico
```

### vercel.json — adicionar entrada

```json
{
  "path": "/api/cron/meta-sync-health",
  "schedule": "0 */4 * * *"
}
```

---

## Tasks

- [x] **T1** — Extrair helper `sendTelegramAdminAlert` para `packages/web/src/lib/telegram.ts`
  - [x] Criar `packages/web/src/lib/telegram.ts` com a função
  - [x] Refatorar `webhook-health/route.ts` para importar de `@web/lib/telegram` (remover duplicata local)

- [x] **T2** — Expandir catch de `MetaOAuthException` nos crons existentes
  - [x] Adicionar `sendTelegramAdminAlert` no catch de `MetaOAuthException` em `meta-sync-entities/route.ts`
  - [x] Adicionar `sendTelegramAdminAlert` no catch de `MetaOAuthException` em `meta-sync-insights/route.ts`

- [x] **T3** — Criar cron `packages/web/src/app/api/cron/meta-sync-health/route.ts`
  - [x] Verificar entities sync (6h threshold)
  - [x] Verificar insights sync (26h threshold)
  - [x] Verificar token status (`meta_ad_accounts.status = 'error'`)
  - [x] Guard de horário comercial BRT
  - [x] Enviar alertas Telegram para cada falha detectada
  - [x] Registrar em `vercel.json` schedule `0 */4 * * *`

- [x] **T4** — Criar endpoint `packages/web/src/app/api/health/meta-sync/route.ts`
  - [x] Implementar lógica de status (healthy/degraded/error)
  - [x] Retornar checks: entities_sync, insights_sync, token_status
  - [x] HTTP 200 se healthy, HTTP 503 se degraded/error

---

## Testing

### Cenário 1 — entities sync stale
- Inserir em `meta_sync_log`: último entities success com `finished_at = NOW() - 7h`
- Chamar `GET /api/cron/meta-sync-health` com `Authorization: Bearer {CRON_SECRET}`
- Verificar: `alert_sent: true`, mensagem Telegram enviada (ou logada se Telegram não configurado)

### Cenário 2 — token inválido detectado no health
- Setar `meta_ad_accounts.status = 'error'` para uma conta
- Chamar `GET /api/cron/meta-sync-health`
- Verificar: alerta sobre token inválido

### Cenário 3 — tudo OK
- `meta_sync_log` com sucesso recente (<6h entities, <26h insights)
- `meta_ad_accounts` sem status error
- Chamar cron → `{ ok: true, alerts_sent: 0 }`

### Cenário 4 — health endpoint
- `GET /api/health/meta-sync` (sem auth)
- Verificar: retorna JSON com todas as chaves esperadas, status correto, HTTP code correto

### Cenário 5 — fora do horário comercial
- Simular hora fora de 11h–23h UTC em `isBusinessHoursBRT()`
- Chamar cron → `{ ok: true, skipped: 'outside_business_hours' }`

### Cenário 6 — OAuthException nos crons existentes
- Mock de `MetaOAuthException` sendo lançada no catch de `meta-sync-entities`
- Verificar: alerta Telegram imediato enviado (além do comportamento existente preservado)

---

## Dev Agent Record

### Agent Model Used
Claude Sonnet 4.6

### Debug Log References
Nenhum blocker — implementação direta.

### Completion Notes
- Typecheck: PASS
- Lint: 0 errors (2 warnings pré-existentes em arquivos não modificados por esta story)
- `sendTelegramAdminAlert` extraída para `@web/lib/telegram` — elimina duplicata em `webhook-health/route.ts`
- `maybeSingle()` usado nos queries de `meta_sync_log` (ao invés de `single()`) para evitar erro PGRST116 quando tabela está vazia
- Alerta Telegram imediato nos crons existentes ao detectar OAuthException — sem mudança no comportamento de erro existente
- Health endpoint sem auth — retorna 503 se degraded/error, 200 se healthy

### File List
- `packages/web/src/lib/telegram.ts` (novo)
- `packages/web/src/app/api/cron/meta-sync-health/route.ts` (novo)
- `packages/web/src/app/api/health/meta-sync/route.ts` (novo)
- `packages/web/src/app/api/cron/webhook-health/route.ts` (modificado — importar de lib)
- `packages/web/src/app/api/cron/meta-sync-entities/route.ts` (modificado — alerta OAuthException)
- `packages/web/src/app/api/cron/meta-sync-insights/route.ts` (modificado — alerta OAuthException)
- `vercel.json` (modificado — adicionar meta-sync-health)

---

## QA Results

**Veredicto: PASS ✅** — Quinn (@qa) | 2026-04-27 | Iteração 1

Todos os 5 ACs cumpridos. Typecheck PASS, Lint PASS (0 errors).

**Concern documentado (não-bloqueante):**
- ALERT-REPEAT-001 (LOW): Sem cooldown entre alertas — em falha prolongada o admin recebe múltiplos alertas iguais a cada 4h. AC não exige deduplicação. Tech debt para story futura.

Gate file: `docs/qa/gates/16.13-alertas-saude-integracao.yml`

---

## Change Log

| Data | Agente | Ação |
|------|--------|------|
| 2026-04-27 | River (@sm) | Story criada |
| 2026-04-27 | Pax (@po) | Validação GO 10/10 — aprovada para desenvolvimento |
| 2026-04-27 | Dex (@dev) | Implementação completa — typecheck PASS, lint PASS (0 errors) |
| 2026-04-27 | Quinn (@qa) | QA Gate PASS — 5 ACs verificados, 1 concern LOW não-bloqueante |
| 2026-04-27 | Gage (@devops) | Push para origin/main — Story Done |
