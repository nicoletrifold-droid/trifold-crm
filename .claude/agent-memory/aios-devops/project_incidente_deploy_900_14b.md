---
name: incidente-deploy-900-14b
description: Incidente de 2026-08-23/24 — produção sem deploy por ~37h; corrigido pela 900-14b (PR #493), previews verdes, aguardando merge do Marcos e deploy de produção READY
metadata:
  type: project
---

Produção parou em `dpl_5AtbXWNUYan2Hc7Bw1Dt7znatcTn` (SHA `a5517c56d`, 2026-08-23T15:46:33Z =
12:46 BRT) e ficou 3 deploys de produção em ERROR. A Story **900-14b** (**PR #493**, branch
`fix/900-14b-snapshot-fora-do-deploy`, aberta 2026-08-24) tira o import de
`packages/web/src/lib/supabase/org-scoped-admin.ts` para `docs/audits/schema-snapshot.json` e o
substitui por codegen (`org-scoped-tables.generated.ts`, emitido por
`scripts/generate-schema-snapshot.ts`). Previews de todos os commits da branch em `READY` — os
primeiros builds verdes do projeto desde 23/08.

**Why:** o `.vercelignore` da **raiz** lista `docs`, `scripts`, `bin`, `.github`, `.aios-core`,
`.claude`. Qualquer artefato nesses diretórios consumido por `packages/web` produz a mesma
assinatura de falha: `pnpm build` local passa, CI do GitHub passa, testes passam, type-check
passa — e **só** o deploy da Vercel reprova, com `TS2307 Cannot find module`, porque
`next.config.ts` tem `typescript.ignoreBuildErrors: false` e o `tsconfig` inclui `**/*.ts` (o
`next build` type-checa o projeto inteiro, mesmo código que nenhuma rota importa). Erra **depois do
merge**, o que torna a classe de defeito capaz de parar produção sem nenhum sinal prévio.

**How to apply:**
- **Nada em `main` deploya enquanto o #493 não mergear.** O #492 (75-367) tem os três previews em
  ERROR pelo mesmo motivo — parte de `main` e herda o import. Preview verde é condição
  **necessária, não suficiente**: o incidente só fecha com `target=production` em `readyState=READY`
  depois do merge. **O merge é decisão do Marcos** — ele foi explícito, e eu não mergeio.
- Ficaram sem chegar a produção: 900-11, 900-14, 75-366 e o fix de mídia do WhatsApp.
- **Sem barreira contra reincidência**, por corte de escopo do usuário: não existe regra de lint
  contra import de `packages/web/src` para fora da árvore buildável, nem check de sincronia entre o
  `.generated.ts` e o snapshot. Estão como risco aceito (RA1/RA2) no gate da 900-14b e no backlog,
  para quando a `900-15` migrar as 129 rotas. Antes de aprovar qualquer novo import relativo saindo
  de `packages/web/src`, conferir o destino à mão.
- Ao auditar um preview, o `readyState` **e** o SHA importam: `gh pr view N --json headRefOid` tem
  de bater com `meta.githubCommitSha` do deployment. Registrar a evidência no arquivo da story move
  o HEAD e invalida o próprio registro — anotar em **comentário do PR** quebra a regressão.
- A Vercel **clona** o repo: `GET /v7/deployments/{id}/files` responde `not_found` e o log não
  enumera fontes. Para provar que um arquivo chegou ao build, usar a cadeia `Cloning … Commit: X` no
  log + `GET /repos/…/contents/<path>?ref=X` + build verde com `ignoreBuildErrors: false`.

Relacionado: [[transplantar-hotfix-de-branch-alheia]], [[quality-gate-signals]],
[[vercel-project-setup]].
