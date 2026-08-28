# Landing Page — Yarden

Landing standalone (HTML/CSS/JS puro, sem build) do empreendimento Yarden.
Projeto Vercel `yarden`, servido em produção sob `https://trifold.eng.br/yarden/`
via rewrite do projeto `trifold-design-system`.

> **Status do conteúdo:** placeholder. Copy, imagens e seções de marketing são
> dependência externa (Story 86-12 AC12) e ainda não foram fornecidas. O que já
> está pronto e testado é a **infraestrutura**: formulário de captação funcional
> + Pixel Meta + CAPI com deduplicação browser↔servidor.

A landing WordPress antiga (`trifold.eng.br/y/`) não existe mais — retorna 404.
Esta é uma landing nova, não uma migração.

## Estrutura

```
yarden/
├── index.html               # página completa (CSS + JS inline)
├── api/lead.js              # proxy do lead → POST /api/webhooks/landing-page do CRM
├── api/track.js             # proxy dos eventos de topo de funil → .../landing-page/track
├── api-proxy.test.ts        # testes dos dois proxies (fora de api/ de propósito)
├── tracking-browser.test.ts # testes do tracking do browser + contrato do index.html
└── README.md
```

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
| `tracking-browser.test.ts` | contrato estático do `index.html` (ids dos campos, endpoints, live region, guarda de duplo submit) + helpers do browser: `visitor_id`, `fbc`/`fbp`/`fbclid`, degradação graciosa |

Os dois ficam fora de `api/` de propósito — tudo dentro de `api/` vira função
serverless no deploy.

## Integrar o conteúdo definitivo

Quando a copy/design chegar:

0. **Remova o `<meta name="robots" content="noindex, nofollow">`** do `<head>`.
   Ele existe só para o placeholder não ser indexado; esquecê-lo mantém a
   landing definitiva fora do Google (não afeta tráfego pago).
1. Substitua as seções de placeholder do `<main>` e o bloco `:root` do `<style>`.
2. **Preserve os `id` dos campos** usados pelo tracking: `nome`, `whats`,
   `email`, `empresa` (honeypot), `leadForm`, `formMsg`. Se algum mudar,
   atualize o `<script>` do fim da página no mesmo commit.
3. **Não recrie o Pixel/CAPI.** O bloco do `<head>` e o handler de `submit` já
   estão corretos e validados.
4. Não reintroduza `console.log` do corpo/resposta do envio de lead — imprimiria
   `fbc`/`fbp` no console do browser (defeito `86.11-QA-005`).
5. Se o conteúdo introduzir uma segunda etapa real (ex.: agendamento),
   `CompleteRegistration` deve passar a disparar nela, e não junto com `Lead`.

## Deploy

Publicação manual, de dentro deste diretório:

```bash
vercel deploy --prod --yes --scope trifold-s-projects
```

Ordem quando as três peças mudam junto: (1) `packages/web`, (2) este projeto,
(3) `landing-pages/trifold-design-system` (CSP). Sem (3) o Pixel fica bloqueado
mesmo com (2) no ar.
