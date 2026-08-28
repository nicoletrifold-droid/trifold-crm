# Story 90-6 — URLs limpas (`/sobre-nos`, `/empreendimentos`, `/corporativas`, `/blog`) + redirect 301

**Status:** Ready for Review (implementada por @dev em 2026-08-28 — aguardando `@qa *qa-gate` e deploy manual por @devops)
**Epic:** 90 — SEO Técnico do site institucional trifold.eng.br
**Executor:** @dev (Dex)
**Quality Gate:** @qa (Quinn) — `*qa-gate` ao fim da implementação
**Prioridade:** P1 — alto impacto (Tier 2 do relatório de auditoria)
**Estimativa:** 8 pontos (G) — renomear arquivos + reconfigurar `vercel.json` +
atualizar links internos em 6 páginas
**Depende de:** — (roteamento/rewrite, independente da 90-1)
**Roda ANTES de:** 90-1, 90-3a, 90-3b, 90-4 — ver "Sequenciamento" abaixo. Esta story
é a **primeira** a ser implementada no epic.

## Sequenciamento (por que esta story roda primeiro no epic)

A abordagem recomendada nesta story envolve **renomear fisicamente** os arquivos
`.dc.html` (ver Dev Notes). Um rename quebra qualquer referência por nome de arquivo
que as outras stories do epic façam — 90-1 (pré-renderização), 90-3a/90-3b (H1) e
90-4 (Open Graph) tocam nos mesmos arquivos institucionais. Rodar esta story em
paralelo com as outras convida conflito de merge e referência quebrada. **Ordem de
execução do epic:** 90-6 → 90-1 → 90-2 → 90-3a → 90-3b → 90-4 → 90-5 → 90-7 (ver
`epic-90-seo-tecnico-trifold.md`).

## Contexto (achado T3 do relatório de auditoria)

> Fonte: `docs/research/2026-08-28-seo-audit-trifold/RELATORIO.md`, achado T3 (ALTO,
> Prioridade 2).

URLs com extensão, espaço e acento (`Sobre Nós.dc.html`) — confirmado no nav de
`Home.dc.html`, que aponta para `"Sobre Nós.dc.html"`, `"Empreendimentos.dc.html"`,
`"B2B.dc.html"`, `"Blog.dc.html"`. URL ilegível, vira `%20` ao compartilhar, destoa do
padrão limpo já usado em `/vindresidence/` e `/yarden/`. Correção sugerida pelo
relatório: migrar para `/sobre-nos`, `/empreendimentos`, `/corporativas`, `/blog`,
com redirect 301 das antigas.

## Correções aplicadas pós-validação @po (2026-08-28)

A versão original desta story tinha 3 erros de levantamento, corrigidos abaixo:

1. **São 6 arquivos com link para as URLs antigas, não 8.** Confirmado por grep em
   todo o diretório: `Home.dc.html`, `Sobre Nós.dc.html`, `Empreendimentos.dc.html`,
   `B2B.dc.html`, `Blog.dc.html` e **`Artigo.dc.html`** (que também tem o nav
   completo, incluindo os 4 links). `Design System.dc.html` e `Logo.dc.html` **não
   têm nenhum link** para essas 4 URLs (confirmado — só têm âncoras internas tipo
   `#logo`, `#tipografia`) — ficam de fora tanto das Tasks quanto do "Fora de
   escopo", sem contradição.
2. **São 3 ocorrências de cada um dos 4 links por arquivo** (nav desktop, overlay de
   menu mobile, rodapé) — confirmado por grep em `Home.dc.html`, `Sobre Nós.dc.html`,
   `Empreendimentos.dc.html`, `Blog.dc.html` (3× cada uma das 4 URLs). Exceção
   observada: `Artigo.dc.html` tem 3× para Sobre Nós/Empreendimentos/B2B, mas só 2×
   para Blog (o link do Blog no nav desktop de `Artigo.dc.html` está marcado como
   página ativa, com estilo diferente — `@dev` deve conferir esse arquivo
   especificamente antes de assumir 3× ali).
3. **`Home.dc.html` entra no escopo desta story** — ver AC5 abaixo, item novo.

## Acceptance Criteria

### AC1 — Novas URLs limpas servindo o conteúdo correto

`GET https://trifold.eng.br/sobre-nos` serve o conteúdo hoje em `Sobre Nós.dc.html`;
`/empreendimentos` serve `Empreendimentos.dc.html`; `/corporativas` serve
`B2B.dc.html`; `/blog` serve `Blog.dc.html`. Todas com status 200.

### AC2 — Forma canônica de URL definida (com/sem barra final)

**Forma canônica: SEM barra final** (`/sobre-nos`, não `/sobre-nos/`) — segue
literalmente a correção sugerida pelo relatório de auditoria, que já usa essa forma.
A forma com barra final (`/sobre-nos/`, `/empreendimentos/`, `/corporativas/`,
`/blog/`) redireciona com **301** para a forma canônica sem barra — mesmo tratamento
do AC3, para nenhuma das duas formas ficar servindo 200 (o que criaria conteúdo
duplicado aos olhos do Google, exatamente o problema que esta story ataca).

### AC3 — Redirect 301 das URLs antigas

Requisições às URLs antigas — `/Sobre%20N%C3%B3s.dc.html` (URL-encoded),
`/Empreendimentos.dc.html`, `/B2B.dc.html`, `/Blog.dc.html` — retornam **301** (não
302) para a URL limpa correspondente (forma canônica do AC2). 301 (permanente) é o
que preserva o valor de SEO acumulado nas URLs antigas, se houver algum backlink ou
indexação prévia.

### AC4 — Navegação interna atualizada

