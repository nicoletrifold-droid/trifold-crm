# Landing Page — Yarden

Landing standalone (HTML/CSS/JS puro, sem build) do empreendimento Yarden.
Destino **planejado**: projeto Vercel `yarden`, servido sob
`https://trifold.eng.br/yarden/` via rewrite do projeto `trifold-design-system`.

> **Ainda não está no ar.** O projeto Vercel e o deploy real são as tarefas
> T12/T13 da Story 86-12, pendentes — hoje `https://trifold.eng.br/yarden/`
> não serve esta landing. Tudo abaixo descreve a configuração pretendida.

> **Status do conteúdo:** definitivo. Copy, cores e imagens do Hero e das 3
> seções originais vêm do mockup "Yarden LP v1" fornecido pelo stakeholder
> (Story 86-12 AC12 — conteúdo é dependência externa, nada aqui é inventado);
> esses arquivos de `assets/` são recortes desse mesmo mockup. A página é
> indexável (não há `noindex`).
> A **infraestrutura** por baixo é a mesma desde o início: formulário de captação
> + Pixel Meta + CAPI com deduplicação browser↔servidor.

> **Story 86-13 — seções institucionais.** A página ganhou 6 seções novas
> (header/nav fixo, "O Empreendimento" com 6 números, "Lazer" com 6 chips,
> Galeria de 9 fotos com lightbox, banda CTA e "Sobre a Trifold") e a seção
> "Invista no novo centro urbano de Maringá" foi redesenhada como a seção de
> Localização (`#localizacao`), com endereço, link do Google Maps e os 5 pontos
> de referência como texto visível. **Zero tracking novo:** os 3 blocos
> `<script>` da 86-12 e os 3 `<form>` seguem byte a byte iguais.
> As fontes de conteúdo, todas externas: os números vêm da **Ficha Técnica
> oficial** (`9-YAR FICHA TÉCNICA.pdf`), os chips são itens literais da mesma
> Ficha, as 10 imagens novas são do **book de renders oficial** e o texto de
> "Sobre a Trifold" é reuso verbatim da landing do Vind Residence (mesma
> empresa, mesmo prédio).

A landing WordPress antiga (`trifold.eng.br/y/`) não existe mais — retorna 404.
Esta é uma landing nova, não uma migração.

## Estrutura

```
yarden/
├── index.html                     # página completa (CSS + JS inline)
├── assets/                        # 35 arquivos: 16 imagens (jpg + webp cada) + 2 logos SVG + 1 PDF
├── api/lead.js                    # proxy do lead → POST /api/webhooks/landing-page do CRM
├── api/track.js                   # proxy dos eventos de topo de funil → .../landing-page/track
├── api-proxy.test.ts              # testes dos dois proxies (fora de api/ de propósito)
├── tracking-browser.test.ts       # testes do tracking do browser + contrato do index.html
├── secoes-institucionais.test.ts  # conteúdo travado das 6 seções da 86-13 + âncoras do nav
└── README.md
```

As 16 imagens, por origem:

| Grupo | Arquivos | Origem |
|---|---|---|
| Hero, natureza, mapa, família | `hero-piscina-rooftop{,-mobile}`, `interior-lounge-gourmet`, `mapa-gleba-itororo`, `familia-quer-saber-mais` | recortes do mockup "Yarden LP v1" (86-12) |
| Galeria | `galeria-01` … `galeria-09` | book de renders oficial (86-13) |
| Fundo da seção Lazer | `lazer-terreo` | book de renders oficial (86-13) |
| Sede da Trifold | `trifold-fachada` | cópia do projeto `vind-residence` — mesmo prédio, mesma empresa (86-13 AC8) |

`galeria-05` faz dupla função: além do slot largo da Galeria, é o
`background-image` da banda CTA. Foi escolhida por contraste (é a de menor
luminância média das 9) **e** porque reaproveitar uma foto já referenciada por
atributo é o que impede um asset órfão — ver o item 2 de "Alterar o conteúdo
depois".

## Como visualizar

```bash
cd landing-pages/yarden
python3 -m http.server 8080
# http://localhost:8080
```

As funções `api/*` não rodam no `http.server` — o formulário só chega ao CRM em
um deployment da Vercel (ou via `vercel dev`).

## Integração com o CRM

O formulário envia para `CONFIG.leadEndpoint` (POST JSON) → `api/lead.js` (proxy,
guarda o token fora do browser) → `POST /api/webhooks/landing-page` no
trifold-crm, que cria o lead. O CRM é o mesmo do Vind Residence; nenhuma env nova
foi criada lá.

