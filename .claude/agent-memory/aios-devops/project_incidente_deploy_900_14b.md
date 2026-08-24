---
name: incidente-deploy-900-14b
description: Incidente de 2026-08-23/24 — produção sem deploy por ~37h; RESOLVIDO pela 900-14b (PR #493 mergeado, produção READY em 2026-08-24T14:08Z). Lições sobre .vercelignore e prova de deploy
metadata:
  type: project
---

Produção parou em `dpl_5AtbXWNUYan2Hc7Bw1Dt7znatcTn` (SHA `a5517c56d`, 2026-08-23T15:46:33Z =
12:46 BRT) e ficou 3 deploys de produção em ERROR. A Story **900-14b** (**PR #493**, branch
`fix/900-14b-snapshot-fora-do-deploy`, aberta 2026-08-24) tira o import de
`packages/web/src/lib/supabase/org-scoped-admin.ts` para `docs/audits/schema-snapshot.json` e o
substitui por codegen (`org-scoped-tables.generated.ts`, emitido por
`scripts/generate-schema-snapshot.ts`). **RESOLVIDO em 2026-08-24T14:08:16Z:** PR #493 mergeado por squash (`8a2e76d0`), deploy de produção
`dpl_B3AF4nJBRTd6oyQUuigFHgyyGE2u` em `target: production` / `readyState: READY`. ~37h de parada e
4 deploys de produção em ERROR.

**Why:** o `.vercelignore` da **raiz** lista `docs`, `scripts`, `bin`, `.github`, `.aios-core`,
`.claude`. Qualquer artefato nesses diretórios consumido por `packages/web` produz a mesma
assinatura de falha: `pnpm build` local passa, CI do GitHub passa, testes passam, type-check
passa — e **só** o deploy da Vercel reprova, com `TS2307 Cannot find module`, porque
`next.config.ts` tem `typescript.ignoreBuildErrors: false` e o `tsconfig` inclui `**/*.ts` (o
`next build` type-checa o projeto inteiro, mesmo código que nenhuma rota importa). Erra **depois do
merge**, o que torna a classe de defeito capaz de parar produção sem nenhum sinal prévio.

**How to apply:**
- **Preview verde é condição necessária, não suficiente** — o que fecha um incidente de deploy é
  `target=production` + `readyState=READY`, e só depois do merge. Vale para o próximo incidente:
  não declarar resolvido em cima de preview.
- **A contraprova mais forte veio de graça, em produção.** O merge do PR #494 (escopo alheio) caiu
  em `main` 2 minutos antes do meu e falhou com `Cannot find module '…/docs/audits/schema-snapshot.json'`;
  o meu, 2 minutos depois, deu `Compiled successfully` + `Build Completed`. Mesma pipeline, mesmo
  projeto, dois logs. Quando existir um par assim, capturá-lo: vale mais que qualquer reprodução local.
- Destravou de uma vez o que estava preso em `main`: 900-11, 900-14, 75-366 e o fix de mídia do
  WhatsApp. **Confirmado no PR #492 (75-367)**: os 3 previews em ERROR eram herança desta causa —
  depois de integrar a `main` na branch (`03b347a4`), o preview
  `dpl_CUFMW1qNW1dqMZdqLZLBn724Vuuc` ficou READY com o SHA do HEAD, e o merge por squash
  (`901e366e`) produziu produção READY em `dpl_6Q8UfKJKcLodHgjHhkf7WrzuPjuQ`
  (2026-08-24T14:49:09Z). O sinal a guardar: **preview em ERROR numa branch não implica defeito da
  branch** — antes de investigar o PR, integre a `main` atual e veja se o erro sobrevive.
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
