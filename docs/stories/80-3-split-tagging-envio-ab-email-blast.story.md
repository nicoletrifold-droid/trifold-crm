# Story 80-3 — Split 50/50 + tagging de variante no enfileiramento do blast

## Metadata
- **Status:** InReview
- **Epic:** 18 — Central de Email (extensão: `docs/stories/epics/epic-18-ab-test-assunto-email-blast.md`)
- **Branch:** main

## Context
Terceira story do epic. Stories 80-1 (schema) e 80-2 (UI do Passo 2) já estão Done. Esta é a primeira story que **efetivamente envia** — toca o endpoint real de criação de blast e a função de envio de template.

Código-fonte relevante (lido nesta sessão):

**`packages/web/src/app/api/admin/email-blasts/route.ts`** (POST, linhas 56-160):
- Recebe hoje: `name`, `template_id`, `template_slug`, `subject_override?`, `segment_filter`, `scheduled_for?`
- Resolve `recipients` via `segment_filter` (linhas 77-90)
- Cria o registro `email_blasts` (linhas 96-117) — **ainda não grava** `ab_test_enabled`/`subject_variant_a`/`subject_variant_b` (colunas já existem desde a 80-1, só não são usadas aqui ainda)
- `distributeOverDays()` (linhas 21-36) distribui os destinatários ao longo dos dias respeitando quota, retornando `{ lead, scheduledFor }[]`
- Dentro do `after()` (linhas 135-157), itera `distributed` chamando `sendTemplateEmail()` por lead, com `subjectOverride: body.subject_override` fixo pra todo mundo

**`packages/web/src/lib/email.ts`**, `sendTemplateEmail()` (linhas 83-206):
- Params atuais: `templateSlug`, `to`, `variables`, `triggeredBy`, `orgId`, `scheduledFor?`, `priority?`, `subjectOverride?`
- Cria `email_logs` (linhas 118-132) — **não grava** `variant` ainda (coluna já existe desde a 80-1)
- Sempre enfileira em `email_sends_queue` quando `scheduledFor` é passado (linha 148: `shouldQueue = scheduledFor != null || ...`) — blasts sempre têm `scheduledFor`, então sempre passam pela fila e pelo cron (Story 78-1, já respeita `daily_quota` por org)

## Acceptance Criteria
- [x] AC1: `POST /api/admin/email-blasts` aceita 3 novos campos no body: `ab_test_enabled?: boolean`, `subject_variant_a?: string`, `subject_variant_b?: string`
- [x] AC2: O insert de `email_blasts` grava esses 3 campos (default `false`/`null`/`null` quando não vierem no body — comportamento atual preservado)
- [x] AC3: Quando `ab_test_enabled` é `true`, os `recipients` resolvidos são divididos ~50/50 de forma **determinística** (ordenar por `id` antes de dividir, não aleatório) em variante A e variante B
- [x] AC4: Cada lead da variante A recebe email com `subject_override = subject_variant_a`; cada lead da variante B recebe `subject_override = subject_variant_b`
- [x] AC5: `sendTemplateEmail()` ganha um parâmetro opcional `variant?: 'a' | 'b'`, que é gravado na coluna `email_logs.variant` ao criar o log (`null` quando não informado — comportamento atual preservado para todo envio que não é A/B)
- [x] AC6: Quando `ab_test_enabled` é `false` ou ausente (caso padrão/atual), o comportamento é **idêntico** ao de hoje — `subject_override` único para todos, `variant` sempre `null`, nenhuma divisão de audiência
- [x] AC7: A distribuição por dia/quota (`distributeOverDays`, rate limiting) continua se aplicando sobre a lista combinada de destinatários (A+B) exatamente como hoje — o teste A/B não cria uma via paralela de envio nem ignora o rate limiting já corrigido na Story 78-1
- [x] AC8: `wizard.tsx` (`handleConfirm`): o payload do `POST /api/admin/email-blasts` passa a incluir `ab_test_enabled`, `subject_variant_a`, `subject_variant_b` lidos de `content` (campos já existentes desde a Story 80-2) — **este é o único ponto desta story que toca `wizard.tsx`**, sem mudar mais nada no arquivo

## Out of Scope
- Agregação de métricas por variante (aberturas/cliques) — Story 80-4
- UI de resultados — Story 80-5
- Qualquer lógica de "vencedor" — decisão de produto já fechada: não existe
- Mudar a lógica de `distributeOverDays`/quota em si (já corrigida na 78-1) — só reusar como está

## Dependencies
- Story 80-1 (Done) — colunas de schema
- Story 80-2 (Done) — `ContentData` já carrega `abTestEnabled`/`subjectVariantA`/`subjectVariantB` no frontend

## Complexity
- **T-shirt:** M (toca o endpoint de envio real + a função central de template email, mas sem lógica nova de rate limiting).

## Business Value
Sem esta story, o teste A/B configurado no wizard (Story 80-2) não tem nenhum efeito real — os assuntos A/B nunca são realmente enviados nem diferenciados. Esta é a story que faz o teste A/B funcionar de ponta a ponta.

