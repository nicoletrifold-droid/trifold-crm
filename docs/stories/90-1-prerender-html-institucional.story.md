# Story 90-1 — Pré-renderizar o HTML institucional (Home, Sobre Nós, Empreendimentos, B2B, Blog)

**Status:** InReview (@devops, 2026-09-03) — deployado em produção e smoke-testado; PR #564 aberto e **aguardando confirmação explícita do usuário para merge** (promove para `Done` só depois do merge)
**Epic:** 90 — SEO Técnico do site institucional trifold.eng.br
**Executor:** @dev (Dex)
**Quality Gate:** @qa (Quinn) — `*qa-gate` ao fim da implementação
**Prioridade:** P0 — bloqueante (Tier 1 do relatório de auditoria)
**Estimativa:** 13 pontos (GG) — mantida; a abordagem agora está mais bem especificada
(não é mais decisão em aberto), mas o volume de trabalho não mudou: snapshot aditivo,
assembly de `dist/`, script de deploy novo, testes de CLS/mount.
**Depende de:** Story 90-6 (URLs limpas) — **já concluída e em produção.** O arquivo
de Sobre Nós já está renomeado (`sobre-nos.dc.html`); as outras 4 páginas mantêm o
nome original com rewrite para URL limpa. Ver Dev Notes.
**Bloqueia:** Story 90-3b (H1 da Home só tem valor de SEO depois desta)

## Contexto (achado T1 do relatório de auditoria — escopo corrigido em 2026-09-01)

> Fonte: `docs/research/2026-08-28-seo-audit-trifold/RELATORIO.md`, achado T1 (CRÍTICO,
> Prioridade 1).

**Correção de escopo (consulta @architect, 2026-09-01):** a redação original desta
story descrevia o problema como "o site inteiro é invisível para crawlers sem JS".
Isso superdimensionava o achado. O que é real:

- Crawlers sem JS (a maioria dos crawlers de IA, previews sociais) já veem hoje
  `<title>` + `<meta name="description">` de cada página — isso nunca esteve
  bloqueado.
- Empreendimentos, B2B e Blog já servem um `<h1>` estático real, sem depender de JS
  (corrigido no achado O1, rodada anterior de validação deste epic).
- **O gap real e específico é o conteúdo dinâmico**: os itens de `<sc-for>` (slides
  do hero da Home, cards de empreendimento, posts do blog), valores interpolados de
  dados (`{{ ... }}`), e o atraso de orçamento de renderização do Googlebot (que
  enfileira paginas com JS pesado para um passe de render separado, dias depois do
  crawl inicial).

O HTML servido a um crawler sem JS hoje é o esqueleto do template — evidência da
auditoria original:

```
GET /  →  <h2>{{ s.heading }}</h2>, <sc-for list="{{ slides }}">...
```

**Impacto real:** indexação atrasada do conteúdo dinâmico (Googlebot enfileira o
passe de renderização à parte), e o texto que mais importa para ranqueamento (nome
dos empreendimentos, descrições, posts) só existe depois do JS rodar.

## Restrição técnica confirmada (achado do @sm ao redigir esta story; validado pelo @po)

`support.js` é um artefato **gerado fora deste repositório**. A primeira linha do
arquivo declara:

```js
// GENERATED from dc-runtime/src/*.ts — do not edit. Rebuild with `cd dc-runtime && bun run build`.
```

O diretório `dc-runtime/` **não existe** em `trifold-crm` (confirmado por busca em todo
o repositório). Isso significa:

- Esta story **não pode** editar a lógica de parsing/renderização do runtime "dc"
  (`parseDcDocument`, `parseDcText`, o motor de `<sc-for>`/`<sc-if>`/`<dc-import>` etc.)
  — esse código não está disponível para o @dev alterar.
- Qualquer solução precisa operar **sobre os artefatos já publicados** em
  `landing-pages/trifold-design-system/` (os 5 arquivos `.dc.html` públicos +
  `support.js` + `vercel.json`), sem depender de mudar o pipeline de export do Claude
  Design canvas.
- O deploy deste projeto é manual (`vercel deploy --prod`, sem CI), então a solução
  também precisa se encaixar num processo manual bem definido — ver "Convenção de
  deploy" abaixo.

## Achado do @architect (Aria) — consulta técnica de 2026-09-01

A própria story recomendava consultar @architect dado o ineditismo da decisão. A Aria
leu `support.js` inteiro (não só o topo) e encontrou um problema que **invalida a
abordagem original desta story como estava redigida** — não é ajuste cosmético, é
correção de rumo técnico.

### O achado central: snapshot ingênuo QUEBRA o site

O runtime "dc" (`support.js`, função `boot()`, linha 150) faz `dc.replaceWith(hostEl)`
(linha 166) — ou seja, ele **substitui** o `<x-dc>` por um `<div id="dc-root">` vazio
e monta o React nele (`ReactDOM.createRoot(hostEl).render(...)`, linha 194-195 — é
**mount**, não `hydrate`; não existe `hydrateRoot` em lugar nenhum do bundle).

**Consequência:** se a abordagem fosse "serializar o DOM final e publicar isso no
lugar do `.dc.html`" (o que a redação anterior desta story não impedia), o HTML
publicado deixaria de ter `<x-dc>` — teria só o `<div id="dc-root">` com o DOM já
expandido dentro. No próximo carregamento, `parseDcDocument` (`support.js:25`, usada
para adotar o template) já não encontra `<x-dc>` e retorna `null`; e o próprio
`boot()` (`support.js:163`, chamada distinta — mesma busca por `querySelector("x-dc")`,
logo antes de criar o `#dc-root` na linha 165) também não encontra nada para montar.
(`parseDcText`, à parte, nem usa `querySelector` — é regex sobre texto cru,
`support.js:38` — não entra nessa falha, mas também não ajuda: ele readotaria o
`<div id="dc-root">` vazio como se fosse o template.) Resultado prático: **nada
monta** — morre o carrossel do hero, o menu mobile (`toggleMenu`), o acordeão, e
principalmente **o formulário de contato** (`handleContactSubmit` → `POST
/api/contact`, confirmado em `Home.dc.html:211,277,290`).

Isso trocaria um problema de SEO por uma **queda de conversão de leads** — pior que o
problema original.

Isso também torna a opção "in-place" do AC0 (que já estava desaconselhada por
auditabilidade na redação anterior) **tecnicamente inviável**, não só indesejável:
sobrescrever o `<x-dc>` mata os bindings, e o próprio `boot()` faz `fetch(location.href)`
→ `parseDcText` → `updateHtml()` logo depois — ele **readotaria o template morto como
fonte**. Perde-se interatividade E código-fonte ao mesmo tempo.

### A forma correta: snapshot ADITIVO, não substitutivo

- O `.dc.html` de saída em `dist/` mantém o `<x-dc>` **íntegro** (não remove, não
  substitui) e ganha um elemento **irmão novo**, `<div id="dc-prerender">`, contendo o
  DOM já renderizado/serializado (o snapshot do Playwright).
- **Correção do @po (validação de 2026-09-01): `#dc-root` não existe no HTML servido
  nem no HTML-fonte — só é criado dentro do próprio `boot()`
  (`support.js:164-166`: `doc.createElement("div")` → `hostEl.id = "dc-root"` →
  `dc.replaceWith(hostEl)`), em runtime. `document.getElementById('dc-root')` retorna
  `null` até o mount rodar, e `observer.observe(null)` lança `TypeError` — um
  `MutationObserver` "observando `#dc-root`" diretamente é inimplementável.** O alvo
  correto é um ancestral **estável**, já presente no HTML desde o primeiro paint —
  `document.body` (ou o elemento pai do `<x-dc>`) — com
  `{ childList: true, subtree: true }`. A condição de remoção continua a mesma de
  sempre ("assim que `#dc-root` ganhar filhos"): a cada mutação observada, o script
  testa `const r = document.getElementById('dc-root'); if (r && r.childNodes.length)`
  e, se verdadeiro, remove `#dc-prerender` e chama `observer.disconnect()`. Uma
  checagem síncrona idêntica roda uma vez logo ao carregar o `<script>` inline
  (antes de registrar o observer), cobrindo a corrida em que o mount termina antes do
  observer estar configurado.
- **Efeito colateral bom, quase de graça:** se o mount falhar por qualquer motivo (JS
  quebrado, erro de rede ao carregar o React local), o bloco pré-renderizado
  **permanece visível** — degradação graciosa real. Isso é o que cobre o AC4 revisado
  (ver abaixo), melhor do que a redação anterior cobria.
- Adicionar `<style>x-dc{display:none}</style>` **estático** no `<head>` do output —
  hoje o `hideRawTemplate()` (`support.js:1572`) só injeta esse mesmo estilo via JS,
  de forma síncrona no topo do IIFE, mas ainda depois do parser HTML já ter começado a
  pintar o documento — o que pode causar um FOUC breve de `{{ }}`/tags cruas visível
  hoje em produção antes do script rodar (achado novo, fora do escopo original, vale
  registrar como observação — ver Dev Notes). **Atenção:** essa regra estática só pode
  entrar **junto** com o bloco pré-renderizado (`#dc-prerender`) — sozinha, ela também
  esconderia os `<h1>` estáticos que Empreendimentos/B2B/Blog já servem sem JS,
  regredindo o achado O1 já corrigido.

### Risco residual reconhecido (não bloqueante, mas precisa ser gerenciado)

**Correção do @po (validação de 2026-09-01):** a citação original desta story
("`renderVals()` em `support.js:737` depende de `window.innerWidth`") estava errada.
`support.js:737` é só o stub genérico da classe-base (`renderVals() { return {}; }`)
— `support.js` não tem nenhuma ocorrência de `innerWidth`/`matchMedia`/`resize`
(confirmado por grep). **A dependência real de viewport está no `data-dc-script` de
CADA página institucional** — ex.: `Home.dc.html:257` (`vw: window.innerWidth` no
`state` inicial), `:260` (listener de `resize` atualizando `vw`), `:307`
(`isMobile = vw < 900`) — e está presente nas 5 páginas (Home, `sobre-nos`,
Empreendimentos, B2B, Blog; confirmado por grep, 2 ocorrências de
`window.innerWidth` em cada uma). Isso torna o risco de CLS **real e presente nas 5
páginas**, não hipotético — a citação errada da linha poderia levar a concluir
(incorretamente) que o risco não existe, ou, pior, a tentar "resolver" isso editando
`support.js`, o que é proibido pela restrição do dc-runtime (ver acima). **O snapshot
congela UM viewport.** Quem visita com um viewport diferente do
que foi usado para gerar o snapshot vai ver um "salto" (CLS — Cumulative Layout Shift)
no momento em que o React monta por cima e substitui os estilos.

**Mitigação:** gerar o snapshot em viewport **mobile** (Googlebot é mobile-first hoje),
e medir CLS na AC6 em vez de só contar elementos (ver AC6 revisado).

## Decisão técnica (não é mais uma escolha em aberto)

A redação anterior apresentava duas abordagens candidatas para o @dev escolher. Após a
consulta @architect, isso deixou de ser uma escolha:

**Abordagem adotada: snapshot ADITIVO** (`#dc-prerender` + `MutationObserver`, ver
acima) — é a única forma de resolver o gap de conteúdo sem quebrar o mount do React.

**Dynamic rendering (user-agent) permanece só como alternativa teórica de último
recurso** — se, na prática de implementação, a abordagem aditiva se provar inviável
por algum motivo não previsto aqui, essa seria a rota B. Não há indício hoje de que
isso vá acontecer; não é esperado que o @dev precise dela.

## Acceptance Criteria

### AC0 — Fonte-da-verdade pós-prerender (decidido — não é mais escolha entre 2 opções)

**Build-output separado é a única opção tecnicamente viável**, não uma recomendação
por preferência de auditabilidade:

- O README do projeto (`landing-pages/trifold-design-system/README.md`) já justificava
  versionar os `.dc.html` no git por auditabilidade (snippets de pixel/GA, endpoints do
  form, CSP inline) — esse argumento continua válido.
- Mas agora há um segundo motivo, técnico e não-negociável: o prerender **in-place**
  (sobrescrever o `.dc.html` versionado) sobrescreveria o `<x-dc>`, o que **quebra o
  mount do React** (ver "Achado do @architect" acima) — não é mais uma questão de gosto
  entre duas opções aceitáveis, a opção in-place simplesmente não funciona.
