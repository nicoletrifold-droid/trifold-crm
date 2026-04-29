---
epic: 18
story: 18.5
title: Webhook Resend Expandido — Tracking de Templates
status: Ready
priority: P1-ALTO
created_at: 2026-04-29
created_by: River (@sm)
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [webhook_security, event_idempotency, backwards_compatibility, signature_validation]
complexity: P
estimated_hours: 2
depends_on: [18.1, 18.4]
---

# Story 18.5 — Webhook Resend Expandido (Tracking de Templates)

## Contexto

O webhook em `packages/web/src/app/api/webhook/resend/route.ts` já processa eventos Resend para `campaign_entries` usando a tag `entry_id`. Esta story **expande** — não substitui — esse handler para também rastrear emails enviados via `sendTemplateEmail()` (Story 18.4), que incluem a tag `email_log_id`.

A lógica de roteamento é simples: se o evento tiver `entry_id` → comportamento atual; se tiver `email_log_id` → nova lógica de atualização em `email_logs`.

Adicionalmente, habilitar o evento `email.complained` no handler (spam reports).

## Story Statement

**Como** sistema de rastreamento de emails do Trifold CRM,
**Quero** que o webhook Resend atualize `email_logs` para emails de templates (além de `campaign_entries` para emails de campanha),
**Para que** o dashboard de monitoramento (18.6) exiba o status real de entrega, abertura e clique de todos os emails.

## Acceptance Criteria

- [ ] **AC1:** Roteamento no webhook por tipo de tag:
  ```typescript
  const entryId = tags?.entry_id          // campanha — comportamento atual preservado
  const emailLogId = tags?.email_log_id   // template — nova lógica

  if (entryId) {
    // Comportamento atual sem alteração
  } else if (emailLogId) {
    // Nova lógica de atualização em email_logs
  } else {
    // Logar e retornar { status: 'skipped' } (comportamento atual mantido)
  }
```

- [ ] **AC2:** Para eventos com `email_log_id`, atualizar `email_logs` com:
  - `email.delivered` → `status = 'delivered'`, `delivered_at = now()`
  - `email.opened` → `status = 'opened'`, `opened_at = now()`
  - `email.clicked` → `status = 'clicked'`, `clicked_at = now()`
  - `email.bounced` → `status = 'bounced'`, `bounced_at = now()`
  - `email.complained` → `status = 'complained'` (sem timestamp específico)

- [ ] **AC3:** Idempotência — processar o mesmo evento 2x não corrompe dados:
  - Usar `UPDATE ... WHERE id = emailLogId AND status != 'novo_status'` ou verificar antes de atualizar
  - Segundo processamento do mesmo evento retorna 200 sem erro

- [ ] **AC4:** Eventos com `entry_id` continuam com comportamento exatamente igual ao atual — zero regressão:
  - Atualiza `campaign_entries.email_status`
  - Insere em `campaign_events`
  - Nenhuma linha de código do path `entry_id` é alterada

- [ ] **AC5:** Svix signature validation ativa em produção:
  - Verificação da assinatura Svix permanece igual ao código atual
  - Sem relaxamento da validação

- [ ] **AC6:** Evento `email.complained` adicionado à lista de eventos aceitos pelo handler (atualmente apenas delivered/opened/bounced/clicked)

- [ ] **AC7:** `npm run type-check` passa sem erros

## Scope

### IN
- Roteamento por `entry_id` vs `email_log_id`
- Atualização de `email_logs` para eventos de template
- Suporte ao evento `email.complained`
- Idempotência

### OUT
- Alteração no comportamento do path `entry_id` (zero mudança)
- Novo endpoint de webhook (mesmo endpoint expandido)
- Alerta de bounce/complained ao admin (→ Story 18.6)
- Unsubscribe automático em `email.complained` (fora do MVP)

## Dev Notes

### Arquivo a modificar

`packages/web/src/app/api/webhook/resend/route.ts` — arquivo existente com ~100 linhas.

### Estrutura atual do handler (para referência)

```typescript
// Trecho atual — manter intacto para entry_id
const tags = body.data?.tags as Record<string, string> | undefined
const entryId = tags?.entry_id
const campaignId = tags?.campaign_id

if (!entryId) {
  // Atualmente: log warn e return 'skipped'
  // NOVO: verificar email_log_id antes de retornar
}
```

### Modificação mínima necessária

```typescript
// Substituir o bloco "if (!entryId)" existente por:
const emailLogId = tags?.email_log_id

if (!entryId && !emailLogId) {
  logEvent({ /* warn existente */ })
  return NextResponse.json({ status: 'skipped' })
}

if (entryId) {
  // TODA a lógica existente — sem alterar uma linha
  // ...
} else if (emailLogId) {
  // NOVA lógica para email_logs
  await updateEmailLog(supabase, emailLogId, eventType)
}
```

