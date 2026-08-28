---
name: discard-already-merged-copy
description: Arquivo modificado na branch cujo conteudo ja entrou em main por outro PR — descartar com checkout HEAD, nunca checkout origin/main
metadata:
  type: feedback
---

Quando um arquivo aparece ` M` mas `git diff origin/main -- <arquivo>` sai **vazio**, o working tree ja e igual a `main`: o conteudo entrou por outro PR e a "modificacao" e so a branch estar com a versao antiga. Descartar com `git checkout HEAD -- <arquivo>` (volta a versao da branch, zero diff a commitar). **Nunca** `git checkout origin/main -- <arquivo>` nesse caso — isso *stagea* a mudanca e recommita em cima do que ja esta em main.

**Why:** duplicar a virada de status de uma story em duas branches gera conflito no merge e polui o historico. O repo e squash-merge: se a branch nao toca o arquivo, o merge nao mexe nele — o conteudo de main sobrevive intacto.

**How to apply:** tipico com `docs/stories/*.story.md` e `docs/qa/gates/*.yml` quando o PR de virada de status foi mergeado durante a sessao. Sempre **provar** a identidade com o `git diff origin/main` antes de descartar (nao assumir), e nunca usar `git checkout .` / `stash -u` amplo — ver [[feedback_untracked_collision_arquivo_a_arquivo]]. Fluxo de virada de status em [[feedback_status_story_via_branch_pr]].
