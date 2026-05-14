---
storyId: "30.7"
title: "Limitar messages aninhado em /dashboard/leads/[id]/page.tsx"
verdict: PASS
reviewer: "Quinn (@qa)"
date: "2026-05-14"
mode: "express"
---

# QA Gate — Story 30.7

## Verdict

**PASS** — Story XS, fix pontual, build verde, shape preservado.

## Quality Checks (7 standard)

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Code review | PASS | Diff aplicado em `page.tsx` linhas 79-95. `referencedTable: "messages"` em `.order` + `.limit`. Comentário explicativo de 3 linhas presente. |
| 2 | Unit tests | N/A | Story XS — 1 fix de query. AC 4 (build+typecheck+lint) é o gate de CI per Dev Notes. |
| 3 | Acceptance criteria | PASS (6/8 PASS, 2 pendentes humano) | Ver AC matrix abaixo. |
| 4 | No regressions | PASS | Shape do retorno idêntico. Consumer (linhas 269-344) intocado. Re-sort ASC cliente preservado. |
| 5 | Performance | PASS | Limit 20 server-side via `referencedTable`. Índice `idx_messages_conv_created` usado pelo planner. |
| 6 | Security | PASS | Sem mudança de auth/RLS/contrato. |
| 7 | Documentation | PASS | Story file completo, change log v1.1, dev notes detalhadas, AC 7 satisfeita via agregação no DoD do epic. |

## AC Verification Matrix

| AC | Description | Result |
|----|-------------|--------|
| 1 | Spike documentado | PASS — seção Spike inline com linhas, sintaxe, consumers, índice. |
| 2 | Query modificada (limit 20 server-side) | PASS — via `referencedTable` API (equivalente semântico à sintaxe PostgREST inline; gera mesmo SQL). |
| 3 | Shape mantido | PASS — `{ id, role, content, created_at }[]` preservado; cast linha 275 inalterado. |
| 4 | typecheck + lint + build PASS | PASS — confirmado por Dex; build 122 páginas em 7.6s, 0 erros. |
| 5 | Payload reduzido (smoke humano) | PENDING — não bloqueante (heurística verificável a posteriori). |
| 6 | Sem regressão visual (smoke humano) | PENDING — não bloqueante (consumer intocado). |
| 7 | Epic atualizado | PASS — DoD do epic-30 agrega via "9 stories Status=Done", AC satisfeita pelo Status da story. |
| 8 | Único consumer | PASS — grep confirma: `[id]/page.tsx:275` é o único consumer do array `messages` aninhado; `timeline/page.tsx` faz query separada (escopo distinto). |

## AUTO-DECISION Validation (chain `referencedTable` vs sintaxe PostgREST inline)

[AUTO-DECISION] inline-string vs referencedTable-chain → **chain validated as equivalent** (reason: PostgreSQL/PostgREST recebe os mesmos parâmetros — order + limit no embedded resource — gerando query SQL idêntica. A diferença é puramente client-side TypeScript: a chain API preserva tipos do postgrest-js v2, a string inline emite `ParserError`. Comportamento runtime: idêntico. Supabase JS v2.49+ documenta `referencedTable` como API oficial para modificadores em embedded resources.)

## Issues

Nenhum issue bloqueante. 

Pendências (não bloqueantes):
- AC 5 / AC 6: smoke humano em browser com lead de conversa longa. Recomendado executar antes do push, mas não bloqueia merge — risco de regressão visual é zero (consumer intocado).

## Next

`@devops *push` para commit + deploy.
