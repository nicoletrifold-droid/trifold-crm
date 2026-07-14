# Story 80-4 — Agregação de métricas por variante (Teste A/B de Assunto)

## Metadata
- **Status:** InReview
- **Epic:** 18 — Central de Email (extensão: `docs/stories/epics/epic-18-ab-test-assunto-email-blast.md`)
- **Branch:** main

## Context
Quarta story do epic. Stories 80-1 (schema), 80-2 (UI Passo 2) e 80-3 (split + envio real com `variant` gravado em `email_logs`) já estão Done — os dados já existem no banco, só falta agregá-los.

**Reuso identificado (IDS REUSE > CREATE):** já existe `packages/web/src/app/api/admin/email-blasts/[id]/stats/route.ts` (GET), que:
- Busca o blast (`id, name, status, total_recipients, scheduled_for, created_at`)
- Busca todos os `email_logs` via `triggered_by LIKE 'blast:<id>%'`
- Agrega contagem por `status` (sent/delivered/opened/clicked/bounced/failed/pending) num objeto `stats`
- **Não é consumido por nenhuma tela ainda** (sem fetch encontrado no frontend) — a Story 80-5 vai consumi-lo.

Esta story **estende esse endpoint existente**, não cria rota nova.

## Acceptance Criteria
- [x] AC1: A query de `email_logs` no endpoint passa a também selecionar `variant`, `opened_at`, `clicked_at` (além de `status`, já buscado)
- [x] AC2: A query do blast passa a também selecionar `ab_test_enabled`, `subject_variant_a`, `subject_variant_b` (além dos campos já buscados)
- [x] AC3: Quando `ab_test_enabled` é `true`, a resposta ganha um campo `by_variant` com a forma `{ a: { sent, opened, opened_rate, clicked, click_rate }, b: { ... } }`
- [x] AC4: "opened" conta logs com `opened_at IS NOT NULL` (não pelo campo `status` isolado — um log com `status='clicked'` também tem `opened_at` preenchido e deve contar como aberto); "clicked" conta `clicked_at IS NOT NULL`. `sent` conta todos os logs daquela variante (`variant='a'` ou `'b'`)
- [x] AC5: `opened_rate = opened/sent` e `click_rate = clicked/sent`, com proteção contra divisão por zero (`sent === 0` → taxas `0`, não `NaN`/`Infinity`)
- [x] AC6: Quando `ab_test_enabled` é `false`/ausente (todo blast existente em produção hoje), `by_variant` é omitido da resposta (ou `null`) — o restante do payload (`stats`, dados do blast) permanece **idêntico** ao atual, zero regressão
- [x] AC7: Nenhuma lógica de "vencedor" ou comparação entre variantes — só os números agregados (decisão de produto já fechada)

## Out of Scope
- UI de resultados (consumo do endpoint) — Story 80-5
- Qualquer lógica de decisão/vencedor — não existe neste epic
- Nova rota de API — reuso explícito da já existente

## Dependencies
- Stories 80-1, 80-2, 80-3 (Done) — dados de `variant`/`opened_at`/`clicked_at` já sendo gravados corretamente em produção

## Complexity
- **T-shirt:** P (estende uma query e um objeto de resposta já existentes, sem lógica nova de negócio).

## Business Value
Sem esta story, mesmo com o envio A/B funcionando (Story 80-3), não há como consultar os resultados — os dados ficam presos no banco sem visibilidade. Esta story torna os números acessíveis via API, pré-requisito direto da Story 80-5.

## Risks
- Baixo. Mudança aditiva num endpoint que já existe e não tem consumidor ainda (zero risco de quebrar tela em produção). Único cuidado: proteção contra divisão por zero (AC5), já explicitada.

## Definition of Done
- ACs atendidos, lint OK, teste manual (chamar o endpoint pra um blast de teste com A/B ativo e conferir os números batendo com uma contagem manual em `email_logs`), QA gate PASS, commit/push via @devops.

## File List
- `docs/stories/80-4-agregacao-metricas-variante-ab.story.md` (this file)
- `packages/web/src/app/api/admin/email-blasts/[id]/stats/route.ts`

## Dev Notes (@dev / Dex)
- Cálculo de `opened`/`clicked` deve ser feito iterando os logs já buscados (mesma lista usada pra popular `stats` por `status`), filtrando por `log.variant === 'a'`/`'b'` e checando `log.opened_at != null`/`log.clicked_at != null` — não precisa de uma segunda query.
- Estrutura sugerida da função de agregação (local, dentro do próprio route handler, sem exportar/reusar em outro lugar por enquanto): um pequeno helper que recebe a lista de logs + a letra da variante e devolve `{ sent, opened, opened_rate, clicked, click_rate }`.
- Testar manualmente com um blast pequeno de teste (reusar o padrão da Story 80-3: `sendTemplateEmail` direto, `scheduledFor` distante, cleanup depois) — ou, se já existir algum blast de teste com A/B no banco de uma verificação anterior, usar esse.

## Dev Agent Record

### Completion Notes
- AC1-AC3: query de `email_logs` estendida com `variant, opened_at, clicked_at`; query do blast estendida com `ab_test_enabled, subject_variant_a, subject_variant_b`; `by_variant` adicionado à resposta, condicional a `blast.ab_test_enabled`.
- AC4-AC5: helper `aggregateVariant()` filtra por `variant`, conta `opened_at != null`/`clicked_at != null` (não pelo `status` isolado, conforme exigido), com proteção `sent > 0 ? ... : 0` contra divisão por zero.
- AC6: quando `ab_test_enabled` é falsy, `byVariant = null` — `stats`/dados do blast inalterados (mesmo objeto espalhado de antes, só com `by_variant: null` adicionado no fim).
- AC7: sem nenhuma lógica de comparação/decisão — só os 2 objetos de números lado a lado.
- ESLint: 0 erros.
- **Teste manual executado (dado que é uma agregação nova):** criei um blast de teste temporário (`ab_test_enabled=true`) e 4 `email_logs` fabricados (2 variante A: 1 aberto+clicado, 1 só enviado; 2 variante B: 1 aberto sem clique, 1 só enviado), rodei a mesma query do endpoint contra produção, e comparei o resultado com a contagem manual esperada (`A: sent=2, opened=1, clicked=1`; `B: sent=2, opened=1, clicked=0`) — bateu exatamente. Cleanup confirmado (blast e logs de teste removidos, verificado via consulta independente pós-limpeza).

### File List
- `packages/web/src/app/api/admin/email-blasts/[id]/stats/route.ts`

## QA Results (@qa / Quinn)
_Pendente — aguardando QA gate._

## Change Log
- @sm (River): story criada em Draft a partir do epic de Teste A/B de Assunto, quarta de 5 stories. Identificado reuso de endpoint já existente (`[id]/stats/route.ts`, órfão/sem consumidor) em vez de criar rota nova.
- @po (Pax): validação via checklist de 10 pontos → **GO** (10/10). Status Draft → Ready.
- @dev (Dex): AC1-AC7 implementados, teste manual com dados fabricados batendo com contagem esperada, ESLint OK. Status Ready → InReview. Pronta para @qa *qa-gate.
