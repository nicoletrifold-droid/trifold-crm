---
name: prova de deploy vale na Vercel, não local
description: Em trifold-crm, build/CI verdes NÃO provam que o deploy passa — o CI e o disco local têm o repo inteiro, a Vercel não
metadata:
  type: feedback
---

Para qualquer mudança que possa afetar o build de produção, `pnpm build` + CI verdes **não** são
evidência suficiente. A evidência é um deployment da Vercel (`readyState: READY` lido da API, com o
SHA igual ao HEAD do commit em questão).

**Why:** o runner do GitHub Actions e a máquina local têm o repositório inteiro no disco; a Vercel
recebe só o que o `.vercelignore` da raiz **não** exclui (`docs`, `scripts`, `bin`, `.aios-core`,
`.claude`, `.github`, …). Uma dependência em qualquer um desses diretórios passa nos dois primeiros
e quebra apenas no deploy. Foi o que derrubou três deploys consecutivos de produção em 2026-08-23
(um `import` de `docs/audits/…` dentro de `packages/web/src`), com produção parada ~14h porque
três PRs foram mergeados com o check da Vercel vermelho. Hoje uma regra `no-restricted-imports` em
`error` em `packages/web/eslint.config.mjs` fecha esse vetor específico — mas a lição sobre o que
conta como prova é mais ampla que a regra.

**How to apply:**
- Reproduzir a condição da Vercel localmente é barato e vale a pena: mover `docs/` (ou o diretório
  em questão) para fora da árvore e rodar `pnpm --filter @trifold/web exec tsc --noEmit`. Restaurar
  sempre no fim.
- Ao fechar uma story de build/deploy, registrar `dpl_…` + `readyState` + SHA lidos da API da
  Vercel (token em `~/Library/Application Support/com.vercel.cli/auth.json`, ids em
  `.vercel/project.json`). Só `GET` — deploy e push são do @devops.
- Antes de dar uma story de infra por fechada, conferir se o check que a garante mora num job
  **bloqueante** do CI. Em `.github/workflows/ci.yml`, o job `static` bloqueia; o `tenancy-gate` é
  `continue-on-error: true` e um check plugado nele é decorativo.
- Ver também [[project_trifold_crm]].