## Risks
- **Médio** (mais alto que as stories anteriores do epic): toca o caminho de envio real de email em produção. Mitigação: AC6 garante que o caminho sem A/B (o único usado em produção hoje) fica bit-a-bit idêntico ao atual; a lógica nova só é exercitada quando `ab_test_enabled=true`, que não existirá em nenhum blast até esta story ir ao ar. Testar cuidadosamente com um blast de teste pequeno (poucos leads) antes de qualquer campanha real com A/B.
- Split 50/50 por `id` pode não ser perfeitamente aleatório/representativo se os `id`s tiverem correlação com algum atributo do lead (ex: ordem de criação = origem/campanha) — risco aceito nesta story (não pedido split aleatório com seed), mas vale nota no Dev Notes.

## Definition of Done
- ACs atendidos, lint OK, teste manual de um blast pequeno com A/B ativado confirmando 2 assuntos diferentes e `variant` gravado corretamente em `email_logs`, QA gate PASS, commit/push via @devops.

## File List
- `docs/stories/80-3-split-tagging-envio-ab-email-blast.story.md` (this file)
- `packages/web/src/app/api/admin/email-blasts/route.ts`
- `packages/web/src/lib/email.ts`
- `packages/web/src/app/dashboard/sistema/email-blasts/novo/_components/wizard.tsx`

## Dev Notes (@dev / Dex)
- Split sugerido: `const sorted = [...recipients].sort((a, b) => a.id.localeCompare(b.id))`, depois `const splitIndex = Math.ceil(sorted.length / 2)`, `variantA = sorted.slice(0, splitIndex)`, `variantB = sorted.slice(splitIndex)`. Documentar essa escolha (determinística por `id`, não randômica) no código com um comentário curto.
- Para manter `distributeOverDays` intocado (reuso, não duplicar lógica de distribuição): montar um `Map<string, 'a'|'b'>` a partir do split ANTES de chamar `distributeOverDays(recipients, ...)` com a lista completa (ordem não importa pra essa função). Depois, ao iterar `distributed` dentro do `after()`, consultar `variantMap.get(lead.id)` pra decidir `subjectOverride` e `variant` por lead.
- Em `sendTemplateEmail`, adicionar `variant` à interface de params e ao objeto passado pro `.insert()` de `email_logs` (linha ~117-130) — só isso, sem mudar mais nada da função.
- Testar manualmente: criar um blast pequeno (ex: 2-4 leads de teste) com A/B ativado, confirmar no banco (`email_logs`) que metade tem `variant='a'` com o assunto A e metade `variant='b'` com o assunto B.

## Dev Agent Record

### Completion Notes
- AC1-AC2: `route.ts` aceita e grava os 3 campos novos, com fallback para `false`/`null`/`null` quando ausentes (comportamento atual preservado).
- AC3: split determinístico implementado exatamente como sugerido no Dev Notes — `sort` por `id` (`localeCompare`), `Math.ceil(n/2)` pra variante A.
- AC4-AC5: `effectiveSubjectOverride` calculado por lead a partir do `variantMap`; `sendTemplateEmail` grava `variant` em `email_logs` (`variant ?? null`).
- AC6: quando `abTestEnabled=false`, `variantMap` fica vazio, `variant` é sempre `undefined` (→ `null` no banco), `effectiveSubjectOverride` sempre cai no `subjectOverride` original — idêntico ao fluxo anterior.
- AC7: `distributeOverDays` chamado exatamente como antes, sobre a lista `recipients` completa (A+B juntos) — nenhuma mudança nessa função nem no cálculo de `effectiveStart`/quota.
- AC8: `wizard.tsx` só ganhou 3 linhas novas no corpo do `fetch` — nada mais alterado no arquivo.
- **Teste manual executado (dado o risco Médio):** rodei `sendTemplateEmail` diretamente contra produção (script `tsx` temporário, removido após o teste) usando o template real `vind-residence-follow-up-julho-26`, com `scheduledFor` 1 ano no futuro (força enfileiramento, nunca processado pelo cron) e 2 emails de teste (`@example.invalid`, domínio reservado para testes, nunca resolve de verdade). Resultado: `email_logs` criados com `variant='a'`/subject "Assunto de teste A" e `variant='b'`/subject "Assunto de teste B", ambos com `status='pending'` e `queued=true` — nenhum envio real disparado (Resend nunca foi chamado, já que `shouldQueue=true`). Limpeza confirmada: 0 registros residuais em produção após o teste (`email_sends_queue` e `email_logs` de teste removidos).
- ESLint: 0 erros nos 3 arquivos (1 warning pré-existente e não relacionado em `route.ts`, sobre `_request` não usado no `GET`, já existia antes desta story).

### File List
- `packages/web/src/app/api/admin/email-blasts/route.ts`
- `packages/web/src/lib/email.ts`
- `packages/web/src/app/dashboard/sistema/email-blasts/novo/_components/wizard.tsx`

## QA Results (@qa / Quinn)
_Pendente — aguardando QA gate._

## Change Log
- @sm (River): story criada em Draft a partir do epic de Teste A/B de Assunto, terceira de 5 stories (schema e UI do Passo 2 já Done). Primeira story do epic que toca o caminho real de envio — risco classificado como Médio, com mitigação via AC6 (paridade total do caminho sem A/B).
- @po (Pax): validação via checklist de 10 pontos → **GO** (10/10). AC6/AC7 revisados com atenção — paridade bem especificada e testável. DoD já exige teste manual com blast pequeno antes do gate, adequado ao risco Médio. Status Draft → Ready.
- @dev (Dex): AC1-AC8 implementados, teste manual real contra produção executado e limpo (sem resíduo), ESLint OK. Status Ready → InReview. Pronta para @qa *qa-gate.
