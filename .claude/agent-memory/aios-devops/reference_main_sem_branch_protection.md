---
name: main-sem-branch-protection
description: main NAO tem branch protection no GitHub — o "check bloqueante" e convencao (job `type-check · lint · test`), e `gh pr merge` aceita PR UNSTABLE
metadata:
  type: reference
---

`GET repos/nicoletrifold-droid/trifold-crm/branches/main/protection` responde **404 "Branch not protected"**.
Consequencias medidas (2026-09-04, merges dos PRs #573 e #574):

- Nao existe *required status check* no GitHub. O check bloqueante do repo e **convencao humana**:
  o job **`type-check · lint · test`** do workflow `CI`. Os outros dois se autodeclaram no nome
  (`gate de tenancy (não-bloqueante)`, `migrations deste PR (aviso, não-bloqueante)`), e `CodeRabbit`
  e bot — ver [[coderabbit-e-ruido]].
- `mergeStateStatus: UNSTABLE` (CodeRabbit `PENDING`) **nao impede** `gh pr merge --squash`: sem protection
  o merge passa direto, sem `--admin`. Ou seja, a trava e o julgamento do agente, nao a API — leia o
  rollup check por check antes de mergear, `mergeable: MERGEABLE` nao e prova de CI verde.
- Nas runs de **push em `main`** o job `migrations deste PR` sai **`skipped`** (ele filtra por evento de PR).
  `skipped` ali e normal e nao derruba a conclusion da run — nao confundir com falha.

**How to apply:** antes de mergear, liste `statusCheckRollup` com nome + `conclusion//state` e exija SUCCESS
no `type-check · lint · test`. Depois do squash, confirme a run de `main` pelo `headSha` do squash
(`gh run list --branch main --json databaseId,headSha`) — PR verde antes de entrar nao garante `main` verde.