Todos os links internos (`<a href="...">`) que hoje apontam para as URLs antigas, nos
**6** arquivos que de fato os contêm — `Home`, `Sobre Nós`, `Empreendimentos`, `B2B`,
`Blog`, `Artigo` (nav desktop, overlay de menu mobile e rodapé, onde existir) —
passam a apontar diretamente para as novas URLs limpas, forma canônica do AC2. Não
depender do redirect 301 para navegação normal (o 301 é rede de segurança para quem
já tinha a URL antiga salva/indexada, não o caminho principal).

### AC5 — `Home.dc.html` normalizado para `/` (item novo, não estava na versão original)

`Home.dc.html` retorna hoje **200** com conteúdo idêntico ao de `/` — é conteúdo
duplicado, o mesmo problema que esta story ataca para as outras 4 páginas. Sem
nenhuma tag `rel=canonical` publicada em qualquer página do site (confirmado: 0
ocorrências em todos os `.dc.html`), esse é um gap real, não cosmético.

- `GET https://trifold.eng.br/Home.dc.html` retorna **301** com `Location: /`
  (sem fragmento nenhum no destino).
- **Correção do @po (2ª validação, 2026-08-28): o fragmento `#contato` nunca é
  enviado ao servidor** — nem o `vercel.json` consegue casar nele (fragmentos não
  fazem parte da requisição HTTP), nem `curl` consegue testá-lo. O `destination` do
  redirect é **sempre `/`**, mesmo para requisições que na barra de endereço do
  usuário tinham `#contato` — não escrever `"destination": "/#contato"` no
  `vercel.json` (isso arrastaria **todo** visitante de `/Home.dc.html`, mesmo sem
  fragmento, para a seção de contato, o que é um bug, não o comportamento
  desejado).
- O fragmento é preservado **pelo navegador**, não pelo servidor: é comportamento
  padrão de qualquer browser reaplicar o fragmento original da URL de origem quando
  o header `Location` da resposta não traz um — `Home.dc.html#contato` → o browser
  segue o 301 para `/`, mantém o `#contato` que ele mesmo já tinha, e o resultado
  final na barra de endereço é `/#contato`. Isso **não é verificável por `curl`**
  (fragmento não aparece em nenhum header nem corpo de resposta) — ver "Testing"
  abaixo para o método correto de verificação (Playwright).
- Todos os links internos que hoje apontam para `Home.dc.html` ou
  `Home.dc.html#contato`, nos 6 arquivos, passam a apontar para `/` e `/#contato`
  diretamente (mesmo princípio do AC4 — não depender do redirect para navegação
  normal).

### AC6 — Nenhuma referência quebrada

Nenhum link interno do site (nav desktop, menu mobile, CTAs, rodapé) resulta em 404
ou num redirect encadeado (redirect que aponta para outro redirect) após a mudança.

## Fora de escopo

- `Artigo.dc.html?slug=...` — roteamento por query string, não por path; fora do
  achado T3 evidenciado. `Artigo.dc.html` entra nesta story **só** para atualização
  dos links de navegação (AC4/AC5), não para ganhar URL própria por slug. Registrado
  como observação separada no backlog do epic (Tier 4).
- `Design System.dc.html`, `Logo.dc.html` — confirmado que não têm nenhum link para
  as 4 URLs antigas nem para `Home.dc.html`; não precisam de edição nesta story.
- Renomear fisicamente os arquivos para nomes ASCII (`sobre-nos.dc.html` etc.) é uma
  decisão de implementação do @dev, não uma AC em si — o que importa é o resultado
  observável (AC1–AC6), não o nome do arquivo físico. Ver Dev Notes para a
  recomendação.

## Convenção de deploy

- `landing-pages/trifold-design-system/` não passa por CI nem por `git push` — a
  publicação é manual: `vercel deploy --prod --yes --scope trifold-s-projects`, de
  dentro do diretório (ver `landing-pages/trifold-design-system/README.md`).
- **Rollback:** antes de editar `vercel.json`, copiar o conteúdo atual do arquivo
  para o Dev Agent Record (ou um comentário no próprio PR) — como o deploy é manual
  e não passa por pipeline de CI com rollback automático, ter o `vercel.json` anterior
  à mão permite reverter rápido com um novo `vercel deploy --prod` caso alguma regra
  nova quebre produção, sem precisar caçar no histórico do git sob pressão.
- Como esta story roda **primeiro** no epic, seu deploy em produção deve ser validado
  (AC1–AC6, especialmente "nenhuma referência quebrada") antes de qualquer uma das
  stories seguintes (90-1, 90-3a, 90-3b, 90-4) começar a editar os mesmos arquivos —
  evita que o @dev da próxima story trabalhe em cima de um nome de arquivo que ainda
  vai mudar.

## Dev Notes

- `vercel.json` atual (`landing-pages/trifold-design-system/vercel.json`) só tem
  `redirects`/`rewrites` para `/vindresidence` e `/yarden` hoje — precisa ganhar
  regras novas para: os 4 pares URL-limpa↔arquivo, a forma com/sem barra (AC2), as
  URLs antigas → novas (AC3), e `Home.dc.html` → `/` (AC5 — `destination` é sempre
  `/`, sem fragmento; o navegador reaplica `#contato` sozinho quando presente na
  URL de origem).
- Cuidado com a ordem de regras no `vercel.json`: `redirects` são avaliados antes de
  `rewrites` na Vercel — garantir que nenhum redirect entre em loop com o rewrite da
  URL nova, e que o AC6 (sem redirect encadeado) seja realmente verificado com
  `curl -IL` (que segue a cadeia de redirects e mostra cada hop).
