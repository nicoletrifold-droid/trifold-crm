---
epic: 16
story: 16.6
title: Webhook Logs + Monitoring
status: Ready for Review
priority: P1-ALTO
created_at: 2026-04-27
created_by: River (@sm)
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [logging_completeness, admin_visibility, health_check]
complexity: M
estimated_hours: 3
depends_on: [16.0, 16.1]
---

# Story 16.6 — Webhook Logs + Monitoring

## Contexto

Stories 16.0 (Fix webhook Graph API) e 16.1 (Tabelas Meta Marketing API) estão em produção.
A tabela `webhook_logs` existe no banco com schema: `id, org_id (NULLABLE), source, event_type,
payload, leadgen_id, signature_valid, processed, processing_error, created_at`.

Porém, o webhook handler atual (`/api/webhooks/meta-ads/route.ts`) **não grava nada em
`webhook_logs`**. Em produção, eventos chegam e são processados sem rastreabilidade — impossível
diagnosticar falhas ou auditar quais leadgen_ids foram recebidos.

Esta story completa a infra de observabilidade: persiste todos os eventos no banco, expõe via API
de admin, exibe em UI simples e alerta via Telegram se a integração Meta parar de receber eventos
durante horário comercial.

## Story Statement

**Como** administrador do Trifold CRM,
**Quero** visualizar um log de todos os webhooks Meta recebidos e ser alertado se a integração
parar de funcionar,
**Para que** eu possa diagnosticar falhas de recebimento de leads e garantir a saúde da integração
Meta Ads em produção.

## Acceptance Criteria

- [x] **AC1:** Webhook handler persistir todos os eventos em `webhook_logs`:
  - Modificar `packages/web/src/app/api/webhooks/meta-ads/route.ts`
  - Insert em `webhook_logs` **síncrono, antes de chamar `after()`** — garante registro mesmo se o async falhar
  - Campos obrigatórios: `source='meta_ads'`, `event_type`, `payload` (body original), `leadgen_id`,
    `signature_valid`, `processed=false`
  - Usar `createAdminClient()` — `org_id` pode ser null se não resolvido no momento do insert
  - Atualizar `processed=true` (ou `processing_error`) ao final do bloco `after()` async
  - Insert síncrono é seguro: leva ~50–200ms, dentro do SLA Meta (< 20s para retornar 200)

- [x] **AC2:** Endpoint `GET /api/admin/webhook-logs` criado em
  `packages/web/src/app/api/admin/webhook-logs/route.ts`:
  - Protegido por sessão de admin (usar `createServerClient()` + verificar role `admin`)
  - Query params suportados: `source` (filter), `limit` (default 50, max 200), `offset` (paginação)
  - Retorna: `{ data: WebhookLog[], total: number }`
  - Ordenado por `created_at DESC`

- [x] **AC3:** UI em `packages/web/src/app/dashboard/sistema/webhooks/page.tsx`:
  - Lista os últimos 50 eventos de `webhook_logs` via `/api/admin/webhook-logs`
  - Colunas: Horário, Source, Event Type, Leadgen ID (truncado), Assinatura, Status
  - Badge de status: verde=processed, vermelho=processing_error, cinza=pending
  - Filtro por source (select: Todos / meta_ads / whatsapp / google_forms)
  - Auto-refresh a cada 30s (padrão do `/dashboard/sistema/page.tsx`)
  - Link na navegação de sistema (ou aba na página `/dashboard/sistema`)

- [x] **AC4:** Health check cron em `packages/web/src/app/api/cron/webhook-health/route.ts`:
  - Roda a cada 30min via `vercel.json`: `"*/30 * * * *"`
  - Verifica: se é horário comercial (08h–20h BRT = 11h–23h UTC) E último evento
    `webhook_logs` com `source='meta_ads'` tem `created_at` > 30min atrás → alerta
  - Alerta via Telegram admin: `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ADMIN_CHAT_ID`
  - Se `TELEGRAM_ADMIN_CHAT_ID` não configurado: apenas `console.warn` (graceful degradation)
  - Protegido por `CRON_SECRET` (padrão existente)
  - Retorna 200 sempre (não deve gerar 5xx falsos)

