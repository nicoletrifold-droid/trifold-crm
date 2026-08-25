---
name: epic900-numbering-and-vercelignore-trap
description: Epic 900 reserva 900-15 para a migração das 129 rotas (hotfix do deploy virou 900-14b); e o trap do .vercelignore que faz build passar local/CI e falhar só na Vercel
metadata:
  type: project
---

Dois fatos do Epic 900 (SaaS multi-tenant) que custaram um incidente de produção em 2026-08-24.

**1. O ID `900-15` é da story de migração das 129 rotas `createAdminClient()`, não de outra coisa.**
Ele é referenciado em artefatos já publicados: epic §9.3, risco R1 do epic,
`docs/audits/admin-client-allowlist.json` (a lista `legado` que só diminui),
`docs/qa/epic-900-po-validation.md`, o texto da `900-14` e o comentário em
`packages/web/eslint.config.mjs` ("a promoção para `error` é da 900-15"). O hotfix do deploy foi
renumerado por mim de `900-15` para **`900-14b`** por isso.

**Why:** reaproveitar um ID reservado invalida silenciosamente a rastreabilidade de 6 artefatos — em
especial um comentário no código que passaria a apontar para uma story que não faz o que ele diz.
O epic já usa sufixo `a`/`b` (900-27a/b, 900-42a/b) para desdobramento.

**How to apply:** ao validar qualquer story nova da série 900, conferir se o número já está
prometido no epic/§9.3 ou no R1 antes de aceitar o draft. Hotfix de artefato existente → sufixo
`b` da story que o criou.

**2. `.vercelignore` na raiz lista `docs`, `scripts`, `bin`, `.aios-core`, `.claude`, `.github`.**
Um import de `packages/web/src` para qualquer um desses diretórios passa `pnpm build` local **e** o
CI do GitHub, e falha **só** no build da Vercel com `Cannot find module`. Foi o que travou produção
por 3 deploys (a `900-14` importava `docs/audits/schema-snapshot.json`).

**Why:** local e CI têm o working tree completo; a Vercel não recebe os diretórios ignorados. O
sinal verde do CI é enganoso por desenho.

**How to apply:** em toda story que faça `packages/web` ler artefato versionado fora do pacote,
exigir AC de prova em **preview deployment da Vercel** (`dpl_…` + `readyState: READY` + SHA = HEAD
do PR) — build local verde não fecha. Ver [[feedback-validation-post-pm-review]].