- O arquivo físico `Sobre Nós.dc.html` tem espaço e acento no nome — isso é válido no
  sistema de arquivos, mas complica a regra de `rewrite` no `vercel.json` (que
  precisaria de URL-encoding exato no `destination`). Uma alternativa mais robusta:
  renomear o arquivo fisicamente para algo ASCII (ex.: `sobre-nos.dc.html`) e apontar
  o `rewrite` para o nome novo — evita depender de encoding correto em produção. Essa
  é uma decisão de implementação do @dev (ver "Fora de escopo" acima), não uma AC.
- Os 6 arquivos com nav completo (confirmado por grep, 2026-08-28): `Home.dc.html`,
  `Sobre Nós.dc.html`, `Empreendimentos.dc.html`, `B2B.dc.html`, `Blog.dc.html`,
  `Artigo.dc.html`. **A contagem de ocorrências por link NÃO é fixa** (correção da
  2ª validação @po) — não assumir "3 por arquivo" como número universal. Contagem
  real, reconferida por grep em 2026-08-28:

  | Arquivo | Sobre Nós / Empreend. / B2B / Blog | `Home.dc.html` | `Home.dc.html#contato` |
  |---|---|---|---|
  | Home | 3/3/3/3 | 0 | 0 |
  | Sobre Nós | 0/3/3/3 | 5 | 3 |
  | Empreendimentos | 3/0/3/3 | 5 | 3 |
  | B2B | 3/3/0/3 | 5 | 4 |
  | Blog | 3/3/3/0 | 5 | 3 |
  | Artigo | 3/3/3/2 | 5 | 3 |
  | Design System, Logo | 0/0/0/0 | 0 | 0 |

  Tratar esta tabela como referência, não como substituto do grep exaustivo por
  arquivo antes de fechar a story (mesmo método já usado no "Testing" abaixo) — o
  que importa é que nenhuma ocorrência sobre, não bater um número fixo.
- Cross-referência com a Story 90-2 (sitemap): como esta story (90-6) roda antes, o
  sitemap da 90-2 já deve nascer com as URLs limpas finais desta story.
- Cross-referência com a Story 90-4 (Open Graph): o `og:url` é a URL canônica de cada
  página — como a 90-4 roda depois desta no epic, ela já deve usar as URLs limpas
  finais, sem necessidade de retrabalho.

### Testing

- `curl -IL` em cada URL antiga e nova (a flag `-L` segue redirects e mostra a cadeia
  completa), validando os códigos de status (200 nas novas forma canônica, 301 nas
  antigas e na forma com barra, com `Location:` correto, sem cadeia de mais de 1 hop).
- Grep por `.dc.html` nos `href` dos 6 arquivos pós-mudança — nenhuma ocorrência das
  4 URLs antigas nem de `Home.dc.html` deve sobrar em link interno.
- Testar navegação real (Playwright) clicando em cada item do nav, desktop e mobile,
  em pelo menos 3 das 6 páginas, incluindo o CTA de Contato (`#contato`).
- **AC5, fragmento (`#contato`) — validar por Playwright, NÃO por `curl`:** fragmento
  não é enviado ao servidor, então nenhuma resposta HTTP o contém. Navegar (Playwright)
  até `.../Home.dc.html#contato`, seguir o redirect, e confirmar que a URL final no
  navegador é `.../#contato` e que a página rolou até a seção de contato — é o
  browser que reaplica o fragmento após o 301 para `/`, não o `vercel.json`.

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não está habilitado em `core-config.yaml` (chave
> `coderabbit_integration` ausente). Validação de qualidade usará processo de revisão
> manual pelo @qa (quality gate desta story).

## Tasks / Subtasks

- [x] **Task 1** — Copiar o `vercel.json` atual para o Dev Agent Record (rollback)
- [x] **Task 2** — Decidir e documentar a abordagem (renomear arquivo físico vs manter
      nome atual com rewrite URL-encoded) no Dev Agent Record
- [x] **Task 3 (AC1, AC2)** — Configurar os `rewrites`/regras das 4 URLs limpas,
      forma canônica sem barra
- [x] **Task 4 (AC2)** — Configurar o 301 da forma com barra → forma sem barra
- [x] **Task 5 (AC3)** — Configurar os 4 `redirects` (301) das URLs antigas
- [x] **Task 6 (AC5)** — Configurar o 301 de `Home.dc.html` → `/` (`destination` sempre `/`, sem fragmento — o navegador reaplica `#contato` sozinho)
- [x] **Task 7 (AC4, AC5)** — Atualizar todos os `href` de nav (desktop + mobile +
      rodapé) nos 6 arquivos para as novas URLs limpas e para `/`
- [x] **Task 8 (AC6)** — Testar `curl -IL` de todas as URLs antigas, novas e com/sem
      barra, confirmando ausência de cadeia de redirect
- [x] **Task 9** — Validar navegação completa com Playwright, incluindo o CTA de
      Contato

## Dev Agent Record

### Agent Model Used

`claude-opus-5[1m]` — @dev (Dex), modo YOLO autônomo, 2026-08-28.

### Task 1 — `vercel.json` anterior (ponto de rollback)

Conteúdo **exato** dos blocos `redirects`/`rewrites` antes desta story. O bloco
`headers` **não foi tocado** (permanece byte-a-byte igual ao anterior), então rollback
= restaurar apenas as duas listas abaixo por cima do arquivo atual. Cópia integral do
arquivo original também preservada em `git show HEAD:landing-pages/trifold-design-system/vercel.json`.

```json
{
  "redirects": [
    { "source": "/vindresidence", "destination": "/vindresidence/", "permanent": false },
    { "source": "/yarden", "destination": "/yarden/", "permanent": false }
  ],
  "rewrites": [
    { "source": "/", "destination": "/Home.dc.html" },
    { "source": "/vindresidence/", "destination": "https://vind-residence.vercel.app/" },
    { "source": "/vindresidence/:path*", "destination": "https://vind-residence.vercel.app/:path*" },
    { "source": "/yarden/", "destination": "https://yarden.vercel.app/" },
    { "source": "/yarden/:path*", "destination": "https://yarden.vercel.app/:path*" }
  ],
  "headers": [ /* inalterado */ ]
}
```