- [x] **AC5:** Zero erros de TypeScript (`npm run type-check` passa). Sem `any` explícito nas
  funções públicas.

## Scope

### IN (o que esta story implementa)
- Modificação do webhook handler para gravar em `webhook_logs`
- `GET /api/admin/webhook-logs` — API de leitura com filtros
- UI `/dashboard/sistema/webhooks` — visualização dos últimos 50 eventos
- `GET /api/cron/webhook-health` — alerta se sem eventos Meta em horário comercial
- Cron registrado em `vercel.json` (`*/30 * * * *`)

### OUT (fora desta story)
- Alertas de falha de sync de campanhas (→ Story 16.13)
- Health check endpoint público `GET /api/health/meta-sync` (→ Story 16.13)
- Webhook logs para outros sources (WhatsApp, Google Forms — tabela já suporta)
- Export/download de logs
- Reprocessamento manual de eventos com erro

## Dev Notes

### Modificação crítica do webhook existente

O webhook atual em `route.ts` usa `after()` (Vercel Edge Runtime) para processar
assincronamente. O insert em `webhook_logs` deve ser feito **antes** de chamar `after()`,
para garantir que o evento é registrado mesmo se o processamento async falhar:

```typescript
// packages/web/src/app/api/webhooks/meta-ads/route.ts
import { createAdminClient } from "@web/lib/supabase/admin"

// No POST handler, logo após validar assinatura:
const supabase = createAdminClient()

// Insert síncrono — antes de after()
const { data: logEntry } = await supabase
  .from("webhook_logs")
  .insert({
    source: "meta_ads",
    event_type: value?.form_id ? "leadgen" : "unknown",
    payload: body,
    leadgen_id: leadgenId ?? null,
    signature_valid: signatureValid,
    processed: false,
  })
  .select("id")
  .single()

// Processar async com after() como antes
after(async () => {
  // ... lógica existente ...

  // Ao finalizar: atualizar log
  if (logEntry?.id) {
    await supabase
      .from("webhook_logs")
      .update({ processed: true })
      .eq("id", logEntry.id)
  }
})
```

**ATENÇÃO:** `createAdminClient()` já existe em `@web/lib/supabase/admin`.
O webhook handler atual usa `createClient()` direto — manter compatibilidade mas adicionar
o insert usando `createAdminClient()` (service role, contorna RLS).

**ATENÇÃO:** `webhook_logs.org_id` é NULLABLE — não incluir no insert se org_id não disponível
no momento do log (é resolvido depois durante o processamento async).

### Schema de webhook_logs (verificado em migration 015)

```
id               UUID     PK
org_id           UUID     NULLABLE (FK organizations)
source           TEXT     CHECK ('meta_ads', 'whatsapp', 'google_forms', 'other')
event_type       TEXT
payload          JSONB
leadgen_id       TEXT
signature_valid  BOOLEAN
processed        BOOLEAN  DEFAULT false
processing_error TEXT
created_at       TIMESTAMPTZ DEFAULT now()
```

### API de admin — padrão de auth

Verificar se user tem role de admin via Supabase session. O projeto já tem `createServerClient`
para rotas protegidas. Usar padrão similar a outros endpoints de admin:

```typescript
import { createServerClient } from "@web/lib/supabase/server"

export async function GET(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Verificar role admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // ... query webhook_logs
}
```

**Verificar** como outros endpoints de admin verificam role — pode haver helper existente.
Olhar `packages/web/src/app/api/system-events/route.ts` para o padrão.

### UI — padrão existente em /dashboard/sistema

