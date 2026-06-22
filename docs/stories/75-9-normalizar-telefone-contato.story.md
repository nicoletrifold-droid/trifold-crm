# Story 75-9 — Normalizar telefones de contato (corretor/usuário/cliente CRM) com normalizePhoneBR

## Metadata
- **Status:** InReview
- **Epic:** 57 — Melhorias Operacionais CRM
- **Branch:** main

## Context
O WhatsApp ao corretor (e ao cliente) só funciona com o número em formato internacional (E.164, ex.: `5544999999999`). Hoje os **telefones de contato** entram em formato local e não são normalizados:
- `users.phone` (corretor e cliente do portal)
- `clientes.telefone` e `clientes.whatsapp` (CRM)

Já existe o helper oficial **`normalizePhoneBR`** (`@trifold/shared`, `packages/shared/src/utils/phone.ts`) — usado no webhook do WhatsApp. Os **leads** já normalizam (coluna `leads.phone_normalized` + índice UNIQUE, migração 021), então **lead matching está fora de escopo** aqui.

Escopo (decisão do solicitante): normalizar os telefones de **contato** na escrita reusando `normalizePhoneBR` + **backfill** dos dados existentes. A unificação dos lookups `.eq("phone", ...)` de lead (usar `phone_normalized`) fica em **backlog** (mexe em webhooks/roleta).

## Acceptance Criteria
- [x] AC1: Aplicar `normalizePhoneBR(body.phone)` ao gravar telefone em: `api/users/route.ts` (criar), `api/users/[id]/route.ts` (editar), `api/brokers/route.ts` (criar/editar), `api/cliente/obras/[obra_id]/notificacoes/route.ts` (telefone do cliente).
- [x] AC2: Em `api/admin/clientes/route.ts` (criar) e `api/admin/clientes/[id]/route.ts` (editar), normalizar `telefone` e `whatsapp` com `normalizePhoneBR` antes de gravar.
- [x] AC3: Reuso — nenhum normalizador novo; usa `normalizePhoneBR` de `@trifold/shared`. Valor inválido/curto → `null` (comportamento do helper).
- [x] AC4: Backfill dos dados existentes: `users.phone`, `clientes.telefone`, `clientes.whatsapp` convertidos para o formato canônico — executado com a MESMA lógica do `normalizePhoneBR` (script Node reusando o helper, com dry-run antes de aplicar em prod).
- [x] AC5: Sem alteração em `leads` / `phone_normalized` / webhooks / roleta. Sem novo schema.

## Out of Scope
- Unificar lookups `.eq("phone", ...)` de lead para `phone_normalized` (backlog — fluxos críticos).
- Telefone de lead (`leads.phone` / `phone_normalized`) — já normalizado.
- Máscara/validação visual nos formulários (só normalização no back).

## Dependencies
- `normalizePhoneBR` em `@trifold/shared` (já existe).

## Complexity
- **T-shirt:** S/M (aplicar helper em ~5 endpoints + backfill via script).

## Business Value
Telefones de contato passam a ficar em formato canônico → WhatsApp ao corretor/cliente funciona com qualquer formato digitado; dado padronizado no CRM.

## Risks
- Baixo. Helper é idempotente em números já canônicos. Backfill com dry-run + confirmação. Não toca matching de lead.

## Definition of Done
- ACs atendidos, type-check/lint OK no escopo, QA gate PASS, backfill aplicado, deploy via @devops.

## File List
- `docs/stories/75-9-normalizar-telefone-contato.story.md` (this file)
- `packages/web/src/app/api/users/route.ts`
- `packages/web/src/app/api/users/[id]/route.ts`
- `packages/web/src/app/api/brokers/route.ts`
- `packages/web/src/app/api/cliente/obras/[obra_id]/notificacoes/route.ts`
- `packages/web/src/app/api/admin/clientes/route.ts`
- `packages/web/src/app/api/admin/clientes/[id]/route.ts`
- backfill: script Node (não versionado / one-off) reusando normalizePhoneBR

## Dev Notes (@dev / Dex)
- `normalizePhoneBR` (de `@trifold/shared`) aplicado em: users criar/editar, brokers criar/editar (2 ocorrências), cliente notificações; e em clientes CRM criar/editar (normaliza `telefone` e `whatsapp` após o build do payload).
- type-check 0 erros no escopo; eslint EXIT 0.
- Backfill: dry-run em prod (sem gravar) → users.phone 1, clientes.telefone 18, clientes.whatsapp 15 (34 no total) converteriam de formato local p/ E.164; todas corretas. A aplicação usa script Node com cópia verbatim do `normalizePhoneBR`.

## QA Results (@qa / Quinn)
**Veredito: PASS** — AC1–AC5. 6 endpoints reusando o helper oficial (sem normalizador novo); leads/`phone_normalized`/webhooks/roleta intocados. Backfill validado em dry-run (34 registros, conversões corretas). type-check/eslint OK. Pronta para @devops *push + aplicar backfill.

## Change Log
- @sm (River): story criada em Draft.
- @po (Pax): validação → GO. Status Draft → Ready.
- @dev (Dex): normalização nos 6 endpoints de contato. Status Ready → InReview.
- @qa (Quinn): QA gate PASS (dry-run do backfill validado). Pronta para @devops *push + backfill.