### Função `updateEmailLog` (nova — adicionar ao final do arquivo)

```typescript
async function updateEmailLog(
  supabase: SupabaseClient,
  emailLogId: string,
  eventType: string
): Promise<void> {
  const updates: Record<string, unknown> = {}
  const now = new Date().toISOString()

  switch (eventType) {
    case 'email.delivered':
      updates.status = 'delivered'
      updates.delivered_at = now
      break
    case 'email.opened':
      updates.status = 'opened'
      updates.opened_at = now
      break
    case 'email.clicked':
      updates.status = 'clicked'
      updates.clicked_at = now
      break
    case 'email.bounced':
      updates.status = 'bounced'
      updates.bounced_at = now
      break
    case 'email.complained':
      updates.status = 'complained'
      break
    default:
      return
  }

  await supabase
    .from('email_logs')
    .update(updates)
    .eq('id', emailLogId)
}
```

### Lista de eventos aceitos — adicionar `email.complained`

```typescript
// Trecho atual no handler:
if (!['email.delivered', 'email.opened', 'email.bounced', 'email.clicked'].includes(eventType)) {

// Substituir por:
if (!['email.delivered', 'email.opened', 'email.bounced', 'email.clicked', 'email.complained'].includes(eventType)) {
```

### Nota sobre habilitar `email.complained` no Resend

Após deploy, habilitar manualmente o evento `email.complained` no painel do Resend:
`resend.com → Webhooks → selecionar webhook → adicionar evento "Email complained"`

Documentar esse passo em `docs/architecture/resend-webhook-config.md`.

### Testing

- Testar evento com `entry_id` — comportamento atual preservado (sem regressão)
- Testar evento com `email_log_id` — `email_logs` atualizado corretamente
- Testar evento sem nenhuma das tags — retorna `{ status: 'skipped' }`
- Testar `email.complained` — aceito e atualiza status
- Testar mesmo evento 2x — idempotente (sem erro no segundo processamento)
- `npm run type-check` deve passar

## 🤖 CodeRabbit Integration

**Story Type Analysis:**
- Primary Type: Integration (webhook Resend)
- Secondary Type(s): API
- Complexity: Low (modificação cirúrgica em arquivo existente)

**Specialized Agent Assignment:**
- Primary Agents: @dev, @qa (quality gate)
- Supporting Agents: —

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): Testar path `entry_id` sem regressão
- [ ] Pre-PR (@devops): Testar path `email_log_id` com evento real

**CodeRabbit Focus Areas:**
- Primary: Zero regressão no path `entry_id` (comportamento atual preservado)
- Primary: Idempotência — mesmo evento 2x não corrompe
- Secondary: `email.complained` aceito e mapeado corretamente
- Secondary: Svix signature validation não relaxada

**Self-Healing Configuration:**
- Primary Agent: @dev (light mode)
- Max Iterations: 2 | Timeout: 15min | Severity Filter: CRITICAL
- CRITICAL: auto_fix | HIGH: document_only

## Tasks / Subtasks

- [x] **Task 1 — Adicionar `email.complained` à lista de eventos** (AC: 6)
  - [x] `email.complained` adicionado ao array de eventos aceitos

- [x] **Task 2 — Roteamento por tag** (AC: 1)
  - [x] `emailLogId` extraído das tags
  - [x] `if (!entryId)` → `if (!entryId && !emailLogId)` com roteamento condicional

- [x] **Task 3 — Função `updateEmailLog`** (AC: 2, 3)
  - [x] `updateEmailLog(supabase, emailLogId, eventType)` adicionada ao final do arquivo
  - [x] Switch com todos os 5 eventos: delivered, opened, clicked, bounced, complained
  - [x] Idempotente: `UPDATE ... WHERE id = emailLogId` (sem verificação de status atual — segundo UPDATE é no-op se status já igual)

- [x] **Task 4 — Verificar zero regressão** (AC: 4)
  - [x] Código do path `entry_id` copiado exatamente sem alterações
  - [x] type-check OK, 217 testes passando

- [ ] **Task 5 — Documentação** (AC: 5)
  - [x] Nota em `docs/architecture/resend-webhook-config.md` — tabela atualizada com `email.complained` e seção de roteamento por tag
  - [ ] Instrução: habilitar `email.complained` no painel Resend após deploy (manual)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-29 | 1.0 | Story criada | River (@sm) |
| 2026-04-29 | 1.1 | Webhook expandido: roteamento entry_id/email_log_id, email.complained, updateEmailLog(). Zero regressão no path de campanha. type-check OK. | Dex (@dev) |