A página `/dashboard/sistema/page.tsx` usa o padrão:
- `useEffect` + `fetch` + `setInterval(30000)` para auto-refresh
- Cards de status + tabela com filtros
- Sem SSR — `"use client"` component

Criar `/dashboard/sistema/webhooks/page.tsx` com o mesmo padrão visual.
Não é necessário modificar a navegação principal — a URL direta já é acessível.

### Health check — padrão de horário comercial

```typescript
function isBusinessHoursBRT(): boolean {
  const now = new Date()
  // BRT = UTC-3, horário comercial 08h–20h BRT = 11h–23h UTC
  const hourUTC = now.getUTCHours()
  return hourUTC >= 11 && hourUTC < 23
}
```

### Alerta Telegram admin

```typescript
async function sendTelegramAdminAlert(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID

  if (!token || !chatId) {
    console.warn("[WEBHOOK_HEALTH] Telegram admin not configured — alert suppressed:", message)
    return
  }

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message }),
    signal: AbortSignal.timeout(10000),
  })
}
```

### vercel.json — adicionar ao array crons existente

```json
{
  "path": "/api/cron/webhook-health",
  "schedule": "*/30 * * * *"
}
```

### Env vars

- `TELEGRAM_BOT_TOKEN` — já existe
- `TELEGRAM_ADMIN_CHAT_ID` — **nova env var** (graceful degradation se ausente)
- `CRON_SECRET` — já existe

## Tasks / Subtasks

- [x] **Task 1** — Modificar webhook handler para persistir em `webhook_logs`
  - Adicionar import `createAdminClient` no webhook handler
  - Insert em `webhook_logs` antes de `after()` (AC1)
  - Update `processed=true` / `processing_error` dentro do bloco async

- [x] **Task 2** — Criar API de admin para leitura de logs
  - Criar `packages/web/src/app/api/admin/webhook-logs/route.ts` (AC2)
  - Verificar padrão de auth admin em `packages/web/src/app/api/system-events/route.ts`
  - Query com filtros source, limit, offset

- [x] **Task 3** — Criar UI de webhook logs
  - Criar `packages/web/src/app/dashboard/sistema/webhooks/page.tsx` (AC3)
  - Seguir padrão visual de `/dashboard/sistema/page.tsx`
  - Tabela com badges de status + filtro por source + auto-refresh 30s

- [x] **Task 4** — Criar health check cron
  - Criar `packages/web/src/app/api/cron/webhook-health/route.ts` (AC4)
  - Verificar horário comercial BRT
  - Query `webhook_logs` para último evento `source='meta_ads'`
  - Alerta Telegram se silence > 30min em horário comercial
  - Adicionar ao `vercel.json`

- [x] **Task 5** — Validar
  - `npm run type-check` sem erros (AC5)
  - `npm run lint` sem erros

## File List

### Arquivos a criar
- `packages/web/src/app/api/admin/webhook-logs/route.ts`
- `packages/web/src/app/api/cron/webhook-health/route.ts`
- `packages/web/src/app/dashboard/sistema/webhooks/page.tsx`

### Arquivos modificados
- `packages/web/src/app/api/webhooks/meta-ads/route.ts` — adicionar insert em `webhook_logs`
- `vercel.json` — adicionar cron `webhook-health` a cada 30min

## Testes

- [ ] `npm run type-check` passa sem erros
- [ ] `npm run lint` passa sem erros
- [ ] Após POST válido ao webhook, `webhook_logs` tem 1 novo registro
- [ ] `signature_valid=false` não bloqueia o insert no log (evento inválido também é registrado)
- [ ] `GET /api/admin/webhook-logs` retorna 401 sem sessão, 403 sem role admin
- [ ] `GET /api/admin/webhook-logs?source=meta_ads&limit=10` retorna máx 10 registros
- [ ] UI exibe lista de eventos com badges corretos
- [ ] Health check retorna 200 sempre (não gera 5xx)
- [ ] Se `TELEGRAM_ADMIN_CHAT_ID` ausente: warning no console, sem erro