- **Decisão:** o script de prerender lê os `.dc.html` versionados (que continuam sendo
  a fonte editável/auditável, com o `<x-dc>` intocado) e escreve o HTML final — `<x-dc>`
  íntegro + `<div id="dc-prerender">` aditivo — em um diretório de saída **não
  versionado** (`dist/`, adicionado ao `.gitignore`), que é o que sobe no
  `vercel deploy --prod` via `deploy.sh` (ver "Convenção de deploy").
- Isso afeta diretamente as Stories 90-3b, 90-4 e 90-5 (que editam os mesmos 5 arquivos
  `.dc.html`-fonte): elas continuam editando os arquivos-fonte normalmente — o
  `dist/` é sempre regenerado a partir deles, nunca editado à mão.

### AC1 — Crawler sem JS recebe conteúdo real (snapshot aditivo, não substitutivo)

Uma requisição HTTP simples (sem executar JavaScript — o mesmo método usado na
auditoria: `curl`) em `/`, `/sobre-nos`, `/empreendimentos`, `/corporativas` e
`/blog` (URLs limpas, já em produção desde a Story 90-6 — **correção do @po**: as
URLs antigas `/Empreendimentos.dc.html`, `/B2B.dc.html`, `/Blog.dc.html` agora
retornam 301, não servem mais conteúdo diretamente) recebe HTML onde:

- O `<x-dc>` original permanece **intacto** no documento (não removido, não
  substituído) — preserva o template que o runtime "dc" precisa para montar
  normalmente no client.
- Um `<div id="dc-prerender">` novo, **irmão** do `<x-dc>`, contém o DOM já
  renderizado/serializado pelo snapshot (Playwright, viewport mobile) — headings,
  parágrafos, CTAs, itens de `<sc-for>` já expandidos como texto real, não
  placeholders `{{ ... }}`/`<sc-for>`/`<dc-import>` sem resolver.
- Um `<script>` inline curto que observa `document.body` (não `#dc-root` — ver
  correção em "A forma correta", acima) com `MutationObserver({ childList: true, subtree: true })`, e
  remove `#dc-prerender` assim que `document.getElementById('dc-root')` existir e
  tiver filhos (com uma checagem síncrona equivalente logo no carregamento do
  script, cobrindo a corrida em que o mount já terminou antes do observer ser
  configurado — ver "A forma correta" acima para o detalhe completo).
- Um `<style>x-dc{display:none}</style>` estático no `<head>`, presente **somente**
  junto com o `#dc-prerender` correspondente (nunca sozinho — ver risco de regressão
  do O1 acima).
- **`#dc-prerender` inteiramente não-interativo** — ver AC7, novo, abaixo (risco de
  vazamento de PII via formulário sem handler).

### AC2 — Sem regressão para usuários reais (mensurável)

A experiência para usuários com JavaScript habilitado não regride, verificada de
forma objetiva, não apenas visual "a olho":

- **Diff de screenshot via Playwright** das 5 páginas, em 2 viewports (mobile
  ~390px e desktop ~1440px), comparando antes/depois da mudança — sem diferença
  visual além de variação esperada (ex.: timestamps, carrossel em posição diferente
  por timing).
- **Contagem de erros/warnings de console** igual à baseline atual (capturar a
  baseline antes de implementar, comparar depois) — nenhum erro novo introduzido pelo
  mecanismo de prerender, pelo `MutationObserver`, ou pelo mount subsequente do
  runtime "dc".
- Métricas de CLS ficam na AC6 (risco específico do snapshot de viewport único), não
  duplicadas aqui.

### AC3 — Sem depender de alterar o `dc-runtime`

A solução não exige nenhuma mudança em código que gere `support.js` — esse código
(`dc-runtime/src/*.ts`) não está neste repositório. A solução opera inteiramente sobre
os arquivos hoje presentes em `landing-pages/trifold-design-system/`, e não altera o
comportamento do runtime em si (o `<script>` do `MutationObserver` é conteúdo novo no
HTML de saída, não uma edição do `support.js`).

### AC4 — Resiliência a falha de mount do React (reescrita — a premissa original estava errada)

