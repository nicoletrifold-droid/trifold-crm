---
name: status-story-via-branch-pr
description: Em trifold-crm nada vai direto para a main — nem commit de documentação; virada de status de story vai por branch docs/<story>-done + PR
metadata:
  type: feedback
---

**Nenhum commit direto na `main`, nem de documentação.** A virada de status de uma story para
`Done` (depois do merge do PR e da produção confirmada) vai por branch própria + PR, no padrão
`docs/<story>-done`.

**Why:** correção explícita do Marcos em 2026-08-24 — no PR #493 eu fiz dois commits de doc direto
na `main` (`005d4684` e `506cc1ed`) e ele pediu para não repetir: "aqui, tudo via a branch e o PR".
Não é preciosismo de processo: commit direto na `main` dispara deploy de produção sem passar por
nenhum check de PR, e some do rastro de revisão. O repo já tinha a convenção antes de mim —
`origin/docs/75-245-247-done`, `origin/docs/75-249-done`, `origin/docs/75-261-…`.

**How to apply:**
- Depois de mergear o PR de código: `git checkout main` → `git merge --ff-only origin/main` →
  `git checkout -b docs/<story>-done` → editar a story → PR → squash-merge.
- O status `Done` do repo é `**Status:** Done` na linha 3, com o parentético de evidência:
  SHA do squash, `uid` do deployment, `target=production`, `readyState=READY` e horário.
- **Não apagar a branch remota** depois do merge — o repo preserva branch mergeada (103 remotas em
  2026-08-24), então `gh pr merge --squash` **sem** `--delete-branch`.
- Se houver memória de agente para gravar na mesma leva, **empacote no mesmo PR** da virada de
  status em vez de abrir um terceiro PR: o Marcos prefere um PR agrupado a vários pequenos quando o
  escopo é o mesmo.

Relacionado: [[merge-main-na-branch-nao-rebase]], [[force-push-vs-merge-main]],
[[incidente-deploy-900-14b]].