## 🤖 CodeRabbit Integration

**Story Type Analysis:**
- Primary Type: Backend Integration + UI + Monitoring
- Complexity: Média (modificação de webhook crítico + API + UI simples + cron)

**Specialized Agent Assignment:**
- Primary: `@dev` (implementação)
- Quality Gate: `@qa` (validar logging completo, auth da API, health check)

**Quality Gate Tasks:**
- [ ] Pre-Commit (`@dev`): `npm run type-check` sem erros
- [ ] Pre-PR (`@qa`): Validar que insert não bloqueia 200, auth admin correto, graceful degradation Telegram

**CodeRabbit Focus Areas:**
- Insert em `webhook_logs` não deve bloquear retorno 200 ao Meta
- Auth admin na API: verificar role corretamente
- Health check: graceful degradation se Telegram não configurado
- `org_id` nullable: não incluir se não disponível
- Admin client: uso correto de `createAdminClient()` vs `createServerClient()`

## QA Results

**Verdict: PASS** — Gate file: `docs/qa/gates/16.6-webhook-logs-monitoring.yml`

| AC | Status | Observação |
|---|---|---|
| AC1 | ✅ PASS | Insert antes de todos os early returns — sig inválida e ping também logados |
| AC2 | ✅ PASS | createAdminClient() sem filtro org_id — pending events (org_id NULL) visíveis |
| AC3 | ✅ PASS | UI completa, badges, filtros, auto-refresh |
| AC4 | ✅ PASS | Health check, business hours, Telegram graceful degradation |
| AC5 | ✅ PASS | type-check ✅ lint ✅ |

**Ciclo:** CONCERNS (1ª review) → fixes C-001/C-002 pelo @dev → PASS (2ª review)
**Debt registrado:** C-003 (LOW) — getServerUser() retorna redirect 302 vs 401 para API clients

## Change Log

| Data | Agente | Ação |
|---|---|---|
| 2026-04-27 | @sm (River) | Story criada — Draft |
| 2026-04-27 | @po (Pax) | Validação 10-point: 9/10 — GO. Correção: AC1 contradição insert síncrono vs dentro de after() — alinhado com Dev Notes (síncrono antes de after()). Status: Draft → Ready |
| 2026-04-27 | @dev (Dex) | Implementação completa — 4 arquivos criados + webhook modificado + vercel.json. type-check ✅ lint ✅. Status: Ready → Ready for Review |
| 2026-04-27 | @qa (Quinn) | Review completa — Verdict: CONCERNS. C-001: insert após early returns (sig inválida não logada). C-002: org_id filter exclui pending events. Gate: docs/qa/gates/16.6-webhook-logs-monitoring.yml |
| 2026-04-27 | @dev (Dex) | Fix C-001: insert síncrono movido para antes dos early returns — todos os eventos logados (sig inválida → processing_error, ping → processed=true). Fix C-002: admin endpoint usa createAdminClient() sem filtro org_id — pending events (org_id NULL) visíveis. type-check ✅ lint ✅ |
| 2026-04-27 | @qa (Quinn) | Re-review após fixes — Verdict: PASS. C-001 e C-002 resolvidos. C-003 registrado como debt (LOW). Story aprovada para @devops push. |

## Definition of Done

- [x] `webhook_logs` recebe todos os eventos Meta (insert no webhook handler)
- [x] `GET /api/admin/webhook-logs` funcional com auth admin
- [x] UI `/dashboard/sistema/webhooks` exibe logs com filtro e auto-refresh
- [x] Cron `webhook-health` rodando a cada 30min com alerta Telegram
- [x] `vercel.json` atualizado
- [x] `npm run type-check` passa sem erros
- [x] `npm run lint` passa sem erros
- [x] @qa PASS
- [ ] @devops push realizado