Envs necessárias **neste** projeto Vercel:

| Env | Valor |
|---|---|
| `LANDING_PAGE_WEBHOOK_SECRET` | o **mesmo** valor já usado pelo projeto `vind-residence` |

## Tracking Meta — Pixel + CAPI (Story 86-12)

Dataset/Pixel `1337310707164669` (conta "TRIFOLD - VIND") — o **mesmo** do Vind
Residence, por decisão do stakeholder. A separação entre os empreendimentos é
feita por `content_category` (`landing_yarden` vs `landing_vind_residence`), no
servidor.

| Onde | O quê |
|---|---|
| `index.html` `<head>` | Pixel base code + helpers vanilla de `visitor_id`, `fbc`/`fbp`/`fbclid`; dispara `PageView` (só browser) e `ViewContent` (browser + servidor) |
| `index.html` fim da página | `InitiateCheckout` no primeiro `focus` em `#nome`/`#whats`; no envio do form, gera dois `event_id` e dispara `Lead` + `CompleteRegistration` no Pixel quando o proxy confirma sucesso |
| `api/track.js` | Proxy de `ViewContent`/`InitiateCheckout` → `POST /api/webhooks/landing-page/track` |
| `api/lead.js` | Além do lead, repassa o bloco `tracking` e **preenche `client_ip`/`client_ua`** com os headers que só ele enxerga |

Pontos que não podem regredir:

- **`landing: "yarden"` é constante dos proxies, nunca lido do browser.** É esse
  slug que o CRM resolve em `resolveLandingConfig`
  (`packages/web/src/lib/meta/landing-page-tracking.ts`) para
  `content_category: "landing_yarden"`. Se o browser pudesse ditá-lo, qualquer
  chamador com o token gravaria eventos sob a categoria de outro empreendimento.
  Slug desconhecido cai no default `vind_residence` — silenciosamente, de
  propósito (nunca quebrar o lead), o que torna o campo fácil de errar sem
  perceber: há teste dedicado para isso.
- **`page: "yarden"` em `api/lead.js` não é campo Meta.** O CRM o persiste em
  `webhook_logs.payload.page`, `leads.metadata.landing_page`,
  `leads.metadata.page` e na descrição da activity. Deixá-lo como
  `"vind-residence"` num clone rotularia todo lead do Yarden como Vind Residence
  no próprio CRM, sem nenhum teste de CAPI acusar.
- **IP e UA do visitante vêm dos headers do PROXY, nunca do CRM.** O CRM é
  chamado servidor-a-servidor e só veria o IP do datacenter da Vercel. Por isso
  os dois viajam no corpo, e o CRM dá precedência ao corpo sobre os próprios
  headers.
- **`TRACK_ENDPOINT` (no `<head>`) e `CONFIG.leadEndpoint` (no fim) apontam para
  o mesmo projeto Vercel.** Ao trocar o domínio, atualizar os dois.
- **O token do CRM vai no header `Authorization: Bearer`, nunca em `?token=`.**
  Query string é gravada em texto puro nos logs de plataforma/proxy (Vercel, CDN,
  observabilidade), o que vazaria o `LANDING_PAGE_WEBHOOK_SECRET` para quem tiver
  acesso a log. As duas rotas do CRM aceitam as duas formas, com precedência do
  Bearer — o `?token=` só existe por compatibilidade com o tráfego WordPress.
- **A CSP vive em outro projeto** (`landing-pages/trifold-design-system/vercel.json`,
  que serve `trifold.eng.br/yarden/`). Sem `connect.facebook.net` em
  `script-src`, `www.facebook.com` em `img-src` e ambos em `connect-src`, o Pixel
  é bloqueado em silêncio — inclusive pelo bloco catch-all, que precisa excluir
  `yarden` do regex. O Pixel **não** precisa de `'unsafe-eval'`: os blocos
  `/yarden*` não o concedem, e reintroduzi-lo só amplia a superfície de XSS.
- Nada de tracking pode derrubar o formulário: bloqueador de anúncios,
  `localStorage` bloqueado ou `/api/track` fora do ar são estados normais.

Testes (rodam com `pnpm vitest run` na raiz do repo):

