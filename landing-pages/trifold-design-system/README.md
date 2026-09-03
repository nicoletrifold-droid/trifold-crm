# Site institucional Trifold (`trifold-design-system`)

> **ATENÇÃO:** este projeto **NÃO é deployado via git.** Ele é publicado rodando
> **`./deploy.sh`** localmente, que monta o `dist/` (com as páginas
> pré-renderizadas) e faz upload direto na Vercel. Push nesta branch/repo **não**
> publica nada aqui. Ver "Como publicar de verdade".

O `trifold-design-system` é o site institucional de `trifold.eng.br` — um export do
Claude Design canvas (HTML puro `*.dc.html` + `support.js` + assets), hospedado como um
**projeto Vercel independente** do `trifold-crm` (que roda a aplicação em `packages/web`).

## O que está versionado aqui (e o que não está)

O critério **não é o deploy — é auditabilidade.** Versionamos o que é escrito/revisado à
mão e caberia numa code review; deixamos fora o que é binário pesado gerado pelo canvas.

| Versionado | O quê | Por quê |
|---|---|---|
| ✅ | 8 páginas `*.dc.html` (`Home`, `Empreendimentos`, `Blog`, `Artigo`, `sobre-nos`, `Design System`, `Logo`, `B2B`) | ~253 KB somados. É onde vivem os snippets de pixel/GA, os endpoints chamados pelo form e a CSP inline — precisa ser revisável e diffável. |
| ✅ | `support.js` | Runtime do template (roteamento client-side, form, animações). |
| ✅ | `api/contact.js` | Serverless function do formulário de contato (honeypot, rate limit, allowlist de origem, Resend). Código de segurança — tem que ser auditável. |
| ✅ | `vercel.json`, `.vercelignore` | Config de roteamento/segurança de produção, incluindo o proxy do Vind. |
| ✅ | `deploy.sh`, `scripts/*.mjs` | Pipeline de publicação e pré-renderização (Story 90-1). É o único caminho de deploy — tem que ser revisável. |
| ❌ | `dist/` | Build-output da pré-renderização. Regerado a cada `./deploy.sh` a partir dos `*.dc.html`; **nunca** editado à mão. |
| ❌ | `.seo-metrics/` | Screenshots de baseline/depois e números de CLS (AC2/AC6b da Story 90-1). Artefato de verificação local, pesado e não-diffável. |
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
   `/Home.dc.html` responde **301 para `/`** (Story 90-6): o arquivo continua sendo a
   origem do conteúdo servido em `/`, mas deixa de ser uma URL pública duplicada.
   Rewrite e redirect **não** entram em loop — na Vercel o `destination` de um rewrite
   é resolvido contra o filesystem e não volta a passar pela fase de `redirects`.
2. **URLs limpas do institucional** (Story 90-6): `/sobre-nos`, `/empreendimentos`,
   `/corporativas` e `/blog`. Cada uma tem 3 peças:
   - um `rewrite` da URL limpa para o `.dc.html` de origem
     (`/corporativas` → `/B2B.dc.html`, e assim por diante);
   - um `redirect` **301** da URL antiga com extensão para a limpa
     (`/B2B.dc.html` → `/corporativas`);
   - um `redirect` **301** da forma com barra final para a canônica sem barra
     (`/blog/` → `/blog`).

   **A forma canônica é sem barra final, e isso é funcional, não cosmético:** as páginas
   referenciam `assets/…` e `./support.js` de forma relativa. Em `/sobre-nos` o diretório
   base é `/`, então tudo resolve para `/assets/…`. Em `/sobre-nos/` resolveria para
   `/sobre-nos/assets/…` e o site quebraria — daí o 301 da forma com barra.

   Os redirects usam `"statusCode": 301` em vez de `"permanent": true` porque
   `permanent: true` na Vercel emite **308**, e a AC3 da story pede 301 explicitamente.

   `Sobre Nós.dc.html` foi renomeado para `sobre-nos.dc.html`: espaço e acento no nome
   do arquivo tornam o `destination` do rewrite dependente de URL-encoding exato.
   `Artigo.dc.html` **não** foi renomeado nem ganhou URL limpa — é roteado por query
   string (`?slug=…`) e está fora do escopo da 90-6.
3. **Proxy do Vind** (`/vindresidence`): serve a landing do projeto Vercel separado
   `vind-residence` sem duplicar arquivos. Composto por 4 partes, todas necessárias:
   - redirect trailing-slash (`/vindresidence` → `/vindresidence/`) para assets relativos resolverem;
   - 2 rewrites (`/vindresidence/` e `/vindresidence/:path*`) → `https://vind-residence.vercel.app`;
   - CSP escopada para `/vindresidence*` (permite fetch cross-origin do form + Google Fonts + YouTube + Maps);
   - regra site-wide com negative-lookahead `/((?!vindresidence).*)` para a CSP escopada não ser sobrescrita.

## Como publicar de verdade (deploy manual)

```bash
cd landing-pages/trifold-design-system
./deploy.sh              # monta, valida e publica em produção
./deploy.sh --dry-run    # monta e valida, sem publicar
```

