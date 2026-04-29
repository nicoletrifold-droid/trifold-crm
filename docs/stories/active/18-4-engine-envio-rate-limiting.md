---
epic: 18
story: 18.4
title: Engine de Envio Evoluída + Rate Limiting
status: Ready
priority: P0-CRÍTICO
created_at: 2026-04-29
created_by: River (@sm)
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: [rate_limit_correctness, queue_reliability, retry_logic, backwards_compatibility]
complexity: G
estimated_hours: 5
depends_on: [18.1]
---

# Story 18.4 — Engine de Envio Evoluída + Rate Limiting

## Contexto

A função `sendEmail()` em `packages/web/src/lib/email.ts` é básica: envia via Resend sem log, sem template, sem fila e sem controle de quota. O Resend Free permite 100 emails/dia — ultrapassar esse limite resulta em rejeição silenciosa.

Esta story evolui a engine de envio com:
1. Log obrigatório de todos os envios em `email_logs` (18.1)
2. Rate limiting baseado na contagem diária
3. Fila de envio para emails que excedem a quota
4. Cron horário para processar a fila
5. Nova função `sendTemplateEmail()` para envios baseados em templates

Retrocompatibilidade com `sendEmail()` é obrigatória — todos os callers existentes continuam funcionando.

## Story Statement

**Como** sistema Trifold CRM,
**Quero** uma engine de envio de emails com fila, rate limiting (100/dia) e log automático,
**Para que** nenhum email ultrapasse o limite do Resend Free, todos os envios sejam rastreáveis e emails pendentes sejam processados no próximo ciclo disponível.

## Acceptance Criteria

- [ ] **AC1:** Nova função `sendTemplateEmail()` criada e exportada de `packages/web/src/lib/email.ts`:
  ```typescript
  async function sendTemplateEmail(params: {
    templateSlug: string
    to: { email: string; name?: string }
    variables: Record<string, string>
    triggeredBy: string            // "automation:followup-24h"
    orgId: string
    scheduledFor?: Date            // undefined = enviar imediatamente
    priority?: 1 | 5 | 10         // default: 5
  }): Promise<{ logId: string; queued: boolean; error?: string }>
  ```

- [ ] **AC2:** `sendTemplateEmail()` verifica quota antes de enviar:
  - Conta emails com `sent_at >= today 00:00 BRT` em `email_logs` (status != 'failed')
  - Se count >= 100: enfileira na `email_sends_queue` (não envia), retorna `{ queued: true }`
  - Se count >= 95 e priority > 1: enfileira, retorna `{ queued: true }`
  - Se count < 95 ou priority == 1: envia imediatamente

- [ ] **AC3:** Todo envio (imediato ou enfileirado) cria registro em `email_logs` antes de qualquer chamada ao Resend:
  - Status inicial: `'pending'`
  - Atualizado para `'sent'` após resposta OK do Resend
  - Atualizado para `'failed'` com `error_message` em caso de erro
  - `resend_email_id` preenchido com ID retornado pelo Resend

- [ ] **AC4:** Tags Resend incluem `email_log_id` para rastreamento pelo webhook (18.5):
  ```typescript
  tags: [
    { name: 'email_log_id', value: logId },
    { name: 'template_slug', value: templateSlug },
    { name: 'org_id', value: orgId }
  ]
  ```

- [ ] **AC5:** Cron `POST /api/cron/email-queue` criado:
  - Busca até `min(50, quota_restante)` itens com `status='pending'` e `scheduled_for <= now()`
  - Processa por prioridade (1 primeiro) e `scheduled_for` crescente
  - Marca como `status='processing'` antes de enviar (previne double-send)
  - Atualiza `email_logs.status` e `email_sends_queue.status` após cada envio
  - Incrementa `attempts` em falha; marca `status='failed'` após `max_attempts`
  - Registrado em `vercel.json`: `{"path": "/api/cron/email-queue", "schedule": "0 * * * *"}`
  - Protegido por `CRON_SECRET` (padrão existente)

- [ ] **AC6:** `sendEmail()` existente (retrocompatibilidade):
  - Continua funcionando sem alteração de assinatura
  - Internamente passa a criar registro em `email_logs` com `template_id = null` e `triggered_by = 'legacy'`
  - Callers existentes (`/api/cron/followup`, campanhas) não precisam de alteração

- [ ] **AC7:** Retry automático em `sendTemplateEmail()` para erros de rede (não erros 4xx):
  - Max 2 retries com backoff: 1s → 2s
  - Erro 4xx (API key inválida, destinatário bloqueado): não retentar, marcar `failed` imediatamente

- [ ] **AC8:** `npm run type-check` passa sem erros. Sem `any` explícito nas funções públicas.

## Scope

### IN
- `sendTemplateEmail()` — nova função principal
- Rate limiting baseado em contagem diária em `email_logs`
- Fila em `email_sends_queue`
- Cron `email-queue` horário
- Retrocompatibilidade total de `sendEmail()`

### OUT
- Renderização do HTML do template (a engine recebe o html já renderizado — 18.3 cuida do preview, o template HTML é armazenado no banco)
- Webhook de tracking (→ Story 18.5)
- Alertas de quota (→ Story 18.6)
- Descadastro / unsubscribe handling (fora do MVP)

## Dev Notes

### Arquivo a modificar

