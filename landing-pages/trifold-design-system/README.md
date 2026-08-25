# Site institucional Trifold (`trifold-design-system`)

> **ATENÇÃO:** este projeto **NÃO é deployado via git.** Ele é publicado por **upload
> direto na Vercel** (`vercel --prod`) a partir de uma pasta local completa. Push nesta
> branch/repo **não** publica nada aqui.

O `trifold-design-system` é o site institucional de `trifold.eng.br` — um export do
Claude Design canvas (HTML puro `*.dc.html` + `support.js` + assets), hospedado como um
**projeto Vercel independente** do `trifold-crm` (que roda a aplicação em `packages/web`).

## Por que só o `vercel.json` está versionado aqui

Este diretório contém **apenas** o `vercel.json` como **snapshot de referência** do que
está publicado em produção hoje. O objetivo é não perder o registro da configuração de
roteamento/segurança do site — em especial o **proxy do Vind** (`trifold.eng.br/vindresidence`),
cuja receita é sutil e fácil de quebrar.

As páginas `*.dc.html`, o `support.js` e os assets **não** estão versionados aqui: são
grandes (~100+ MB), gerados pelo canvas, e o site é publicado por upload manual — versioná-los
no repo do CRM só cria ruído e conflito (foi o que motivou o fechamento do PR #471).

## O que o `vercel.json` faz

1. **Home:** rewrite de `/` → `/Home.dc.html` (o export não gera `index.html`).
2. **Proxy do Vind** (`/vindresidence`): serve a landing do projeto Vercel separado
   `vind-residence` sem duplicar arquivos. Composto por 4 partes, todas necessárias:
   - redirect trailing-slash (`/vindresidence` → `/vindresidence/`) para assets relativos resolverem;
   - 2 rewrites (`/vindresidence/` e `/vindresidence/:path*`) → `https://vind-residence.vercel.app`;
   - CSP escopada para `/vindresidence*` (permite fetch cross-origin do form + Google Fonts + YouTube + Maps);
   - regra site-wide com negative-lookahead `/((?!vindresidence).*)` para a CSP escopada não ser sobrescrita.

## Como publicar de verdade (deploy manual)

Este `vercel.json` sozinho **não deploya**. Para publicar uma mudança é preciso a pasta
completa do site. O processo cuidadoso:

1. Reconstruir a pasta local completa (todas as `*.dc.html` + `support.js` + `assets/`) a partir
   do **deployment de produção atual**, via API da Vercel (ou da cópia local de trabalho, se ainda existir).
2. Aplicar a mudança desejada (incluindo, se for o caso, editar este `vercel.json`).
3. Deploy manual de dentro da pasta:
   ```bash
   cd <pasta-local-completa-do-trifold-design-system>
   vercel deploy --prod --yes --scope trifold-s-projects
   ```
4. Validar (o site é template client-side: `curl`+grep não prova render — validar headless).

Detalhes operacionais completos (SSO nos previews, protocolo de validação headless,
gotchas de CSP, receita do proxy do Vind) estão documentados nas memórias do agente
`@devops` (`vercel-landing-pages-projects`, `vindresidence-proxy-path-resolution`).
