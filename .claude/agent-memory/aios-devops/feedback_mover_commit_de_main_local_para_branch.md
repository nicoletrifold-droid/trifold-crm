---
name: feedback-mover-commit-de-main-local-para-branch
description: Commit que outro agente fez direto em main local move-se com switch -c + branch -f, nunca com reset --hard (a árvore suja é artefato válido)
metadata:
  type: feedback
---

Quando um agente commita direto em `main` local (viola a REGRA ZERO) e ainda deixa artefatos **não
commitados** na árvore, a correção é de **dois comandos**, nesta ordem:

```bash
git switch -c <branch-da-story>      # branch nasce no commit órfão; a árvore suja vem junto
git branch -f main <sha de origin/main>   # move o ref de main; seguro porque main NÃO está checkado
```

**Nunca** use `git reset --hard origin/main` para "devolver a main" nesse cenário: ele apaga os
artefatos não commitados, que costumam ser o gate do @qa, o parecer do @po e as memórias de agente —
tudo o que a story referencia por caminho. Também não precisa de `stash`: `switch -c` carrega
modificações e untracked sem tocar em nada, porque não há troca de conteúdo entre os dois refs.

**Why:** aconteceu em 2026-08-27 na Story 87-17 (Fatia 1) — o @dev commitou `1454d4ca` em `main`
local e o @qa deixou 5 arquivos de doc + 13 de memória por commitar. O `reset --hard` teria destruído
a evidência do gate; o `stash` é o passo que dispara as colisões de
[[feedback_untracked_collision_arquivo_a_arquivo]].

**How to apply:** confirme depois que `git rev-parse main origin/main` devolve **o mesmo SHA** e que
`git status -sb` da branch nova **não** mostra upstream (a branch nasce sem tracking com `switch -c`,
diferente do worktree criado de `origin/main` descrito em [[project_main_divergence_2026-06-08]], que
nasce trackeando `origin/main`). Só depois disso comece a stagear por categoria.
