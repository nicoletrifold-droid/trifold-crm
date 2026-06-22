---
name: feedback-force-push-vs-merge-main
description: Quando origin/main tem commits de terceiros disjuntos, mergear (não force-push) mesmo com a regra "git push -f origin main"
metadata:
  type: feedback
---

A regra do Alan `git push -f origin main` (app/Vercel) NÃO é licença para sobrescrever commits de outros devs em origin/main. Antes de qualquer push para main: `git fetch origin main` e checar `ahead`/`behind`.

- Se `behind > 0` e o commit remoto toca arquivos DISJUNTOS dos seus → `git merge origin/main --no-edit` (sem force) e push normal. Force-push apagaria o trabalho deles e quebraria prod.
- O `-f` só se justifica no cenário original (divergência de rebuild do Vercel, sua árvore é a fonte de verdade), nunca para clobberar trabalho de terceiros.

**Why:** Em 2026-06-17, ao pushar Story 52-6, origin/main estava behind 1 com Story 59-1 (outro dev, arquivos `packages/ai`/`cron/followup` — disjuntos da 52-6). Force-push teria destruído a 59-1. Merge limpo resolveu sem conflito.

**How to apply:** Sempre inspecionar `git show --stat <remote-commit>` quando behind>0 antes de decidir entre merge e force. Disjunto → merge. Confirma e reforça [[project-main-divergence-2026-06-08]] (sempre fetch antes).
