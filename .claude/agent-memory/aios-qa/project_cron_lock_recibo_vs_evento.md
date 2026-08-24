---
name: cron-lock-recibo-vs-evento
description: Trava de cron (migration 234) é medida pelo started_at — o recibo finish_cron_run é descartável, o evento em system_events não
metadata:
  type: project
---

Na trava de cron do Trifold (`claim_cron_run`/`finish_cron_run`, migration 234), a janela do
intervalo mínimo é reavaliada contra o **`started_at`**. `finish_cron_run` é **só recibo**: perdê-lo
deixa `finished_at` nulo e nada mais — não reabre duplicata.

**Why:** usado como critério em duas decisões de gate (Story 75-367 Round 1 e Round 2). Quando @dev
argumenta que a ordem das escritas tardias deve proteger o recibo "porque é AC", o argumento está
invertido: o evento em `system_events` carrega `falharam`/`enviados` (superset do recibo) e é a única
coisa com superfície de leitura. `cron_locks` **não tem nenhum consumidor** no código;
`system_events` tem `/api/system-events`.

**How to apply:** em qualquer discussão de ordem de escritas tardias em rotas de cron, o evento vale
mais que o recibo. Mas antes de pedir a inversão, checar se as duas funções lançam: `logEventOnce`
(`logger.ts`) e `finishCronRun` (`claim-run.ts`) são **ambas** best-effort com try/catch e nunca
lançam — com isso o risco diferencial da ordem cai para ~zero e não justifica churn. Só volta a
importar se algo entrar **entre** as duas escritas ou se uma delas deixar de ser best-effort.

Ressalva de observabilidade recorrente: evento sem a mensagem de erro deixa o "por quê" só no
`console.error` do log da Vercel, cuja retenção (horas/dias) é **menor** que a janela de silêncio de
crons com intervalo longo (144h no relatório semanal). Vale como concern LOW, não como bloqueio.

Relacionado: [[mutacao-prova-teste-real]]