**É esse o único caminho.** Não rode `vercel deploy` da pasta-fonte: desde a
Story 90-1 o que sobe não é esta pasta, é o `dist/` montado — com as 5 páginas
institucionais pré-renderizadas. Um deploy feito à mão da pasta-fonte publica o
site **sem** a pré-renderização, e nada avisa.

O `deploy.sh` faz 5 passos e aborta em qualquer um deles:

1. **Verifica `assets/` + `uploads/`.** São ~77 MB que não estão no git. Sem
   eles o snapshot sai com imagem quebrada — e o snapshot quebrado é o que iria
   para produção. Se faltarem, baixe-os do deployment de produção atual pela
   API da Vercel, ou reuse a cópia local de trabalho.
2. **Monta o `dist/`** (`scripts/build-dist.mjs`): copia os arquivos-fonte por
   uma *allowlist* explícita + `support.js` + `api/` + `vercel.json` +
   `.vercelignore` + a mídia, e pré-renderiza as 5 páginas com headless browser.
   Se a pré-renderização de UMA página falhar, aquela página fica com o
   `.dc.html`-fonte original (comportamento anterior: render 100% no cliente), o
   erro é logado alto, e as outras quatro seguem — uma página não derruba o
   deploy inteiro.
3. **Gate pré-deploy** (`scripts/check-dist.mjs`): procura template cru (`{{`,
   `<sc-for>`) **dentro do `#dc-prerender`** e reprova elemento interativo
   sobrevivente no bloco. O grep é escopado de propósito: o `<x-dc>` sempre tem
   `{{ }}` — é o template-fonte, e isso é correto. Se achar problema, **nada é
   publicado**.
4. **`vercel deploy --prod --yes --scope trifold-s-projects`** de dentro do `dist/`.
5. **Verificação pós-deploy** (`scripts/check-live.mjs`): bate nas 5 URLs de
   produção e confere que o HTML final não tem `{{ }}` cru fora do `<x-dc>` e
   que as páginas que o build pré-renderizou chegaram pré-renderizadas.

### A pré-renderização, em uma tela (Story 90-1)

O site é um export do Claude Design canvas: HTML com `<x-dc>` renderizado 100%
no cliente por `support.js`. Um crawler sem JS recebia `{{ s.heading }}` e
`<sc-for …>` no lugar do conteúdo dinâmico (slides do hero, cards de
empreendimento, posts do blog).

O `support.js` **não pode ser alterado** — é gerado fora deste repositório
(`dc-runtime/`, que não existe aqui). E ele faz **mount, não hydrate**: `boot()`
exige encontrar um `<x-dc>` e o substitui por `<div id="dc-root">`. Publicar o
DOM serializado no lugar do `.dc.html` mataria o `<x-dc>` e, no carregamento
seguinte, **nada montaria** — sem carrossel, sem menu mobile, sem formulário de
contato.

Por isso o desenho é **aditivo**: o HTML de saída mantém o `<x-dc>` íntegro e
ganha um irmão `<div id="dc-prerender">` com o DOM já renderizado, mais um
`<script>` inline que observa `document.body` e remove esse irmão assim que
`#dc-root` ganha filhos. Se o mount falhar, o bloco nunca é removido — o
conteúdo real continua visível.

Três detalhes que parecem cosméticos e não são:

- **O bloco vem ANTES do `<x-dc>`, não depois.** Medido: depois, o CLS chegava a
  1.0 (o bloco visível era empurrado para baixo pela altura inteira do documento
  quando o React montava, e o `componentDidMount` de cada página lê
  `window.innerWidth`, forçando o layout nessa janela). Antes, fica em y=0 e
  nunca é empurrado: CLS ≤ 0.045.
- **`<form>`/`<button>`/`<input>` são removidos fisicamente do snapshot.** A
  cópia estática do formulário de contato não carrega handler (`onSubmit` é prop
  React), e um submit na janela pré-mount faria `GET` nativo para a própria URL,
  vazando nome/telefone/e-mail para a query string e para os logs. Âncoras
  **são** preservadas — são o grafo de links interno e não carregam dado do
  usuário.
- **Cada `<h1>` aparece 2x no HTML servido** (um no `<x-dc>` escondido, um no
  `#dc-prerender`). É consequência esperada do desenho aditivo. Qualquer
  validação de "exatamente um `<h1>`" precisa contar **só dentro de
  `#dc-prerender>`**, não no documento inteiro.

Scripts auxiliares (todos em `scripts/`, nenhum roda em produção):
`capture-metrics.mjs` (screenshots/console/CLS), `compare-metrics.mjs` (diff
baseline × depois), `verify-prerender.mjs` (suíte das ACs 1/4/6a/7/8).
Dependem do `@playwright/test` da raiz do monorepo — rode-os de dentro desta pasta.

Detalhes operacionais complementares (SSO nos previews, gotchas de CSP, receita
do proxy do Vind) estão documentados nas memórias do agente `@devops`
(`vercel-landing-pages-projects`, `vindresidence-proxy-path-resolution`).