**Procedimento de rollback:** restaurar as duas listas acima, `vercel deploy --prod
--yes --scope trifold-s-projects` de dentro da pasta completa. Como o rename físico de
`Sobre Nós.dc.html` é parte da mudança, um rollback só do `vercel.json` deixaria
`/sobre-nos` em 404 — para rollback total, reverter também o rename (`git revert` do
commit desta story) e reconstruir a pasta de deploy.

### Task 2 — Decisão de abordagem (renomear vs rewrite URL-encoded)

**Decisão: renomear apenas `Sobre Nós.dc.html` → `sobre-nos.dc.html`.** Os outros três
arquivos (`Empreendimentos.dc.html`, `B2B.dc.html`, `Blog.dc.html`) e o `Home.dc.html`
**não** foram renomeados.

Justificativa — o rename é o remédio para um problema específico (espaço + acento no
nome, que torna o `destination` do rewrite dependente de URL-encoding exato), então foi
aplicado exatamente onde o problema existe. Renomear os outros três seria churn sem
efeito observável em nenhuma AC: nomes ASCII simples funcionam como `destination` de
rewrite sem qualquer encoding, e todo rename tem custo (histórico do git, README, e o
fluxo de re-export do canvas do Claude Design, que regeneraria os nomes originais).

Evidência que sustenta o rename (`vercel dev` local, projeto de teste isolado): um
`rewrite` com `destination` apontando para o arquivo acentuado devolveu **404 nas duas
formas de escrita** — `"/Sobre%20N%C3%B3s.dc.html"` (URL-encoded) e `"/Sobre Nós.dc.html"`
(literal). **Ressalva honesta:** o servidor estático do `vercel dev` também devolve 404
para `GET /Design%20System.dc.html`, que em produção responde **200** — ou seja, o
`vercel dev` tem uma limitação própria com nomes contendo espaço e essa evidência
específica **não prova** que o rewrite acentuado falharia em produção. O rename
permanece a decisão correta pelo argumento de robustez das próprias Dev Notes (não
depender de encoding em produção), não por essa medição.

`Artigo.dc.html` **não** foi renomeado (roteado por `?slug=`, fora de escopo) e
`Design System.dc.html` / `Logo.dc.html` também não (`Logo.dc.html` é carregado em
runtime pelo `support.js` via `<dc-import name="Logo">` — renomear quebraria o logo em
todas as páginas).

### Decisões autônomas fora do texto literal da story

- `[AUTO-DECISION]` **Usar `"statusCode": 301` em vez de `"permanent": true`** →
  medido no `vercel dev`: `"permanent": true` emite **308**, não 301. A AC3 pede 301
  explicitamente ("retornam **301** (não 302)"). `statusCode: 301` produz 301 real.
  As duas regras pré-existentes do Vind/Yarden ficaram com `"permanent": false` (307)
  como estavam — não foram tocadas.
- `[AUTO-DECISION]` **Adicionar uma 11ª regra não pedida por nenhuma AC:**
  `/sobre-nos.dc.html` → 301 `/sobre-nos`. Motivo: o rename da Task 2 **cria** uma URL
  pública nova (`/sobre-nos.dc.html`) que responderia 200 com o mesmo conteúdo de
  `/sobre-nos` — exatamente o tipo de duplicata que a AC5 trata como gap real. É a
  minha decisão de implementação que abriu esse buraco, então ela o fecha. Provado
  localmente que não gera loop com o rewrite `/sobre-nos` → `/sobre-nos.dc.html`.
- `[AUTO-DECISION]` **Atualizar o `README.md` do projeto** → o README documentava
  "rewrite de `/` → `/Home.dc.html`" como a única regra de roteamento do institucional
  e listava `Sobre Nós` entre os arquivos versionados. Deixar isso intacto publicaria
  documentação que promete um comportamento que deixou de existir.
- `[AUTO-DECISION]` **Não renomear `Home.dc.html`** → cogitei `Home.dc.html` →
  `index.html` para eliminar por construção qualquer chance de loop entre o rewrite
  `/` → `/Home.dc.html` e o redirect `/Home.dc.html` → `/`. Descartado depois de
  **medir** que o loop não existe (ver "Verificação"): a Vercel resolve o `destination`
  de um rewrite contra o filesystem sem reentrar na fase de `redirects`. Sem o risco,
  o rename perde a justificativa e vira escopo extra.

### Divergências encontradas em relação à tabela de contagem das Dev Notes

A tabela das Dev Notes conta **apenas ocorrências em `<a href="…">`**. O grep exaustivo
achou **2 links adicionais que a tabela não cobre**, ambos em CTA renderizado por
JavaScript (atributo `ctaHref` de um objeto de dados, aspas simples):

| Arquivo | Linha | Ocorrência | Virou |
|---|---|---|---|
| `Home.dc.html` | 341 | `ctaHref:'B2B.dc.html'` (CTA do card "Obras Corporativas") | `ctaHref:'/corporativas'` |
| `Empreendimentos.dc.html` | 160 | `ctaHref:'Home.dc.html#contato'` (CTA do card "Yarden") | `ctaHref:'/#contato'` |

Ambos são renderizados como `<a href="{{ e.ctaHref }}">`, ou seja, são links reais de
CTA — cobertos pela AC4 ("não depender do redirect 301 para navegação normal") e
explicitamente pela AC6 (que cita "CTAs"). Fora isso, a contagem por `href` bateu
exatamente com a tabela da story, incluindo a exceção do `Blog` 2× em `Artigo.dc.html`.