| Arquivo | Cobre |
|---|---|
| `api-proxy.test.ts` | os dois proxies serverless: identidade da landing (`page`/`landing`), repasse de `client_ip`/`client_ua`, honeypot, CORS, autenticação no CRM |
| `tracking-browser.test.ts` | contrato estático do `index.html` (ids dos campos, endpoints, live region, guarda de duplo submit, integridade de `assets/`) + helpers do browser: `visitor_id`, `fbc`/`fbp`/`fbclid`, degradação graciosa |
| `secoes-institucionais.test.ts` | conteúdo travado por decisão do stakeholder (os 6 números, os 6 chips, o texto verbatim de "Sobre a Trifold", o link oficial do Maps, os 5 pontos de referência), âncoras do nav que existem de fato, proporção da imagem por slot da galeria (lida do JPEG no disco), e as proibições: nada de preço, nada de depoimentos, nada de hex/fonte/logo novos |

Os dois ficam fora de `api/` de propósito — tudo dentro de `api/` vira função
serverless no deploy.

## Alterar o conteúdo depois

A página tem **três** marcações de formulário, uma única lógica:

| `<form>` | Onde | Mensagem |
|---|---|---|
| `leadForm` | hero, sobreposto à foto (desktop) | `formMsg` |
| `leadFormMobile` | hero, em fluxo (mobile) | `formMsgMobile` |
| `leadFormSaber` | seção "Quer saber mais?" | `formMsgSaber` |

Só uma marcação do hero fica visível por media query — as duas existem porque o
layout do mockup difere entre desktop e mobile, não porque a lógica difere.
`ligarFormulario()` é chamada uma vez por formulário e é isso que dá a cada um
**honeypot próprio**, **trava de duplo envio própria** (no closure) e **par de
`event_id` próprio por submissão**. Compartilhar qualquer um dos três misturaria
formulários distintos num só veredito.

Ao mexer no conteúdo:

1. **Preserve os `id` dos campos** de cada formulário: `nome`/`whats`/`email`/
   `empresa` (honeypot) no hero desktop, com sufixo `Mobile` e `Saber` nos
   outros. Se algum mudar, atualize `FORMULARIOS` e a lista de `InitiateCheckout`
   no `<script>` do fim da página, no mesmo commit.
2. **Todo arquivo de `assets/` tem que ser referenciado pelo HTML, e toda
   referência tem que existir no disco.** Não há build para resolver caminho: um
   `srcset` errado é 404 silencioso em produção. Há teste que confere os dois
   sentidos, incluindo asset órfão (sobra de clone).
3. **Não recrie o Pixel/CAPI.** O bloco do `<head>` e o handler de `submit` já
   estão corretos e validados.
4. Não reintroduza `console.log` do corpo/resposta do envio de lead — imprimiria
   `fbc`/`fbp` no console do browser (defeito `86.11-QA-005`).
5. Se o conteúdo introduzir uma segunda etapa real (ex.: agendamento),
   `CompleteRegistration` deve passar a disparar nela, e não junto com `Lead`.
6. Não reintroduza `<meta name="robots" content="noindex">`: existia só enquanto
   o conteúdo era placeholder e manteria a landing definitiva fora do Google.
7. **Os números de "O Empreendimento" e os chips de "Lazer" são curadoria
   travada** (Story 86-13, decisões D1/D2 do stakeholder), com cada item
   rastreável à Ficha Técnica. Em especial: **não existe stat de preço/entrada**
   — a Ficha não traz o dado em nenhuma das 7 páginas, e o `R$65mil` da landing
   do Vind Residence é de outro empreendimento. Há teste que reprova os dois
   desvios.
8. **A galeria tem proporção por slot.** Dos renders do book, 12 são quadrados
   (4000×4000) e o resto é paisagem 4000×1818. Os 2 slots `.g-wide` só aceitam
   paisagem — um quadrado ali perde ~55% da altura no recorte e o ambiente fica
   irreconhecível. O `.g-tall` é o inverso (nenhum render é retrato, então o
   quadrado é o que perde menos). O teste lê a proporção **do arquivo**, não do
   atributo `width`/`height`. No grid de 2 colunas o `.g-wide` volta a 1 coluna:
   com `span 2` o auto-placement deixa uma célula vazia no canto (a landing do
   Vind Residence tem esse buraco em produção).
9. **Toda âncora do nav precisa de um `id` de destino.** `href="#lazer"` sem
   `id="lazer"` não gera erro nenhum — o clique só não sai do lugar. E o header
   é `position:fixed`: quem adicionar seção nova herda o
   `html{scroll-padding-top}`, que é o que impede a âncora de parar com o topo
   da seção escondido atrás do header.

## Deploy

Publicação manual, de dentro deste diretório:

```bash
vercel deploy --prod --yes --scope trifold-s-projects
```

Ordem quando as três peças mudam junto: (1) `packages/web`, (2) este projeto,
(3) `landing-pages/trifold-design-system` (CSP). Sem (3) o Pixel fica bloqueado
mesmo com (2) no ar.
