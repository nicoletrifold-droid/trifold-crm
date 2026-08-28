---
name: concurrent-agent-edits-during-commit
description: Outro agente AIOS pode editar o mesmo story file enquanto eu commito; re-rodar git status DEPOIS do commit e reportar, nunca amend/descartar
metadata:
  type: feedback
---

Depois de commitar arquivos de `docs/stories/`, **rode `git status` de novo**. Se o
arquivo que acabei de commitar reaparecer como ` M`, provavelmente **outro agente
AIOS está editando ele em paralelo na mesma sessão** — não é lixo nem falha minha.

Confirmar antes de concluir: `stat -f '%Sm' -t '%Y-%m-%d %H:%M:%S' <arquivo>` +
`date` — mtime de poucos segundos atrás = alguém escrevendo agora.

**Why:** em 2026-08-26 commitei a Story 86-12 em `Draft` (PR #510) e segundos
depois o @po virou o Status para `Ready` e travou as duas decisões de negócio
que a story deixava abertas (dataset Meta e nome do projeto Vercel). O commit
já estava pushado — o PR virou um snapshot instantaneamente desatualizado. O
fluxo AIOS (`@sm *draft` → `@po *validate`) roda encadeado, então a janela
entre "story criada" e "story validada" pode ser menor que a duração do meu
próprio commit+push.

**How to apply:**
- **NÃO** `git commit --amend` nem force-push para "consertar" o snapshot — a
  virada `Draft → Ready` é trabalho do @po e vai no commit dele (convenção
  `docs/<story>-done` / branch própria, ver [[status-story-via-branch-pr]]).
- **NÃO** `git checkout --` no arquivo: apaga o trabalho do outro agente.
- Deixar a modificação no working tree e **reportar explicitamente** ao usuário
  que o PR contém a versão anterior e que há uma edição concorrente pendente —
  ele decide se quer um segundo commit no mesmo PR ou um PR separado.
- Se o escopo da minha missão era "commitar o que está aí", o commit está
  correto como feito; o que muda é só o relatório.

**Resolução escolhida pelo usuário (2026-08-26, PR #510):** *segundo commit na
mesma branch/PR*, não PR separado — critério dado por ele: "é a mesma story e o
PR ainda não mergeou". Use esse default em casos análogos (PR aberto + mesma
story), sem deixar de perguntar quando o PR já mergeou.

**A edição concorrente raramente fica num arquivo só.** A validação do @po
tocou, além da story, o **epic** (`docs/stories/epics/epic-86-*.md`, com as
decisões promovidas a "Decisões de Produto travadas" + frontmatter
`stories_done`/`stories_superseded` reconciliado) e a **memória do próprio @po**
— dois deles apareceram como ` M` só *durante* meu commit+push, não no `git
status` inicial. Então: rodar `git status` no início **e** no fim, e nunca
presumir que os arquivos vizinhos são meus para commitar. Doc de epic editada
pelo @po é escopo dele; eu reporto e ele decide.

**Não é só o @po, e não é só ruído: pode bloquear troca de branch.** Ainda em
2026-08-26, minutos depois, o **@dev** virou a mesma 86-12 de `Ready` para
`InProgress` (13s antes do meu `git checkout`). Como a story existe só na branch
do PR e **não** em `origin/main`, o checkout precisaria *deletar* o arquivo — e
o git abortou com "Please commit your changes or stash them". Nesse caso:

- **NÃO** `stash`/`stash -u` (some com o trabalho do outro agente do working
  tree compartilhado) nem `checkout -f`.
- Usar o **worktree a partir de `origin/main`** (`git worktree add --no-track -b
  <branch> <dir> origin/main`), copiar os arquivos do meu escopo para lá,
  conferir SHA256 byte a byte, commitar e pushar de dentro do worktree. O
  working tree principal fica intacto, com a edição concorrente preservada.
- Sintoma diagnóstico: o `git status` inicial da missão **não** lista o arquivo
  e o do meio da missão lista. Sempre checar `stat -f '%Sm'` + `date` antes de
  concluir que é lixo.

Mesmo espírito de [[vercel-static-deploy-concurrency]]: neste repo há vários
processos/agentes mexendo ao mesmo tempo, então **revalidar o estado depois de
agir** é parte do trabalho, não paranoia.