### Verificação executada

Todas as medições de roteamento abaixo são de **`vercel dev` 54.6.1 rodando local**
contra a pasta real do projeto (`localhost:3999`) — ver "Limitação da evidência".

**Task 8 — `curl -IL`, cadeia completa (todas de 1 hop, nenhuma encadeada):**

| Requisição | Status | `Location` | Hop final |
|---|---|---|---|
| `/` | 200 | — | — |
| `/sobre-nos` `/empreendimentos` `/corporativas` `/blog` | 200 | — | — |
| `/Sobre%20N%C3%B3s.dc.html` | **301** | `/sobre-nos` | 200 |
| `/Empreendimentos.dc.html` | **301** | `/empreendimentos` | 200 |
| `/B2B.dc.html` | **301** | `/corporativas` | 200 |
| `/Blog.dc.html` | **301** | `/blog` | 200 |
| `/Home.dc.html` | **301** | `/` (sem fragmento) | 200 |
| `/sobre-nos/` `/empreendimentos/` `/corporativas/` `/blog/` | **301** | forma sem barra | 200 |
| `/sobre-nos.dc.html` | **301** | `/sobre-nos` | 200 |

Conteúdo conferido por `<title>` em cada URL limpa: `/sobre-nos` → "Sobre Nós —
Trifold Engenharia", `/empreendimentos` → "Empreendimentos — …", `/corporativas` →
"Corporativas — …", `/blog` → "Blog — …", `/` → "Trifold Engenharia — Construtora e
Incorporadora em Maringá" (AC1).

Headers de segurança preservados nas URLs limpas (a regra catch-all
`/((?!vindresidence|yarden).*)` continua casando): `x-frame-options`,
`x-content-type-options`, `referrer-policy`, `permissions-policy` e a CSP.

Sem regressão nas rotas que já existiam: `/vindresidence` e `/yarden` → 307 para a
forma com barra → 200; `/Artigo.dc.html` → 200; `/Logo.dc.html` → 200;
`/api/contact` → 405 em `HEAD` (rota POST-only, como antes).

**Task 9 — Playwright, 34 asserções, 34 PASS / 0 FAIL** (Chromium desktop 1440×900 +
emulação iPhone 13):

- Clique em cada item de nav a partir de `/`, `/sobre-nos` e `/blog`, desktop **e**
  overlay de menu mobile — todos aterrissam na URL limpa correta, sem hop intermediário.
- CTA "Contato" a partir de `/sobre-nos` e `/blog`, desktop e mobile → `/#contato`.
- **AC5, fragmento:** navegação real até `/Home.dc.html#contato` → URL final na barra
  de endereço = `/#contato`, e a página **rolou até a seção** (`scrollY=3557`,
  `#contato` com `rect.top=138` no desktop; `scrollY=4707` no mobile). Confirma que o
  browser reaplica o fragmento sozinho após o 301 cujo `Location` é `/`.
- Baseline comparado contra **produção** (`https://trifold.eng.br/Home.dc.html#contato`,
  ainda com o código antigo): `scrollY=3557` / `rect.top=138` — **valores idênticos**,
  provando que o comportamento de rolagem não foi alterado por esta story.

**AC4/AC6 — crawl exaustivo dos links renderizados:** varredura das 6 páginas *após*
a renderização client-side do `support.js`, coletando todo `a[href]` do DOM e batendo
HTTP em cada um. **31 URLs internas distintas, 31 respondendo 200 em 0 hops** — inclui
os 24 `Artigo.dc.html?slug=…` (fora de escopo, continuam intactos), as 4 URLs limpas e
`/`. Zero 404, zero redirect encadeado.

**Grep exaustivo pós-mudança:** `0` ocorrências de `Sobre Nós.dc.html`,
`Empreendimentos.dc.html`, `B2B.dc.html`, `Blog.dc.html` ou `Home.dc.html` em qualquer
`*.dc.html`. Todos os `href` do site agora são: `/`, `/#contato`, `/sobre-nos`,
`/empreendimentos`, `/corporativas`, `/blog`, `#…` (âncoras), `assets/…`,
`Artigo.dc.html?slug=…` e o `wa.me` externo.

**Lint / typecheck:** `pnpm lint` → 0 erros (34 warnings pré-existentes em
`packages/web`, nenhum relacionado); `pnpm type-check` → passou. Ambos com cache hit
total — confirmando que o turbo **não cobre** `landing-pages/*` (os `package.json` de
lá não declaram task). Esta story não tocou em nenhum `.ts`/`.js`: só HTML, JSON e
Markdown. `vercel.json` validado com `JSON.parse`.

### Limitação da evidência (leitura obrigatória para o @qa)

Nenhuma das medições acima vem de produção — **`landing-pages/trifold-design-system`
não tem CI e não deploya por `git push`**, e deploy é operação exclusiva do @devops.
Toda a prova de roteamento é de `vercel dev` local, e este relatório já documenta **um
caso concreto em que `vercel dev` diverge de produção** (404 vs 200 em
`Design%20System.dc.html`). O gate real desta story é um `vercel deploy --prod` e a
re-execução do `curl -IL` e do Playwright contra `https://trifold.eng.br`.

Duas coisas para o @devops no momento do deploy:

1. A pasta de deploy é montada à mão. **Não copiar `Sobre Nós.dc.html` para dentro
   dela** — o arquivo foi renomeado. (Se sobrar, não quebra nada: o redirect roda antes
   do filesystem e `/Sobre%20N%C3%B3s.dc.html` continua 301. Mas seria lixo publicado.)
2. Validar em produção, no mínimo: `/`, as 4 URLs limpas, os 5 redirects 301 e
   `/Home.dc.html#contato` no navegador.