`packages/web/src/lib/email.ts` — adicionar `sendTemplateEmail()` abaixo da `sendEmail()` existente sem alterar a assinatura da função existente.

### Calcular quota diária (BRT = UTC-3)

```typescript
// Contar emails enviados hoje em BRT
async function getEmailsSentToday(orgId: string, supabase: SupabaseClient): Promise<number> {
  // BRT é UTC-3. Início do dia BRT = 03:00 UTC
  const now = new Date()
  const startOfDayBRT = new Date(now)
  startOfDayBRT.setUTCHours(3, 0, 0, 0) // 03:00 UTC = 00:00 BRT
  if (now.getUTCHours() < 3) {
    // Ainda é "ontem BRT" — subtrair 1 dia
    startOfDayBRT.setUTCDate(startOfDayBRT.getUTCDate() - 1)
  }

  const { count } = await supabase
    .from('email_logs')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .neq('status', 'failed')
    .gte('sent_at', startOfDayBRT.toISOString())

  return count ?? 0
}
```

### Fluxo completo de `sendTemplateEmail()`

```
1. Buscar template por slug e org_id em email_templates
2. Se não encontrado: retornar { error: 'Template not found' }
3. Se is_active = false: retornar { error: 'Template is not active' }
4. Resolver variáveis: substituir {{chave}} no subject e html_body
5. Verificar variáveis obrigatórias preenchidas
6. Criar registro em email_logs (status='pending')
7. Verificar quota do dia
   - Se enfileirar: criar email_sends_queue, retornar { logId, queued: true }
   - Se enviar: chamar sendEmail() internamente, atualizar status
8. Retornar { logId, queued: false }
```

### Substituição de variáveis

```typescript
function resolveTemplate(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    variables[key] ?? `{{${key}}}` // deixa a variável no texto se não fornecida
  )
}
```

### Cron de fila — arquivo a criar

`packages/web/src/app/api/cron/email-queue/route.ts`

Padrão a seguir: `packages/web/src/app/api/cron/followup/route.ts`

```typescript
// Estrutura do cron
export async function GET(request: NextRequest) {
  // 1. Verificar CRON_SECRET
  // 2. Usar service_role para bypass RLS
  // 3. Calcular quota restante
  // 4. Buscar itens da fila por prioridade
  // 5. Para cada item: marcar processing → enviar → atualizar status
  // 6. Retornar { processed: n, failed: m }
}
```

### vercel.json — adicionar entrada

```json
{
  "path": "/api/cron/email-queue",
  "schedule": "0 * * * *"
}
```

### Testing

- Testar que `sendEmail()` ainda funciona sem alteração (smoke test)
- Testar que `sendTemplateEmail()` cria registro em `email_logs`
- Testar rate limiting: mock de 100 emails hoje → deve enfileirar
- Testar cron com itens na fila — deve processar em ordem de prioridade
- `npm run type-check` deve passar

## 🤖 CodeRabbit Integration

**Story Type Analysis:**
- Primary Type: API (backend service)
- Secondary Type(s): Integration (Resend API)
- Complexity: High (rate limiting, queue, retry, retrocompatibilidade)

**Specialized Agent Assignment:**
- Primary Agents: @dev, @architect (quality gate)
- Supporting Agents: —

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): Testar `sendEmail()` retrocompatibilidade
- [ ] Pre-PR (@devops): Testar rate limiting com mock de quota atingida

**CodeRabbit Focus Areas:**
- Primary: Retrocompatibilidade — `sendEmail()` sem quebra de callers existentes
- Primary: Rate limiting correto — contagem em BRT não UTC
- Secondary: Double-send prevention no cron (status='processing' antes de enviar)
- Secondary: Retry apenas em erros de rede, não em 4xx

**Self-Healing Configuration:**
- Primary Agent: @dev (light mode)
- Max Iterations: 2 | Timeout: 15min | Severity Filter: CRITICAL
- CRITICAL: auto_fix | HIGH: document_only

## Tasks / Subtasks

- [ ] **Task 1 — Função auxiliar de quota** (AC: 2)
  - [ ] `getEmailsSentToday(orgId, supabase)` — contagem diária em BRT
  - [ ] Testar com mock de banco

- [ ] **Task 2 — `sendTemplateEmail()`** (AC: 1, 2, 3, 4, 7)
  - [ ] Buscar template por slug
  - [ ] Resolver variáveis no subject e html_body
  - [ ] Criar `email_log` com status 'pending'
  - [ ] Verificar quota → enviar ou enfileirar
  - [ ] Tags Resend com `email_log_id`
  - [ ] Retry 2x em erros de rede

- [ ] **Task 3 — Retrocompatibilidade `sendEmail()`** (AC: 6)
  - [ ] Adicionar criação de `email_log` dentro de `sendEmail()`
  - [ ] `triggered_by = 'legacy'`, `template_id = null`
  - [ ] Testar callers existentes (followup, campaign confirmation)

- [ ] **Task 4 — Cron `email-queue`** (AC: 5)
  - [ ] Criar `packages/web/src/app/api/cron/email-queue/route.ts`
  - [ ] Lógica de processamento com prioridade
  - [ ] Atualização de status no banco após cada envio
  - [ ] Registrar em `vercel.json`

- [ ] **Task 5 — Qualidade** (AC: 8)
  - [ ] `npm run type-check` sem erros
  - [ ] `npm run lint` sem erros

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-29 | 1.0 | Story criada | River (@sm) |
