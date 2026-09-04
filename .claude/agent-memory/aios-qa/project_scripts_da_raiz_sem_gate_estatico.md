---
name: scripts-da-raiz-sem-gate-estatico
description: scripts/ na raiz do trifold-crm não passa por tsc nem por eslint em nenhum gate — "lint e type-check verdes" não diz nada sobre os ~40 scripts operacionais
metadata:
  type: project
---

Medido em 04/09/2026: `pnpm lint` e `pnpm type-check` são `turbo <task>`, e a task só existe em
`packages/*` (`ai`, `bot`, `db`, `shared`, `web`). A **raiz não é workspace**
(`pnpm-workspace.yaml`: `packages/*`), e o `tsconfig.json` da raiz não é executado por script
nenhum. Logo `scripts/*.ts` fica **fora de `tsc` e de eslint**. O `include` de
`packages/web/tsconfig.json` também não cobre `.mjs` (`**/*.ts|tsx|mts`), então
`packages/web/scripts/*.mjs` está fora do type-check igualmente.

O que **existe** de cobertura ali: `vitest.config.ts` inclui `scripts/**/*.test.ts` — 8 arquivos de
teste (gate de tenancy, `db-env`, `gitignore-env`, allowlist do admin client, ledger de migrations).
Tudo o mais em `scripts/` só é verificado por execução real.

**Why:** são ~40 scripts operacionais, vários carregando service-role de **produção**. Aceitar
"gates verdes" como cobertura de uma mudança em `scripts/` é falso positivo estrutural — o gate
nunca olhou o arquivo. Registrado como MNT-001 (low) no gate da Story 900-69.

**How to apply:** mudança em `scripts/` exige execução real com controle negativo, não gate verde.
Se um @dev disser "type-check passou", pergunte por qual task o arquivo dele foi coberto. E quando
alguém propuser fechar a lacuna, o caminho é uma task `type-check` na raiz ou um projeto `tsc`
próprio para `scripts/`. Relacionado: [[sentinela-de-exit-prova-carregamento-de-env]],
[[reverificacao-focada]].