### Observações fora de escopo (para o backlog do epic 90)

- **`/Design%20System.dc.html` e `/Logo.dc.html` respondem 200 e são indexáveis.** São
  artefatos internos do template (o `Logo.dc.html` é carregado em runtime pelo
  `support.js` e **precisa** continuar acessível). Não é o achado T3 e não tem link
  interno apontando para eles, mas é conteúdo interno exposto ao crawler — candidato
  natural a `Disallow` na **Story 90-2** (robots/sitemap), não a redirect.
- **`Artigo.dc.html?slug=…` continua sem URL própria** — 24 artigos servidos por query
  string. Já registrado como Tier 4 no epic; nada mudou.
- **404s de `/{{ s.logoSrc }}` e `/{{ c.src }}`** aparecem no console de qualquer
  página. São placeholders de template que o browser tenta buscar antes da hidratação.
  **Pré-existentes e idênticos em produção** (medido no baseline) — nada a ver com esta
  story, mas vale um item de backlog.
- **O hamburger do menu mobile não tem `aria-label` nas páginas internas** (só a Home
  tem `aria-label="Abrir menu"`). Achado incidental do teste de navegação; gap de
  acessibilidade pré-existente.

### Protocolo IDS — decisões de reuso

| Artefato | Decisão | Justificativa |
|---|---|---|
| `vercel.json` | **REUSE/EXTEND** | Arquivo de roteamento já existente; regras novas apensadas às listas `redirects`/`rewrites`. Bloco `headers` intocado. Zero arquivo de config novo. |
| Páginas `.dc.html` | **ADAPT** | Substituição literal de `href`/`ctaHref` nos 6 arquivos que já existiam. Nenhuma página criada. |
| `sobre-nos.dc.html` | **ADAPT (rename)** | `git mv` de `Sobre Nós.dc.html` — mesmo conteúdo, histórico preservado. Não é arquivo novo. |
| `README.md` | **REUSE/EXTEND** | Seção "O que o `vercel.json` faz" estendida no lugar de criar doc separada. |
| Scripts de teste (Playwright/crawl) | **CREATE (efêmero)** | Escritos no scratchpad da sessão, **fora do repositório**. Este projeto não tem suíte de testes nem CI (ver "Limitação da evidência"); adicionar harness permanente para um projeto sem runner seria dívida, não cobertura. |

### File List

**Modificados**

- `landing-pages/trifold-design-system/vercel.json` — +10 regras em `redirects` (todas
  `statusCode: 301`) e +4 em `rewrites`; bloco `headers` intocado
- `landing-pages/trifold-design-system/Home.dc.html` — 12 `href` + 1 `ctaHref`
- `landing-pages/trifold-design-system/Empreendimentos.dc.html` — 17 `href` + 1 `ctaHref`
- `landing-pages/trifold-design-system/B2B.dc.html` — 18 `href`
- `landing-pages/trifold-design-system/Blog.dc.html` — 17 `href`
- `landing-pages/trifold-design-system/Artigo.dc.html` — 19 `href`
- `landing-pages/trifold-design-system/README.md` — seção "O que o `vercel.json` faz"

**Renomeado**

- `landing-pages/trifold-design-system/Sobre Nós.dc.html` →
  `landing-pages/trifold-design-system/sobre-nos.dc.html` (17 `href` atualizados no
  mesmo commit)

**Não modificados (confirmado por grep — 0 referência às URLs antigas)**

- `landing-pages/trifold-design-system/Design System.dc.html`
- `landing-pages/trifold-design-system/Logo.dc.html`
- `landing-pages/trifold-design-system/support.js`
- `landing-pages/trifold-design-system/api/contact.js`

### Completion Notes

- AC1 ✅ · AC2 ✅ · AC3 ✅ · AC4 ✅ · AC5 ✅ · AC6 ✅ — todas verificadas, **porém
  todas contra `vercel dev` local**. Nenhuma AC pode ser considerada fechada em
  produção antes do deploy manual do @devops (ver "Limitação da evidência").
- **Nada foi commitado.** A branch ativa durante a implementação era
  `feat/86-12-pixel-capi-landing-yarden` — branch de **outra** story (86-12). Commitar
  a 90-6 ali misturaria dois escopos num PR só, então as mudanças foram deixadas na
  árvore de trabalho para o @devops criar a branch correta (`feat/90-6-…`) a partir de
  `main` e commitar. `git push`, PR e `vercel deploy` seguem exclusivos do @devops.
- Arquivos alterados na árvore de trabalho (`git status --short`): 6 `.dc.html`
  modificados, 1 renomeado (`R` de `Sobre Nós.dc.html`), `vercel.json` e `README.md`.
  Nenhum arquivo fora de `landing-pages/trifold-design-system/` foi tocado, além desta
  própria story.
- **Efeito colateral desta sessão, já revertido:** rodar `vercel dev --yes` num
  diretório de scratch criou por engano um projeto Vercel vazio chamado `routetest` na
  org `trifold-s-projects`. Removido em seguida com `vercel project rm routetest`
  (`vercel project ls` confirma 0 ocorrências). Nenhum deployment chegou a existir e
  nenhum projeto real foi tocado. Registrado aqui para auditoria do @devops.

## Change Log

