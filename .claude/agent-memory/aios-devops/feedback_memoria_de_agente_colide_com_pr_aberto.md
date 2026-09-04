---
name: memoria-de-agente-colide-com-pr-aberto
description: Antes de incluir .claude/agent-memory/ num PR, simule o merge contra os PRs abertos — os MEMORY.md são índices append-only e conflitam sempre
metadata:
  type: feedback
---

**Não inclua `.claude/agent-memory/` num PR sem antes simular o merge contra os PRs abertos.**
Os `MEMORY.md` de cada agente são índices *append-only* no fim do arquivo: dois PRs que
acrescentam linhas diferentes ali **conflitam sempre**, porque o 3-way do git não sabe combinar
duas inserções no mesmo hunk de EOF.

**Why:** medido em 2026-09-04 no PR #572 (Story 900-68, P0 que destravava a CI vermelha de
`main`). As memórias na árvore tocavam `aios-dev/MEMORY.md`, `aios-po/MEMORY.md` e
`aios-qa/MEMORY.md`, e o **#570** — já aberto e em revisão — havia mexido nas **mesmas regiões**
(`@@ -14,6` vs `@@ -14,6`; `@@ -11,3` vs `@@ -11,3`). A simulação deu **exit 1 com 3
`CONFLICT (content)`**. Incluir memória teria criado conflito garantido no exato PR que o P0
existia para desbloquear. Sem as memórias, o merge contra o #570 é limpo (`merge-tree` exit 0).

**How to apply:**
- **Como simular sem sujar nada** (nem índice, nem árvore):
  ```bash
  export GIT_INDEX_FILE=$SCRATCH/tmpindex
  git read-tree HEAD && git add -- .claude/agent-memory/
  COMMIT=$(git commit-tree $(git write-tree) -p HEAD -m temp)
  unset GIT_INDEX_FILE
  git merge-tree --write-tree --messages "$COMMIT" <head-do-outro-PR>   # exit 1 = conflito
  ```
  `git merge-tree --messages` imprime `CONFLICT (content)` com o nome de cada arquivo. É prova,
  não estimativa — e não precisa de worktree.
- **Se conflitar, exclua a categoria inteira** do PR (não faça stage parcial de arquivo novo sem
  a linha de índice — memória sem entrada no `MEMORY.md` é memória morta). Declare no corpo do PR
  o que ficou de fora, com a saída medida do `merge-tree`, e mande num `chore(memory)` próprio
  depois que o outro PR mergear.
- **Num P0 isso não é opcional.** A regra de ouro: um PR de desbloqueio nunca introduz atrito no
  PR que ele desbloqueia.
- O precedente oposto (memória num `chore(memory)` no mesmo PR, como no #570) só vale quando
  **nenhum** outro PR aberto tocou os mesmos índices.

Relacionado: [[no-add-all-secret-leak]], [[main-vermelha-900-65-66]], [[squash-merge-branches]].
