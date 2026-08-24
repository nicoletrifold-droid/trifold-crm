---
name: merge-main-na-branch-nao-rebase
description: Para atualizar uma feature branch com a main em trifold-crm, use merge — nunca rebase; o repo é squash-merge e rebase exige force-push que orfana previews e comentários do PR
metadata:
  type: feedback
---

Quando uma feature branch com PR aberto precisa da `main` atual, **integre com
`git merge origin/main`, não com rebase**.

**Why:**
- O repo mergeia PR por **squash** (todo commit de `main` termina em `título (#NNN)`). O commit de
  merge intermediário **não sobrevive** na `main`, então o argumento "rebase deixa a história
  limpa" não se aplica aqui — a história final é idêntica nos dois caminhos.
- Rebase exige `git push --force`, que reescreve os SHAs da branch. Isso **orfana** os previews da
  Vercel e os comentários de PR que citam SHA — e neste repo a evidência de deploy é registrada em
  comentário do PR justamente para não mover o HEAD (ver [[incidente-deploy-900-14b]]).
- Conflito típico ao mergear: os índices `.claude/agent-memory/aios-*/MEMORY.md`, que são listas
  **append-only**. Resolve-se mantendo as entradas dos dois lados — nunca escolhendo um lado.

**How to apply:** `git fetch origin` → `git merge origin/main` com mensagem `merge:` explicando o
que a integração traz (foi o fix de build da 900-14b no PR #492) → resolver os índices de memória
mantendo ambos os lados → rodar o gate **depois** do merge, não antes (a base mudou) → `git push`
sem `--force`. Depois do push, confirme que o preview ficou `READY` **com SHA igual ao
`headRefOid`** do PR: é isso que prova que a falha anterior era herança da base e não do PR.

Relacionado: [[force-push-vs-merge-main]] (que trata do caso oposto — nunca sobrescrever `main`),
[[quality-gate-signals]], [[status-story-via-branch-pr]].