| Date | Version | Description | Author |
|------|---------|--------------|--------|
| 2026-08-28 | 0.1 | Story criada a partir do achado T3 do relatório de auditoria de SEO de 2026-08-28. | @sm (River) |
| 2026-08-28 | 0.2 | NO-GO do @po (4/10) corrigido: contagem de arquivos corrigida para 6 (não 8, incluindo Artigo.dc.html); contagem de ocorrências por link corrigida para 3× (não 2×); Home.dc.html incluído no escopo (AC5, normalização para `/` com 301, preservando `#contato`); forma canônica de trailing slash definida (AC2, sem barra); nota de rollback do vercel.json adicionada; story marcada para rodar primeiro no epic (sequenciamento). | @sm (River) |
| 2026-08-28 | 0.3 | Must-fix da 2ª validação @po: AC5 corrigida — fragmento (`#contato`) nunca é enviado ao servidor, então o `destination` do redirect é sempre `/` (nunca `/#contato`); verificação do fragmento passa a ser por Playwright, não `curl`. Should-fix: Dev Notes trocou a afirmação de "3 ocorrências fixas" por tabela de contagem real por arquivo (reconferida pelo @po) + instrução de grep exaustivo. Status → `Ready`. | @sm (River) |
| 2026-08-28 | 1.0 | Implementada por @dev. `Sobre Nós.dc.html` renomeado para `sobre-nos.dc.html`; 10 `redirects` e 4 `rewrites` novos no `vercel.json` (`statusCode: 301`, porque `permanent: true` na Vercel emite 308); links de nav/rodapé/CTA atualizados nos 6 arquivos. 2 CTAs em JavaScript (`ctaHref`) fora da tabela de contagem das Dev Notes foram encontrados e corrigidos. Verificado com `curl -IL`, crawl de 31 links e 34 asserções Playwright — **tudo contra `vercel dev` local**; prova em produção depende do deploy manual do @devops. Status → `Ready for Review`. | @dev (Dex) |

## QA Results

**Gate:** `CONCERNS` · **Reviewer:** @qa (Quinn) · **Data:** 2026-08-28
**Arquivo do gate:** `docs/qa/gates/90.6-urls-limpas-redirect-301.yml`
**Readiness:** 8/10 · **Nada volta para o @dev.** Liberada para @devops.

### Método

Toda a evidência abaixo foi **re-executada pelo @qa**, não lida do Dev Agent Record.
Ambiente: `vercel dev 54.6.1` em `localhost:3998` contra a pasta real, mais medições
diretas contra `https://trifold.eng.br` onde a produção atual permitia contraprova.

### Rastreabilidade das ACs

| AC | Veredito | Evidência produzida pelo @qa |
|---|---|---|
| AC1 | PASS | `/`, `/sobre-nos`, `/empreendimentos`, `/corporativas`, `/blog` → **200 em 0 hops**. `<title>` conferido em cada uma (Sobre Nós / Empreendimentos / Corporativas / Blog / Home). |
| AC2 | PASS | As 4 formas com barra → **301, 1 hop**, para a forma canônica sem barra. |
| AC3 | PASS | `/Sobre%20N%C3%B3s.dc.html`, `/Empreendimentos.dc.html`, `/B2B.dc.html`, `/Blog.dc.html` → **301, 1 hop**, destino correto. |
| AC4 | PASS | Balanço de grep 1:1 exato nos 6 arquivos (ver abaixo) + crawl de 32 links no DOM pós-render, **32/32 em 200, 0 hops**. |
| AC5 | PASS | 10/10 asserções Playwright, desktop + iPhone 13 (ver abaixo). |
| AC6 | PASS | Zero 404, zero redirect encadeado no crawl. Sem regressão em `/vindresidence`, `/yarden`, `/Logo.dc.html`, `/Artigo.dc.html?slug=`, `/support.js`, `/assets/*`. |

### AC5 — reconferência específica do fragmento (item corrigido em 3 rodadas do @po)

A implementação final está **correta**: `{ "source": "/Home.dc.html", "destination": "/", "statusCode": 301 }`
— sem fragmento no `destination`, como o @po exigiu. Verificado nos dois sentidos:

| Caso | Resultado |
|---|---|
| `/Home.dc.html#contato` (desktop) | URL final `/#contato`, `scrollY=3557`, `rect.top=138`, 1 hop — PASS |
| `/Home.dc.html#contato` (mobile) | URL final `/#contato`, `scrollY=4707`, `rect.top=233`, 1 hop — PASS |
| **`/Home.dc.html` SEM fragmento** (desktop) | URL final `/`, **`scrollY=0`** — PASS |
| **`/Home.dc.html` SEM fragmento** (mobile) | URL final `/`, **`scrollY=0`** — PASS |

Os dois últimos são o **caso negativo** que justificou a correção do @po: se o `destination`
fosse `"/#contato"`, todo visitante de `/Home.dc.html` seria arrastado para a seção de contato.
`scrollY=0` prova que isso não acontece. Nenhum `destination` do `vercel.json` contém `#`.

### 11ª regra (`/sobre-nos.dc.html` → `/sobre-nos`) — correta e sem lacuna irmã

- `/sobre-nos.dc.html` → **301 em 1 hop** para `/sobre-nos`. Fecha o buraco que o próprio rename abriu.
- `/Sobre%20N%C3%B3s.dc.html` → **301 direto para `/sobre-nos`**, não em 2 hops via `/sobre-nos.dc.html`.
- Nenhuma combinação irmã ficou de fora: os outros 3 arquivos não foram renomeados, então não criaram
  URL pública nova. Variantes de caixa (`/BLOG`, `/b2b.dc.html`), URLs antigas com barra final
  (`/B2B.dc.html/`) e `/Sobre%20Nós.dc.html` respondem 404 — sem conteúdo duplicado servindo 200.
- **Sem loop:** o rewrite `/` → `/Home.dc.html` convivendo com o redirect `/Home.dc.html` → `/` foi
  medido, não assumido: `/` responde 200. Mesma lógica vale para os 4 pares URL-limpa↔`.dc.html`.

### AC4 — balanço de substituição (grep próprio, todos os 6 arquivos)

