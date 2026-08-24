---
name: project-cron-claim-validation
description: O que checar ao validar stories da família "cron duplicado" do Epic 75 (trava claim_cron_run) — caminho suprimido precisa de log, e o helper compartilhado é fail-open de propósito
metadata:
  type: project
---

Epic 75 tem uma família de stories que aplica a trava de run da migration 234 (`cron_locks`,
`claim_cron_run`/`finish_cron_run`, helper `packages/web/src/lib/cron/claim-run.ts`) a mais um cron.
A 75-352 fez o `followup`; a 75-367 fez o `analytics-report`.

**Why:** ao validar a 75-367 apareceram dois furos que se repetem nesse recorte e não são óbvios
lendo só os ACs:
1. O caminho suprimido (`claimed === false`) precisa de um evento em `system_events`
   (`*_RUN_DUPLICADA`, aguardado com `logEventOnce`). Sem ele, "chegou um e-mail só" é compatível
   tanto com "a trava pegou" quanto com "o gatilho duplicado parou" — o AC vira não verificável em
   produção.
2. `claimCronRun` é fail-open **de propósito** (RPC falhou → `{ runId: null, claimed: true }`,
   claim-run.ts:55). Em cron sem segunda trava por item, o fail-closed é responsabilidade do
   **chamador** (`claimed === true && runId === null`). A story tem de dizer explicitamente que o
   helper não muda, senão o @dev "conserta" o fail-open e quebra o `followup`, que depende dele.

**How to apply:** ao validar a próxima story dessa família, exigir (a) log no caminho suprimido,
(b) frase explícita de "não alterar claim-run.ts", (c) `finishCronRun` em TODOS os returns pós-claim
(inclusive early returns tipo "nada para processar", senão `finished_at` fica nulo e o recibo mente),
(d) procedimento de liberar a trava à mão quando o intervalo mínimo é longo:
`update cron_locks set started_at = now() - interval 'N hours' where job_name = '...'`.