**Correção do @architect:** a redação original desta AC ("resiliência a falha do CDN
externo unpkg.com") partia de uma premissa que não se aplica às 5 páginas
institucionais. Confirmado lendo o código: `ensureBabel()` (`support.js:1057`) só é
chamado via `x-import` com `kind === "jsx"` (`support.js:1078`), e **nenhuma das 5
páginas institucionais usa `x-import`** (0 ocorrências, confirmado por grep em
`Home.dc.html`, `sobre-nos.dc.html`, `Empreendimentos.dc.html`, `B2B.dc.html`,
`Blog.dc.html`). O React vem de um arquivo **local** com SRI
(`assets/vendor/react.production.min.js`/`react-dom.production.min.js`,
`support.js:1568-1571`), não de CDN — `unpkg.com` não é carregado por essas páginas.

O achado T1 original ("transpilação JSX dependente de `unpkg.com`") é **código morto**
para essas 5 páginas — não invalida a decisão de fazer esta story (o gap real de
conteúdo em `<sc-for>` continua existindo e vale corrigir), só muda o que a AC4 precisa
testar:

**AC4 revisada:** se o mount do React falhar por qualquer motivo (`loadReactUmd()`
rejeitar — ex.: arquivo local do vendor indisponível, erro de rede, SRI não bater), a
página ainda exibe conteúdo real para o usuário/crawler, porque o `#dc-prerender`
aditivo (AC1) nunca foi removido pelo `MutationObserver` (que só remove quando
`#dc-root` ganha filhos — e sem mount bem-sucedido, isso nunca acontece). Esta AC é
coberta **por construção** pelo desenho aditivo do AC1, não precisa de lógica extra.

*(Nota de backlog, não desta story: `unpkg.com` continua no `script-src` do CSP em
`vercel.json:109` sem uso real pelas 5 páginas institucionais — superfície de
supply-chain à toa. Registrado como Tier 4 no epic para limpeza futura.)*

### AC5 — Falha de pré-renderização de UMA página não bloqueia o deploy inteiro (reescrita)

Se o processo de pré-renderização falhar para uma página específica durante a
montagem do `dist/` (ver Task de assembly), o `deploy.sh`:

- Loga o erro explicitamente (não falha silenciosa).
- **Copia o `.dc.html`-fonte original** (sem o bloco `#dc-prerender`) para o lugar
  daquela página em `dist/` — a página continua no comportamento atual (client-render
  puro, sem o ganho de SEO desta story), mas **não fica sem conteúdo nenhum** e **não
  trava o deploy das outras 4 páginas**.
- O gate pré-deploy (ver "Convenção de deploy") continua rodando sobre o `dist/`
  montado — uma página que caiu no fallback não tem `#dc-prerender`, então não é
  pega pelo grep de `{{`/`<sc-for>` como se fosse um erro (esse grep serve para achar
  template cru vazando, não para exigir que toda página tenha sido pré-renderizada
  com sucesso).

### AC6 — Sem duplicação permanente + CLS de viewport medido (reescrita)

Duas verificações distintas, ambas cobrindo riscos reais do desenho aditivo:

**AC6a — Sem duplicação permanente.** O script inline (ver AC1/"A forma correta")
observa `document.body` e remove `#dc-prerender` assim que
`document.getElementById('dc-root')` ganha filhos — **não** observa `#dc-root`
diretamente (esse elemento só existe depois que `boot()` roda; observá-lo direto é
inimplementável, correção da 2ª validação @po). Teste associado: Playwright captura
o DOM imediatamente após o `load` (deve ter `#dc-prerender` com conteúdo E `#dc-root`
ausente do DOM, porque `boot()` ainda não rodou) e novamente depois do runtime "dc"
reportar-se pronto (deve ter `#dc-root` com conteúdo E `#dc-prerender` removido do
DOM, não apenas escondido) — nunca os dois com conteúdo visível simultaneamente por
mais que o tempo de transição esperado.

**AC6b — CLS medido, não assumido.** Como o snapshot é gerado em viewport mobile
(~390px) mas pode ser visto por qualquer viewport, medir o Cumulative Layout Shift
real com Playwright/Lighthouse em pelo menos 2 cenários por página: (1) viewport
mobile (mesmo do snapshot — CLS esperado próximo de zero) e (2) viewport desktop
(~1440px — CLS esperado maior, por causa da diferença de layout calculada a partir
de `window.innerWidth` no `data-dc-script` de cada página — ver "Risco residual"
acima). Documentar os números medidos no Dev Agent Record — não há um limite
numérico travado nesta story (não inventar um threshold sem dado), mas o número
precisa existir para decisão futura, não ser assumido como zero.

### AC7 — `#dc-prerender` inteiramente não-interativo (proteção de PII — bloqueante)

**Achado da 2ª validação @po, o mais grave dos três — reintroduz pela porta dos
fundos o exato risco que a consulta @architect existia para evitar.** O
`<form onSubmit="{{ handleContactSubmit }}">` (`Home.dc.html:211`) está dentro do
`<x-dc>`, então o snapshot serializado (`#dc-prerender`) contém uma cópia desse
formulário. `onSubmit` é prop React, não atributo HTML — a cópia estática **não
carrega handler nenhum**. O bloco `#dc-prerender` fica visível desde o primeiro
paint, por desenho, durante toda a janela até o mount real terminar (AC1/AC6a).

Se um visitante preencher e enviar o formulário **nessa janela**: o navegador faz
submit **nativo** de um `<form>` sem `action` definido → `GET` para a própria URL →
nome, e-mail, telefone e mensagem vazam para a query string da URL, para o histórico
do navegador, e para os logs de acesso do servidor. E o lead se perde (nunca chega em
`/api/contact`).

**Esta AC exige que `#dc-prerender` seja inteiramente não-interativo — via remoção
física, única rota aceita (decisão do usuário, 2026-09-01):**

- **Rota obrigatória — remover fisicamente** `<form>`/`<button>`/`<input>`/qualquer
  elemento interativo do HTML serializado, no próprio script de prerender, antes de
  escrever em `#dc-prerender`. Mais trabalho no script do que a alternativa abaixo,
  mas elimina o risco por completo em vez de só mitigá-lo.
- **Alternativa descartada — atributo `inert` + `pointer-events: none`.** Foi
  cogitada (também resolveria foco de teclado e leitores de tela de graça, dado que
  o bloco é tecnicamente uma cópia duplicada da página inteira — ver AC8), mas
  **descartada pelo usuário**: `inert` é no-op em navegadores antigos (pré-Chrome
  102/Safari 15.5/Firefox 112) — mesmo sendo minoria de tráfego, deixaria um
  resíduo de risco de vazamento de PII em vez de eliminá-lo. O usuário preferiu
  eliminar o risco por completo à custa do trabalho extra no script de prerender.
  Não é uma opção válida para esta story — se o @dev encontrar limitação técnica
  real que impeça a remoção física, isso é um bloqueio a escalar, não motivo para
  reintroduzir `inert` como substituto silencioso.

**Teste obrigatório:** confirmar que nenhum elemento interativo dentro de
`#dc-prerender` responde a clique/foco/submit antes do mount real terminar
(Playwright: tentar submeter o formulário fantasma e confirmar que nada acontece —
sem navegação, sem `GET` com query string, sem requisição de rede). Confirmar também,
por inspeção do HTML serializado, que `<form>`/`<button>`/`<input>` simplesmente **não
existem** dentro de `#dc-prerender` (não apenas neutralizados por CSS/atributo).

### AC8 — Duplicação de headings é consequência esperada — regra de contagem corrigida

O desenho aditivo (AC1) significa que **cada elemento do template, inclusive cada
`<h1>`, aparece duas vezes no HTML final servido** — uma vez dentro do `<x-dc>`
original (escondido por `display:none`, AC1) e outra vez dentro de `#dc-prerender`.
Confirmado lendo `Empreendimentos.dc.html`: o `<h1>` da linha 67 está dentro do
`<x-dc>` que abre na linha 14 — o snapshot conteria uma segunda cópia desse mesmo
`<h1>`.

**Isso é esperado e correto, não um defeito** — mas precisa de uma regra de contagem
explícita para não quebrar as validações de `<h1>` únicas já aprovadas nas Stories
90-3a e 90-3b: **contar headings (incluindo `<h1>`) somente dentro de
`#dc-prerender`, excluindo toda a subárvore do `<x-dc>` original** (que fica
`display:none` por desenho desta story). Qualquer verificação de "exatamente um
`<h1>`" feita depois desta story estar em produção precisa aplicar esse filtro — não
contar `<h1>` no documento inteiro.

## Fora de escopo

- Landings de empreendimento (`/vindresidence/`, `/yarden/`) — já são projetos Next.js/
  estáticos separados, fora do escopo desta story (não usam o runtime "dc").
- `Artigo.dc.html`, `Design System.dc.html`, `Logo.dc.html` — não fazem parte do
  achado T1 evidenciado no relatório. `Artigo.dc.html` tem uma limitação própria de
  roteamento por query string, registrada como backlog no epic (Tier 4), não nesta
  story.
- **Migrar o site para um framework com SSR nativo (Next.js, Astro, etc.)** — fora de
  escopo. O @architect foi explícito: essa é uma decisão de produto de médio prazo,
  fora do escopo deste epic de SEO, e deveria virar um epic próprio separado se o
  usuário quiser considerar — **recomendação explícita de NÃO** meter isso dentro de
  `packages/web`/CRM, por acoplar o site público a uma aplicação autenticada. Esta
  story não cria essa story nova; só deixa a observação registrada no backlog (Tier 4)
  do epic.
- Remover `unpkg.com` do CSP (`vercel.json`) — superfície sem uso real pelas 5 páginas
  institucionais (AC4), mas removê-la é limpeza de segurança independente desta story;
  registrada como Tier 4 no epic.

## Convenção de deploy

**Substitui a antiga seção de "processo manual documentado no README" por um único
script.** A montagem do `dist/` não é um `mkdir dist` trivial: só funciona como deploy
se tiver junto `support.js`, `api/`, `vercel.json`, `.vercelignore` **e** os ~77 MB de
`assets/`+`uploads/` que não estão no git — é uma etapa de assembly (tipo rsync +
verificação), não uma cópia simples. Documentar isso só em prosa no README convida
dois processos (manual + script) divergirem — por isso a decisão é um script único:

`landing-pages/trifold-design-system/deploy.sh` (novo), que faz, em sequência, e
**falha alto** (aborta, não segue silencioso) se qualquer passo falhar:

1. **Verificar `assets/`+`uploads/` presentes localmente** — aborta com mensagem clara
   se não estiverem (evita montar um `dist/` com imagens quebradas).
2. **Montar `dist/`** — copia os arquivos-fonte + gera o prerender por página (AC1);
   se o prerender de UMA página falhar, aplica o fallback do AC5 (copia o
   `.dc.html`-fonte original para aquela página, loga o erro) em vez de travar o
   script inteiro.
3. **Gate pré-deploy:** grep por `{{` ou `<sc-for` no que vai subir em `dist/` — se
   achar, **aborta o deploy** (proteção contra publicar template cru por engano; uma
   página em fallback do AC5 não é pega por esse gate, porque não tem
   `#dc-prerender`, só o `.dc.html` original de sempre, que sempre teve `{{`/`<sc-for>`
   no HTML cru — **atenção**: esse gate precisa ser específico o bastante para não
   reprovar o fallback esperado; ajustar o grep para checar só dentro de
   `#dc-prerender`, não o documento inteiro).
4. **`vercel deploy --prod --yes --scope trifold-s-projects`** a partir de `dist/`.
5. **Verificação pós-deploy:** `curl` na URL de produção confirmando que o HTML final
   não tem mais `{{ }}` fora do `<x-dc>` original (o `<x-dc>` sempre vai ter `{{ }}` —
   isso é esperado e correto, é o template-fonte; o que não pode ter é `{{ }}` cru fora
   dele, no lugar onde o `#dc-prerender` deveria estar).

A seção "Como publicar de verdade (deploy manual)" do
`landing-pages/trifold-design-system/README.md` é **substituída** por "rode
`./deploy.sh`" — um caminho documentado, não dois processos paralelos que podem
divergir.

**Pré-requisito de conteúdo, não de decisão de código:** o script de prerender
(headless browser) precisa carregar a página com todos os seus assets reais para
produzir um snapshot fiel. `assets/` (~20 MB) e `uploads/` (~57 MB) **não estão no
git** — o passo 1 do `deploy.sh` cobre isso.

Esta story só pode ser publicada em produção com as páginas-fonte já no estado
pós-Story 90-6 (já é o caso — 90-6 concluída e em produção).

## Dev Notes

- Arquivos-fonte afetados: `landing-pages/trifold-design-system/Home.dc.html`,
  `sobre-nos.dc.html` (renomeado pela Story 90-6, já em produção — era
  `Sobre Nós.dc.html`), `Empreendimentos.dc.html`, `B2B.dc.html`, `Blog.dc.html`
  (essas 3 e a `Home.dc.html` não foram renomeadas pela 90-6).
- `support.js` é gerado externamente — **não editar diretamente**. Pontos de código
  relevantes confirmados nesta consulta (todos em `support.js`, salvo indicação
  contrária; linhas revisadas e separadas corretamente na 2ª validação @po):
  - `boot()` — linha 150; `doc.querySelector("x-dc")` dentro dele — linha 163;
    `doc.createElement("div")` + `hostEl.id = "dc-root"` — linhas 164-165;
    `dc.replaceWith(hostEl)` — linha 166; `ReactDOM.createRoot(hostEl).render(...)` —
    linhas 194-195 (mount, não hydrate). **`#dc-root` só existe a partir daqui — não
    existe no HTML-fonte nem no HTML servido antes do mount rodar** (confirmado por
    grep: 0 ocorrências fora do próprio `support.js`).
  - `parseDcDocument` (função separada, não a mesma coisa que `boot()`) também exige
    `doc.querySelector("x-dc")` — linha 25.
  - `parseDcText` **não usa `querySelector`** — é regex sobre texto cru (`exec` em
    `/<x-dc(?:\s[^>]*)?>/`) — linha 38.
  - `ensureBabel()` — linha 1057, só chamado via `x-import` com `kind === "jsx"` —
    linha 1078. `BABEL_URL` (unpkg) — linha 1048.
  - `REACT_URL`/`REACT_SRI`/`REACT_DOM_URL`/`REACT_DOM_SRI` — linhas 1568-1571
    (`assets/vendor/react*.production.min.js`, local, com SRI).
  - `loadReactUmd()` — linha 1590 (não 1589); `hideRawTemplate()` — linha 1572,
    chamada síncrona no fim do IIFE, antes de `loadReactUmd().then(init)`.
  - `renderVals()` — linha 737, é só o **stub genérico da classe-base**
    (`return {}`) — **não** é onde a dependência de viewport vive. A dependência real
    está no `data-dc-script` de cada página (`window.innerWidth`, ver "Risco
    residual" acima e AC6b).
- **Observação nova, fora do escopo original mas registrada para contexto:** o
  `hideRawTemplate()` roda de forma síncrona assim que `support.js` executa (o script
  tem `defer`, então roda após o parse do HTML, mas potencialmente depois de o browser
  já ter pintado o documento parcialmente) — isso pode causar um FOUC breve de
  `{{ }}`/tags cruas visível hoje em produção, antes do `deferred script` rodar. Não é
  o achado T1 original, é um achado colateral desta investigação. O
  `<style>x-dc{display:none}</style>` estático do AC1 resolve isso como efeito
  colateral bom, mas só nas 5 páginas desta story — não é uma correção geral do site.
- MCP `playwright` já está disponível diretamente no Claude Code (não via
  docker-gateway) — ver `.claude/rules/mcp-usage.md`.
- `<x-dc>` / `<script data-dc-script>` / `data-props` são os pontos de entrada do
  parser do runtime — úteis para entender o que precisa estar "resolvido" no HTML de
  saída, mesmo sem poder editar essa lógica.

### Testing

- Reproduzir o método da auditoria: `curl` (sem executar JS) em cada uma das 5 URLs e
  verificar que `#dc-prerender` contém texto real (não placeholders), e que `<x-dc>`
  original continua presente e intacto no documento (AC1).
- Diff de screenshot Playwright (2 viewports × 5 páginas) + contagem de erros de
  console, comparando baseline pré-implementação com o resultado pós-implementação
  (AC2).
- Simular falha de mount do React (bloquear localmente o carregamento do
  `assets/vendor/react*.production.min.js`) e confirmar que `#dc-prerender` permanece
  visível, nunca removido (AC4).
- Testar o fallback por página: forçar erro no prerender de 1 página durante a
  montagem do `dist/` e confirmar que o `deploy.sh` continua para as outras 4, loga o
  erro, e a página em fallback serve o `.dc.html`-fonte original sem
  `#dc-prerender` (AC5).
- Captura de DOM em 2 momentos (load vs. runtime "dc" pronto), confirmando que nunca
  há `#dc-prerender` com conteúdo E `#dc-root` com conteúdo simultaneamente por mais
  que o tempo de transição esperado (AC6a) — e confirmando que o observer está de
  fato registrado em `document.body` (não tentando `observe(null)` em `#dc-root`).
- Medir CLS real (Playwright/Lighthouse) em viewport mobile e desktop, documentar os
  números no Dev Agent Record (AC6b).
- **Testar não-interatividade de `#dc-prerender` (AC7):** tentar submeter o
  formulário de contato fantasma (dentro de `#dc-prerender`) antes do mount real
  terminar e confirmar que nada acontece — sem navegação (`GET` com query string),
  sem requisição de rede, sem foco por tab. Testar em pelo menos 2 páginas (Home,
  que tem o formulário; e uma sem formulário, para confirmar que a remoção física
  dos elementos interativos não quebra nada onde não há risco de PII). Confirmar
  também, por inspeção do HTML serializado, que `<form>`/`<button>`/`<input>`
  simplesmente não existem dentro de `#dc-prerender` — não é suficiente que estejam
  só neutralizados.
- **Testar a regra de contagem de headings (AC8):** confirmar que contar `<h1>` no
  documento inteiro dá 2 (esperado, não é bug) e que contar só dentro de
  `#dc-prerender` dá 1 — documentar esse comportamento para as Stories 90-3a/90-3b
  reutilizarem o mesmo critério.
- Testar o `deploy.sh` fim a fim num ambiente local/staging: gate pré-deploy
  bloqueando um `dist/` com `{{`/`<sc-for` fora de `#dc-prerender`, e verificação
  pós-deploy confirmando ausência do mesmo em produção.

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não está habilitado em `core-config.yaml` (chave
> `coderabbit_integration` ausente). Validação de qualidade usará processo de revisão
> manual pelo @qa (quality gate desta story).

## Tasks / Subtasks

- [x] **Task 1 (AC0)** — Documentar no Dev Agent Record a decisão já tomada
      (build-output separado, `dist/`) e o motivo técnico (in-place quebra o mount do
      React — não é mais avaliação de preferência)
- [x] **Task 2** — Registrar a abordagem aditiva (`#dc-prerender` + observer em
      `document.body`, ver correção da 2ª validação @po) como adotada no Dev Agent
      Record, referenciando o achado do @architect
- [x] **Task 3** — Baixar `assets/`/`uploads/` do deployment de produção atual antes de
      rodar o prerender localmente pela primeira vez
- [x] **Task 4** — Capturar baseline de screenshots/console/CLS **ANTES** de
      implementar qualquer mudança
- [x] **Task 5 (AC1)** — Implementar o mecanismo aditivo para as 5 páginas públicas:
      `<x-dc>` intacto + `#dc-prerender` sibling + script inline observando
      `document.body` (`MutationObserver` + checagem síncrona de corrida) +
      `<style>x-dc{display:none}</style>` condicionado ao par
- [x] **Task 6 (AC7)** — Tornar `#dc-prerender` inteiramente não-interativo:
      remover fisicamente `<form>`/`<button>`/`<input>`/qualquer elemento interativo
      do HTML serializado, no script de prerender, antes de escrever em
      `#dc-prerender` (única rota aceita — decisão do usuário, `inert` descartado
      por deixar resíduo de risco em browsers antigos; ver AC7)
- [x] **Task 7** — Implementar a montagem do `dist/` (assembly explícito: copiar
      fonte + `support.js` + `api/` + `vercel.json` + `.vercelignore` +
      `assets/`/`uploads/` + gerar prerender por página, com fallback por página do
      AC5)
- [x] **Task 8 (AC5)** — Implementar o fallback por página (prerender falhou → copia
      `.dc.html`-fonte original para `dist/`, loga o erro, não trava o deploy)
- [x] **Task 9** — Criar `deploy.sh` com os 5 passos (verificar assets, montar dist,
      gate pré-deploy de `{{`/`<sc-for` fora de `#dc-prerender`, `vercel deploy --prod`,
      verificação pós-deploy por `curl`)
- [x] **Task 10** — Substituir a seção "Como publicar de verdade" do
      `landing-pages/trifold-design-system/README.md` por "rode `./deploy.sh`"
- [x] **Task 11 (AC4)** — Testar resiliência a falha de mount do React (bloquear o
      vendor local, confirmar `#dc-prerender` permanece)
- [x] **Task 12 (AC6a)** — Testar que o observer remove `#dc-prerender` corretamente
      (via `document.body`, checando `#dc-root` por polling — não `observe(null)`),
      sem duplicação permanente
- [x] **Task 13 (AC6b)** — Medir CLS em viewport mobile e desktop, documentar números
      no Dev Agent Record
- [x] **Task 14 (AC7)** — Testar não-interatividade de `#dc-prerender` (formulário
      fantasma não responde a clique/submit/foco antes do mount)
- [x] **Task 15 (AC8)** — Documentar e validar a regra de contagem de headings
      (`<h1>` só dentro de `#dc-prerender`), e avisar as Stories 90-3a/90-3b do
      critério
- [x] **Task 16 (AC1, AC2)** — Testar com `curl` (sem JS) que as 5 páginas retornam
      texto real via `#dc-prerender` (AC1), e validar diff de screenshot/console contra
      a baseline da Task 4 (AC2)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (`@dev` / Dex) — implementação em modo YOLO autônomo, 2026-09-02.

### Task 1 (AC0) — Fonte-da-verdade pós-prerender: build-output separado

Implementado como `dist/`, **não versionado** (adicionado ao `.gitignore` do próprio
projeto — antes só era coberto implicitamente pelo `dist/` do `.gitignore` da raiz do
monorepo, o que era frágil demais para uma decisão de AC).

O motivo é técnico e não de preferência, e foi confirmado lendo o código: o prerender
in-place sobrescreveria o `<x-dc>`, e `boot()` (`support.js:150`) exige
`doc.querySelector("x-dc")` (`:163`) para existir — sem ele, `parseDcDocument`
(`:25`) devolve `null` e **nada monta**. Os 5 `.dc.html` da raiz continuam sendo a
única fonte editável; `dist/` é apagado e regerado a cada `./deploy.sh`.

**Os arquivos-fonte NÃO foram modificados por esta story** — confirmado por
`git status`: nenhum dos 5 `.dc.html` aparece como alterado por mim (as alterações
em `B2B/Blog/Empreendimentos/Artigo/sobre-nos` já estavam na working tree, são da
Story 90-6, e foram preservadas intactas).

### Task 2 — Abordagem de mecanismo implementada (snapshot ADITIVO)

Exatamente a abordagem fechada na story após a consulta @architect e as duas
correções do @po. O HTML de saída, por página:

1. `<style id="dc-prerender-hide-template">x-dc{display:none!important}</style>` no
   `<head>` — emitido **somente** junto com o bloco correspondente (nunca sozinho,
   para não regredir o achado O1 escondendo os `<h1>` estáticos).
2. `<div id="dc-prerender">` com o DOM serializado pelo Playwright (viewport mobile
   390×844), **irmão** do `<x-dc>`, que permanece byte a byte idêntico ao fonte.
3. `<script>` inline que faz uma checagem **síncrona** de corrida e, se o mount ainda
   não terminou, registra `MutationObserver` em **`document.body`** com
   `{childList:true, subtree:true}`, consultando `document.getElementById('dc-root')`
   a cada mutação e removendo o bloco quando ele ganha filhos.
4. Sentinelas `<!--dc-prerender:start-->` / `<!--dc-prerender:end-->` em volta do
   bloco — permitem ao gate pré-deploy recortar exatamente o conteúdo
   pré-renderizado (a regra AC8/AC6a é "checar só dentro de `#dc-prerender`") e
   tornam o bloco óbvio em `view-source`.

Confirmado na prática que `#dc-root` **não existe** no HTML servido: a captura 1 do
teste da AC6a mede `#dc-root existe: false` nas 5 páginas. O observer em
`document.body` era mesmo a única rota implementável.

### Decisão de implementação NÃO coberta pela story (a mais importante desta entrega)

**O bloco é inserido ANTES do `<x-dc>`, não depois — por medição, não por gosto.**

A AC1 pede um elemento *irmão*, sem dizer de que lado; a leitura natural ("ganha um
elemento irmão do lado") levou à primeira implementação, com o bloco depois de
`</x-dc>`. Ela passou em todas as ACs funcionais, mas o CLS da AC6b saiu **péssimo**:

| variante | CLS somado (5 páginas × 2 viewports, pior de 3 execuções) | pior página |
|---|---|---|
| bloco DEPOIS de `</x-dc>` | **3.5251** | 1.0045 (`/` mobile) |
| bloco ANTES do `<x-dc>` | **0.2862** | 0.0583 |
| bloco depois + `position:absolute` | 0.3291 | 0.1011 |

Mecanismo: `boot()` troca o `<x-dc>` por `#dc-root` e o React o preenche com a página
inteira. Com o bloco **depois**, o `#dc-prerender` — que está ocupando a viewport —
é empurrado para baixo pela altura inteira do documento. Isso só virava CLS porque
algo força um layout síncrono nessa janela, e algo força: o `componentDidMount` de
cada página lê `window.innerWidth` (`Home.dc.html:260` e equivalentes nas outras 4) —
exatamente a dependência de viewport que a 2ª validação do @po corrigiu na redação.
Ou seja: o risco que a story identificou é real, mas o seu efeito dominante não era
a diferença mobile/desktop do snapshot, e sim a **posição do bloco**.

Com o bloco **antes**, ele fica em y=0 e nunca é empurrado. `position:absolute`
também resolveria, mas tira o bloco do fluxo — e no cenário de falha de mount da AC4
o usuário ficaria com uma página de altura zero, enfraquecendo justamente a
degradação graciosa que a AC4 compra de graça. Ficar no fluxo, mas antes, resolve sem
esse custo. Ganho colateral: o conteúdo real passa a vir **antes** do template cru na
ordem do documento, o que é melhor para crawler.

Guarda adicional que isso exigiu: `parseDcText` (`support.js:38`) recorta o template
entre o **primeiro** `<x-dc>` (regex `exec`) e o **último** `</x-dc>`
(`lastIndexOf`). Com o bloco antes, um `<x-dc` dentro do snapshot passaria a ser o
primeiro match e o runtime readotaria um template errado no `fetch(location.href)`
que o `boot()` faz. `injectPrerender()` aborta se o snapshot contiver `<x-dc`,
`</x-dc>`, `id="dc-root"` ou um `#dc-prerender` aninhado.

### Task 6/14 (AC7) — CONFIRMAÇÃO EXPLÍCITA: formulário fantasma não responde

Implementada a **remoção física** (única rota aceita; `inert` não foi usado em lugar
nenhum). No `serializeSanitized()`, sobre um clone de `#dc-root` e antes de escrever:

- removidos com a subárvore inteira: `form`, `button`, `input`, `textarea`, `select`,
  `iframe`, `object`, `embed`, `dialog`, `script`;
- apagados de todo elemento sobrevivente: qualquer atributo `on*` (onclick/onsubmit/…),
  mais `tabindex`, `contenteditable`, `draggable`, `autofocus`, `accesskey`
  (e `data-dc-tpl`, peso morto do editor do canvas).

Na Home, o build reporta `removidos {"form":1,"button":6}` — o `<form>` sai inteiro,
levando junto os 4 `<input>`, o `<textarea>` e o `<button type=submit>` do formulário
de contato (`Home.dc.html:211-219`).

**Testado e confirmado** (`scripts/verify-prerender.mjs`, com o vendor local do React
bloqueado por `page.route(... abort)`, de modo que o mount **nunca** termina e a janela
de risco fica aberta indefinidamente — Home, que tem o formulário, e Blog, que não tem):

- `#dc-prerender form,button,input,textarea,select` → **0** nas 5 páginas, por
  inspeção do HTML serializado *e* por consulta ao DOM ao vivo;
- zero `[tabindex]`/`[contenteditable]` dentro do bloco;
- **60 pressionamentos de Tab**: o foco só passa por `A` e `BODY` — nunca por um
  controle de formulário;
- `requestSubmit()`/`submit()` forçado em **todo** `<form>` do documento: nenhuma
  navegação, URL inalterada;
- digitar `nome-teste-pii` + Enter sem foco em nada: nenhuma navegação, nenhuma query
  string, **zero** requisições com `nome=`/`email=`/`telefone=`/`mensagem=` na URL;
- o bloco continua com conteúdo real depois de todas as tentativas.

Nuance encontrada na prática e que vale registrar: o `<form>` do template **cru**
continua existindo no documento (dentro do `<x-dc>`) — `document.querySelectorAll('form')`
devolve 1 na Home, não 0. Ele não é risco: o teste confirma que está dentro do `<x-dc>`
e tem **zero client rects** (não é renderizado, por `x-dc{display:none!important}`),
portanto é impossível preencher ou submeter pela interface. Isso já é verdade em
produção hoje, via `hideRawTemplate()`. A AC7 é sobre o `#dc-prerender`, e nele não
sobrou nada.

**Desvio deliberado, para revisão do @qa:** `<a href>` **não** foi removido. A AC7 diz
"qualquer elemento interativo", mas o risco que ela descreve e justifica é
especificamente o submit nativo de formulário vazando PII para a query string.
Âncoras não carregam dado do usuário — o "efeito" de clicar numa é uma navegação
comum, idêntica à do site real — e removê-las destruiria o grafo de links interno,
que é metade do valor de SEO desta story (20 links na Home, 40 no Blog). A preservação
virou **invariante testada** (`AC7 … âncoras preservadas no bloco`), não omissão.
Se o @qa entender que a AC exige removê-las, é troca de uma linha em `REMOVED_TAGS`.

### Task 12/15 (AC6a e AC8) — CONFIRMAÇÃO EXPLÍCITA: contagem de headings

**AC6a — sem duplicação permanente.** Duas capturas de DOM por página, com o
`support.js` atrasado 1,5s via `page.route` para a janela pré-mount ser observável de
forma determinística (sem isso o mount termina em ~25ms e a "captura logo após o load"
já pegaria o estado pós-mount, não provando nada):

- captura 1 (pré-mount): `#dc-prerender` com conteúdo (948–5898 chars), `#dc-root`
  **ausente do DOM**, `<x-dc>` presente — nas 5 páginas;
- captura 2 (pós-mount): `#dc-root` com conteúdo, `#dc-prerender` **removido do DOM**
  (não apenas escondido) — nas 5 páginas;
- janela de coexistência medida: **0.1–0.4ms** entre `#dc-root` receber conteúdo e o
  bloco sair, sempre nessa ordem.

**AC8 — a contagem é SÓ dentro de `#dc-prerender`.** Verificado que
`h1(documento) == h1(<x-dc>) + h1(#dc-prerender)` e que `h1(#dc-prerender) == h1(<x-dc>)`
nas 5 páginas. Tabela medida no HTML servido (critério a ser reusado pelas Stories
90-3a/90-3b):

| rota | `<h1>` no documento | no `<x-dc>` | em `#dc-prerender` |
|---|---|---|---|
| `/` | 0 | 0 | 0 |
| `/sobre-nos` | 0 | 0 | 0 |
| `/empreendimentos` | 2 | 1 | **1** |
| `/corporativas` | 2 | 1 | **1** |
| `/blog` | 2 | 1 | **1** |

Nota para a 90-3b: `/` e `/sobre-nos` dão 0 porque hoje **não têm** `<h1>` nenhum —
não é efeito desta story. O `<h1>` da Home é justamente o que a 90-3b vai adicionar, e
a partir daí a contagem dela precisa ser `#dc-prerender h1`, não `document h1`.

### Task 13 (AC6b) — CLS medido, não assumido

Medido com `PerformanceObserver({type:'layout-shift'})` instalado em `document_start`,
somando `value` de entradas com `hadRecentInput === false`. A coluna "após a troca"
isola os shifts com `startTime >= ` o instante em que o `#dc-prerender` saiu do DOM —
é a fatia atribuível a esta story. Não há threshold travado na story; os números
existem para decisão futura (referência externa: o "bom" do Google é < 0.1).

| rota | viewport | CLS baseline | CLS depois | CLS após a troca | troca em |
|---|---|---|---|---|---|
| `/` | mobile | 0.00326 | 0.01985 | 0.00326 | 71ms |
| `/` | desktop | 0.00787 | 0.00853 | 0.00787 | 45ms |
| `/sobre-nos` | mobile | 0 | 0 | 0 | 31ms |
| `/sobre-nos` | desktop | 0 | 0 | 0 | 31ms |
| `/empreendimentos` | mobile | 0 | 0.04352 | 0.04352 | 35ms |
| `/empreendimentos` | desktop | 0 | 0 | 0 | 28ms |
| `/corporativas` | mobile | 0 | 0.06068 | 0.04487 | 61ms |
| `/corporativas` | desktop | 0 | 0.02849 | 0.02601 | 48ms |
| `/blog` | mobile | 0 | 0.01992 | 0.01736 | 55ms |
| `/blog` | desktop | 0 | 0.02548 | 0.02548 | 39ms |

A tabela acima é **uma execução representativa**. O CLS aqui é sensível a timing
(depende de o layout ser forçado ou não durante a janela de troca), então varia entre
execuções: repetindo a medição após a correção do QA-1, o pior valor observado foi
**0.06807** (`/sobre-nos` mobile) e algumas células que deram 0 passaram a dar
~0.03. Em todas as execuções feitas, **nenhuma das 10 combinações passou de ~0.07** —
folga confortável contra o 0.1 que o Google trata como "bom". Quem for reproduzir
deve esperar variação nessa ordem, não números idênticos.

O risco de viewport que a story previu **existe e foi medido**, mas é pequeno depois
da correção de posição do bloco: o snapshot é gerado a 390px e o desktop (1440px)
**não** é sistematicamente pior que o mobile. A troca acontece entre ~28ms e ~71ms
após o load, cedo demais para ser percebida.

### Task 4/16 (AC2) — sem regressão para usuários com JS

Baseline capturada **antes** de qualquer implementação (`.seo-metrics/baseline/`), com
o mesmo script usado depois (`capture-metrics.mjs --root`), para não haver dois
caminhos de código que possam divergir.

- **Diff de screenshot** (5 páginas × 2 viewports, full-page, decodificado e comparado
  pixel a pixel dentro do próprio Chromium): **0% de pixels diferentes em todas as 10
  combinações**, dimensões idênticas. O estado pós-mount é literalmente o mesmo de antes.
- **Console**: erros 2→2, 1→1, 0→0 etc. — **nenhum erro, warning ou 4xx novo** em
  nenhuma combinação.

Achado de baseline que vale registrar (pré-existente, não introduzido aqui): as páginas
já produzem 404s do tipo `GET /%7B%7B%20s.logoSrc%20%7D%7D` — o parser do browser
dispara o `src` **cru** do template (`{{ s.logoSrc }}`) antes de o runtime montar.
Contagem inalterada depois da mudança (o `display:none` não impede o fetch de `<img>`).

### Task 11 (AC4) — resiliência a falha de mount

Com `assets/vendor/react*.production.min.js` abortado no nível da rede, nas 5 páginas:
`#dc-prerender` **permanece presente, visível e com conteúdo** (948–5898 chars) após
3s, e `#dc-root` nunca é criado. Coberto por construção, como a AC previa.

### Task 3 — assets/uploads

Os ~77 MB já estavam presentes na cópia local de trabalho (`assets/` 94 arquivos/20 MB,
`uploads/` 79 arquivos/57 MB, incluindo `assets/vendor/react*.production.min.js`), então
não foi preciso baixá-los do deployment de produção. O passo 1 do `deploy.sh` verifica
isso a cada execução — e foi testado com `assets/` removido, abortando com a mensagem
que aponta para o README.

### Task 5/7/8/9 (AC1, AC5) — build e deploy

`./deploy.sh` implementa os 5 passos, com `set -euo pipefail` e falha explícita em cada
um. Ganhou uma flag `--dry-run` (passos 1-3, sem publicar) que não estava na story: sem
ela não havia como testar o script fim a fim sem publicar em produção, que é
exatamente o que a seção Testing pede.

A montagem do `dist/` usa **allowlist explícita**, não denylist. Isso não é preciosismo:
esta story criou `scripts/`, `dist/` e `.seo-metrics/` (que guarda screenshots) dentro
da pasta do site, e com denylist um deploy futuro publicaria tudo isso por omissão.
Pelo mesmo motivo, `dist`, `scripts`, `.seo-metrics`, `README.md` e `.gitignore` foram
adicionados ao `.vercelignore` — rede de segurança para quem rodar `vercel deploy` da
pasta-fonte por hábito.

**Fallback do AC5 é por construção, não por passo de restauração:** o assembly copia o
`.dc.html`-fonte de todas as páginas *antes* de pré-renderizar; uma página que falha
simplesmente não é sobrescrita. Não existe um "passo de restauração" que possa deixar
de rodar.

Para testar isso de forma determinística e repetível foi adicionado o seam
`DC_PRERENDER_FAIL_IDS` (build-time apenas, nunca chega em runtime de página).
Testado: com 2 das 5 páginas falhando, o build segue, loga alto, e os arquivos em
fallback ficam **byte a byte idênticos ao fonte** (`cmp -s` ✓); o gate pré-deploy
aprova essas páginas de propósito, e o `deploy.sh` chega ao fim.

### Task 10 — README

A seção "Como publicar de verdade (deploy manual)" foi **substituída** por
`./deploy.sh` (um caminho, não dois processos que divergem), com os 5 passos
explicados e uma seção nova de uma tela sobre a pré-renderização. As alterações da
Story 90-6 no README (que estavam na working tree, não commitadas) foram preservadas
— verificado no diff.

### Correções aplicadas após o gate do @qa (2026-09-02)

**QA-1 (bloqueante) — `deploy.sh` publicaria no projeto errado. CORRIGIDO.**
O passo 4 fazia `cd dist && vercel deploy`, mas `dist/` não tem
`.vercel/project.json` — o vínculo só existe na pasta-fonte, e `assemble()` apaga e
recria o `dist/` a cada build, então um `vercel link` manual ali nunca sobreviveria.
Sem vínculo, `vercel deploy` **cria um projeto novo** com o nome da pasta em vez de
publicar em `trifold-s-projects/trifold-design-system`. Reproduzi o achado do @qa:
`vercel env ls` funciona na pasta-fonte e falha dentro de `dist/` com
"Your codebase isn't linked to a project on Vercel".

Testei as duas rotas propostas na CLI instalada (**Vercel CLI 54.6.1**):
- **rota (b) não funciona** — `--cwd dist` existe na 54.6.1, mas move *também* a
  resolução do vínculo: `vercel env ls --cwd dist` a partir da pasta-fonte dá
  exatamente o mesmo erro. Descartada por medição, não por suposição.
- **rota (a) adotada** — `copyProjectLink()` copia `.vercel/project.json` (+
  `README.txt`) para `dist/.vercel/` como parte do `assemble()`, portanto a cada
  build. `.vercel/cache/` fica de fora (cache pesado e irrelevante).

Provado: `vercel env ls` de dentro do `dist/` reconstruído resolve
`Environment Variables found for trifold-s-projects/trifold-design-system`, e o
vínculo sobrevive a rebuild. O `.vercel` continua no `.vercelignore`, então é usado
para resolver o projeto e **nunca é publicado**.

Endurecimento junto: se `.vercel/project.json` não existir na pasta-fonte, o
`deploy.sh` aborta **no passo 1** com o comando de `vercel link` pronto, e o
`build-dist.mjs` aborta no assembly. Publicar sem vínculo não é degradação — é
publicar no lugar errado, então é falha dura, nunca fallback. Ambos os caminhos
testados.

**QA-2 (opcional) — gate aprovava a ausência combinada das proteções. CORRIGIDO.**
A causa era mais específica do que "faltam os dois": o gate detecta fallback do AC5
pela **ausência das sentinelas**. Um documento com `id="dc-prerender"` mas sem
sentinelas caía no ramo de fallback e era aprovado — quando na verdade é um bloco
que o gate não consegue inspecionar, sem observer para removê-lo (duplicação
permanente) e sem o `<style>` par. Agora esse caso reprova explicitamente, com
mensagem dizendo que **não** é fallback do AC5.

Além do fix, o teste de mutação que o @qa fez à mão virou suíte repetível
(`gateMutations()` em `verify-prerender.mjs`): 10 mutantes — controle bom, `{{` cru,
`<sc-for>` não expandido, `<form>+<input>+<button>` (a mutação da AC7 que o @qa
rodou), atributo `on*`, observador removido, `<style>` removido, **os três removidos
juntos (QA-2)**, `<x-dc>` adulterado, e bloco esvaziado. O gate se comporta
corretamente nos 10. Total do harness subiu de 80 para **90 checagens**.

**QA-3 (opcional) — redação sobre lint/typecheck/vitest. CORRIGIDA** na seção
Completion Notes abaixo.

**QA-4 e QA-7** ficaram para o @sm, conforme o gate — fora do escopo desta entrega.

### Debug Log References

- `.seo-metrics/baseline/report.json` — baseline pré-implementação (screenshots, console, CLS)
- `.seo-metrics/after/report.json` + `comparison.json` — pós-implementação e diff da AC2
- `.seo-metrics/build-report.json` — resultado por página do último build (consumido pelo `check-live.mjs`)

### Completion Notes List

- 80/80 checagens de `scripts/verify-prerender.mjs` passando (ACs 1, 4, 6a, 7, 8).
- Gate pré-deploy testado nos dois sentidos: aprova o `dist/` bom, e **reprova**
  (exit 1, "nada foi publicado") um `dist/` com `{{`, `<sc-for>`, `<form>`, `<input>`
  ou `on*` injetados dentro de `#dc-prerender`.
- `deploy.sh` testado fim a fim em dry-run: caminho feliz, abort com `assets/` ausente,
  abort pelo gate, e AC5 com página em fallback atravessando o pipeline inteiro.
- `check-live.mjs` foi endurecido depois de um buraco encontrado ao testá-lo contra a
  produção atual: como "página em fallback" é estado legítimo, um deploy que
  publicasse a pasta-fonte por engano (zero páginas pré-renderizadas) passaria na
  verificação. Agora ele cruza com `.seo-metrics/build-report.json` e reprova quando o
  build pré-renderizou uma página que produção está servindo sem `#dc-prerender`.
  Rodado contra `https://trifold.eng.br` hoje, reprova nas 5 URLs — **correto**, o
  deploy desta story ainda não foi feito (é do @devops).
- **Cobertura de ferramentas, sem inflar o que ela significa (achado QA-3):**
  `pnpm lint` e `pnpm type-check` passam, mas o turbo **só cobre `packages/web`** —
  os `package.json` de `landing-pages/*` não declaram essas tasks, então **nenhuma
  linha do código desta story é analisada por eles**; rodei apenas para confirmar
  ausência de regressão no resto do monorepo. O mesmo vale para
  `npx vitest run landing-pages` (64/64): são testes pré-existentes de
  `yarden`/`vind-residence`, **não desta story** — servem como prova de não-regressão,
  não de cobertura.
  A verificação real desta story é o harness Playwright `scripts/verify-prerender.mjs`
  (**90/90 checagens**, ACs 1/4/6a/7/8 + teste de mutação do gate), mais
  `node --check` nos 8 scripts e `bash -n` no `deploy.sh`. A story não pede unit test.
- **Nada foi publicado e nenhum commit/push foi feito** — `dist/` está montado e
  validado localmente, pronto para `@qa *qa-gate` e depois `@devops`.

### File List

**Criados**

- `landing-pages/trifold-design-system/deploy.sh`
- `landing-pages/trifold-design-system/scripts/dc-site.mjs`
- `landing-pages/trifold-design-system/scripts/prerender.mjs`
- `landing-pages/trifold-design-system/scripts/build-dist.mjs`
- `landing-pages/trifold-design-system/scripts/check-dist.mjs`
- `landing-pages/trifold-design-system/scripts/check-live.mjs`
- `landing-pages/trifold-design-system/scripts/capture-metrics.mjs`
- `landing-pages/trifold-design-system/scripts/compare-metrics.mjs`
- `landing-pages/trifold-design-system/scripts/verify-prerender.mjs`

**Modificados**

- `landing-pages/trifold-design-system/README.md` — seção de deploy substituída por `./deploy.sh`; tabela de versionamento atualizada; banner do topo. (Arquivo já continha alterações não-commitadas da Story 90-6, preservadas.)
- `landing-pages/trifold-design-system/.gitignore` — `dist/` e `.seo-metrics/`
- `landing-pages/trifold-design-system/.vercelignore` — `dist`, `scripts`, `.seo-metrics`, `README.md`, `.gitignore`
- `docs/stories/90-1-prerender-html-institucional.story.md` — Status, checkboxes, Dev Agent Record, File List, Change Log

**Alterados na correção pós-gate (QA-1/QA-2)**

- `landing-pages/trifold-design-system/scripts/build-dist.mjs` — `copyProjectLink()`: o `dist/` herda o vínculo Vercel a cada build; erro limpo no CLI
- `landing-pages/trifold-design-system/deploy.sh` — passo 1 confere `.vercel/project.json`
- `landing-pages/trifold-design-system/scripts/check-dist.mjs` — `id="dc-prerender"` sem sentinelas deixa de ser tratado como fallback do AC5
- `landing-pages/trifold-design-system/scripts/verify-prerender.mjs` — suíte `gateMutations()` (10 mutantes)

**Gerados, não versionados** (`.gitignore`)

- `landing-pages/trifold-design-system/dist/` — build-output publicável
- `landing-pages/trifold-design-system/.seo-metrics/` — baseline, "depois", comparação e relatório de build

**Deliberadamente NÃO modificados**

- Os 5 `.dc.html`-fonte, `support.js` e `vercel.json` — AC0 e AC3. As alterações que
  aparecem em `B2B/Blog/Empreendimentos/Artigo/sobre-nos.dc.html` no `git status` são
  da Story 90-6, já estavam na working tree e não foram tocadas.


## Change Log

| Date | Version | Description | Author |
|------|---------|--------------|--------|
| 2026-08-28 | 0.1 | Story criada a partir do achado T1 do relatório de auditoria de SEO de 2026-08-28. Restrição técnica (dc-runtime fora do repo) descoberta durante a redação e documentada como achado adicional. Decisão de abordagem deixada em aberto para @dev/@architect. | @sm (River) |
| 2026-08-28 | 0.2 | NO-GO do @po (6/10) corrigido: adicionado AC0 (fonte-da-verdade pós-prerender, in-place vs build-output separado), seção "Convenção de deploy" (com pré-requisito de baixar assets/uploads antes do prerender local), AC2 tornado mensurável (diff de screenshot Playwright + contagem de erros de console), AC6 novo (risco de duplicação de conteúdo na hidratação, com teste associado). Marcada dependência de precedência da Story 90-6 (rename de arquivo). | @sm (River) |
| 2026-08-28 | 0.3 | GO na 2ª validação @po. Nits aplicados: Tasks reordenadas (baseline de screenshot/console agora vem antes da implementação, não depois); rótulo da Task de teste final corrigido de "(AC2)" para "(AC1, AC2)" (continha o `curl`, que é da AC1). Status → `Ready`. | @sm (River) |
| 2026-09-01 | 0.4 | Correção mecânica de referência (achado QA-4 do gate da Story 90-6): `Sobre Nós.dc.html` → `sobre-nos.dc.html` (arquivo renomeado na implementação da 90-6, já em produção). `/Sobre Nós.dc.html` → `/sobre-nos` na AC1. Nenhuma outra mudança de escopo. | @sm (River) |
| 2026-09-01 | 0.5 | **Revisão técnica substancial pós-consulta @architect (Aria).** Achado central: `boot()` faz `dc.replaceWith` + `ReactDOM.createRoot` (mount, não hydrate) — um snapshot substitutivo quebraria o mount (carrossel, menu, formulário de contato) no próximo carregamento. Abordagem reescrita como snapshot ADITIVO (`#dc-prerender` sibling + `MutationObserver`, `<x-dc>` intacto). AC0 deixou de ser escolha — build-output separado é a única opção tecnicamente viável. AC4 reescrita (não é sobre unpkg/Babel — 0 ocorrências de `x-import` nas 5 páginas, React vem de vendor local com SRI — é sobre resiliência a falha de mount, coberta por construção pelo desenho aditivo). AC5 reescrita (fallback por página, não bloqueia deploy inteiro). AC6 dividida em AC6a (sem duplicação permanente) e AC6b (CLS medido, não assumido — risco de viewport único no snapshot). Nova seção "Convenção de deploy" com `deploy.sh` único (5 passos) substituindo instrução em prosa no README — a montagem do `dist/` reconhecida como assembly não-trivial (77MB de assets/uploads). Contexto reescrito com escopo mais preciso (não "site inteiro invisível" — conteúdo dinâmico de `<sc-for>` + interpolação). Status → `Draft`, precisa de nova validação @po antes do @dev pegar. | @sm (River) |
| 2026-09-01 | 0.6 | **NO-GO do @po (6/10) na revisão pós-@architect, 3 must-fix corrigidos.** (1) `MutationObserver` não pode observar `#dc-root` (não existe no HTML servido, só é criado dentro do próprio `boot()`; `observe(null)` lançaria `TypeError`) — corrigido para observar `document.body` com `{childList:true,subtree:true}`, checando `#dc-root` via `getElementById` a cada mutação, mais uma checagem síncrona de corrida. (2) AC7 nova: `#dc-prerender` precisa ser inteiramente não-interativo (`inert`+`pointer-events:none` ou remoção física dos elementos de formulário) — sem isso, o formulário de contato duplicado no snapshot fica visível e clicável sem handler, e um submit nessa janela vaza PII pra query string/logs via GET nativo do form. (3) AC8 nova: duplicação de `<h1>` (e headings em geral) é consequência esperada do desenho aditivo — regra de contagem corrigida para contar só dentro de `#dc-prerender`, propagada como correção mecânica pras Stories 90-3a/90-3b. Should-fix: AC1 usa as URLs limpas atuais (`/sobre-nos`, `/empreendimentos`, `/corporativas`, `/blog`), não mais as antigas que já retornam 301; citação de `renderVals()`/`window.innerWidth` corrigida (a real dependência de viewport está no `data-dc-script` de cada página, não em `support.js:737`, que é só o stub genérico); linhas de `loadReactUmd()` (1590) e a separação entre `parseDcDocument`/`boot()`/`parseDcText` corrigidas. | @sm (River) |
| 2026-09-01 | 0.7 | GO (9/10) na rodada focada do @po: os 3 must-fix da v0.6 confirmados como resolvidos de verdade, não só na redação. Status → `Ready`. Duas observações do @po, não bloqueantes, registradas para referência futura (não fecham escopo novo): AC1/Task 2 poderiam citar explicitamente a regra condicional de contagem de headings que hoje só está em Testing (nit de redação); `inert` é no-op em browsers muito antigos (pré-Chrome 102/Safari 15.5/Firefox 112) — se o @dev escolher a rota (a) da AC7 em vez da (b), documentar a escolha e o motivo no Dev Agent Record. | @sm (River) |
| 2026-09-01 | 0.8 | Decisão do usuário: AC7 deixa de dar escolha entre `inert`+`pointer-events:none` e remoção física — trava só na remoção física de `<form>`/`<button>`/`<input>` no script de prerender. Motivo explícito: `inert` é no-op em browsers antigos (pré-Chrome 102/Safari 15.5/Firefox 112) — mesmo minoria de tráfego, o usuário preferiu eliminar o risco de PII por completo em vez de mitigá-lo parcialmente. `inert` mantido só como alternativa descartada, com o motivo, para contexto. Referências cruzadas corrigidas em Task 6 e Testing (não apresentam mais as duas rotas como opção). Constrição de escopo dentro do que já estava aprovado pelo @po — não precisa de nova validação. Status permanece `Ready`. | @sm (River) |
| 2026-09-02 | 1.0 | **Implementada pelo @dev (Dex).** Mecanismo aditivo entregue conforme especificado (`#dc-prerender` irmão + `MutationObserver` em `document.body` + checagem síncrona de corrida + `<style>x-dc{display:none}` pareado). Uma decisão de implementação não coberta pela story: o bloco é inserido **antes** do `<x-dc>`, não depois — por medição de CLS (3.5251 → 0.2862 somado; a variante "depois" chegava a 1.0045 numa página, porque o bloco visível era empurrado pela altura inteira do documento e o `componentDidMount` de cada página força layout lendo `window.innerWidth`). AC7 por remoção física (`inert` não usado em lugar nenhum), com âncoras preservadas de propósito e como invariante testada — desvio registrado para o @qa. AC2 com 0% de diff de pixel e zero console novo; AC6b com todas as 10 combinações ≤ 0.061. `deploy.sh` com os 5 passos + `--dry-run`, testado fim a fim incluindo os caminhos de abort e o fallback do AC5. 80/80 checagens de verificação. Status → `Ready for Review`. | @dev (Dex) |
| 2026-09-02 | 1.1 | **Correção do gate do @qa (CONCERNS 9/10).** QA-1 (bloqueante): `deploy.sh` rodava `cd dist && vercel deploy`, mas `dist/` não tem `.vercel/project.json` e `assemble()` o recria a cada build — o deploy criaria um projeto Vercel novo em vez de publicar em `trifold-s-projects/trifold-design-system`. Medi as duas rotas na CLI 54.6.1: `--cwd dist` (rota b) **não** serve, move também a resolução do vínculo e dá o mesmo erro; adotada a rota (a), `copyProjectLink()` no `assemble()`, com `deploy.sh` e `build-dist.mjs` abortando duro se o vínculo não existir na fonte. Provado por `vercel env ls` de dentro do `dist/` reconstruído. QA-2: `id="dc-prerender"` sem sentinelas deixou de ser confundido com fallback do AC5; o teste de mutação manual do @qa virou suíte repetível de 10 mutantes (harness 80 → **90 checagens**). QA-3: redação de lint/typecheck/vitest corrigida para não sugerir cobertura que não existe sobre `landing-pages/`. QA-4/QA-7 deixados para o @sm. | @dev (Dex) |
| 2026-09-03 | 1.2 | **Publicada em produção pelo @devops (Gage).** Branch `feat/90-1-prerender-institucional` cortada de `origin/main` (worktree isolada) com os 14 arquivos da story por pathspec — sem os commits de Microsoft Clarity nem o resíduo da 90-6 que contaminavam a working tree. PR #564 aberto, **sem merge** (aguarda confirmação do usuário). `./deploy.sh --dry-run` verde, deploy real `dpl_EGqFvA9ENYBydWY3rTXgzJM3SgPw` aliasado em `trifold.eng.br`, passo 5 (`check-live.mjs`) aprovado nas 5 URLs. Smoke test completo registrado na seção "Deploy & Smoke Test em produção" — inclui **envio real do formulário de contato**, que continua funcionando (POST `/api/contact` → 200, ramo de envio real comprovado por latência). QA-9 (linha órfã do Change Log) corrigido antes do commit. | @devops (Gage) |

## QA Results

**Gate:** CONCERNS (com 1 must-fix bloqueante) — `docs/qa/gates/90.1-prerender-html-institucional.yml`
**Revisor:** @qa (Quinn) — 2026-09-02
**Branch/commit no momento do gate (lidos do git, não do contexto):** `feat/86-12-yarden-conteudo-definitivo` / `b4e7c8d3` — nada da 90-1 commitado, nada deployado.
**Readiness:** 9/10

### Método

Nada aqui é leitura do Dev Agent Record. Cada afirmação do @dev foi re-executada por mim, e os
testes que sustentam as ACs de risco foram **mutados** para provar que reprovam quando deveriam.

### ACs — todas reproduzidas independentemente

| AC | Veredito | Como eu verifiquei |
|---|---|---|
| AC0 | PASS | `grep dc-prerender` nos 5 fontes → 0; `git diff -M -U0` contém só reescrita de href da 90-6 (Home.dc.html nem aparece no diff); `git check-ignore -v` confirma `dist/` (.gitignore:54) e `.seo-metrics/` (:58) |
| AC1 | PASS | 5/5 com sentinelas + `#dc-prerender`; `<x-dc>` byte a byte igual ao fonte; 0 `{{`/`<sc-*`/`<dc-import`/`<x-dc`/`id="dc-root"` no bloco; GET HTTP simples devolve 2112/2011/956/5951/2794 chars de texto real |
| AC2 | PASS | 0% de diff de pixel em 10/10 e console inalterado — **com o comparador auditado e mutado** (76.634% quando alimentado com o screenshot errado) |
| AC3 | PASS | `support.js` 0 linhas de diff; `cmp -s support.js dist/support.js` idêntico |
| AC4 | PASS | 5/5 com o vendor do React abortado na rede: bloco permanece visível, 948–5898 chars, `#dc-root` nunca criado |
| AC5 | PASS | `DC_PRERENDER_FAIL_IDS=home,blog` → 3/5 pré-renderizadas, `cmp -s` confirma fallback **byte a byte igual ao fonte**, gate aprova, `check-live` distingue fallback esperado de inesperado |
| AC6a | PASS | 2 capturas por página; janela de coexistência 0.1–0.4ms; bloco **removido do DOM**, não escondido |
| AC6b | PASS | Remedido por mim nas duas variantes de posição (ver abaixo) |
| AC7 | PASS | Estático + ao vivo + **contraprova por mutação** (ver abaixo) |
| AC8 | PASS | `h1(doc) == h1(<x-dc>) + h1(#dc-prerender)` e `h1(bloco) == h1(<x-dc>)` em 5/5 |

`scripts/verify-prerender.mjs`: **80/80 na minha execução**, não no relato.

### Ponto 1 — posição do bloco e o achado de CLS: confirmado por medição própria

Reconstruí a variante "bloco DEPOIS de `</x-dc>`" a partir do próprio `dist/` (recorte por sentinela +
reinserção após o último `</x-dc>`) e medi as duas com `PerformanceObserver({type:'layout-shift'})`,
5 páginas × 2 viewports, pior de 2 execuções:

| variante | CLS somado | pior página |
|---|---|---|
| bloco **ANTES** (entregue) | **0.2944** | 0.0583 (`/sobre-nos` mobile) |
| bloco **DEPOIS** (reconstruída por mim) | **2.9137** | 1.0435 (`/empreendimentos` mobile) |

Razão **9.90x** (o @dev reportou 12.3x com 3 execuções). Meus números da variante entregue reproduzem os
dele — o pior caso bate exato (0.0583), e nenhuma das 10 combinações passa de 0.061. **A decisão de inverter
a posição é correta e mensurável, não racionalização.** A justificativa mecânica também confere: com o bloco
depois, o `#dc-prerender` (que ocupa a viewport) é empurrado pela altura inteira do documento quando o React
preenche o `#dc-root`, e o `componentDidMount` de cada página força layout lendo `window.innerWidth`.

### Ponto 2 — ausência de elementos interativos nas 5 páginas: confirmado, e o teste não é vacuoso

Nas 5 páginas (não só na Home): **0** `<form>`, `<button>`, `<input>`, `<textarea>`, `<select>`, `<iframe>`,
`<object>`, `<embed>`, `<dialog>`, `<script>` dentro do `<div id="dc-prerender">`; 0 atributo `on*`;
0 `tabindex`; 0 `contenteditable`. (O único `<script>` na região das sentinelas é o observador — **irmão** do
div, fora dele.) Ao vivo, com o vendor do React abortado (janela de risco aberta indefinidamente):
`requestSubmit()` forçado não navega, digitar + Enter sem foco não gera query string nem requisição com
`nome=|email=|telefone=|mensagem=`, e 60x Tab só passam por `A` e `BODY`.

**Contraprova (o que fecha o argumento):** injetei um `<form><input name=nome><textarea name=mensagem><button>`
dentro do `#dc-prerender` da Home e reexecutei. O vazamento **materializou** — a URL virou `/?nome=&mensagem=`
com 1 requisição suspeita — e o harness reprovou em 7 checagens (73/80), com o gate pré-deploy abortando por
"VIOLAÇÃO DA AC7". O risco que a AC7 descreve é real e o teste que o cobre pega.

Mais 4 mutações contra o gate pré-deploy: `<x-dc>` alterado → aborta; `<style>` do head removido → aborta;
observador removido → aborta. Só a combinação "observador **e** style removidos juntos" passa — limite real
do gate, registrado como QA-2 (não produzível pelo build).

### Ponto 3 — `<a href>` mantidos no bloco: **interpretação ratificada, não volta para o @dev**

Avaliação de risco, com os dados que levantei:

1. O bloco não tem **nenhum** elemento que colete entrada. Sem dado digitado, não há o que uma âncora carregue
   — `href` é congelado em build-time.
2. Enumerei as **105 âncoras** dos 5 blocos (20 Home / 14 sobre-nos / 16 empreendimentos / 15 corporativas /
   40 blog): esquemas só `https`, root-relativo, fragmento e relativo. **Zero** `mailto:`, `tel:`, `javascript:`.
3. Query strings, que era a pergunta específica: 1 `wa.me/5544991089698?text=<mensagem de marketing hardcoded>`
   por página (sem PII) + 27 `Artigo.dc.html?slug=fN|pN` no Blog (slugs estáticos). **Nenhuma carrega ou
   coleta dado do usuário.**
4. 1 `target="_blank"` por página, todos com `rel="noopener"` — sem reverse tabnabbing.
5. **Decisivo:** a AC1 exige explicitamente "CTAs" dentro do `#dc-prerender`, e neste site os CTAs **são
   âncoras** (`<a href="/#contato">Solicitar orçamento</a>`); os `<button>` removidos eram controles de
   carrossel/menu. A leitura literal de "qualquer elemento interativo" colocaria a AC7 em **contradição
   direta com a AC1**.

A interpretação do @dev é a única que satisfaz AC1 e AC7 ao mesmo tempo, e ele a transformou em invariante
testada em vez de omissão. A redação da AC7 é que precisa ser corrigida para as stories que herdam o critério
(QA-7, para o @sm).

### Ponto 6 — `deploy.sh`: **defeito bloqueante encontrado no passo 4 (QA-1)**

Passos 1, 2, 3 e 5 verificados: `./deploy.sh --dry-run` passa e para antes de publicar; o gate reprova nos
5 cenários que testei; `check-live.mjs` rodado contra `https://trifold.eng.br` reprova corretamente nas 5 URLs
("o build pré-renderizou esta página, mas produção está servindo o fonte").

**O passo 4 não publica no projeto certo.** `cd dist && vercel deploy --prod --yes --scope trifold-s-projects`
roda numa pasta sem `.vercel/project.json` — a allowlist do `build-dist.mjs` não copia `.vercel`, e
`assemble()` faz `fsp.rm(outRoot)` no início de cada build, então um `vercel link` manual dentro de `dist/`
é apagado no build seguinte. **Provado sem deployar nada:** `vercel env ls` na pasta-fonte resolve
`trifold-s-projects/trifold-design-system`; o mesmo comando dentro de `dist/` devolve
`Error: Your codebase isn't linked to a project on Vercel`. Logo o passo 4 ou aborta, ou (com `--yes`, que usa
os defaults do setup) cria um projeto novo com o nome da pasta e publica lá — em nenhum caso o
`trifold.eng.br` é atualizado. Produção não corre risco (fica byte-idêntica ao que já serve) e o passo 5
grita, mas o **único** caminho de deploy que a story criou não funciona, e o README agora proíbe o antigo.

É exatamente o passo que `--dry-run` não exercita — por isso "testado fim a fim em dry-run" não pegou.
Correção de 1 linha (`--project`, ou `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID`, ou copiar `.vercel/project.json`
no `assemble()`); detalhes e recomendação no arquivo de gate.

### Ponto 7 — File List: bate 1:1

Os 9 arquivos declarados como criados existem; `git status` mostra exatamente `?? deploy.sh` e `?? scripts/`
mais os 3 modificados declarados (`README.md`, `.gitignore`, `.vercelignore`); `dist/` e `.seo-metrics/`
ignorados; nenhum dos 5 `.dc.html`-fonte, `support.js` ou `vercel.json` tocado.

### Verificação extra (não pedida, mas material para o @devops)

`sha256` do que produção serve **hoje** vs a árvore local, em todos os artefatos que o `dist/` publica
(5 páginas — documento inteiro **e** `<x-dc>` recortado —, `Artigo.dc.html`, `Design System.dc.html`,
`Logo.dc.html`, `support.js`): **igual em 100%**. O deploy da 90-1 adiciona exatamente o bloco
pré-renderizado e nada mais — sem mudança de carona. E: li `boot()`/`updateHtml()` no `support.js` para
descartar o bloco **voltar** depois do mount — `updateHtml` só recompila o template no registry, não reescreve
o documento.

### Veredito

**CONCERNS com 1 must-fix bloqueante (QA-1).** Não é FAIL: as 10 ACs estão entregues e reproduzidas
independentemente, com contraprovas por mutação — é um trabalho sólido e genuinamente bem testado, e o desvio
das âncoras está certo. Não é PASS: o caminho de deploy da própria story não publica no projeto certo, e isso
é correção de código, não contorno operacional do @devops.

**Volta para o @dev:** QA-1 (bloqueante). QA-2 e QA-3 na mesma passada, se quiser. Depois re-verificação
focada só no passo 4 e liberação para o @devops. Não bloqueantes para a story: QA-4 (@sm/90-2), QA-7 (@sm),
QA-5/QA-6 (informativos).

---

### Re-verificação focada — 2026-09-02 (2ª rodada, escopo: QA-1/QA-2/QA-3)

**Gate final: PASS (10/10).** Liberada para o @devops.
`docs/qa/gates/90.1-prerender-html-institucional.yml` atualizado (histórico: CONCERNS 9/10 → PASS 10/10).

Escopo desta rodada foi só o fix. **AC0/AC1/AC2/AC3/AC4/AC5/AC6a/AC6b/AC7/AC8 não foram reabertos** — e não
precisavam: `prerender.mjs` não foi tocado (mtime anterior à correção), então a lógica de serialização e
sanitização que sustenta a AC7 continua sendo exatamente a que validei na 1ª rodada. O `git diff` dos 5
`.dc.html`-fonte, do `support.js` e do `vercel.json` segue contendo só a reescrita de href da 90-6.

**QA-1 — fechado no mecanismo, não no relato.**

- `copyProjectLink()` re-copia `.vercel/{project.json,README.txt}` a cada build (sem `cache/`), o que
  neutraliza a causa-raiz que apontei: o `fsp.rm(outRoot)` do `assemble()` apagava qualquer `vercel link`
  feito à mão. Não depende de ninguém lembrar.
- `./deploy.sh --dry-run` completo (rm -rf + assembly + prerender + gate): **EXIT 0**; passo 1 imprime
  `✓ vínculo do projeto Vercel presente (trifold-design-system)`; assembly foi de 17 → 18 entradas.
- Depois do rebuild, `cmp -s` confirma `dist/.vercel/project.json` **idêntico** ao da pasta-fonte
  (`prj_1SRBOXwTclTFwGDz3zjIO6uM0pMG`) — é o vínculo **certo**, não "algum" vínculo. `dist/.vercel/cache`
  não existe.
- **Prova independente, de dentro do `dist/` que eu reconstruí:** `vercel env ls` → *Environment Variables
  found for trifold-s-projects/trifold-design-system*; e, mais forte, `vercel ls` → *Deployments for
  trifold-s-projects/trifold-design-system*, listando o deployment de produção real. Mesma CLI 54.6.1 que na
  1ª rodada respondia *"Your codebase isn't linked to a project on Vercel"*.
- **Caminho negativo testado** (movi o `project.json` para fora, com backup, e restaurei): `deploy.sh` aborta
  no **passo 1**, antes de gastar o build, com o `vercel link` pronto para copiar; e a invocação direta de
  `build-dist.mjs` lança em `copyProjectLink()` com a mesma orientação. Duas barreiras, nenhuma silenciosa.
- **A rota descartada foi descartada pelo motivo certo:** confirmei sem desfazer nada que `--cwd` move também
  a resolução do vínculo — `vercel env ls --cwd assets`, invocado de dentro da pasta-fonte vinculada, dá
  *"isn't linked"*. `--cwd dist` sozinho não teria resolvido o QA-1.

**QA-2 — fechado inclusive na variante que a suíte nova não cobre.** `gateMutations()` codifica o caso
"observador + style + **sentinelas** removidos juntos". O meu mutante original era outro: sentinelas
**intactas**, observador e style ausentes. Testei exatamente ele contra o `inspectDocument()` novo →
`fallback: false`, 1 problema apontado, **reprova**. Na 1ª rodada esse mesmo mutante era aprovado.

**Suíte de mutação — é suíte de verdade.** `node scripts/verify-prerender.mjs` → **EXIT 0, 90/90** na minha
execução (era 80/80). Os 10 mutantes se comportam como esperado e a suíte inclui **mutante de controle**
("HTML bom deve APROVAR") — sem ele, um gate que reprovasse tudo passaria nos outros 9. `node --check` ok nos
3 `.mjs` alterados, `bash -n` ok no `deploy.sh`.

**QA-3** — Dev Agent Record reescrito, agora explicitando que os 64 testes são de yarden/vind-residence e que
o turbo só cobre `packages/web`. Confere.

**Sem escopo novo, e nada de carona no deploy.** Tamanhos por página idênticos aos da 1ª rodada
(2104/2007/948/5898/2790 de texto; gate 2112/2011/956/5951/2794) — o fix mexeu no vínculo e no gate, não no
HTML publicado. Refiz o `sha256` produção-vs-árvore (houve um deploy de produção do projeto ~3h antes desta
rodada, visto no `vercel ls`): 5 páginas (documento **e** `<x-dc>`) + `Artigo` + `Design System` + `Logo` +
`support.js` seguem **iguais em 100%**.

**Pendências não bloqueantes** (nenhuma é condição para publicar): QA-4 e QA-7 (@sm — alimentam a 90-2 e a
redação que as 90-3a/90-3b herdam), QA-9 (a linha `1.1` do Change Log ficou **depois** da seção QA Results,
partindo a tabela — arrumar antes do commit), QA-5, QA-6, QA-8, QA-10 (informativos).

---

## Deploy & Smoke Test em produção (@devops — Gage, 2026-09-03)

Seção do @devops (não edita `Dev Agent Record` nem `QA Results`, que pertencem ao @dev e ao @qa).

### Branch e PR — o que entrou, e o que foi deliberadamente deixado de fora

A working tree estava na branch `feat/86-12-yarden-conteudo-definitivo` (outra story), que carregava
**dois blocos de contaminação**: (a) commits de instalação do Microsoft Clarity em `Home.dc.html` e
`vercel.json`, de outra iniciativa; (b) resíduo da Story 90-6 (`Artigo/B2B/Blog/Empreendimentos.dc.html`
+ o rename de `Sobre Nós.dc.html`), que já está em `main` via PR #523.

Por isso a branch da 90-1 foi cortada de `origin/main` em **worktree isolada**
(`.claude/worktrees/90-1-prerender-institucional`) e os arquivos foram copiados e **staged por pathspec
explícito** — nunca `git add -A`. Conferido antes do commit: 14 arquivos staged, nenhum `.dc.html`-fonte,
nenhum `vercel.json`, nenhum rename.

| Item | Valor |
|------|-------|
| Branch | `feat/90-1-prerender-institucional` (base `origin/main` @ `f3992973`) |
| Commit | `3d634a51` — 14 arquivos, +3343 / −21 |
| PR | **#564 — aberto, SEM merge** (aguarda confirmação explícita do usuário) |
| QA-9 | corrigido antes do commit (linha `1.1` do Change Log movida para dentro da tabela) |
| Varredura de segredos | 0 credenciais. Único achado: `prj_…` (projectId da Vercel, identificador não-secreto, com precedente em docs já versionados) |

### Deploy

| Passo | Resultado |
|-------|-----------|
| `./deploy.sh --dry-run` | **EXIT 0.** Passos 1–3 verdes; 18 entradas no assembly (inclui `.vercel/{project.json,README.txt}` do fix do QA-1); 5/5 páginas pré-renderizadas; gate pré-deploy aprovado com 2112 / 2011 / 956 / 5951 / 2794 chars — idêntico aos números do gate do @qa |
| `./deploy.sh` (real) | **Sucesso.** `dpl_EGqFvA9ENYBydWY3rTXgzJM3SgPw`, target `production`, aliasado em `https://trifold.eng.br` |
| Passo 5 (`check-live.mjs`) | Aprovado nas 5 URLs de produção na 1ª tentativa |

**Por que o deploy saiu da working tree principal e não da worktree do PR** (decisão registrada porque é
contraintuitiva): o assembly exige os ~77 MB de `assets/` + `uploads/`, que não estão no git e só existem
na árvore principal. Mais importante: **`origin/main` não tem o Microsoft Clarity, mas produção tem.**
Verificado por `sha256` antes de publicar — as 5 páginas servidas e o `support.js` eram byte-idênticos à
árvore principal, e `origin/main` divergia em `Home.dc.html` e `vercel.json` (Clarity). Publicar de uma
worktree cortada de `origin/main` teria **removido o Clarity de produção e revertido a CSP**. A árvore
principal era a única fonte que reproduz produção + a mudança desta story.

Confirmado depois do deploy: Clarity segue no HTML servido (2 ocorrências) e no header de CSP.

### Smoke test — 8 verificações

**1. `curl` nas 5 URLs — snapshot real servido antes do JS (AC1).** OK em 5/5.

| URL | texto no `#dc-prerender` | âncoras | `{{` / `<sc-` no bloco | interativos no bloco | `<x-dc>` == fonte | bloco antes do `<x-dc>` | `{{` fora do `<x-dc>` |
|-----|---|---|---|---|---|---|---|
| `/` | 2112 | 20 | 0 / 0 | nenhum | ✅ byte a byte | ✅ | 0 |
| `/sobre-nos` | 2011 | 14 | 0 / 0 | nenhum | ✅ byte a byte | ✅ | 0 |
| `/empreendimentos` | 956 | 16 | 0 / 0 | nenhum | ✅ byte a byte | ✅ | 0 |
| `/corporativas` | 5951 | 15 | 0 / 0 | nenhum | ✅ byte a byte | ✅ | 0 |
| `/blog` | 2794 | 40 | 0 / 0 | nenhum | ✅ byte a byte | ✅ | 0 |

A integridade do `<x-dc>` (AC3) foi verificada **por mim, manualmente** — o passo 5 do `deploy.sh` pula
essa checagem quando roda contra produção ("sem fonte local para comparar"). Comparei o `<x-dc>` servido
com o `.dc.html`-fonte: idêntico byte a byte nas 5 páginas.

**2. Browser real — o snapshot DESAPARECE depois do mount (AC6a).** OK em 5/5.
Chromium (Playwright 1.60.0), espera de `#dc-root` com filhos + 2,5 s de margem:
`#dc-prerender` **removido do DOM** (não escondido) em 5/5; `#dc-root` com 1 filho e 956–5945 chars de
texto; `<x-dc>` consumido pelo `boot()`; contagem de `h1` visível 0/0/1/1/1 — bate com a tabela do @qa.

**3. ⭐ FORMULÁRIO DE CONTATO REAL — a verificação crítica de regressão. FUNCIONA.**
Preenchido e enviado **pela UI, no browser, depois do mount concluído**, em `https://trifold.eng.br/`:

- método: **`POST https://trifold.eng.br/api/contact`** — não é `GET` nativo de formulário;
- resposta: **`200 {"ok":true}"`**;
- **URL não mudou e não ganhou query string** (`https://trifold.eng.br/`, `search` vazio) — nenhuma PII
  foi para a barra de endereço, para o histórico ou para os logs de acesso;
- feedback visível ao usuário: *"Mensagem enviada! Em breve entraremos em contato."*;
- honeypot `empresa` verificado **vazio** no corpo capturado; `loadedAt` ~6 s antes do submit (a guarda
  `MIN_SUBMIT_MS` é 2 s).

**O 200 é do ramo de envio real, não de um 200 "de mentira"** — provado por latência contra os dois
controles negativos disparados na mesma sessão e na mesma origem:

| Cenário | status | latência |
|---------|--------|----------|
| honeypot preenchido (`empresa` = valor) — retorna 200 sem chamar a Resend | 200 | **257 ms** |
| time-guard (`loadedAt` = agora) — retorna 200 sem chamar a Resend | 200 | **185 ms** |
| **envio real pelo formulário** | 200 | **2505 ms** |

O envio real levou ~10x mais tempo: é o round-trip para `api.resend.com`. E como `api/contact.js`
devolve `502 email_send_failed` se a Resend responde não-2xx (e `500` se a chave faltar), um `200` nesse
ramo significa que a Resend **aceitou** a mensagem. Limitação registrada com honestidade: a confirmação
do `last_event` pela API da Resend **não** foi feita — exigia ler a chave em texto claro, o que o
ambiente bloqueou. A prova acima é indireta (ramo + latência), não o `last_event`.
Foram 2 e-mails de smoke test para `caio@trifold.eng.br`, ambos identificados no corpo como
"SMOKE TEST AUTOMATIZADO — Story 90-1 … Pode ignorar".

**4. Nada é interativo ANTES do mount (AC7, reproduzido em produção).** OK em 5/5.
Com `assets/vendor/react*.js` abortado na rede (janela pré-mount aberta indefinidamente):
`#dc-prerender` vivo e visível com 899–5888 chars, `#dc-root` nunca criado, e no bloco
**0** `form` / `input` / `button` / `textarea` / `select` / `iframe` / `script`, **0** atributos `on*`;
`requestSubmit()` forçado em todo `<form>` do documento **não navega**; digitar + Enter sem foco não gera
query string nem requisição contendo `nome=|email=|telefone=|mensagem=` (0 requisições suspeitas); 40x
`Tab` pousam só em `A` e `BODY`. Âncoras preservadas (20/14/16/15/40), como esperado pela AC1.

**5. Comportamento visual normal, sem flash e sem duplicação visível (AC2/AC6b).** OK em 10/10
combinações página × viewport (390px e 1440px): **0** headings visíveis duplicados; bloco removido no
mesmo tick de polling de 1 ms do mount (a janela de coexistência de 0,1–0,4 ms medida pelo @qa está
abaixo da resolução do meu instrumento — na prática, imperceptível). Screenshots de Home mobile e Blog
desktop inspecionados: layout normal.

**CLS medido em produção:** soma **0,1823** | pior **0,0741** (`/corporativas` mobile) — todas as 10
combinações abaixo do limite 0,1 de "bom". Referência do gate local: soma 0,2944 / pior 0,0583.

**6. Console / rede sem regressão.** Os únicos 4xx são `404 /{{ c.src }}`, `/{{ s.logoSrc }}`,
`/{{ t.photoSrc }}`, `/{{ t.photo }}` — `src` de imagem não resolvido **dentro do `<x-dc>`**, e são
**pré-existentes**: o `.seo-metrics/baseline/report.json` (capturado em 2026-09-01, sobre a fonte, antes
desta story) registra exatamente `404 …%7B%7B%20s.logoSrc%20%7D%7D` e `404 …%7B%7B%20c.src%20%7D%7D` na
Home, com `errors: 2 / httpErrors: 2` — e o `comparison.json` fecha `httpBefore == httpAfter`.
`/empreendimentos` e `/blog` ficaram com **0** erro e **0** 4xx em produção.

**7. Sem regressão de roteamento nem nas outras rotas do projeto.**
`200`: `/`, `/sobre-nos`, `/empreendimentos`, `/corporativas`, `/blog`, `/vindresidence/` (proxy do Vind),
`/Artigo.dc.html?slug=f1`, `/support.js`. `301` da Story 90-6 preservados:
`/Sobre%20Nós.dc.html` → `/sobre-nos`, `/B2B.dc.html` → `/corporativas`. `/api/contact` via `GET` → `405`.
`/y/` segue `404` — estado pré-existente, fora do escopo desta story.

**8. Nada do que a story criou foi exposto na web.** `404` em `/deploy.sh`, `/scripts/build-dist.mjs`,
`/scripts/prerender.mjs`, `/dist/Home.dc.html`, `/.seo-metrics/after/report.json`, `/.vercel/project.json`,
`/.claude/settings.json`, `/README.md`, `/.gitignore`, `/.vercelignore`. A allowlist do `build-dist.mjs`
resolve isso por construção (nada fora da lista entra no `dist/`), e o `.vercelignore` novo é a rede de
segurança para quem publicar da pasta-fonte por hábito.

### Observações não bloqueantes

- **Mount lento em `/corporativas` desktop na 1ª medição (8186 ms).** Era cache de edge frio logo depois
  do deploy: re-medido 3x, deu 1438 / 1498 / 1261 ms. Não é efeito do bloco pré-renderizado (que adiciona
  ~6 KB nessa página).
- **Deployment anterior (`…-9jx77gcvy`) não serve como controle de console.** A URL de deployment injeta
  toolbar/SSO da Vercel (`vercel.com/api/jwt`, Sentry) e roteia paths desconhecidos de forma diferente do
  domínio aliasado. O controle válido é o `.seo-metrics/baseline/` — usado no item 6.

### Estado final

**Deploy concluído e verificado. Nenhuma divergência encontrada — nada volta para o @dev.**
Status da story: **`InReview`**. O PR #564 fica **aberto, sem merge**, até confirmação explícita do
usuário. Como este projeto não é deployado por git, o merge é apenas registro no repositório — produção
já está com a Story 90-1 no ar.