| Removido | Qtd | Adicionado | Qtd |
|---|---|---|---|
| `Home.dc.html` | 25 | `/` | 25 |
| `Home.dc.html#contato` | 17 | `/#contato` | 17 |
| `B2B.dc.html` | 16 | `/corporativas` | 16 |
| `Sobre Nós.dc.html` | 15 | `/sobre-nos` | 15 |
| `Empreendimentos.dc.html` | 15 | `/empreendimentos` | 15 |
| `Blog.dc.html` | 14 | `/blog` | 14 |

**102 substituições (100 `href` + 2 `ctaHref`), 1:1, sem sobra e sem excesso** — bate exatamente
com o File List. `0` ocorrências das URLs antigas em qualquer `*.dc.html`.

### Verificações estruturais adicionais

- **`vercel.json` íntegro:** bloco `headers` idêntico ao HEAD; regras de `vindresidence`/`yarden` e o
  rewrite `/` → `/Home.dc.html` idênticos; +10 `redirects`, +4 `rewrites`; JSON válido.
- **Segurança:** os 10 redirects novos têm `source` e `destination` **literais estáticos** — nenhuma
  captura (`:path*`) ou wildcard, logo sem risco de open redirect. `x-frame-options`,
  `x-content-type-options`, `referrer-policy` e a CSP confirmados nas URLs limpas.
- **Sem deriva na pasta de deploy manual:** `sha256` de `Home`/`B2B`/`Blog`/`Empreendimentos`/
  `Sobre Nós`/`Artigo.dc.html` e `support.js` — **produção no ar == baseline git HEAD em todos**.
  Isso valida que o `git diff` é representação fiel do que mudará em produção.
- **Lint/typecheck:** não aplicáveis — a story tocou apenas `.html`, `.json` e `.md` (confirmado por
  `git diff --name-only`). Nenhum `.ts`/`.js` alterado.

### Concerns registrados (nenhum bloqueia o deploy)

| ID | Sev | Resumo |
|---|---|---|
| QA-1 | medium | ACs são escritas contra `https://trifold.eng.br` e produção ainda responde 404 em `/sobre-nos`. Limitação estrutural (sem CI), não defeito. |
| QA-2 | medium | **2ª divergência `vercel dev` × produção, encontrada no gate.** Ver abaixo. |
| QA-3 | medium | Deploy da 90-6 publica junto o roteamento/CSP da 86-12 (produção está com `vercel.json` anterior à 86-12: `/yarden` → 404 hoje). |
| QA-4 | low | 6 stories downstream do épico ainda citam `Sobre Nós.dc.html`; a 90-3a manda editar "o arquivo com o nome atual". @sm/@po. |
| QA-5 | low | Nenhuma suíte permanente para 12 redirects + 9 rewrites, com 7 stories do épico ainda por vir. |
| QA-6 | low | Resíduo da 86-12 no README (`/((?!vindresidence).*)` vs `|yarden` real). |
| QA-7 | low | `assets/…` e `./support.js` são relativos — URLs limpas só funcionam por serem de 1 segmento. |

### QA-2 em detalhe — a divergência corre nos dois sentidos

O @dev documentou honestamente um caso de `vercel dev` ≠ produção (`/Design%20System.dc.html`:
404 local, 200 em produção). **Reproduzi os dois lados e encontrei um segundo caso, oposto:**

- `vercel dev` **descarta a query string** no 301: `/B2B.dc.html?utm_source=meta` devolve
  `Location: /corporativas`, sem query.
- **Produção preserva.** Contraprova na regra pré-existente e intocada do Vind, medida no ar hoje:
  `https://trifold.eng.br/vindresidence?fbclid=TESTE123&utm_source=qa` →
  `location: /vindresidence/?fbclid=TESTE123&utm_source=qa`.

Ou seja: aqui a evidência local **subestima** a corretude de produção. Registrado porque a diferença
importa (`utm_*`/`fbclid` em URLs antigas que hoje respondem 200 passarão a passar por 301) e porque
confirma que a suíte local não serve de gate em nenhuma das duas direções.

### Para o @devops

1. Criar `feat/90-6-urls-limpas` **a partir de `main`** (`main` == `HEAD` para `landing-pages/`,
   verificado). O rename já está **staged** no índice como `R100`; as demais mudanças estão só na
   working tree. Branch atual (`feat/86-12-…`) é de outra story.
2. Não copiar `Sobre Nós.dc.html` para a pasta de deploy — foi renomeado.
3. Ciente de QA-3: este deploy publica junto a 86-12. Incluir `/yarden/` e `/vindresidence/` no smoke.
4. **Smoke test obrigatório pós-`vercel deploy --prod`,** contra `https://trifold.eng.br`:
   - `curl -IL` em `/`, `/sobre-nos`, `/empreendimentos`, `/corporativas`, `/blog` → 200
   - `curl -IL` em `/Sobre%20N%C3%B3s.dc.html`, `/Empreendimentos.dc.html`, `/B2B.dc.html`,
     `/Blog.dc.html`, `/Home.dc.html`, `/sobre-nos.dc.html` → **301, 1 hop**
   - `curl -sI 'https://trifold.eng.br/B2B.dc.html?utm_source=qa&fbclid=X'` → query **deve** aparecer
     no `Location` (QA-2). Se não aparecer, é bug real de atribuição e volta para o @dev.
   - navegador em `/Home.dc.html#contato` → barra de endereço em `/#contato`, página rolada
   - `/vindresidence/` e `/yarden/` → 200 (QA-3)
5. **Status recomendado: `InReview`, não `Done`.** As AC1/AC3/AC5 nomeiam produção; só após o smoke
   acima a story pode ir para `Done` — transição do @devops, conforme `story-lifecycle.md`.
