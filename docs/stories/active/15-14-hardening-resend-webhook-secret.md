---
epic: 15
story: 15.14
title: "Hardening: RESEND_WEBHOOK_SECRET obrigatório"
status: Done
priority: P1-ALTO
created_at: 2026-05-05
created_by: River (@sm)
validated_at: 2026-05-05
validated_by: Pax (@po)
validation_score: "9.5/10"
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

- [x] **AC1:** Quando `RESEND_WEBHOOK_SECRET` nao estiver configurado (`undefined` ou string vazia), o endpoint retorna HTTP 503 com body `{ "error": "Webhook secret not configured" }` e loga `RESEND_WEBHOOK_SECRET_MISSING` em nivel `"error"`.

- [x] **AC2:** O comportamento atual de "warn + aceitar sem verificacao" e removido integralmente — nao existe mais nenhum caminho de codigo que aceite um request sem secret configurado.

- [x] **AC3:** Quando `RESEND_WEBHOOK_SECRET` esta corretamente configurado, o fluxo de verificacao HMAC-SHA256 (Svix) continua identico ao implementado em 15.11 — nenhuma regressao nos paths de campanha (`entry_id`) e template (`email_log_id`).

- [x] **AC4:** `pnpm --filter @trifold/web run type-check` passa sem erros apos a alteracao.

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

- [x] **Task 1 — Substituir bloco permissivo por hard-fail 503** (AC: 1, 2)
  - [x] 1.1: Editar `packages/web/src/app/api/webhook/resend/route.ts` — remover o `else` e converter o bloco `if (!RESEND_WEBHOOK_SECRET)` em return 503 com log level `"error"`
  - [x] 1.2: Garantir que o bloco de verificacao Svix (antes no `else`) permaneca inalterado como fluxo principal apos o guard clause

- [x] **Task 2 — Verificar `.env.example`** (AC: 1)
  - [x] 2.1: Localizar `.env.example` na raiz ou em `packages/web/`
  - [x] 2.2: Confirmar presenca de `RESEND_WEBHOOK_SECRET` — adicionar se ausente

- [x] **Task 3 — Type-check** (AC: 4)
  - [x] 3.1: Executar `pnpm --filter @trifold/web run type-check` e confirmar saida limpa

- [x] **Task 4 — Atualizar File List da story**

## File List

| File | Action |
|------|--------|
| `packages/web/src/app/api/webhook/resend/route.ts` | Modified |
| `.env.example` | Modified (adicionada secao `Email / Webhooks` com `RESEND_WEBHOOK_SECRET`) |

### Resumo da implementacao

- Removido o bloco `if/else` permissivo (warn + accept) e substituido por guard clause hard-fail que retorna `HTTP 503 { error: "Webhook secret not configured" }` e loga `RESEND_WEBHOOK_SECRET_MISSING` com `level: "error"`.
- Bloco de verificacao Svix (headers, replay protection, HMAC-SHA256) subiu um nivel de indentacao e passou a ser o fluxo principal apos o guard. Nenhuma alteracao de logica nos paths `entry_id` (campanha) ou `email_log_id` (template).
- Como TypeScript narrowing aplica `string` (nao mais `string | undefined`) apos o `return` do guard, a chamada `verifySvixSignature(RESEND_WEBHOOK_SECRET, ...)` permanece type-safe sem assertion.
- `.env.example` ganhou secao `Email / Webhooks` documentando `RESEND_WEBHOOK_SECRET=whsec_` com nota de obrigatoriedade.
- Type-check (`pnpm --filter @trifold/web run type-check`) executado com saida limpa.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-05 | 1.0 | Story criada | River (@sm) |
| 2026-05-05 | 1.1 | Validacao PO 9.5/10 — GO. Status Draft → Ready. Anti-hallucination check: todas as alegacoes tecnicas (linhas 77-88, comentario do source, dependencia 15.11 Done) verificadas contra o codigo fonte. | Pax (@po) |
| 2026-05-05 | 1.2 | Implementacao concluida. Bloco permissivo removido; hard-fail 503 com log error em `route.ts`. `RESEND_WEBHOOK_SECRET` adicionado ao `.env.example`. Type-check PASS. Status Ready → Ready for Review. | Dex (@dev) |
| 2026-05-05 | 1.3 | QA Gate PASS. Todos os 4 ACs verificados contra o codigo. Type-check limpo. Pronta para @devops push. | Quinn (@qa) |

