---
epic: 15
story: 15.14
title: "Hardening: RESEND_WEBHOOK_SECRET obrigatório"
status: Draft
priority: P1-ALTO
created_at: 2026-05-05
created_by: River (@sm)
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [security-scan, code-review, test-validation]
complexity: S
estimated_hours: 1
depends_on: [15.11]
---

# Story 15.14 — Hardening: RESEND_WEBHOOK_SECRET obrigatório

## Contexto

**Epic 15 — Campaign Engine (Fase 2 — Painel + Tracking)**

A Story 15.11 implementou verificacao HMAC-SHA256 via Svix para o webhook `POST /api/webhook/resend`. Por backwards-compat durante o deploy gradual, o bloco de validacao tem um fallback permissivo: quando `RESEND_WEBHOOK_SECRET` nao esta configurado, o handler loga um `warn` e aceita o request normalmente.

O comentario no codigo e explicito (`route.ts` linhas 77-88):

```typescript
// No secret configured: log a warning and accept (backwards-compat during deploy).
// Once RESEND_WEBHOOK_SECRET is set in all environments, missing-secret should be
// treated as a hard failure.
```

O deploy gradual foi concluido. Esta story remove o fallback permissivo e torna a ausencia do secret um hard-fail com HTTP 503, completando o hardening iniciado em 15.11.

**Dependencias:** Story 15.11 (webhook base + validacao Svix implementada).

## Story Statement

**Como** sistema de seguranca do Trifold CRM,
**Quero** que o endpoint `POST /api/webhook/resend` recuse requests imediatamente quando `RESEND_WEBHOOK_SECRET` nao estiver configurado no ambiente,
**Para que** nenhum webhook nao-autenticado seja processado silenciosamente em producao.

## Acceptance Criteria

- [ ] **AC1:** Quando `RESEND_WEBHOOK_SECRET` nao estiver configurado (`undefined` ou string vazia), o endpoint retorna HTTP 503 com body `{ "error": "Webhook secret not configured" }` e loga `RESEND_WEBHOOK_SECRET_MISSING` em nivel `"error"`.

- [ ] **AC2:** O comportamento atual de "warn + aceitar sem verificacao" e removido integralmente — nao existe mais nenhum caminho de codigo que aceite um request sem secret configurado.

- [ ] **AC3:** Quando `RESEND_WEBHOOK_SECRET` esta corretamente configurado, o fluxo de verificacao HMAC-SHA256 (Svix) continua identico ao implementado em 15.11 — nenhuma regressao nos paths de campanha (`entry_id`) e template (`email_log_id`).

- [ ] **AC4:** `pnpm --filter @trifold/web run type-check` passa sem erros apos a alteracao.

## Scope

### IN
- Substituicao do bloco `if (!RESEND_WEBHOOK_SECRET) { warn + continue }` por `return 503`
- Verificacao de presenca de `RESEND_WEBHOOK_SECRET` em `.env.example` (ou equivalente) — adicionar se ausente

### OUT
- Alteracao na logica de verificacao HMAC-SHA256 (inalterada)
- Alteracao nos paths de processamento de eventos (`entry_id`, `email_log_id`)
- Testes automatizados (sem suite de integracao configurada para este endpoint)
- Configuracao do secret no ambiente de producao (responsabilidade de @devops)

## Dev Notes

### Arquivo alvo

`packages/web/src/app/api/webhook/resend/route.ts`

### Bloco a substituir (linhas 77-88 atuais)

```typescript
// REMOVER este bloco inteiro:
if (!RESEND_WEBHOOK_SECRET) {
  logEvent({
    level: "warn",
    category: "webhook",
    event_type: "RESEND_WEBHOOK_SECRET_MISSING",
    message:
      "RESEND_WEBHOOK_SECRET is not configured; accepting webhook without signature verification",
    source: "api/webhook/resend",
  })
} else {
  // ... logica de verificacao Svix ...
}
```

### Bloco substituto

```typescript
// SUBSTITUIR pelo hard-fail:
if (!RESEND_WEBHOOK_SECRET) {
  logEvent({
    level: "error",
    category: "webhook",
    event_type: "RESEND_WEBHOOK_SECRET_MISSING",
    message: "RESEND_WEBHOOK_SECRET is not configured — rejecting webhook request",
    source: "api/webhook/resend",
  })
  return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 })
}

// Logica de verificacao Svix (antes estava no bloco `else` — agora e o fluxo principal):
if (!svixId || !svixTimestamp || !svixSignature) {
  return NextResponse.json({ error: "Missing signature headers" }, { status: 401 })
}
// ... restante da verificacao identico ...
```

A mudanca e cirurgica: o `else` desaparece, o bloco de verificacao Svix sobe um nivel de indentacao, e o bloco `if (!RESEND_WEBHOOK_SECRET)` passa de warn+continue para log-error+return-503. Aproximadamente 5 linhas alteradas.

### Variavel de ambiente

Verificar se `RESEND_WEBHOOK_SECRET` esta documentada em `.env.example` (raiz do monorepo ou `packages/web/.env.example`). Adicionar se ausente:

```bash
# Webhook secret do Resend (Svix) — obrigatorio em producao
RESEND_WEBHOOK_SECRET=whsec_...
```

## CodeRabbit Integration

**Story Type Analysis:**
- Primary Type: Security hardening
- Secondary Type(s): Bug fix (remocao de fallback permissivo)
- Complexity: Very Low (alteracao cirurgica, ~5 linhas)

**Specialized Agent Assignment:**
- Primary Agents: @dev, @qa (quality gate)
- Supporting Agents: —

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): Confirmar que o path com secret configurado nao regrediu (type-check OK)
- [ ] Pre-PR (@devops): Confirmar variavel presente no `.env.example`

**CodeRabbit Focus Areas:**
- Primary: Remocao completa do fallback permissivo (nenhum caminho de escape sem secret)
- Primary: Status code 503 correto para "servico nao configurado" vs 401 para "assinatura invalida"
- Secondary: Nivel de log `error` (nao `warn`) para ausencia de secret

**Self-Healing Configuration:**
- Primary Agent: @dev (light mode)
- Max Iterations: 2 | Timeout: 15min | Severity Filter: CRITICAL
- CRITICAL: auto_fix | HIGH: document_only

## Tasks / Subtasks

- [ ] **Task 1 — Substituir bloco permissivo por hard-fail 503** (AC: 1, 2)
  - [ ] 1.1: Editar `packages/web/src/app/api/webhook/resend/route.ts` — remover o `else` e converter o bloco `if (!RESEND_WEBHOOK_SECRET)` em return 503 com log level `"error"`
  - [ ] 1.2: Garantir que o bloco de verificacao Svix (antes no `else`) permaneca inalterado como fluxo principal apos o guard clause

- [ ] **Task 2 — Verificar `.env.example`** (AC: 1)
  - [ ] 2.1: Localizar `.env.example` na raiz ou em `packages/web/`
  - [ ] 2.2: Confirmar presenca de `RESEND_WEBHOOK_SECRET` — adicionar se ausente

- [ ] **Task 3 — Type-check** (AC: 4)
  - [ ] 3.1: Executar `pnpm --filter @trifold/web run type-check` e confirmar saida limpa

- [ ] **Task 4 — Atualizar File List da story**

## File List

_A ser preenchido por @dev durante a implementacao._

| File | Action |
|------|--------|
| `packages/web/src/app/api/webhook/resend/route.ts` | Modified |

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-05 | 1.0 | Story criada | River (@sm) |
