---
name: branch-merged-check-squash-repo
description: Provar que uma branch e segura de apagar neste repo squash-merge exige comparar arvore/diff, nao `git log origin/main..branch` (que nunca sai vazio)
metadata:
  type: feedback
---

Para decidir se uma branch remota pode ser apagada, **nao** use `git log origin/main..origin/<branch> --oneline` como prova. O repo e squash-merge: os commits originais da branch **nunca** entram em `main` (o merge cria um commit novo com SHA diferente), entao esse range sai **sempre nao-vazio**, inclusive para branches ja mergeadas. Falso positivo garantido.

Provas que valem:
- `git rev-parse origin/main^{tree}` vs `git rev-parse origin/<branch>^{tree}` — SHAs iguais = branch e byte-identica a main, zero conteudo unico.
- `git diff --stat origin/main origin/<branch>` vazio = mesma coisa.
- Se o diff **nao** e vazio, ler a **direcao**: linhas `+` nesse diff sao o que a branch tem e main nao. Se essas linhas forem so a versao *antiga* de arquivos que main avancou (ex.: `Status: InReview` vs `Done` em `docs/stories/*`), a branch esta apenas atrasada — nao ha trabalho a perder. Conteudo unico real seria arquivo/logica que main nunca viu.

O mesmo vale para o **branch local**: `git branch -d <branch>` **sempre** falha aqui com "is not fully merged", por construcao (o commit squashado em `main` nao e ancestral do branch). Nao e sinal de perigo. Depois da prova de conteudo acima, `-D` e a ferramenta **correta**, nao um atalho — mas registre os SHAs antes (`git rev-parse`), que o reflog permite recuperar. Ordem que funciona: trocar a working tree pra `main` -> apagar remoto -> apagar local.

**Why:** o check por commit-range e o instinto natural e leva a duas falhas opostas — travar a limpeza de branches ja mergeadas, ou (pior) achar que "sempre da commit, entao ignoro o check" e apagar algo vivo.

**How to apply:** em qualquer `*cleanup` / `git push origin --delete`. Se o usuario condicionar a exclusao a "`git log origin/main..branch` vazio", esse gate vai falhar por construcao — reportar a razao (squash-merge) junto com a prova de arvore, e nao apagar sem a confirmacao dele. Relacionado: [[feedback_discard_already_merged_copy]], [[feedback_merge_main_na_branch_nao_rebase]], [[feedback_force_push_vs_merge_main]].
