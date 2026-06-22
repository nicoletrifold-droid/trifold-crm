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

Veja [[project_meta_subscription]] para contexto do Epic 50/51.
