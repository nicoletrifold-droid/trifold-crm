---
name: project-main-divergence-2026-06-08
description: Local main ficou ~30 commits atrás de origin/main durante merge de PRs #5/#6 — branches de PR estavam baseadas em b8be21d enquanto origin/main já estava em 9083400
metadata:
  type: project
---

Durante merge dos PRs #5 (migration 075) e #6 (Story 50-3 CTWA), descobri que `main` local divergiu severamente de `origin/main`:

- main local HEAD: `5ade0d8` (com creative attribution feature)
- origin/main HEAD no momento: `9083400` (~30 commits à frente)
- Branches dos PRs baseadas em `b8be21d` (ainda mais antigo)

**Why:** Outros desenvolvedores fizeram push de commits diretos em origin/main (alertas, RLS gerente-comercial, analytics fixes, meta-ads health score) sem sincronizar localmente. PRs ficaram com base desatualizada.

**How to apply:**
- Sempre `git fetch origin` ANTES de criar/atualizar branch de feature
- Antes de mergear via gh, validar `gh pr view N --json mergeStateStatus` — se DIRTY/CONFLICTING, fazer rebase local
- PR #5 precisou rebase manual: conflito em `dashboard/pipeline/page.tsx` (totalVisible vs totalPipeline) resolvido combinando ambos — creative lookup do PR + totalPipeline com totalCount do main
- Remote real: `freelans-dev/trifold-crm.git` mas GitHub está redirecionando para `nicoletrifold-droid/trifold-crm.git` (repo moved)

**Recorrência 2026-07-29 (padrão confirmado):** main local estava ~6 PRs atrás (#295-#300 já mergeados no remoto) ao mergear #299. `gh pr merge 299 --squash --delete-branch` fez o merge no remoto e o hook local fast-forwardou main de `e3b002ec` para `013e3a7e` sem conflito. Padrão de trabalho aqui: workflow correto é **stash seletivo dos arquivos da story → merge do PR aberto → checkout/pull main → nova branch a partir da main atualizada → stash pop**. O stash pop faz auto-merge limpo quando as mudanças da nova story são aditivas sobre o que o PR anterior trouxe (JSDoc/labels). `mergeStateStatus` vem UNKNOWN logo após abrir; re-consultar após ~3s retorna CLEAN/MERGEABLE.

**Recorrência 2026-08-20 (main local cronicamente obsoleta):** `main` local estava **177 commits atrás** de `origin/main` (0 à frente). Trate `main` local como lixo: crie branch sempre de `origin/main` após `git fetch`, nunca de `main`.

**Padrão para commitar trabalho untracked quando a branch atual está suja com trabalho não relacionado:** `git worktree add -b nova-branch <path-no-scratchpad> origin/main` → copiar (`rsync -a`) só a pasta desejada pra dentro do worktree → `git add` seletivo + commit + `git push -u origin HEAD:refs/heads/nova-branch` → `git worktree remove`. Zero risco de stash/checkout mexer na branch original (ela nem é tocada). Cuidado: worktree criado de `origin/main` nasce **trackeando `origin/main`**, então `git push` sem refspec explícito tentaria empurrar pra main — sempre use `HEAD:refs/heads/<branch>`.

Veja [[project_meta_subscription]] para contexto do Epic 50/51.
