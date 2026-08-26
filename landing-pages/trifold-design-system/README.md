# Site institucional Trifold (`trifold-design-system`)

> **ATENÇÃO:** este projeto **NÃO é deployado via git.** Ele é publicado por **upload
> direto na Vercel** (`vercel --prod`) a partir de uma pasta local completa. Push nesta
> branch/repo **não** publica nada aqui.

O `trifold-design-system` é o site institucional de `trifold.eng.br` — um export do
Claude Design canvas (HTML puro `*.dc.html` + `support.js` + assets), hospedado como um
**projeto Vercel independente** do `trifold-crm` (que roda a aplicação em `packages/web`).

## O que está versionado aqui (e o que não está)

O critério **não é o deploy — é auditabilidade.** Versionamos o que é escrito/revisado à
mão e caberia numa code review; deixamos fora o que é binário pesado gerado pelo canvas.

| Versionado | O quê | Por quê |
|---|---|---|
| ✅ | 8 páginas `*.dc.html` (`Home`, `Empreendimentos`, `Blog`, `Artigo`, `Sobre Nós`, `Design System`, `Logo`, `B2B`) | ~253 KB somados. É onde vivem os snippets de pixel/GA, os endpoints chamados pelo form e a CSP inline — precisa ser revisável e diffável. |
| ✅ | `support.js` | Runtime do template (roteamento client-side, form, animações). |
| ✅ | `api/contact.js` | Serverless function do formulário de contato (honeypot, rate limit, allowlist de origem, Resend). Código de segurança — tem que ser auditável. |
| ✅ | `vercel.json`, `.vercelignore` | Config de roteamento/segurança de produção, incluindo o proxy do Vind. |
| ❌ | `assets/` (20 MB), `uploads/` (57 MB), `preview/`, `brand_imgs/`, `.thumbnail` | ~77 MB de mídia binária gerada pelo canvas. Não diffa, não revisa, e infla o repo do CRM. |
| ❌ | `.vercel/`, `.claude/` | Internals da CLI e memória de agente. `.claude/` estava sendo servido publicamente — ver PR #505. |

> **Correção de um argumento antigo:** este README dizia que os `*.dc.html`/`support.js`
> não eram versionados por serem "grandes (~100+ MB)". Isso está errado: os ~77 MB são
> exclusivamente de `assets/` + `uploads/`. O HTML e o JS somam **~253 KB** — não havia
> razão de tamanho para mantê-los fora, e mantê-los fora nos deixou sem histórico de
> mudanças em arquivos que carregam pixel, CSP e chamadas de API.

**Versionar não muda o deploy.** Continua sendo manual, por upload via Vercel CLI —
`git push` nesta branch/repo **não publica nada** neste projeto. O git aqui é registro
e auditoria, não pipeline.

O `.gitignore` local implementa essa separação. Ele **não é espelho do `.vercelignore`**:
`assets/`/`uploads/` são ignorados pelo git mas são obrigatórios no deploy.

## O que o `vercel.json` faz

1. **Home:** rewrite de `/` → `/Home.dc.html` (o export não gera `index.html`).
2. **Proxy do Vind** (`/vindresidence`): serve a landing do projeto Vercel separado
   `vind-residence` sem duplicar arquivos. Composto por 4 partes, todas necessárias:
   - redirect trailing-slash (`/vindresidence` → `/vindresidence/`) para assets relativos resolverem;
   - 2 rewrites (`/vindresidence/` e `/vindresidence/:path*`) → `https://vind-residence.vercel.app`;
   - CSP escopada para `/vindresidence*` (permite fetch cross-origin do form + Google Fonts + YouTube + Maps);
   - regra site-wide com negative-lookahead `/((?!vindresidence).*)` para a CSP escopada não ser sobrescrita.

## Como publicar de verdade (deploy manual)

O conteúdo versionado aqui sozinho **não deploya**. Para publicar uma mudança é preciso a
pasta completa do site, com os assets. O processo cuidadoso:

1. Montar a pasta local completa: o git já entrega `*.dc.html`, `support.js`, `api/`,
   `vercel.json` e `.vercelignore`; falta baixar `assets/` + `uploads/` (+ `preview/`,
   `brand_imgs/`) do **deployment de produção atual** via API da Vercel, ou reusar a cópia
   local de trabalho se ainda existir.
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
