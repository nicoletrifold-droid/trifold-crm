---
name: pr-aberto-absorve-story-seguinte
description: Antes de "reconstruir a branch podre" numa branch nova, confirme se o PR anterior realmente mergeou — se estiver aberto, empurre a story seguinte pra dentro dele e reescreva o corpo
metadata:
  type: feedback
---

Quando uma branch acumula duas stories, a decisão **depende do estado real do PR anterior**,
não do que o prompt/handoff afirma. Confira sempre com `gh pr view N --json state,mergedAt`
antes de escolher a estratégia.

- **PR anterior MERGEADO** → a branch é lixo (`origin/main` já absorveu os commits antigos).
  Reconstrua: branch nova de `origin/main` + cherry-pick só dos commits novos.
  Ver [[main-divergence-2026-06-08]] e [[transplantar-hotfix-de-branch-alheia]].
- **PR anterior ABERTO** → a branch **é** o PR. `git push` fast-forward e os commits novos
  entram no PR existente automaticamente. Não dá pra abrir um segundo PR com a mesma head
  branch e a mesma base — o `gh pr create` é rejeitado. Ação correta: push + `gh pr edit`
  com título e corpo cobrindo as **duas** stories.

**Why:** Na 86-12/86-13 (landing do Yarden) o handoff afirmava que o PR #567 já tinha
mergeado e mandava reconstruir numa branch limpa. Ele estava **aberto** (`mergedAt: null`,
`reviewDecision: APPROVED`, 7 checks verdes). Reconstruir teria sido destrutivo por dois
motivos: (1) a 86-13 edita o mesmo `index.html` que a 86-12 — cherry-pick sobre `origin/main`
sairia sem a base e conflitaria; (2) PR empilhado (base = branch da story anterior) é
inviável neste repo porque ele é **squash-merge** — mergear o de baixo orfana o de cima.
Ver [[merge-main-na-branch-nao-rebase]] pelo mesmo motivo de fundo.

**How to apply:** Ao receber "a branch está podre, reconstrua", rode primeiro
`gh pr list --head <branch> --state all --json number,state,mergedAt` +
`git log --oneline origin/main..HEAD`. Se o PR está aberto e
`mergeable=MERGEABLE`/`mergeStateStatus=CLEAN`, **estar N commits atrás de `origin/main` não
é problema** — só importa se há conflito real (`git merge-tree --write-tree origin/main HEAD`)
ou sobreposição de arquivos. Não faça merge de `main` na branch "por higiene": inflar o diff
atrapalha a review e reseta o CodeRabbit à toa. Ao unificar duas stories num PR, **diga no
corpo por que são uma só** — o revisor precisa saber que não foi desleixo.