## QA Results

**Verdict:** PASS
**Reviewer:** Quinn (@qa)
**Date:** 2026-05-05
**Gate Type:** Security hardening / Bug fix

### Acceptance Criteria Verification

| AC | Status | Evidence |
|----|--------|----------|
| **AC1** — 503 + body + log error quando secret ausente | PASS | `route.ts:77-86` — guard clause retorna `NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 })` com `logEvent({ level: "error", event_type: "RESEND_WEBHOOK_SECRET_MISSING", ... })`. Body, status code, e log level batem exatamente com o spec. |
| **AC2** — Sem fallback permissivo remanescente | PASS | Bloco original `if/else` (warn + accept) substituido por guard clause com `return`. Nao existe mais nenhum caminho de codigo que aceite request sem secret. Comentario "backwards-compat" tambem removido. O unico `warn` remanescente em `route.ts:136` e do log `RESEND_NO_ENTRY_ID` — caminho diferente, executado APOS verificacao de assinatura, nao relacionado ao fallback de secret. |
| **AC3** — Fluxo HMAC inalterado quando secret presente | PASS | Apos o guard, o bloco de verificacao Svix (linhas 88-111) e identico ao implementado em 15.11: validacao de headers, replay protection (`SVIX_TOLERANCE_SECONDS`), `verifySvixSignature(...)`. Paths `entry_id` (campanha — linhas 158-220) e `email_log_id` (template — linha 152-155) preservados sem regressao. TypeScript narrowing aplica `string` apos guard, mantendo type-safety na chamada `verifySvixSignature(RESEND_WEBHOOK_SECRET, ...)` sem assertion. |
| **AC4** — Type-check passa | PASS | `pnpm --filter @trifold/web run type-check` executado — saida limpa (`tsc --noEmit` sem erros). |

### Quality Checks (7 pontos)

1. **Code review** — PASS. Mudanca cirurgica e idiomatica: guard clause early-return e o padrao mais legivel para preconditions. Nivel de log `error` correto (era `warn`). Status 503 (Service Unavailable) e semanticamente correto para "secret nao configurado" (vs 401 que e reservado para "assinatura invalida apresentada"). TypeScript narrowing remove a necessidade de non-null assertion na linha 103 — ganho colateral de type-safety.
2. **Unit tests** — N/A. Story escopo OUT explicita "Testes automatizados (sem suite de integracao configurada para este endpoint)".
3. **Acceptance criteria** — PASS (4/4 verificados acima).
4. **No regressions** — PASS. Logica HMAC, replay protection, e ambos os paths de processamento (`entry_id` e `email_log_id`) preservados linha-por-linha. Apenas o nivel de indentacao do bloco Svix mudou (subiu um nivel apos remocao do `else`).
5. **Performance** — PASS. Guard clause economiza um `request.text()` de payload nao-autenticado em ambientes mal-configurados. Sem impacto perceptivel quando secret presente.
6. **Security** — PASS. Esta e a propria correcao de seguranca: elimina um caminho silencioso onde webhooks nao-autenticados eram aceitos. Hardening completo do escopo iniciado em 15.11. Log level elevado para `error` garante alertas em monitoramento.
7. **Documentation** — PASS. `.env.example:108-113` com secao `Email / Webhooks`, comentario explicativo de obrigatoriedade e nota sobre o comportamento 503.

### Constitution Compliance

- Article IV (No Invention): PASS — todas as alteracoes correspondem exatamente ao spec da story.
- Article V (Quality First): PASS — type-check limpo, sem testes pendentes (escopo OUT documentado).

### Issues Encontrados

Nenhum.

### Recomendacao para @devops

Story PRONTA para push. Acoes pos-deploy obrigatorias:

1. **Configurar `RESEND_WEBHOOK_SECRET` em todos os ambientes (dev/staging/prod)** ANTES do deploy do codigo, ou o webhook comecara a retornar 503 imediatamente apos rollout. Esta e a contraparte operacional do hardening — listada como OUT da story (responsabilidade @devops conforme `Scope.OUT`).
2. Validar via `curl` ou logs que webhooks reais do Resend continuam sendo processados (HMAC ok) apos deploy.
3. Monitorar `RESEND_WEBHOOK_SECRET_MISSING` em logs por 24h pos-deploy — qualquer ocorrencia indica ambiente nao configurado.
