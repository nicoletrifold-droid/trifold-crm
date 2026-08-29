---
name: ci-surface-trifold
description: Desde a 900-1 existe GitHub Actions (`ci.yml`) rodando type-check/lint/test em todo PR; o build do Vercel continua sem rodar vitest, por isso `it.fails` segue sem quebrar deploy
metadata:
  type: reference
---

Superfície de CI real do `trifold-crm` — **manchete corrigida em 2026-08-29 (Story 900-3b · AC7)**.

## O que mudou (a manchete antiga estava obsoleta)

A versão anterior deste arquivo dizia *"o único check de PR é o build do Vercel — não há
GitHub Actions"*. Isso valia em 2026-08-07 e **deixou de valer com a Story 900-1**, que criou
`.github/workflows/ci.yml`. Medido em 2026-08-29:

- **Dois jobs:** `static` e `tenancy-gate`.
- `static` roda, em todo PR: `pnpm type-check`, `pnpm lint`, `pnpm test` (`vitest run`), com um
  passo final "Resultado" que falha o job se qualquer um dos três falhar (necessário porque os
  três usam `if: always()`).
- `tenancy-gate` roda `pnpm gate:tenancy` e é **`continue-on-error: true`** — não bloqueia
  nesta onda, por sequência declarada no próprio workflow.
- Os checks do Vercel continuam existindo ao lado.

**Consequência para o `pnpm test`:** ele agora *tem* carrasco em PR. Um teste novo em
`scripts/**/*.test.ts` ou `packages/web/src/**/*.test.ts` roda no GitHub, não só na máquina de
quem escreveu.

## O que NÃO mudou — as duas lições abaixo continuam verdadeiras

O **deploy do Vercel** segue sem rodar vitest: `packages/web/vercel.json` →
`pnpm turbo build --filter=@trifold/web`, e a task `build` do `turbo.json` só tem
`dependsOn: ["^build"]` — **não depende de test**. Por isso `it.fails` continua sem quebrar
*deploy* (embora agora possa quebrar o *PR*, pelo job `static`).

**Consequências práticas:**
- Testes marcados `it.fails` (dívida documentada, ex.: os 7 da Story 87-0) **não quebram o build do Vercel nem o deploy**. O vitest reporta "34 passed | 7 expected fail" e sai 0 — logo passam também no job `static`, que só olha o exit code.
- 🔵 **O total `passed + expected fail` é a constante a comparar entre branches, nunca o `passed` sozinho.** Os `it.fails` vêm de `const debtCase = process.env.AIOS_87_0_SEM_MARCADORES === "1" ? it : it.fails` (em `packages/ai/src/prompts/contradiction.test.ts:47` e `config-surfaces.test.ts:56`). Quando uma story **quita** a dívida, o `it.fails` **passa a falhar por sucesso** e o caso migra de `expected fail` para `passed` — o `passed` sobe 1 e o `expected fail` cai 1, com o total intacto. Aconteceu em 11/08: PR #391 deu `2177 | 6` e a `main`/PR #393 davam `2176 | 7`, os dois somando **2183**. Diagnosticar isso como "teste faltando" é o erro fácil; **comparar o total desmascara na hora.** Antes de concluir, cheque *qual* `debtCase` virou: em `contradiction.test.ts` são dois (snapshot × constantes do código) e o `prompts:write` da 87-1 quitou **só o do snapshot**.
- O risco real com arquivo de teste novo em `packages/ai` é **outro**: o `build` do pacote é `tsc` e o `packages/ai/tsconfig.json` faz `include: ["src"]` **sem excluir `*.test.ts`** — ou seja, os testes são type-checked no build de produção. Um teste com tipo quebrado derruba o deploy. O check verde do Vercel no PR já é a prova empírica de que passou.
- ~~Como não há gate automático, o quality gate é manual e é meu~~ — **desatualizado desde a 900-1**: o job `static` roda `pnpm test` em todo PR. Rodar `npx vitest run <arquivos>` localmente continua valendo por velocidade, não por ausência de carrasco. O que **segue** sem gate automático é o `tenancy-gate` (`continue-on-error: true`).

Relacionado: [[agent-prompts-source-of-truth]] (a story D5 do backlog propunha criar o *primeiro* workflow, para rodar `dump-agent-prompts.ts --check` — a 900-1 chegou antes e criou o `ci.yml`; o passo do `--check` ainda não está lá).
