---
name: landing-pages-runtime
description: landing-pages/* são projetos Vercel standalone fora do workspace pnpm — regras de deploy, git e o trap de IP via proxy
metadata:
  type: project
---

`landing-pages/vind-residence/`, `landing-pages/yarden/` e
`landing-pages/trifold-design-system/` são projetos Vercel **standalone**, fora do
workspace pnpm, sem bundler e sem CI.

**Why:** foram criados como réplicas estáticas de landings externas (GreatPages/WordPress),
não como pacotes do monorepo. Isso muda o que é possível implementar ali e como o código
chega em produção — nada disso é visível lendo só o código.

**How to apply:**
- `vind-residence/` (PRs #478/#483/#494) e `yarden/` **são versionados no git**;
  `trifold-design-system/` **é untracked de propósito** — nunca forçar `git add` nele. Quando uma mudança vive só
  lá (ex.: CSP), registrar o conteúdo final no Dev Agent Record da story: não haverá diff
  versionado para auditar depois.
- Nenhum dos dois passa por CI. Publicação é sempre manual:
  `vercel deploy --prod --yes --scope trifold-s-projects` de dentro de cada diretório
  (cada um tem seu `.vercel/project.json`). @devops executa.
- `package.json` de `vind-residence` não declara dependência nenhuma → `import`/`require`
  de `packages/shared` **falha no deploy**. Código novo ali é JS puro (Node 24.x, CommonJS
  nas funções `api/`). Duplicar a semântica dos módulos do CRM é a exceção justificada;
  duplicar o lado servidor não é.
- Tudo dentro de `api/` vira função serverless. Arquivos de teste ficam FORA de `api/` e
  entram no `.vercelignore`. As funções são CommonJS comum e são testáveis pela suíte da
  raiz via `createRequire` (`landing-pages/**/*.test.ts` está no `vitest.config.ts`).
- **`npm run lint` não alcança `landing-pages/`** (o `pnpm-workspace.yaml` só tem
  `packages/*`), então lint verde ali não significa nada — ele nem foi executado
  (o turbo sai `FULL TURBO`, tudo em cache). Para conferir um `.ts` novo de teste
  dessas pastas: `tsc --strict` com o `tsconfig.json` da raiz, apontando
  `typeRoots` para o `@types/node` do `.pnpm` (na worktree o root
  `node_modules/@types` não existe).
- **Processar imagem nesta máquina:** `sips` do macOS **não** exporta WebP
  (`sips -s format webp` falha), e não há `cwebp` nem ImageMagick instalados. O que
  funciona é `python3` + `PIL` 11.3.0 (com WebP). Para caber num teto de KB, buscar
  a qualidade por ladder decrescente em vez de chutar um número — e, quando a
  qualidade cai a ponto de borrar, **reduzir a largura** em vez de continuar
  baixando qualidade.

**Trap de atribuição (Epic 86), e a faca de dois gumes:** o browser chama
`api/lead.js`/`api/track.js`, e ESSES proxies chamam o CRM servidor-a-servidor. O
`x-forwarded-for` que o CRM enxerga é o do datacenter da Vercel. Qualquer sinal que dependa
do IP/UA reais do visitante tem que ser capturado no proxy e viajar no CORPO, com o corpo
tendo precedência sobre o header do lado do CRM. Reusar um helper que deriva IP da própria
request quebra isso **sem erro e sem log**.

Mas o inverso também morde, e foi o defeito `86.11-QA-001`: dar essa precedência dentro de
um helper **compartilhado** a expõe nas rotas que o browser chama DIRETO (sem proxy), onde
o corpo é escrito pelo próprio visitante — que passa a poder forjar geografia/dispositivo
no dataset do Meta. Regra: precedência corpo→header é sempre **opt-in explícito por
chamador** (default = header), nunca o default do helper. Um cast de TypeScript
(`interface X extends CorpoTracking`) **não** filtra chave nenhuma em runtime, então "essa
rota não manda esse campo" não é proteção. Ver [[project-trifold-crm]] e a Story 86-11.
