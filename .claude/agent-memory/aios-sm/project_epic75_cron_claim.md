---
name: project-epic75-cron-claim
description: Epic 75 — padrão de trava anti-duplicata de cron (claim-run.ts) e quando usar só a trava de RUN vs. RUN+item
metadata:
  type: project
---

Story 75-352 criou a infraestrutura de trava atômica para cron duplicado: migration
`supabase/migrations/234_cron_lock_e_claim_atomico.sql` (tabela `cron_locks`, RPCs `claim_cron_run` /
`finish_cron_run` / `claim_follow_up`) e helper `packages/web/src/lib/cron/claim-run.ts`
(`claimCronRun`/`finishCronRun`). Aplicada em produção em 20/08 10:49 UTC. Só o `/api/cron/followup`
usava até a 75-367 (relatório semanal de analytics duplicado — mesma assinatura: dois `emailId`
distintos do Resend em `system_events`, ~60s de diferença, tempo de render do PDF ~105s).

**Padrão de decisão ao aplicar isto em outro cron:**
- Trava de RUN (`claim_cron_run`) sozinha basta quando o cron processa **um item só** por invocação
  (ex.: um e-mail para lista fixa de destinatários, uma organização única em produção).
- Trava de RUN + trava por ITEM (`claim_follow_up`, ou um RPC análogo) é necessária quando o cron
  itera sobre uma coleção onde duas runs concorrentes podem intercalar item a item (caso do followup,
  centenas de leads por run).
- `claimCronRun` é **fail-open de propósito** quando o RPC falha (devolve `{runId: null, claimed:
  true}`, run segue sem trava) — seguro no followup porque a segunda trava por lead cobre a falha.
  **Não é seguro** em cron sem segunda trava: o chamador precisa detectar esse caso
  (`claimed === true && runId === null`) e tratar como fail-closed (não processa, loga, retorna).
  Isso NÃO é mudança no helper compartilhado — é responsabilidade de cada chamador decidir.
- Intervalo mínimo (`p_min_interval_seconds`) escalado pelo período do próprio cron: followup 2h → 90
  min (75%); analytics-report semanal (168h) → 144h/6 dias (~86%, mais folga por ser evento raro).

**Onde olhar antes de reabrir uma investigação de "cron duplicado":** o segundo gatilho nunca foi
achado no repo (manifesto de cron Vercel, `cron.job` do Postgres, contas Vercel — tudo conferido na
75-352). Não vale a pena reabrir essa busca; a estratégia do projeto é sempre consertar o efeito com
claim atômico, não caçar a causa externa.

Ver [[project_epic75_analytics_report_duplicado]] quando essa story existir com o resultado do deploy.
