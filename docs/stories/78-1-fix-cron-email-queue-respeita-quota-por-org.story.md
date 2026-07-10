# Story 78-1 — Cron de fila de email deve respeitar a quota diária configurada por organização

## Metadata
- **Status:** InReview
- **Epic:** 18 — Central de Email: Templates, Envio e Monitoramento
- **Branch:** main

## Context
Existem duas camadas de rate limiting no sistema de envio de email, e elas estão **inconsistentes**:

1. **Enfileiramento** (`packages/web/src/lib/email.ts`, função que decide enfileirar vs. enviar direto): respeita corretamente `settings.daily_quota`, lido via `getEmailSettings(orgId)` da tabela `email_settings` (configurável em `/dashboard/sistema/email-configuracoes`, campo "Quota diária", CHECK 1-1000).
2. **Processamento da fila** (`packages/web/src/app/api/cron/email-queue/route.ts`): usa uma **constante hardcoded** `DAILY_QUOTA = 100` (linha 7), ignorando completamente a configuração por organização. O cálculo `const remaining = DAILY_QUOTA - sentToday` (linha 56) roda dentro de `for (const orgId of orgIds)` (linha 54), então já existe o `orgId` disponível no escopo certo para ler a config — só falta usar.

**Efeito prático:** um admin pode configurar "Quota diária = 30" na tela de Configurações, mas o cron real que dispara os emails da fila continua processando até 100/dia de qualquer jeito, porque nunca lê essa configuração.

**Motivação:** usuário quer disparar a campanha "Vind Residence" (Stories 76-1/77-1) respeitando um limite de 30 emails/dia, e descobriu que configurar isso na tela não teria efeito real sem este fix.

## Acceptance Criteria
- [x] AC1: Em `email-queue/route.ts`, dentro do loop `for (const orgId of orgIds)`, a constante global `DAILY_QUOTA` é substituída pela leitura de `daily_quota` via `getEmailSettings(orgId)` (já exportada de `lib/email.ts`), calculando `remaining` com o valor configurado daquela organização.
- [x] AC2: Se a organização não tiver registro em `email_settings`, o fallback é o default já existente em `getEmailSettings` (`daily_quota: 100`) — nenhum comportamento novo de fallback precisa ser inventado, é só reusar o que a função já retorna.
- [x] AC3: `BATCH_SIZE` continua como constante técnica (tamanho de lote de processamento por execução do cron, não é limite de negócio) — não deve ser confundido nem substituído pela quota.
- [x] AC4: Nenhuma mudança de comportamento para organizações que já usam o default de 100 (regressão zero para o caso comum atual).
- [x] AC5: Com `daily_quota = 30` configurado para uma org, o cron processa no máximo 30 emails daquela org por dia (considerando `sentToday` já contabilizado via `getEmailsSentToday`).

## Out of Scope
- Mudar a UI da tela de Configurações (já existe e já funciona, campo "Quota diária").
- Mudar a lógica de enfileiramento em `lib/email.ts` (já está correta, só o cron está desalinhado).
- Qualquer alteração no `BATCH_SIZE` ou na cadência de execução do cron (frequência definida em `vercel.json`).

## Dependencies
- Nenhuma nova. Reusa `getEmailSettings` já existente e exportada de `lib/email.ts`.

## Complexity
- **T-shirt:** XS (troca de constante por chamada de função já existente, dentro de um loop que já tem o `orgId` em escopo).

## Business Value
Corrige uma configuração que hoje é "decorativa" — a quota diária configurada pelo admin passa a ter efeito real no envio, permitindo campanhas com limites mais conservadores (ex: 30/dia) sem depender de ajuste manual de código a cada campanha.

## Risks
- Baixo. Mudança isolada em uma função já testada (`getEmailSettings`) sendo chamada de um novo lugar. Único cuidado: `getEmailSettings` cria seu próprio client Supabase (`createServiceClient()`) — confirmar que isso não duplica excessivamente conexões dentro do loop por org (impacto desprezível dado o volume de orgs esperado ser baixo, mas vale nota no Dev Notes).

## Definition of Done
- ACs atendidos, lint OK no arquivo, QA gate PASS, commit/push via @devops.

## File List
- `docs/stories/78-1-fix-cron-email-queue-respeita-quota-por-org.story.md` (this file)
- `packages/web/src/app/api/cron/email-queue/route.ts`

## Dev Notes (@dev / Dex)
- Import necessário: `getEmailSettings` de `@web/lib/email` (já existe `import { sendEmail, getEmailsSentToday } from "@web/lib/email"` na linha 4 — só adicionar `getEmailSettings` ao mesmo import).
- Trocar `const remaining = DAILY_QUOTA - sentToday` (linha 56) por algo como:
  ```ts
  const { daily_quota } = await getEmailSettings(orgId)
  const remaining = daily_quota - sentToday
  ```
  posicionado logo após a linha 55 (`const sentToday = await getEmailsSentToday(orgId, supabase)`), antes do `if (remaining <= 0) continue`.
- Remover a constante global `const DAILY_QUOTA = 100` (linha 7) já que não é mais usada — manter `BATCH_SIZE` intocado.
- Sem migração de banco necessária (schema de `email_settings` já existe e já tem o CHECK 1-1000).

## Dev Agent Record

### Completion Notes
- AC1-AC2: import de `getEmailSettings` adicionado ao lado de `sendEmail`/`getEmailsSentToday` (mesma linha de import de `@web/lib/email`). Dentro do loop, logo após `getEmailsSentToday`, adicionado `const { daily_quota } = await getEmailSettings(orgId)` e `remaining` agora usa `daily_quota` em vez da constante removida.
- AC3: `BATCH_SIZE = 50` mantido intocado, só a linha da constante `DAILY_QUOTA` foi removida.
- AC4: comportamento para orgs sem registro em `email_settings` é idêntico ao anterior, já que `getEmailSettings` retorna `DEFAULT_SETTINGS.daily_quota = 100` nesse caso — mesmo valor que estava hardcoded antes.
- AC5: com `daily_quota` configurado como 30 na tabela (via tela de Configurações), o cálculo de `remaining` passa a refletir esse valor real, limitando o processamento da fila àquele número por dia para a organização.
- ESLint: 0 erros no arquivo.
- CodeRabbit (WSL) não aplicável neste ambiente macOS — mesma situação documentada nas Stories 76-1/77-1.

### File List
- `packages/web/src/app/api/cron/email-queue/route.ts`

## QA Results (@qa / Quinn)
_Pendente — aguardando QA gate._

## Change Log
- @sm (River): story criada em Draft, documentando o bug de inconsistência entre a config de quota diária (UI) e o cron real de envio (hardcoded), encontrado ao ajudar o usuário a configurar 30 emails/dia para a campanha Vind Residence.
- @po (Pax): validação via checklist de 10 pontos → **GO** (10/10). Status Draft → Ready.
- @dev (Dex): AC1-AC5 implementados, ESLint OK. Status Ready → InReview. Pronta para @qa *qa-gate.
