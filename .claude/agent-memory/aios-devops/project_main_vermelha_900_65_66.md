---
name: main-vermelha-900-65-66
description: RESOLVIDO em 2026-09-04 pelo PR #572 (Story 900-68). A main ficou vermelha por colisão entre PR #565 (teste de lista fechada) e PR #569 (arquivo novo); a saída foi declarar, não afrouxar
metadata:
  type: project
---

**✅ RESOLVIDO em 2026-09-04 pelo PR #572** (Story 900-68, `fix/900-68-residual-declarado-papel-do-host`,
CI verde: `type-check · lint · test` **pass** em 2m11s, `app-url-fallback.test.ts ✓ 24 tests`,
`Test Files 324 passed`). A saída escolhida pelo @dev/@po foi **declarar** `papel-do-host.ts` no
mapa `RESIDUAL_DECLARADO` — ali o literal mora em `HOSTS_DE_TENANT`, denylist de segurança
estática em import-time, e rotear pelo `resolveAppUrlFallback` (que lê env e **lança**) colocaria
leitura de env num caminho de guarda por requisição. A régua não foi enfraquecida.

O diagnóstico abaixo fica registrado porque **o padrão vai repetir**: qualquer régua declarativa
de lista fechada é uma trava que dois merges paralelos detonam.

---

**`origin/main` em `19843658` (2026-09-04) reprovava o próprio teste
`packages/web/src/lib/tenancy/app-url-fallback.test.ts › AC10 — nenhum sítio de fallback ficou
para trás`.** Todo PR aberto contra essa main mostra o check bloqueante
`type-check · lint · test` em ❌ sem ter culpa nenhuma.

```
AssertionError: expected { …(7) } to deeply equal { …(6) }
+   "lib/tenancy/papel-do-host.ts": 1,
```

**Why:** colisão entre dois PRs já mergeados, nenhum dos dois vendo o outro na sua própria CI:
- **#565** (`9d60c758`, Story 900-66) trouxe o teste com uma **lista fechada** de resíduos de
  fallback de marca — teste que reprova por *qualquer* arquivo novo com o literal cru.
- **#569** (`19843658`, Story 900-65) acrescentou `packages/web/src/lib/tenancy/papel-do-host.ts`
  com 1 literal cru a mais. É o commit mais recente da main.

Um teste de "lista exatamente igual" é uma trava que qualquer merge paralelo detona. O #569
chegou depois e ninguém rerodou a CI do #565 contra a main nova.

**How to apply:**
- **Antes de culpar a branch, compare a contagem de testes.** Local (branch sozinha, atrás da
  main) rodou 304 arquivos / 3996 testes; a CI, que roda `main` + branch, rodou 326 / 4610. Os 22
  arquivos a mais vêm da main — se a falha está num deles, não é da branch.
- **A prova que fecha é worktree destacado em `origin/main` puro**, sem um byte da branch:
  `git worktree add --detach <scratchpad>/wt-main origin/main`, symlinkar `node_modules` da raiz
  e de `packages/*`, rodar só o arquivo de teste. Deu `EXIT=1` com a assertion idêntica. Depois:
  **apagar os symlinks ANTES** do `git worktree remove --force`, senão o remove entra nos
  `node_modules` reais.
- **Não consertar como @devops.** Há duas saídas com significados diferentes — declarar
  `papel-do-host.ts` na lista do AC10, ou fazer ele usar o helper de fallback em vez do literal.
  A escolha muda o que o gate garante; é decisão do @dev.
- Registrar o diagnóstico como **comentário no PR**, com a contraprova, para o revisor não ler o
  ❌ como defeito da story. Feito no PR #570.
- **Fechar o ciclo no PR herdeiro.** Depois que a `main` ficou sã, o #570 foi atualizado com
  `git merge origin/main` e a CI virou de `failure` (run 33868536052, 1 falha: a AC10) para
  `success` (run 33876144648) **sem tocar um byte do PR** — é essa a prova, nos dois sentidos, de
  que o ❌ era herança e não defeito. Guardar os dois run ids no comentário do PR.

Relacionado: [[feedback-quality-gate-signals]], [[squash-merge-branches]],
[[merge-main-na-branch-nao-rebase]], [[memoria-de-agente-colide-com-pr-aberto]].
