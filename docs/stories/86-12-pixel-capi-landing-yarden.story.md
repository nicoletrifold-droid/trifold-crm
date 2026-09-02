# Story 86-12 — Pixel Meta + CAPI na landing do Yarden (landing nova, sem tracking nem conteúdo hoje)

**Status:** InReview (QA PASS — liberado para @devops; `Done` após T12/T13/AC13)
**Epic:** 86 — Conversions API (CAPI) e Rastreamento Meta
**Executor:** @dev (Dex)
**Quality Gate:** @qa (Quinn) — `*qa-gate` ao fim da implementação
**Prioridade:** P2 (não há tráfego pago ativo apontando para esta URL hoje — confirmado com o stakeholder, lucas@trifold.eng.br, em 2026-08-26, sem urgência de campanha)
**Estimativa:** 6 pontos (M) — menor que a 86-11 porque os módulos server-side e a rota `/track` já existem e são reusados sem criar nada novo no lado CRM; o ponto novo de complexidade é o discriminador multi-landing (AC5) e um projeto Vercel que ainda não existe
**Depende de:** 86-1 (credenciais CAPI, já em produção — nenhuma nova env no `trifold-crm`), 86-3 (módulo `packages/shared/src/meta/*`), **86-11** (Done — é a story-irmã cujos módulos server-side esta story reusa quase sem alteração)
**Decisões de negócio — TRAVADAS pelo stakeholder (lucas@trifold.eng.br) em 2026-08-26, na validação @po. Não reabrir:**
1. **Dataset/Pixel Meta = `1337310707164669`** (conta "TRIFOLD - VIND") — o **mesmo** já usado pelo Vind Residence. **NÃO** criar dataset/Pixel próprio do Yarden. A segmentação por empreendimento é feita por `content_category` (`landing_yarden` vs `landing_vind_residence`, AC5), não por dataset. Ver AC1.
2. **Nome do projeto Vercel = `yarden`**, URL de deployment `https://yarden.vercel.app` (análogo a `vind-residence` / `vind-residence.vercel.app`). Não é mais placeholder — é o valor definitivo a usar em `ALLOWED_ORIGINS` (AC8), nos `rewrites` da CSP (AC9) e nos endpoints do `index.html` (AC12). Ver "Pré-requisito de infraestrutura".

**Nenhum bloqueio de decisão restante.** A única dependência externa aberta é o conteúdo/copy definitivo da página (AC12), que **não bloqueia** esta story — o placeholder estrutural é o entregável.
**Não confundir com:** a landing WordPress antiga do Yarden (`trifold.eng.br/y/`) — verificado por `curl` em 2026-08-26, retorna **404** em produção. Não existe mais, não há nada para migrar dela, e não há tráfego pago apontando para lá hoje. Esta story constrói uma landing nova do zero no padrão pós-WordPress, não uma migração.

## Contexto — por que esta story existe

`trifold.eng.br` migrou de WordPress para o projeto Vercel `trifold-design-system`
(confirmado nas Stories 86-9/86-11). A landing antiga do empreendimento Yarden,
que vivia em `/y/` sob o WordPress, não sobreviveu à migração — hoje é 404. O
usuário decidiu reconstruir essa landing como um projeto novo, standalone, no
mesmo padrão já validado e **Done** da Story 86-11 (Vind Residence), em vez de
reviver o WordPress. A URL final definida pelo usuário é
**`trifold.eng.br/yarden/`** — nome completo do empreendimento, mesmo padrão de
`/vindresidence/` (não `/y/`, a URL curta antiga).

Esta é a segunda landing standalone do CRM instrumentada com Pixel + CAPI. A
86-11 já provou o padrão (Opção A: disparo CAPI server-side no `trifold-crm`,
runtime da landing sem bundler); esta story reusa esse padrão quase
integralmente, mas expõe um problema estrutural que a 86-11 não precisava
resolver por só existir uma landing: **os módulos server-side reusados
hardcodam identificadores do Vind Residence.** Ver "Descoberta de runtime"
abaixo — é o achado mais importante desta story, verificado lendo o código em
produção, não presumido.

## Descoberta de runtime (verificado no repo antes de escrever esta story — não presumir)

- **A landing WordPress antiga está morta.** `curl -I https://trifold.eng.br/y/`
  devolve `404`. Nenhum rewrite para `/y/` existe em
  `landing-pages/trifold-design-system/vercel.json`. Nenhum tráfego pago ativo
  aponta para lá hoje (confirmado com o usuário).
- **`landing-pages/vind-residence/` é a estrutura de referência**, e o próprio
  `README.md` do projeto já documenta uma seção "Reaproveitar para outro
  empreendimento" (cores/fontes no `:root` do `<style>`, textos no HTML,
  imagens em `assets/`, `CONFIG.whatsapp`/`CONFIG.leadEndpoint` no `<script>`
  final) — ou seja, o próprio código já foi desenhado para ser clonado.
- **🔴 Achado crítico, não previsto na auditoria original: os módulos
  server-side da 86-11 NÃO são genéricos por landing — hardcodam "Vind
  Residence".** Verificado em
  `packages/web/src/lib/meta/landing-page-tracking.ts`:
  ```ts
  export const LANDING_VIND_CONTENT_CATEGORY = "landing_vind_residence"
  export const LANDING_VIND_CONTENT_NAME = "Landing Vind Residence"
  export const LANDING_VIND_URL_PADRAO = "https://trifold.eng.br/vindresidence/"
  ```
  Essas três constantes são importadas e usadas **incondicionalmente** em
  `packages/web/src/app/api/webhooks/landing-page/route.ts` (função
  `dispararEventosCapi`) e em
  `packages/web/src/app/api/webhooks/landing-page/track/route.ts` (dentro do
  `after()`). `grep` confirmou que são os **únicos dois consumidores** (fora
  do próprio arquivo). Se o Yarden reusasse essas rotas como estão hoje,
  **todo evento CAPI do Yarden sairia rotulado `content_category:
  "landing_vind_residence"` e `content_name: "Landing Vind Residence"**, e o
  fallback de `page_url` apontaria para `/vindresidence/`** — poluindo o
  dataset e impedindo Custom Conversions separadas por empreendimento. Isso
  **contradiz a premissa inicial desta tarefa** (de que as rotas já seriam
  genéricas o bastante) — verificado, não presumido, e é o motivo do AC5 novo
  abaixo.
- **Estruturalmente, porém, as rotas SÃO agnósticas de landing** no que diz
  respeito aos campos que aceitam: `tracking` (bloco JSON opcional),
  `TrackingLanding`/`CorpoTracking` (visitor_id, fbc, fbp, fbclid, client_ip,
  client_ua, page_url), a allowlist de `event_name` em `/track`
  (`ViewContent`/`InitiateCheckout`), e a precedência de IP/UA do corpo sobre
  os headers (`confiarEmClientIpDoCorpo: true`, fixo nas duas rotas,
  independente de qual landing chama) — nenhum desses pontos precisa de
  mudança. O único ponto não-genérico são as três constantes acima.
- `packages/web/src/lib/meta/form-capi.ts` — `EnviarEventoInput` **já aceita**
  `contentName`, `contentCategory`, `urlPadrao` como parâmetros por chamada
  (não hardcoded no módulo). O hardcode está só em
  `landing-page-tracking.ts` e nos dois call sites — ou seja, o ADAPT
  necessário é pequeno e isolado, não espalhado pelo módulo inteiro.
- `landing-pages/vind-residence/api/lead.js` e `api/track.js` são funções
  serverless Node "cruas" (sem framework), com `ALLOWED_ORIGINS` fixa,
  honeypot, e `CRM_WEBHOOK_URL`/`CRM_TRACK_URL` apontando para
  `crm.trifold.eng.br`. Nenhuma dessas duas URLs do CRM precisa mudar para o
  Yarden — é o mesmo CRM. Só `ALLOWED_ORIGINS` precisa incluir a origem do
  novo projeto Vercel do Yarden.
- **Não existe hoje nenhum projeto Vercel para o Yarden.** Diferente da 86-11
  (onde `vind-residence` e `vind-residence.vercel.app` já existiam), esta
  story exige que @devops **crie um projeto Vercel novo**, chamado **`yarden`**
  (nome travado na validação @po de 2026-08-26), antes do deploy final — ver
  "Pré-requisito de infraestrutura" abaixo. Isso não bloqueia a criação do
  código (que pode ser desenvolvido e testado localmente via
  `python3 -m http.server`, mesmo padrão da 86-11), só o deploy em produção.
- **Conteúdo/design da página não está pronto.** O usuário vai construir/
  fornecer copy, imagens e seções separadamente. Esta story trata isso como
  dependência externa — ver AC12.
- **Dataset/Pixel ID: decidido — reusar `1337310707164669`.** O Vind Residence
  já usa esse dataset ("TRIFOLD - VIND") e o stakeholder confirmou em
  2026-08-26 que o Yarden usa o **mesmo**. Ver AC1.
- **🔴 Segundo achado do @po (verificado lendo `api/lead.js:123`, não
  presumido): o proxy também carrega um identificador de landing FORA do
  bloco `tracking`.** `landing-pages/vind-residence/api/lead.js` monta
  `const payload = { nome, whatsapp, email, page: "vind-residence" }`. Esse
  `page` **não** é campo de tracking Meta — ele é achatado por
  `flattenIntoFields` em `fields.page`, virá `ctx.pageName` e é gravado no CRM
  em **quatro** lugares: `webhook_logs.payload.page`,
  `leads.metadata.landing_page` (`route.ts:282`, `formName ?? ctx.pageName`),
  `leads.metadata.page` (`route.ts:343`) e a descrição da activity
  (`route.ts:325`, "Lead criado via landing page: vind-residence"). Se o
  proxy do Yarden for clonado sem trocar esse literal, **todo lead do Yarden
  entra no CRM rotulado como Vind Residence** — bug de qualidade de dado no
  próprio CRM, independente do Meta, e invisível nos testes de CAPI. Coberto
  agora pelo AC8.

## Decisão arquitetural (travada agora — não reabrir em modo YOLO no @dev)

**Escolha: mesma Opção A da 86-11** — o disparo CAPI server-side continua
acontecendo no `trifold-crm`, reusando `packages/shared/src/meta/*` e as
rotas já existentes de `packages/web/src/app/api/webhooks/landing-page/*`
**sem criar nenhuma rota nova**. Razão: são as mesmas do item 1-2 da 86-11
(zero segredo novo, módulo sensível a PII/hashing não deve ser duplicado) —
não reabertas aqui, só reafirmadas porque valem igualmente para o Yarden.

**Decisão nova desta story — discriminador multi-landing (ADAPT, não CREATE):**

O problema descrito em "Descoberta de runtime" (constantes hardcoded) é
resolvido estendendo `packages/web/src/lib/meta/landing-page-tracking.ts`
com um discriminador de landing, e não duplicando as rotas/módulo para o
Yarden (que seria CREATE desnecessário, violando REUSE>ADAPT>CREATE):

```ts
export type LandingSlug = "vind_residence" | "yarden"

export const LANDING_CONFIGS: Record<
  LandingSlug,
  { contentCategory: string; contentName: string; urlPadrao: string }
> = {
  vind_residence: {
    contentCategory: "landing_vind_residence",
    contentName: "Landing Vind Residence",
    urlPadrao: "https://trifold.eng.br/vindresidence/",
  },
  yarden: {
    contentCategory: "landing_yarden",
    contentName: "Landing Yarden",
    urlPadrao: "https://trifold.eng.br/yarden/",
  },
}

export const DEFAULT_LANDING_SLUG: LandingSlug = "vind_residence"

export function resolveLandingConfig(
  slug: unknown,
): { contentCategory: string; contentName: string; urlPadrao: string } {
  const chave =
    typeof slug === "string" && slug in LANDING_CONFIGS
      ? (slug as LandingSlug)
      : DEFAULT_LANDING_SLUG
  return LANDING_CONFIGS[chave]
}
```

**Por que o default é `vind_residence` (não um erro/exceção):** os dois
proxies em produção do Vind Residence (`api/lead.js`, `api/track.js`) **não
enviam** o campo `landing` hoje e não precisam ser tocados por esta story —
`resolveLandingConfig(undefined)` cai no default e devolve exatamente as três
strings que `LANDING_VIND_CONTENT_CATEGORY`/`_NAME`/`_URL_PADRAO` produziam
antes. **É isso que torna esta mudança um ADAPT seguro, não um CREATE**: o
único consumidor existente (Vind Residence) não muda de comportamento;
testes de não-regressão devem provar isso byte a byte (ver Testing).

**Por que o valor de `landing` vem do PROXY, nunca do browser:** mesmo
raciocínio já aplicado a `content_category` na 86-11 ("fica no servidor de
propósito: se viesse no corpo, qualquer chamador com o token poderia gravar
eventos sob a categoria que quisesse") — aqui a fonte confiável é o **proxy**
de cada landing (`api/lead.js`/`api/track.js` do Yarden), que embute
`landing: "yarden"` como uma constante fixa no próprio arquivo, do mesmo jeito
que hoje já embute `client_ip`/`client_ua` dos headers que só ele enxerga. O
browser nunca escreve esse campo. `resolveLandingConfig` ainda valida contra
o `Record` fixo (defesa em profundidade: um valor desconhecido cai no
default, nunca quebra).

## Escopo dos eventos — os mesmos 5 eventos da 86-9/86-11, adaptados a um HTML ainda não definido

Mesma tabela lógica da 86-11 (`PageView`, `ViewContent`, `InitiateCheckout`,
`Lead`, `CompleteRegistration`), com uma diferença: como o conteúdo/HTML final
do Yarden **ainda não existe** (AC12), os ACs abaixo descrevem o
**comportamento**, não os seletores DOM exatos (`#nome`/`#whats` da 86-11 são
específicos daquele HTML). O @dev implementa o placeholder da AC12 com campos
equivalentes e usa os mesmos seletores desse placeholder; se o conteúdo
definitivo chegar depois com um formulário diferente, os `id`s do `<script>`
de tracking devem ser atualizados junto — não é motivo para reabrir esta
story, é manutenção normal de acoplamento HTML↔JS.

| Evento | Gatilho |
|---|---|
| `PageView` | Carregamento da página (só browser). |
| `ViewContent` | Carregamento da página (browser + servidor). |
| `InitiateCheckout` | **[AUTO-DECISION]** Primeiro `focus` num campo de nome OU num campo de telefone/WhatsApp do formulário de captação — mesmo critério da 86-11 ("engajou com o formulário"). Reason: mesma landing de página única, sem etapas sequenciais; o primeiro foco é o sinal real de intenção disponível. Os `id`s exatos dependem do placeholder do AC12 (`#nome`/`#whats`, mesma convenção da 86-11, a menos que o @dev tenha um motivo documentado para mudar). |
| `Lead` | Servidor confirma que o lead foi criado/localizado com sucesso. |
| `CompleteRegistration` | **[AUTO-DECISION]** Igual à 86-11: disparado no MESMO instante que `Lead` (mesma condição de disparo), com `event_id` próprio. Reason: mesma ausência de um segundo marco temporal genuíno — página única, POST atômico, sem tela de confirmação separada — **a menos que o conteúdo definitivo do AC12 introduza uma segunda etapa real** (ex.: agendamento), caso em que o @dev deve documentar a mudança de gatilho no Dev Agent Record em vez de manter esta ressalva silenciosamente incorreta. |

## Acceptance Criteria

### AC1 — Pixel carregado na landing (browser) — dataset `1337310707164669` (DECISÃO TRAVADA)

Em `landing-pages/yarden/index.html`, adicionar o Pixel Base Code oficial do
Meta no `<head>`, o mais cedo possível (mesma justificativa do `_fbp` da
86-11 AC1).

**Dataset/Pixel ID = `1337310707164669`** (conta "TRIFOLD - VIND") — o **mesmo**
do Vind Residence. Decisão de produto **travada** pelo stakeholder
(lucas@trifold.eng.br) em 2026-08-26; não reabrir, nem em modo YOLO. Razão
registrada: nenhum ativo novo no Business Manager, nenhuma credencial nova, e a
segmentação por empreendimento já é garantida por `content_category`
(`landing_vind_residence` vs `landing_yarden`, AC5) — Custom Conversions por
empreendimento continuam possíveis com um único dataset.

O ID aparece em **dois** pontos do `<head>` do `index.html` do Vind Residence e
precisa estar consistente nos dois no Yarden (verificado pelo @po lendo
`landing-pages/vind-residence/index.html`):

1. `window.TRIFOLD_PIXEL_ID = '1337310707164669'` (linha 21) usado em
   `fbq('init', window.TRIFOLD_PIXEL_ID)` (linha 30) — manter o mesmo padrão de
   constante nomeada, não literal solto no `init`.
2. O fallback `<noscript><img src="https://www.facebook.com/tr?id=1337310707164669&ev=PageView&noscript=1" /></noscript>` (linha 468) —
   se divergir do `init`, o `PageView` sem-JS vai para o dataset errado em
   silêncio.

Dispara `fbq('track', 'PageView', {}, { eventID: <uuid> })` imediatamente ao
carregar. Sem contraparte servidor (mesma razão da 86-11 AC1).

### AC2 — `visitor_id` estável como `external_id` (browser, vanilla JS)

**REUSE do padrão, não do arquivo** (runtime sem bundler, mesma restrição da
86-11 AC2): UUID v4 com fallback próprio, persistido em `localStorage` como
`trifold_visitor_id` (mesma chave — não há conflito entre landings porque
cada uma vive em `localStorage` de um domínio-caminho distinto do ponto de
vista do browser apenas se os domínios forem diferentes; como as duas landings
compartilham o domínio `trifold.eng.br`, **usar a mesma chave é intencional**:
um visitante que passar pelas duas landings mantém o mesmo `visitor_id` —
comportamento desejável, não um bug), com fallback em memória se
`localStorage` não estiver disponível.

### AC3 — Captura de `fbc`/`fbp`/`fbclid` (browser, vanilla JS)

REUSE do padrão da 86-11 AC3: leitura de `_fbp`/`_fbc`, derivação de `fbc` a
partir de `fbclid` da URL quando ausente, persistência de `fbclid` bruto em
`sessionStorage`. Nunca lança exceção.

### AC4 — Os 5 eventos do funil, com `event_id` gerado no browser e dedup 48h

Ver "Escopo dos eventos" acima. Mesmas regras de implementação da 86-11 AC4
(servidor decide se `Lead`/`CompleteRegistration` saem; `event_id`
compartilhado entre Pixel e POST ao servidor; `action_source: "website"` e
`event_source_url` real em todos os 5 eventos), com a única mudança sendo o
valor de `content_category`/`content_name`/URL padrão, que vem do AC5
(`resolveLandingConfig("yarden")`) em vez de ser hardcoded.

### AC5 — Discriminador multi-landing em `packages/web/src/lib/meta/landing-page-tracking.ts` (ADAPT — pré-requisito dos AC6/AC7)

Este AC não existia na 86-11 porque só havia uma landing. Implementar
exatamente o design da seção "Decisão arquitetural" acima:

1. Substituir as três constantes `LANDING_VIND_CONTENT_CATEGORY`,
   `LANDING_VIND_CONTENT_NAME`, `LANDING_VIND_URL_PADRAO` por
   `LANDING_CONFIGS` (`Record<LandingSlug, {...}>`), `DEFAULT_LANDING_SLUG`
   e `resolveLandingConfig(slug: unknown)`.
2. Estender `TrackingLanding` com `landing?: string` (via `textoCurto`, máx.
   32 chars, mesma allowlist de leitura que os demais campos de
   `lerTracking`).
3. **Não é necessário validar `landing` dentro de `lerTracking`** — a
   validação contra o `Record` fixo acontece em `resolveLandingConfig`
   (single source of truth), evitando duas allowlists divergentes.

### AC6 — REUSE da rota `POST /api/webhooks/landing-page/track` (ajuste mínimo de import)

**Nenhuma rota nova.** Em
`packages/web/src/app/api/webhooks/landing-page/track/route.ts`, trocar o
import de `LANDING_VIND_CONTENT_CATEGORY`/`_NAME`/`_URL_PADRAO` por
`resolveLandingConfig`, e no corpo do `after()`:

```ts
const landingConfig = resolveLandingConfig(tracking.landing)
// ...
contentName: landingConfig.contentName,
contentCategory: landingConfig.contentCategory,
urlPadrao: landingConfig.urlPadrao,
```

Nenhuma outra linha desta rota muda — a allowlist de `event_name`
(`ViewContent`/`InitiateCheckout`), a validação de `event_id`, e a
precedência de IP/UA (`confiarEmClientIpDoCorpo: true`) já são agnósticas de
landing e continuam exatamente como estão.

### AC7 — REUSE da rota `POST /api/webhooks/landing-page` estendida (ajuste mínimo de import)

Mesmo ajuste do AC6, em `packages/web/src/app/api/webhooks/landing-page/route.ts`,
dentro de `dispararEventosCapi`:

```ts
const landingConfig = resolveLandingConfig(tracking.landing)
// ...
contentName: landingConfig.contentName,
contentCategory: landingConfig.contentCategory,
urlPadrao: landingConfig.urlPadrao,
```

`tracking.landing` chega no mesmo bloco `tracking` do body (lido do JSON
bruto, mesma mecânica da 86-11 AC6 — `flattenIntoFields` continua descartando
objetos aninhados, então nada muda na propagação até `processLandingPageLead`
além de o `ctx.tracking` agora poder conter `landing`). O restante do AC6 da
86-11 (gravação de `metadata.meta_ad` via `comMetaAd`, batch de `Lead` +
`CompleteRegistration`, dois `event_id` distintos) é reusado sem nenhuma
mudança — não depende de qual landing originou o evento.

### AC8 — IP/UA capturados no ponto certo (o proxy do Yarden, não o CRM)

Novo diretório `landing-pages/yarden/api/`, com `lead.js` e `track.js`
**clonados de `landing-pages/vind-residence/api/{lead,track}.js`**, com estas
mudanças (e só estas):

- `ALLOWED_ORIGINS`: trocar `"https://vind-residence.vercel.app"` por
  **`"https://yarden.vercel.app"`** (nome do projeto Vercel travado pelo
  stakeholder em 2026-08-26 — não é mais placeholder).
  `"https://trifold.eng.br"` e `"https://www.trifold.eng.br"` permanecem
  (mesmo domínio final).
- `CRM_WEBHOOK_URL`/`CRM_TRACK_URL`: **sem mudança** — mesmo `trifold-crm`.
- **🔴 `page: "vind-residence"` → `page: "yarden"` em `lead.js` (obrigatório,
  acrescentado pelo @po na validação).** Em
  `landing-pages/vind-residence/api/lead.js:123` o payload é
  `{ nome, whatsapp, email, page: "vind-residence" }`. Esse `page` **não** é
  campo Meta: ele é achatado por `flattenIntoFields` em `fields.page`, vira
  `ctx.pageName` e é persistido no CRM em `webhook_logs.payload.page`,
  `leads.metadata.landing_page`, `leads.metadata.page` e na descrição da
  activity ("Lead criado via landing page: …"). Clonar sem trocar faria **todo
  lead do Yarden entrar no CRM rotulado como Vind Residence** — e nenhum teste
  de CAPI pegaria isso. `track.js` **não** tem campo `page` (a rota `/track`
  não grava nada), então essa mudança é exclusiva do `lead.js`.
- **Novidade desta story:** cada proxy passa a incluir `landing: "yarden"`
  como um campo fixo do `payload.tracking` (`lead.js`) / `payload`
  (`track.js`) — **não lido de `rawBody`**, uma constante no próprio arquivo,
  pelo mesmo motivo do AC5 (fonte confiável = proxy, nunca o browser). Isso
  substitui uma entrada em `TRACKING_FIELDS`/`TRACK_FIELDS` (que são listas
  de campos *lidos do corpo recebido do browser*) por uma atribuição direta,
  já que `landing` nunca vem do browser.
- Honeypot, `sanitizeField`, `MAX_FIELD_LENGTH`, mensagens de log e a
  mitigação `tracked: false` (86-11, risco #4) são idênticos — reusados sem
  alteração de comportamento.

Regra de precedência de IP/UA (`client_ip`/`client_ua` do corpo vencem sobre
os headers desta requisição) já está garantida pelas rotas do CRM
(`confiarEmClientIpDoCorpo: true`, fixo, independente de landing) — nenhuma
mudança adicional necessária além do que o AC6/AC7 já cobrem.

### AC9 — CSP atualizada em `landing-pages/trifold-design-system/vercel.json` (bloqueante)

Mesma mecânica da 86-11 AC8, para os novos caminhos `/yarden`, `/yarden/` e
`/yarden/:path*`:

**Inventário atual do arquivo, conferido pelo @po (parse do JSON, não presumido):**
`redirects` = 1 entrada (`/vindresidence` → `/vindresidence/`); `rewrites` = 3
entradas (`/` → `/Home.dc.html`, `/vindresidence/`, `/vindresidence/:path*`) —
ou seja, só **2** delas são do Vind Residence; `headers` = 4 blocos
(`/vindresidence`, `/vindresidence/`, `/vindresidence/:path*`, catch-all
`/((?!vindresidence).*)`).

- Adicionar 3 novos blocos de `headers` (clonados dos 3 blocos existentes de
  `/vindresidence*`, com `source` trocado), com `script-src` incluindo
  `https://connect.facebook.net`, `connect-src` incluindo
  `https://connect.facebook.net https://www.facebook.com` e (se o Pixel
  hospedar no domínio novo do Yarden algo além de `trifold.eng.br`) o próprio
  domínio Vercel do Yarden, e `img-src` incluindo `https://www.facebook.com`.
- Adicionar **2** novos blocos de `rewrites` (`/yarden/` e `/yarden/:path*`,
  clonados dos 2 blocos de `/vindresidence*` — o terceiro rewrite do arquivo é
  o `/` → `/Home.dc.html` e não tem contraparte aqui), apontando para
  **`https://yarden.vercel.app`** (nome travado; @devops confirma o domínio
  real do deployment antes do deploy final — ver "Pré-requisito de
  infraestrutura").
- Adicionar 1 novo `redirect` (`/yarden` → `/yarden/`, não permanente, mesmo
  padrão de `/vindresidence`).
- **Atualizar o bloco catch-all** (hoje `/((?!vindresidence).*)`) para
  `/((?!vindresidence|yarden).*)` — sem isso, o Yarden herdaria a CSP
  restritiva default (`script-src` sem `unsafe-inline`/`unsafe-eval` nem
  `connect.facebook.net`) por trás do rewrite mais específico, e o Pixel
  quebraria mesmo com os 3 blocos novos configurados. **Este é o mesmo tipo
  de erro silencioso que a 86-11 preveniu para o Vind Residence** — conferir
  a ordem de precedência de `headers` do Vercel antes de considerar este AC
  concluído.
- Validação manual pós-deploy (@devops): console do navegador sem nenhum
  erro de CSP relacionado a `facebook.net`/`facebook.com` em
  `https://trifold.eng.br/yarden/`.

### AC10 — Hasheados vs. texto puro (reforço, sem lógica nova)

REUSE integral da regra já implementada (`capi-hashing.ts`/`capi-payload.ts`,
86-3/86-9/86-11): `em`/`ph`/`fn`/`ln`/`external_id` sempre SHA-256 hex;
`fbc`/`fbp`/`client_ip_address`/`client_user_agent` sempre texto puro. Nenhum
PII em `console.log`/`console.error` nos proxies novos do Yarden (mesmo
padrão de log já usado em `lead.js`/`track.js` do Vind Residence — só a
mensagem do erro, nunca o corpo da requisição).

**⚠️ Defeito herdado a NÃO clonar (`86.11-QA-005`, status OPEN na 86-11):** o
`index.html` do Vind Residence contém um `console.log('[lead capturado]', data)`
que passa a logar `fbc`/`fbp` no console do browser. É caminho morto em produção
naquela story, mas **clonar o HTML propagaria o defeito para uma landing nova** —
o que seria uma regressão introduzida por esta story, não herdada. O @dev deve
remover (ou reduzir a um log sem payload) qualquer `console.log` que imprima o
corpo/resposta do envio de lead no `index.html` do Yarden, e registrar isso no
Dev Agent Record. Os itens `86.11-QA-003` (sem rate limit em
`/landing-page/track`) e `86.11-QA-006` (`tracking:{client_ip,client_ua}`
anexado mesmo sem tracking do browser) são herdados **conscientemente** e estão
fora de escopo aqui — são propriedades das rotas compartilhadas, não do clone.

### AC11 — Degradação graciosa

Mesmas quatro garantias da 86-11 AC10: ad-blocker não impede o envio do lead;
sem `localStorage` o `visitor_id` cai para memória; falha de rede no
`/api/track` do Yarden não afeta o envio do lead; `tracking` ausente ou
malformado no CRM não impede a criação do lead (o `landing` ausente/inválido
cai no `DEFAULT_LANDING_SLUG`, nunca em erro).

### AC12 — Conteúdo da página: placeholder estrutural → conteúdo definitivo (redação de consentimento **emendada pelo @po em 2026-09-01**, ver bloco no fim do AC)

**Fora de escopo desta story:** copy, imagens, seções de marketing, design
visual definitivo do Yarden — isso é fornecido pelo usuário separadamente
(ver Contexto/Descoberta) e **não deve ser inventado** pelo @dev (Artigo IV,
No Invention).

**Dentro de escopo:** `landing-pages/yarden/index.html` deve existir como uma
página funcional mínima — página única, replicando a estrutura de
`vind-residence/index.html` **sem o conteúdo de marketing**: um formulário de
captação equivalente (nome, WhatsApp, e-mail, e **um único checkbox de aceite
`required`** — ver a emenda de 2026-09-01 no fim deste AC; a redação original
pedia "os mesmos dois checkboxes da 86-11" e está **revogada**), com os
elementos de tracking do AC1-AC4 já ligados a esse formulário
(Pixel base code, helpers de `visitor_id`/`fbc`/`fbp`/`fbclid`, disparo dos 5
eventos, `CONFIG.leadEndpoint = "https://yarden.vercel.app/api/lead"` e
`TRACK_ENDPOINT = "https://yarden.vercel.app/api/track"` — URLs absolutas, mesmo
motivo documentado no Vind Residence: funcionam mesmo servidas via proxy sob
`trifold.eng.br/yarden/`, e a allowlist de CORS do AC8 inclui `trifold.eng.br`).
Seções de marketing (hero, galeria, localização, etc.) podem ser
placeholders textuais simples (ex.: um `<h1>Yarden</h1>` e um comentário
`<!-- conteúdo definitivo pendente -->`) — o objetivo é que a infraestrutura
de tracking já esteja completa e testável (AC13) antes do conteúdo chegar.

**Quando o conteúdo definitivo for fornecido:** quem for integrá-lo deve
preservar os `id`s dos campos de formulário usados pelo `<script>` de tracking
(ou atualizar o `<script>` junto, documentando a mudança) — não recriar o
Pixel/CAPI do zero.

---

#### ⚖️ Emenda do @po — 2026-09-01: o conteúdo definitivo CHEGOU e traz **um** checkbox, não dois (DECISÃO TRAVADA)

Os dois parágrafos acima foram escritos em 2026-08-26, **antes de o mockup
existir**. O stakeholder (lucas@trifold.eng.br) entregou "Yarden LP v1.png" em
2026-09-01 e o @dev integrou o conteúdo definitivo (Change Log 0.9). Duas
consequências, ambas formalizadas aqui porque seção de AC é alçada do @po
(`story-lifecycle.md`):

**1. Checkbox único — decisão explícita do stakeholder, não omissão.**
O mockup traz **1 (um) checkbox por formulário**, todos `required`. **Não** há
o segundo checkbox de opt-in opcional de marketing que a 86-11 tem. Confirmado
com o stakeholder em **2026-09-01**: **manter 1 checkbox só, como no mockup.**
Decisão **travada — não reabrir**, nem em modo YOLO, nem por "paridade com a
86-11". O @dev agiu **corretamente** ao não inventar o segundo (Artigo IV, No
Invention) — a ausência é o comportamento aceito, não um defeito a corrigir.

Contraste com a 86-11 (verificado pelo @po lendo
`landing-pages/vind-residence/index.html`, no bloco `label.check` do formulário
— sem número de linha de propósito, o arquivo tem mudança em voo no `<head>`):
lá existem
**dois** — `<input type="checkbox" required>` "Li e concordo com as Políticas de
privacidade" **+** `<input type="checkbox">` (sem `required`) "Estou de acordo em
receber comunicações e ser contatado". **Essa paridade deixa de ser requisito do
Yarden.**

Estado real implementado (verificado pelo @po lendo
`landing-pages/yarden/index.html`, não por relato — **reconferido em 2026-09-01
após a padronização de texto do Change Log 0.11**, que tornou obsoleta a versão
anterior desta tabela):

| `<form>` | Linha do `label.check` | Checkbox (único, `required`) |
|---|---|---|
| `leadForm` (hero desktop) | 519-522 | "Políticas de privacidade" |
| `leadFormMobile` (hero mobile) | 551-554 | "Políticas de privacidade" |
| `leadFormSaber` ("Quer saber mais?") | 625-628 | "Políticas de privacidade" |

Os três blocos são hoje **byte-a-byte idênticos** (`<input type="checkbox"
required />` + `<span>Políticas de privacidade</span>`), variando só a
indentação. **Histórico, para não ser lido como defeito numa comparação futura
com o mockup:** até 2026-09-01 o `leadFormSaber` trazia o texto de marketing do
mockup — "Concordo em fornecer meus dados para receber conteúdos e ofertas por
e-mail ou outros meios." — e o stakeholder (lucas@trifold.eng.br) decidiu
padronizá-lo com os outros dois (Change Log 0.11). É uma **divergência
deliberada e autorizada em relação ao mockup** naquele ponto específico: o
mockup segue com o texto de marketing, a página não.

Nenhum dos três tem `id`/`name` e **nenhum viaja no payload** — o browser monta
`{ nome, whatsapp, email, empresa }` (`index.html:719-723`, `empresa` é o
honeypot) e `api/lead.js` repassa ao CRM
`{ nome, whatsapp, email, page: "yarden", tracking }` (`api/lead.js:188-192`).
Ou seja: **o aceite é barrado no browser e não fica registrado em lugar
nenhum.** O enforcement funciona apesar do `novalidate` nos três `<form>` porque
o handler chama `form.checkValidity()` + `form.reportValidity()`
(`index.html:718`) — conferido, porque `novalidate` sozinho anularia o
`required`. Nada disso muda lead, CRM ou CAPI: é consentimento/negócio, não
técnico. A não-persistência está registrada como débito técnico formal e
**aceito** pelo stakeholder — ver "Débitos técnicos conhecidos", item DT-1.

**2. Ajustes factuais de redação (não são mudança de escopo).** A parte "Dentro
de escopo" acima descrevia uma página **placeholder** e tratava a integração do
conteúdo como follow-up futuro. Isso está superado pelo Change Log 0.9 e fica
registrado como histórico, não como requisito pendente. No mesmo espírito,
"e-mail **opcional**" na redação original também não corresponde ao entregue:
os três formulários têm `email` **`required`** (`index.html:517`, `549`, `623`),
seguindo o asterisco do próprio mockup (`placeholder="* E-mail"`). O @po não
reabre isso — o mockup é a fonte.

**Observações — estado em 2026-09-01 (NÃO bloqueiam T12/T13, NÃO reabrem a
decisão travada):**

- ✅ **FECHADA — o `leadFormSaber` não tinha aceite de política de privacidade.**
  Era a assimetria em que leads daquele formulário nunca aceitavam a política.
  Resolvida pela padronização de texto de 2026-09-01 (Change Log 0.11): os três
  formulários pedem hoje o mesmo aceite de política.
- ✅ **NÃO SE APLICA MAIS — consentimento de marketing como `required`** versus a
  exigência de consentimento **livre** da LGPD (art. 8º). Não há mais
  consentimento de marketing na página; o único checkbox de cada formulário é
  aceite de política, cuja obrigatoriedade como condição de envio é de outra
  natureza. Registrado como histórico, não como pendência.
- 🟡 **ABERTA — nenhum consentimento é persistido** (sem `id`/`name`, fora do
  payload): não há como provar depois quem aceitou o quê. **Decisão do
  stakeholder (lucas@trifold.eng.br) em 2026-09-01: NÃO resolver agora** —
  promovida a débito técnico formal, ver "Débitos técnicos conhecidos", DT-1.
  Não é pendência de T13.
- 🟡 **ABERTA — `86.12-QA-002` segue OPEN:** não há URL de política de
  privacidade, então nem o checkbox nem o `<span class="politica">` do rodapé
  são link. É conteúdo pendente do stakeholder, não fix de dev. (A padronização
  da 0.11 não agravou nem resolveu isso de propósito: os três `<span>` seguem
  sem `<a href>`, consistentes entre si.)

### AC13 — Validação de ponta a ponta antes de considerar pronta

Mesma mecânica da 86-11 AC11: com `META_CAPI_TEST_EVENT_CODE` setada no
projeto `trifold-crm` (nenhum projeto novo envolvido — as credenciais CAPI
já vivem lá), uma visita real seguida de um preenchimento do formulário
placeholder em `https://trifold.eng.br/yarden/` produz, no Test Events do
Events Manager do dataset **`1337310707164669`** (o mesmo do Vind Residence —
AC1; filtrar por `content_category: "landing_yarden"` para não confundir com o
tráfego da outra landing, que compartilha o dataset):

- `PageView` (browser).
- `ViewContent` x2 (browser + servidor, deduplicados).
- `InitiateCheckout` x2 (idem).
- `Lead` x2 (idem, `content_category: "landing_yarden"`).
- `CompleteRegistration` x2 (idem).

Env removida e `trifold-crm` redeployado ao fim da validação. **Depende de**
o projeto Vercel do Yarden estar em produção (ver "Pré-requisito de
infraestrutura"). O dataset ID já está confirmado (AC1) — não é mais bloqueio.

**Não-regressão obrigatória no mesmo passo:** confirmar que uma visita+lead na
landing do **Vind Residence** continua produzindo
`content_category: "landing_vind_residence"` e `metadata.landing_page:
"vind-residence"` depois do deploy do AC5/AC6/AC7. É o único teste que fecha o
risco real do ADAPT em produção (os testes unitários provam a função, não o
deploy).

## Pré-requisito de infraestrutura (bloqueia o deploy final, não bloqueia o desenvolvimento do código)

Diferente da 86-11, **não existe hoje nenhum projeto Vercel para o Yarden**.
Antes do AC9/AC13 poderem ser validados em produção, @devops precisa:

1. Criar um novo projeto Vercel chamado **`yarden`** (nome **definido pelo
   stakeholder em 2026-08-26**, espelhando `vind-residence`; URL esperada
   `https://yarden.vercel.app`). Se o nome estiver indisponível no scope
   `trifold-s-projects`, **não escolher um substituto por conta própria** —
   escalar para o stakeholder, porque o nome aparece em `ALLOWED_ORIGINS`
   (AC8), nos `rewrites` da CSP (AC9) e nos endpoints do `index.html` (AC12), e
   uma divergência silenciosa quebra CORS ou o rewrite.
2. Configurar `LANDING_PAGE_WEBHOOK_SECRET` **nesse projeto novo**, com o
   **mesmo valor** já usado pelo `vind-residence` (não é um segredo novo, é o
   mesmo token replicado para um segundo projeto Vercel — mesma chave que
   autentica no `trifold-crm`). Seguir a regra do `CLAUDE.md`: nunca
   `vercel env add` via pipe/stdin; usar `scripts/vercel-env-set.sh` ou a
   REST API.
3. Confirmar o domínio real do deployment (`vercel project ls` /
   `vercel inspect`) antes de finalizar os `rewrites` do AC9 — mesmo cuidado
   do risco #1 da 86-11, para não apontar a CSP/rewrite para um domínio
   errado.

> **⚠️ Este pré-requisito NÃO bloqueia o @dev.** Ele é um bloqueio de **deploy**,
> de responsabilidade do @devops (T12), não um bloqueio de desenvolvimento. O
> @dev pode e deve implementar AC1-AC8, AC10-AC12 e todos os testes automatizados
> integralmente antes de o projeto Vercel existir, usando
> `https://yarden.vercel.app` como valor definitivo (já travado) e
> `python3 -m http.server` para o teste local — mesmo fluxo da 86-11. O AC9
> (arquivo de CSP) também pode ser **escrito** pelo @dev; só a sua **validação
> em produção** e o AC13 dependem do T12. Se o @dev encontrar este pré-requisito
> pendente, isso **não é motivo para pausar a story**.

## Fora de escopo (explícito, não invente na implementação)

- **Copy, imagens, design visual definitivo da página** (AC12) — dependência
  externa do usuário.
- **Criar um dataset/Pixel próprio do Yarden** — decisão travada em contrário
  (AC1: reusar `1337310707164669`). Não criar ativo novo no Business Manager.
- **Advanced Matching no Pixel**, **Custom Conversions/Lookalike/otimização
  de campanha** — mesmo escopo excluído nas 86-8/86-9/86-11.
- **`st`/`ct` (UF/cidade via DDD)** — mesma exclusão da 86-11, mesmo motivo
  (normalizador de telefone incompatível no endpoint compartilhado).
- **Tocar nos proxies/HTML do Vind Residence** — o design do AC5 é
  deliberadamente não-invasivo para o consumidor existente; não há motivo
  para editar `landing-pages/vind-residence/*` nesta story (o default de
  `resolveLandingConfig` já preserva o comportamento sem precisar que o
  Vind Residence passe a enviar `landing: "vind_residence"` explicitamente —
  isso é opcional/cosmético, não obrigatório).

## Riscos e itens fora do nosso controle

1. **O nome `yarden` pode estar indisponível no scope da Vercel** — nome já
   travado pelo stakeholder, então uma indisponibilidade **escala de volta para
   ele**, não é escolha do @devops (ver "Pré-requisito de infraestrutura",
   item 1). Mesma cautela do risco #1 da 86-11.
2. **EMQ é métrica lagged** (mesmo risco já registrado nas stories
   anteriores).
3. **Volume desta landing é desconhecido** (empreendimento novo, sem
   histórico) — pode ser ainda mais baixo que o do Vind Residence.
4. **Honeypot devolve `200 ok` sem criar lead** — mesma mitigação já
   implementada e reusada da 86-11 (`tracked: false`).
5. **Consentimento (LGPD)** — mesma ressalva já registrada nas stories
   anteriores (Pixel dispara `PageView` antes de qualquer aceite explícito).
   Somou-se a isto o fato de o aceite de política **não ser persistido** em
   lugar nenhum: aceito pelo stakeholder e registrado formalmente em
   "Débitos técnicos conhecidos", DT-1.
6. **Conteúdo definitivo pode introduzir uma segunda etapa real** (ex.:
   agendamento) — ver ressalva no `CompleteRegistration` da tabela de
   eventos. Se isso acontecer, é um follow-up de ajuste de gatilho, não uma
   falha desta story.

## Débitos técnicos conhecidos (aceitos pelo stakeholder — NÃO bloqueiam esta story)

Itens verificados no código, conscientemente **não resolvidos** nesta story por
decisão explícita do stakeholder. Registrados aqui para não sumirem no Change
Log: quem for planejar o próximo trabalho nesta landing (ou na irmã, Vind
Residence) deve ler esta seção antes de tratar qualquer um deles como bug novo.

### DT-1 — O aceite de política de privacidade não é persistido em lugar nenhum (só validado no browser)

**Decisão do stakeholder (lucas@trifold.eng.br) em 2026-09-01: NÃO resolver
agora.** Não é pendência de T12/T13, não bloqueia o deploy nem o `Done`, e não
é defeito a corrigir dentro do escopo desta story.

**Estado verificado (lido no código, não presumido):**

- Os três checkboxes de aceite (`leadForm`, `leadFormMobile`, `leadFormSaber` —
  `index.html:520`, `552`, `626`) são `<input type="checkbox" required />`
  **sem `id` e sem `name`**. Sem `name`, o campo é inalcançável pelo handler
  (`form.empresa.value` funciona porque o honeypot **tem** `name`; o checkbox
  não tem nada equivalente).
- O browser monta `data = { nome, whatsapp, email, empresa }`
  (`index.html:719-723`) — nenhum campo de consentimento.
- O proxy repassa ao CRM `{ nome, whatsapp, email, page: "yarden", tracking }`
  (`api/lead.js:188-192`) — idem.
- Portanto o aceite **existe apenas como bloqueio de UI**: `required` +
  `form.checkValidity()`/`reportValidity()` (`index.html:718`). Nada é gravado
  em `leads`, em `leads.metadata`, em `webhook_logs` nem em activity.

**Consequência prática:** não há prova de consentimento recuperável. Se alguém
perguntar depois "este lead aceitou a política? quando? com que redação?", a
resposta hoje é "não há registro" — o que se pede é reconstruído por inferência
(estava na página, o formulário não envia sem o check), não por evidência.

**Por que foi aceito assim:** é exatamente o mesmo padrão que já roda em
produção no Vind Residence (Story 86-11, `landing-pages/vind-residence/` —
também não persiste consentimento), e igualar o Yarden a um padrão já aceito não
introduz risco novo em relação ao que a Trifold já opera. Uma solução aplicada
só ao Yarden deixaria as duas landings divergentes, o que é pior que o débito.

**Soluções plausíveis para o futuro (trabalho futuro, NÃO desta story — não
implementar sem story própria):**

1. Dar `id`/`name` aos três checkboxes (ex.: `name="aceite_politica"`) e incluir
   o valor no `data` do browser.
2. Repassar no payload do proxy e gravar no CRM em
   `leads.metadata.consent` — ex.:
   `{ aceite_politica: true, texto: "Políticas de privacidade", form: "leadFormSaber", em: "<ISO-8601>" }`.
   Persistir o **texto e a versão** do que foi aceito é o que dá valor
   probatório; só um booleano `true` prova pouco.
3. Fazer o mesmo no Vind Residence, para as duas landings não divergirem, e
   avaliar se `leads.metadata.consent` deve ser um contrato compartilhado (o
   campo passaria a valer para qualquer landing futura, como `landing` já vale
   hoje via `resolveLandingConfig`).

**Itens relacionados que continuam abertos e são de outra natureza:**
`86.12-QA-002` (não existe URL de política de privacidade, então nenhum dos três
`<span>` — nem o do rodapé — é link) é **conteúdo pendente do stakeholder**, não
código. Resolver DT-1 sem uma URL de política ainda deixaria o aceite apontando
para um texto que não existe publicamente.

### DT-2 — Herdados da 86-11, fora de escopo aqui (registrados na 86-11, repetidos por visibilidade)

- `86.11-QA-003` — `POST /api/webhooks/landing-page/track` sem rate limit; com
  o Yarden a superfície dobra (duas landings chamando a mesma rota
  desprotegida). Propriedade da rota compartilhada, não do clone.
- `86.11-QA-006` — `tracking: { client_ip, client_ua }` é anexado mesmo quando o
  browser não mandou bloco de tracking.
- **Proxies do Vind Residence sem timeout** no `fetch` ao CRM — o Yarden ganhou
  `CRM_TIMEOUT_MS = 8000` (Change Log 0.7), o Vind Residence não tem nenhum.
- **Normalização de aspas em `landing-pages/*/api/*`** — os dois proxies são
  100% aspas duplas e o `.coderabbit.yaml` pede simples para `**/*.js`;
  nenhum linter cobre esses arquivos (Change Log 0.7).

## Convenção de deploy (mesma da 86-11)

- `landing-pages/yarden/` é versionado no git como um projeto novo (mesmo
  padrão de `landing-pages/vind-residence/`) — commit + PR, CI normal para
  revisão, mas a **publicação é manual**:
  `vercel deploy --prod --yes --scope trifold-s-projects`, executado de
  dentro do diretório, após @devops criar o projeto (ver "Pré-requisito de
  infraestrutura") e o `.vercel/project.json` correspondente existir.
- A mudança em `packages/web` (AC5, AC6, AC7) segue o fluxo normal: commit,
  PR, CI, `@devops *push`.
- A mudança de CSP em `landing-pages/trifold-design-system/vercel.json`
  (AC9) também é commitada normalmente (já é tracked desde o PR #501,
  conforme registrado na 86-11) e publicada com
  `vercel deploy --prod --yes --scope trifold-s-projects` de dentro do seu
  próprio diretório.
- Ordem de deploy recomendada: (1) `packages/web` primeiro (AC5/AC6/AC7
  precisam existir antes do browser chamar as rotas); (2) projeto Vercel do
  Yarden criado + `landing-pages/yarden/` deployado; (3)
  `landing-pages/trifold-design-system/` (CSP) — sem (3) o Pixel fica
  bloqueado mesmo com (2) no ar.
- **Nenhuma env var nova no `trifold-crm`** — mesma credencial CAPI da 86-1.
  A única env nova é `LANDING_PAGE_WEBHOOK_SECRET` **replicada** (mesmo
  valor) no projeto novo do Yarden.

## Dev Notes

- **Mapa dos módulos reusados** (todos verificados como existentes nesta
  sessão):

  | Arquivo | O que já resolve | Uso nesta story |
  |---|---|---|
  | `packages/web/src/lib/meta/landing-page-tracking.ts` | Contrato `TrackingLanding`, `lerTracking`, `eventIdValido` | **ADAPT (AC5)** — trocar 3 constantes fixas por `LANDING_CONFIGS`/`resolveLandingConfig`; estender `TrackingLanding.landing?` |
  | `packages/web/src/app/api/webhooks/landing-page/route.ts` | Endpoint principal (lead + `Lead`/`CompleteRegistration`) | **REUSE + ajuste mínimo de import (AC7)** — trocar 3 constantes importadas por `resolveLandingConfig(tracking.landing)` |
  | `packages/web/src/app/api/webhooks/landing-page/track/route.ts` | Endpoint de topo de funil (`ViewContent`/`InitiateCheckout`) | **REUSE + ajuste mínimo de import (AC6)** — idem |
  | `packages/web/src/lib/meta/form-capi.ts` | `extrairSinais`, `comMetaAd`, `enviarEventosFormulario` | **REUSE, sem nenhuma mudança** — já aceita `contentCategory`/`contentName`/`urlPadrao` por chamada |
  | `packages/shared/src/meta/capi-payload.ts` | `buildCapiUserData`, `buildFormEvent` (com `contentCategory` opcional, ADAPT da 86-11) | **REUSE, sem nenhuma mudança** |
  | `packages/shared/src/meta/capi-client.ts` | `sendCapiEvents` | **REUSE, sem nenhuma mudança** |
  | `landing-pages/vind-residence/index.html` (script final) | Pixel base code, helpers de `visitor_id`/`fbc`/`fbp`, disparo dos 5 eventos | **Referência direta** para `landing-pages/yarden/index.html` — clonar a lógica de tracking, não o conteúdo de marketing (AC12) |
  | `landing-pages/vind-residence/api/{lead,track}.js` | Proxies serverless | **Clonar com as 2 mudanças do AC8** (`ALLOWED_ORIGINS`, `landing: "yarden"` fixo) |

- **Verificado por `grep`:** `LANDING_VIND_CONTENT_CATEGORY`,
  `LANDING_VIND_CONTENT_NAME` e `LANDING_VIND_URL_PADRAO` têm exatamente dois
  consumidores fora do próprio arquivo (`route.ts` e `track/route.ts`) — a
  refatoração do AC5 não tem superfície oculta.
- O runtime de `landing-pages/yarden/` terá a mesma restrição da 86-11: sem
  bundler, sem `node_modules` de projeto, JS puro ES2020+, Node `24.x`
  (mesmo `package.json#engines` do Vind Residence, clonar o arquivo).
- `coderabbit_integration` continua ausente de `core-config.yaml` — CodeRabbit
  desabilitado neste projeto (mesmo padrão observado em toda story recente do
  Epic 86).

### Testing

- `packages/web/src/lib/meta/landing-page-tracking.test.ts` (existente) —
  estender com: (a) `resolveLandingConfig(undefined)` e
  `resolveLandingConfig("vind_residence")` devolvem exatamente as três
  strings antigas (**não-regressão byte a byte da 86-11**); (b)
  `resolveLandingConfig("yarden")` devolve `landing_yarden`/`Landing Yarden`/
  `https://trifold.eng.br/yarden/`; (c) `resolveLandingConfig("algo-invalido")`
  cai no default; (d) `lerTracking` propaga `landing` quando presente e curto
  o bastante, ignora quando ausente.
- `packages/web/src/app/api/webhooks/landing-page/route.test.ts` (existente)
  — acrescentar caso cobrindo `tracking.landing: "yarden"` produzindo
  `content_category: "landing_yarden"` no evento CAPI enviado; confirmar que
  o teste existente sem `landing` (Vind Residence) continua verde sem
  alteração.
- `packages/web/src/app/api/webhooks/landing-page/track/route.test.ts`
  (existente) — mesmo acréscimo, para a rota `/track`.
- Novo `landing-pages/yarden/api-proxy.test.ts` (mesmo padrão do
  `vind-residence/api-proxy.test.ts`, fora de `api/` de propósito — dentro
  viraria função serverless): cobrir CORS, honeypot, e que `landing: "yarden"`
  sempre está presente no `tracking` enviado ao CRM, independente do que o
  browser mandar (inclusive se o browser tentar mandar um `landing` diferente
  no corpo — deve ser ignorado, mesmo padrão de defesa de `client_ip`/
  `client_ua` da 86-11 `86.11-QA-001`). **Acrescentar também um caso para
  `page`:** o payload enviado ao CRM por `lead.js` deve conter
  `page: "yarden"` e **nunca** `"vind-residence"` — é o teste que trava o
  achado do @po no AC8 e o único que pega essa classe de erro
  (assert explícito `expect(payload.page).toBe("yarden")`, não só
  `not.toBe("vind-residence")`).
- Testes manuais (mesmo runtime sem framework de testes): `index.html`/
  `api/lead.js`/`api/track.js` do Yarden — `python3 -m http.server` local +
  Test Events do Meta (AC13).
- Rodar `pnpm vitest run` na raiz — zero regressão esperada em
  `landing-page-tracking`, `landing-page/route`, `landing-page/track/route`,
  `form-capi`, `capi-payload`, `capi-client`.

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled in `core-config.yaml`.
> Quality validation will use manual review process only.
> To enable, set `coderabbit_integration.enabled: true` in core-config.yaml

## Tasks / Subtasks

- [x] **T0 (era bloqueante para AC1)** — ✅ **FECHADA em 2026-08-26 pelo @po:** stakeholder confirmou reusar o dataset `1337310707164669` (mesmo do Vind Residence) e o nome de projeto Vercel `yarden`. Nenhuma decisão de negócio pendente.
- [x] **T1 (AC1)** — Pixel base code (`window.TRIFOLD_PIXEL_ID = '1337310707164669'` + `<noscript>` com o mesmo ID) + `fbq('track', 'PageView', ...)` em `landing-pages/yarden/index.html`
- [x] **T2 (AC2)** — helper vanilla JS de `visitor_id` (clonado da 86-11)
- [x] **T3 (AC3)** — helper vanilla JS de captura `fbc`/`fbp`/`fbclid` (clonado da 86-11)
- [x] **T4 (AC4)** — disparo dos eventos browser-side com `event_id` compartilhado; listener de primeiro foco para `InitiateCheckout`; dois UUIDs para `Lead`/`CompleteRegistration`
- [x] **T5 (AC5)** — ADAPT `packages/web/src/lib/meta/landing-page-tracking.ts`: `LandingSlug`, `LANDING_CONFIGS`, `DEFAULT_LANDING_SLUG`, `resolveLandingConfig`, `TrackingLanding.landing?` + testes
- [x] **T6 (AC6)** — ajustar `landing-page/track/route.ts` para usar `resolveLandingConfig(tracking.landing)`
- [x] **T7 (AC7)** — ajustar `landing-page/route.ts` (`dispararEventosCapi`) para usar `resolveLandingConfig(tracking.landing)`
- [x] **T8 (AC8)** — criar `landing-pages/yarden/api/lead.js` e `api/track.js` (clonados do Vind Residence) com as **3** mudanças: `ALLOWED_ORIGINS` → `https://yarden.vercel.app`, `landing: "yarden"` fixo, e **`page: "yarden"` no payload do `lead.js`** (o literal `"vind-residence"` da linha 123 — sem isso o lead entra no CRM rotulado como Vind Residence)
- [x] **T9 (AC12)** — criar `landing-pages/yarden/index.html` placeholder (formulário funcional + tracking completo, endpoints em `https://yarden.vercel.app/api/{lead,track}`, sem copy de marketing, **sem clonar o `console.log('[lead capturado]', data)`** — ver AC10) + `package.json`/`.vercelignore`/`.gitignore`/`README.md` clonados
- [x] **T10 (AC9)** — atualizar CSP em `landing-pages/trifold-design-system/vercel.json`: 3 blocos novos de `headers` (`/yarden`, `/yarden/`, `/yarden/:path*`), **2** `rewrites` novos (`/yarden/`, `/yarden/:path*` → `https://yarden.vercel.app`), 1 `redirect` novo (`/yarden` → `/yarden/`), e atualizar o regex catch-all para `/((?!vindresidence|yarden).*)`
- [x] **T11 (AC11)** — testes de degradação graciosa
- [ ] **T12 (infra, @devops — bloqueia deploy, NÃO bloqueia T1-T11)** — criar projeto Vercel `yarden` + replicar `LANDING_PAGE_WEBHOOK_SECRET` (mesmo valor do Vind Residence) via `scripts/vercel-env-set.sh` (nunca `vercel env add` via pipe)
- [ ] **T13 (AC13, @devops)** — validação end-to-end com `META_CAPI_TEST_EVENT_CODE` (dataset `1337310707164669`, filtrar `content_category: "landing_yarden"`) + **não-regressão do Vind Residence em produção** + remoção da env de teste

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-26 | 0.1 | Story criada a partir da constatação de que `trifold.eng.br/y/` (landing WordPress antiga do Yarden) está 404 em produção e o usuário decidiu reconstruir em `trifold.eng.br/yarden/`, replicando o padrão Done da Story 86-11. Achado crítico verificado nesta sessão: os módulos server-side reusados da 86-11 hardcodam identificadores "Vind Residence" — introduzido o AC5 (discriminador multi-landing, ADAPT em `landing-page-tracking.ts`) para resolver isso sem duplicar rotas/módulo. Duas decisões de negócio deixadas explicitamente abertas para @po validar com o usuário: dataset/Pixel ID (AC1) e a inexistência de conteúdo definitivo da página (AC12, tratado como dependência externa). | @sm (River) |
| 2026-08-26 | 0.2 | **Decisões de negócio confirmadas pelo stakeholder (lucas@trifold.eng.br) e TRAVADAS na story.** (1) Dataset/Pixel Meta: reusar `1337310707164669` (conta "TRIFOLD - VIND"), o mesmo do Vind Residence — NÃO criar dataset próprio do Yarden; a marcação `[AUTO-DECISION]`/"reversível, não travado" foi removida do AC1 e a segmentação por empreendimento fica por `content_category` (AC5). (2) Nome do projeto Vercel: `yarden`, URL `https://yarden.vercel.app` — deixou de ser placeholder e passou a valor definitivo no cabeçalho, na Descoberta de runtime, no AC8 (`ALLOWED_ORIGINS`), no AC9 (`rewrites`), no AC12 (`CONFIG.leadEndpoint`/`TRACK_ENDPOINT`) e no "Pré-requisito de infraestrutura"; uma indisponibilidade do nome agora escala de volta ao stakeholder em vez de virar escolha do @devops. T0 marcada como fechada. | @po (Pax) |
| 2026-08-26 | 0.3 | **Validação `*validate-story-draft`: GO, 9.5/10** — todas as afirmações técnicas do @sm re-verificadas pelo @po lendo o código (não por relato): as 3 constantes `LANDING_VIND_*` (`landing-page-tracking.ts:29/32/35`), os exatamente 2 consumidores (`route.ts:16-18,412-414` e `track/route.ts:6-8,116-118`), a allowlist de 9 campos de `lerTracking` sem `landing`, `confiarEmClientIpDoCorpo: true` fixo nas duas rotas, o corpo da rota `/track` sendo ele mesmo o bloco de tracking (justificando a assimetria `payload.tracking` vs `payload` do AC8), e o inventário real do `vercel.json` (1 redirect / 3 rewrites dos quais 2 são do Vind Residence / 4 blocos de headers com catch-all `/((?!vindresidence).*)`). **Correções aplicadas pelo @po:** (a) 🔴 **AC8 ganhou uma terceira mudança obrigatória — `page: "vind-residence"` → `page: "yarden"` em `lead.js:123`**: esse campo não é tracking Meta, é achatado por `flattenIntoFields` e persistido em `webhook_logs.payload.page`, `leads.metadata.landing_page`, `leads.metadata.page` e na descrição da activity; clonar sem trocar rotularia todo lead do Yarden como Vind Residence no próprio CRM, e nenhum teste de CAPI pegaria — com teste dedicado acrescentado em Testing; (b) AC9 corrigido de "3 novos blocos de rewrites" para 2, com o inventário real do arquivo documentado; (c) AC1 explicitou que o dataset ID aparece em DOIS pontos do `<head>` (`window.TRIFOLD_PIXEL_ID` e o `<noscript>` de fallback) e os dois precisam bater; (d) AC10 passou a proibir explicitamente a clonagem do `console.log('[lead capturado]', data)` do Vind Residence (`86.11-QA-005`, OPEN) — herdar o defeito num arquivo novo seria regressão introduzida, não herdada — e registrou `86.11-QA-003`/`86.11-QA-006` como herdados conscientemente; (e) AC13 ganhou a não-regressão obrigatória do Vind Residence em produção pós-deploy do ADAPT; (f) "Pré-requisito de infraestrutura" recebeu um bloco explícito de que é bloqueio de DEPLOY (@devops/T12) e não de desenvolvimento — o @dev não deve pausar a story por ele. **Status: `Draft` → `Ready`** conforme `story-lifecycle.md`. | @po (Pax) |
| 2026-08-26 | 0.4 | **Implementação T0–T11 concluída (modo autônomo).** Criado o projeto `landing-pages/yarden/` (index.html placeholder com Pixel + os 5 eventos, `api/lead.js`, `api/track.js`, 2 arquivos de teste, `package.json`/`README.md`/`.gitignore`/`.vercelignore`); ADAPT do AC5 em `landing-page-tracking.ts` (`LandingSlug`/`LANDING_CONFIGS`/`DEFAULT_LANDING_SLUG`/`resolveLandingConfig` + `TrackingLanding.landing?`) com as 3 constantes `LANDING_VIND_*` removidas e os 2 call sites ajustados (AC6/AC7); CSP do `trifold-design-system` estendida com 3 blocos de headers, 2 rewrites, 1 redirect e o catch-all `/((?!vindresidence\|yarden).*)` (AC9). **Desvios do esboço da story, com justificativa:** (a) `resolveLandingConfig` valida com `hasOwnProperty` e não com `slug in LANDING_CONFIGS` — o `in` aceita `"constructor"`/`"toString"` e devolveria uma função como config, fazendo o evento CAPI sair sem categoria em silêncio a partir de um corpo JSON controlável por qualquer chamador com o token (teste dedicado falha com `in`); (b) `connect-src` dos blocos novos de CSP aponta para `yarden.vercel.app` — o AC9 deixava isso condicional e a condição se verifica; (c) `montarTracking` do Yarden nunca devolve `null`, então o `if (tracking)` do proxy do Vind virou código morto e não foi clonado. **Acréscimos ao escopo de teste:** `tracking-browser.test.ts` executa os `<script>` inline do `index.html` com globais falsos, travando as 3 classes de erro silencioso de um clone (id do Pixel divergente entre `fbq('init')` e o `<noscript>`, endpoints ainda apontando para `vind-residence.vercel.app`, e o retorno do `console.log('[lead capturado]', data)` do `86.11-QA-005`) e automatizando os casos do AC11 que a story previa só como manuais. **Comportamento não pedido introduzido:** `<meta name="robots" content="noindex, nofollow">` no placeholder, com a remoção registrada como passo 0 do checklist de integração de conteúdo no README — sem isso, esquecer a tag deixaria a landing definitiva fora da busca orgânica em silêncio. **Validações:** suíte completa verde (255 arquivos / 3146 testes, +41 novos), `type-check` 8/8, `lint` 0 errors (34 warnings, todas pré-existentes e em arquivos não tocados). **T12/T13 permanecem abertas — são de @devops** e bloqueiam o deploy/validação em produção, não a implementação. **Status: `Ready` → `InReview`.** | @dev (Dex) |
| 2026-08-26 | 0.5 | **QA gate (`*qa-gate`) — veredito PASS.** Todos os 12 ACs implementáveis verificados no código; AC13 é pós-deploy (@devops). Nada aceito por relato: suíte re-executada por mim (255 arquivos / 3146 passed + 6 expected fail), `type-check --force` 8/8 com **0 cached**, `lint --force` 0 errors / 34 warnings (nenhuma em arquivo desta story, conferido por grep). **8 mutações executadas, 8 mataram teste** — `hasOwnProperty`→`in` (D1 confirmada), `page: PAGE_NAME`→`"vind-residence"` (achado do @po travado), remoção do `tracking.landing`, id divergente no `<noscript>`, endpoints apontando para `vind-residence.vercel.app`, retorno do `console.log('[lead capturado]')` (`86.11-QA-005`), `resolveLandingConfig(tracking.landing)`→`(undefined)` nas 2 rotas e `confiarEmClientIpDoCorpo: true`→`false` nas 2 rotas; arquivos restaurados e conferidos por `sha256`. Não-regressão do Vind Residence provada por VALOR (as 3 strings da 86-11 escritas à mão no teste) e por `git diff` **vazio** em `form-capi.ts`/`capi-payload.ts`/`capi-client.ts`/`landing-pages/vind-residence/*`. Catch-all da CSP conferido por parse: `/((?!vindresidence\|yarden).*)`. Dataset `1337310707164669` idêntico nos dois pontos do `<head>`. `git check-ignore` nos 9 arquivos do yarden: nenhum ignorado — o `.vercelignore` será versionado (a armadilha do `.claude` no `trifold-design-system` não se repete). **Nenhum push:** `git ls-remote --heads origin docs/86-12-story-draft` devolve vazio; sem `.vercel/` no projeto — T12/T13 não tentadas. 3 achados `low`, nenhum bloqueante (`86.12-QA-001` noindex não pedido; `86.12-QA-002` checkbox de política sem link; `86.12-QA-003` rate limit herdado da 86-11 com superfície dobrada). **Status mantido em `InReview`** — `story-lifecycle.md` atribui o `Done` ao @devops após o push, e AC13 (validação em produção) está aberto; mesmo tratamento dado à 86-11. | @qa (Quinn) |
| 2026-08-28 | 0.6 | **Achados do CodeRabbit no PR #512 corrigidos (6/6, todos `Minor`).** Veredito da review era `CHANGES_REQUESTED`; cada achado foi re-verificado no código antes do fix (a review estava com números de linha levemente defasados, mas os 6 se confirmaram). **(1) CSP** — `'unsafe-eval'` removido do `script-src` dos 3 blocos `/yarden*` do `trifold-design-system/vercel.json`: o `fbevents.js` não precisa dele em operação padrão, só de `connect.facebook.net` em `script-src` e `connect-src`, que já estavam lá. Os 3 blocos `/vindresidence*` e o catch-all **ficaram como estavam** — herança da 86-11 e do design system, fora do escopo desta story. **(2) Token fora da query string** — `api/lead.js` e `api/track.js` passaram a autenticar por `Authorization: Bearer` em vez de `?token=`; query string é gravada em texto puro nos logs de plataforma/proxy, o que vazaria o `LANDING_PAGE_WEBHOOK_SECRET` para quem tiver acesso a log. Troca unilateral: as duas rotas do CRM já leem o header com precedência sobre `?token=` (`route.ts:44-48`, `track/route.ts:63-67`), então **nada mudou no lado do CRM**. **(3) Acessibilidade** — `role="status"` + `aria-live="polite"` no `#formMsg`: o resultado do envio só muda via `textContent`, sem recarregar nem mover foco, então sem live region o leitor de tela não anunciava nem sucesso nem erro. **(4) Duplo submit** — flag `enviando` + `disabled` no botão, liberados nos DOIS desfechos (`ok()` e `fail()`); sem isso um duplo-clique criava dois leads e um segundo par `Lead`/`CompleteRegistration` com `event_id` novos, que o Meta **não** deduplica (ids distintos são eventos distintos por definição). `liberar()` também no caminho de erro de propósito: só no sucesso deixaria o formulário morto após uma falha de rede. **(5) README** — `tracking-browser.test.ts` acrescentado à árvore de estrutura e a seção de testes virou tabela com o escopo de cada arquivo; 2 pontos novos em "não pode regredir" (token no header, Pixel não precisa de `unsafe-eval`). **(6) Assertions de batch CAPI** — `expect(batches[0]).toHaveLength(2)` nos 3 testes de batch de `route.test.ts` (antes o `for` sobre `batches[0]` passaria com array vazio ou de 1 evento, exatamente a regressão que o teste existe para pegar) + `content_category` agora conferida também no **segundo** evento, não só no primeiro. **Acréscimos de teste (não pedidos pela review, para os fixes 2/3/4 não regredirem):** 1 caso em `api-proxy.test.ts` provando o header no `lead.js` (a review só cobria o `track.js`) e 2 casos estáticos em `tracking-browser.test.ts` travando a live region e a guarda de duplo submit — o README avisa que o placeholder vai ser reescrito quando a copy chegar, então fix de HTML sem teste é fix temporário. O stub de `fetch` dos testes de proxy passou a capturar `init.headers`. **Os 2 casos novos foram provados por mutação, não por relato:** revertendo o `lead.js` para `?token=` e removendo o `if (enviando) return` do `index.html`, os 2 testes falharam (`2 failed \| 42 passed`); arquivos restaurados e conferidos por grep, suíte de volta a verde. **Validações:** `npx vitest run` **255 arquivos / 3149 passed + 6 expected fail** (+3 vs. 0.5, zero regressão); `npm run type-check` 8/8; `npm run lint` 0 errors / 34 warnings (as mesmas pré-existentes, nenhuma em arquivo desta story); os 2 `.test.ts` do yarden também checados por `tsc --noEmit` direto, já que `turbo` não tem task de type-check no projeto `yarden-landing`. Nota local: `npm run type-check` estoura o heap do V8 (exit 137) com o default do Node nesta máquina — roda limpo com `NODE_OPTIONS=--max-old-space-size=8192`; é ambiente, não erro de tipo, e o CI já rodava verde. **Comentários do CodeRabbit no PR não foram respondidos/resolvidos e o PR não foi mergeado — alçada do @devops.** Status mantido em `InReview`. | @dev (Dex) |
| 2026-08-28 | 0.7 | **2ª rodada de achados do CodeRabbit no PR #512 corrigida (3/3).** A re-review incidiu sobre o código dos fixes da 0.6, não sobre código novo. **(1) `Minor` — `fetch` ao CRM sem teto de tempo** (`api/lead.js`, `api/track.js`): o modo de falha coberto NÃO é "o CRM devolveu erro" (isso já era o 502), é "o CRM aceitou a conexão e nunca respondeu" — deploy no meio, pool esgotado, Supabase lento. Sem teto próprio a função ficava pendurada até a plataforma matá-la, e o browser recebia o erro genérico da Vercel em vez de um erro tratado. Acrescentado `CRM_TIMEOUT_MS = 8000` + `AbortController`/`signal` nas duas rotas, `504 Upstream timeout` no caminho de abort e `clearTimeout(timer)` no `finally`. **O valor foi escolhido, não copiado:** `landing-pages/yarden/` **não tem `vercel.json`**, então vale o `maxDuration` default da plataforma (10s) — um teto de 10s (o de `AbortSignal.timeout(10_000)` usado em `packages/web/src/lib/meta/*`) **nunca dispararia primeiro** e o fix seria decorativo; 8s deixa folga para serializar a resposta. Os proxies do Vind Residence **não têm** timeout nenhum, então não havia constante de proxy para reusar (é débito herdado, deixado fora de escopo). Motivo do abort detectado por **flag `expirou`** e não por `err.name === "AbortError"`: o nome varia entre versões de Node/undici e confundiria um abort de outra origem com timeout. `504` e não `500` porque o erro não é deste proxy — o `if(!r.ok)` do formulário já trata os dois igual (mostra erro, reabilita o botão e **não** dispara `Lead`/`CompleteRegistration`, que sem contraparte de servidor sairiam sem deduplicação), então o ganho do status honesto é no log da Vercel de quem for investigar. **(2) `Minor` — MD056** na linha 0.6 deste Change Log: `2 failed \| 42 passed` estava dentro de code span, mas **backtick não protege `\|` em tabela GFM** (a linha é quebrada em células ANTES do parse inline), então a tabela renderizava errada; escapado para `\|`. Conferido por contagem: a linha 0.6 tinha **5** pipes não escapados contra **4** (os delimitadores reais) em todas as outras, e agora tem 4. **(3) `Trivial` — aspas** nos blocos de opções do `fetch`: `.coderabbit.yaml` pede aspas simples para `**/*.js`. Trocadas apenas nos trechos apontados. **Inconsistência residual assumida:** os dois proxies são clones 100% duplas-aspas (`0` simples antes desta rodada); converter os arquivos inteiros seriam ~106 trocas enterrando os fixes reais no diff a um commit do merge, e nenhum linter cobre esses arquivos (`yarden-landing` não tem script de `lint`) — a normalização de `landing-pages/*/api/*` fica como débito separado. **Cobertura do fix #1 (o único com substância funcional): 5 casos novos** em `api-proxy.test.ts` (504 no timeout em cada proxy, `getTimerCount() === 0` no sucesso de cada um, e `getTimerCount() === 0` no desfecho 502 para provar que o `finally` cobre os dois caminhos), com `fetch` que só termina quando o `signal` aborta — se o proxy não passar `signal`, o stub rejeita na hora com erro distinguível em vez de pendurar até o timeout do vitest. Cada teste avança os fake timers até **1ms antes** do teto e exige que nada tenha respondido ainda, para o assert final não passar por um abort imediato acidental. AC10 re-conferido no caminho novo: o log do abort não carrega PII, `fbc`/`fbp` nem o segredo. `vi.useRealTimers()` no `afterEach` para os fake timers não vazarem. **Provado por mutação, não por relato — 3 mutações, 3 mataram teste:** remover `signal: controller.signal` (1 falha), remover `clearTimeout(timer)` dos dois proxies (3 falhas), e `CRM_TIMEOUT_MS` `8000` → `12000` (1 falha — é este caso que impede o teto de subir acima do limite da plataforma sem ninguém notar); arquivos restaurados e conferidos por `sha256` idêntico. **Validações:** `npx vitest run` **255 arquivos / 3154 passed + 6 expected fail** (+5 vs. 0.6 = exatamente os 5 casos novos, zero regressão); `npm run type-check --force` 8/8 com **0 cached**, mais `tsc --noEmit` direto nos 2 `.test.ts` do yarden (turbo não cobre `yarden-landing`) — 0 erros; `npm run lint --force` 0 errors / 34 warnings, as mesmas pré-existentes, e `grep` por `yarden`/`landing-pages` na saída volta **vazio**. **Sem `git push`, sem responder/resolver comentário no PR e sem merge — alçada do @devops.** Status mantido em `InReview`. | @dev (Dex) |
| 2026-08-28 | 0.8 | **PR #512 mergeado em `main` por squash — merge commit `0c2b4eb8eeba210f7d2cd1f4039e6bca822b519b`, `mergedAt: 2026-08-28T13:55:46Z`.** Estado re-conferido imediatamente antes do merge, não presumido do relato da rodada anterior: `state: OPEN`, `mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`, `reviewDecision: APPROVED` e os **5** checks em `SUCCESS` (CI `type-check · lint · test`, gate de tenancy não-bloqueante, CodeRabbit, Vercel Preview Comments, Vercel – trifold-crm). Merge **sem `--admin`** e sem bypass de proteção de branch — não foi necessário. **Método escolhido por evidência, não por default:** os 3 merges mais recentes do repo (#519 `51d21d1e`, #517 `093cbb9b`, #516 `98772465`) têm **1 pai cada** por `git rev-list --parents -n 1`, com `allow_squash_merge: true` — squash é o padrão real, e o commit novo `0c2b4eb8` também tem 1 pai. **Branch remota `feat/86-12-pixel-capi-landing-yarden` deletada** (o repo tem `delete_branch_on_merge: false`, logo é passo manual); a branch **local** foi mantida de propósito, porque é o HEAD ativo da working tree e há edições não commitadas de outros agentes nela. A deleção só foi feita depois de provar que o conteúdo está em `main` **por diff de blob, não por `git log`**: os 19 arquivos que a branch altera em relação à merge-base `412eb2cf` dão `git diff` **vazio** entre a ponta da branch (`5a115358`) e `origin/main` — em repo squash-merge o `git log origin/main..branch` nunca sai vazio e portanto não é prova de nada. **Status mantido em `InReview` de propósito: merge não é `Done`.** O merge publica automaticamente **apenas o passo (1)** da "Ordem de deploy" desta story — `packages/web` (AC5/AC6/AC7, o discriminador multi-landing) sobe em produção pelo deploy git-linkado do projeto `trifold-crm`. Os passos (2) e (3) continuam abertos e são **manuais por convenção da própria story**: o projeto Vercel `yarden` **não existe** (não há `.vercel/` em `landing-pages/yarden/`, T12) e a CSP do `trifold-design-system` (AC9) só passa a valer após `vercel deploy --prod` de dentro do seu diretório. Consequência prática a registrar: **`trifold.eng.br/yarden/` não está no ar** e o AC13 não foi validado — T12/T13 seguem `[ ]`. **Nada de infra foi provisionado nesta rodada** (nenhum projeto Vercel criado, nenhum deploy manual disparado, nenhuma env var gravada), por escopo explícito da autorização do stakeholder, que cobria o merge e só o merge. | @devops (Gage) |
| 2026-09-01 | 0.9 | **Placeholder do `index.html` substituído pelo conteúdo e design DEFINITIVOS**, a partir do mockup "Yarden LP v1.png" fornecido pelo stakeholder. É a integração que o próprio AC12 previa como follow-up ("quando o conteúdo definitivo for fornecido") — o gatilho foi o stakeholder entregar o mockup, e **nada de copy, cor ou imagem foi inventado** (Artigo IV). Sessão anterior de @dev escreveu o arquivo e os assets mas **estourou o limite de contexto antes de validar/documentar**; esta rodada fecha a ponta solta, não reescreve o design. **O que a página tem agora:** hero com `<picture>` responsivo, seção de diferenciais, interior/lounge, mapa da Gleba Itororó, seção "Quer saber mais?" e rodapé — HTML conferido **balanceado por parse** (pilha de tags vazia, 0 erros, comentários/`<script>`/`<style>` descontados), `lang="pt-BR"`, **0** `<img>` sem `alt` e **0** `id` duplicado (`uniq -d` vazio) apesar das 3 marcações de formulário. **Estrutura de TRÊS formulários, UMA lógica** (`ligarFormulario()` chamada uma vez por par form/mensagem): `leadForm`+`formMsg` (hero desktop, sobreposto à foto), `leadFormMobile`+`formMsgMobile` (hero mobile, em fluxo — só uma das duas fica visível por media query, porque o layout do mockup difere, não a lógica) e `leadFormSaber`+`formMsgSaber` ("Quer saber mais?"). **Isolamento conferido campo a campo, não presumido:** honeypot próprio em cada `<form>` (`name="empresa"` nos três, `id` distintos `empresa`/`empresaMobile`/`empresaSaber` — id repetido faria `getElementById` devolver sempre o primeiro), trava de duplo envio própria (`var enviando` vive no **closure** de `ligarFormulario`, não no escopo do script — preencher o 2º formulário com o 1º em voo não é barrado), par de `event_id` próprio por submissão (`novoId('e')` × 2 dentro do handler), `role="status"`+`aria-live="polite"` nas 3 mensagens e um `button[type=submit]` próprio por formulário (`form.querySelector`, não seletor global). `InitiateCheckout` continua **uma vez por carregamento de página** e não por formulário, agora escutando o 1º `focus` dos 6 campos (`nome`/`whats` × 3) — mede engajamento do visitante, não do componente. **Dataset `1337310707164669` idêntico nos dois pontos do `<head>`** (`window.TRIFOLD_PIXEL_ID` na linha 30 e `facebook.com/tr?id=` do `<noscript>` na 474) e nenhum outro número de 15-16 dígitos no arquivo — travado por teste. **AC10 re-conferido no arquivo novo:** a única ocorrência de `console.` no `index.html` inteiro está **dentro de um comentário** que explica por que o `console.log('[lead capturado]', data)` do Vind Residence não foi clonado; nenhum `fbc`/`fbp` vaza para o console. **`<meta name="robots" content="noindex, nofollow">` removido** (existia na linha 12 do HEAD anterior, conferido por `git show`): existia só para o placeholder não ser indexado, e o conteúdo agora é definitivo — segurá-lo manteria a landing fora do Google (tráfego pago não é afetado, mas o orgânico sim). Fecha o achado `86.12-QA-001`. **12 assets novos em `landing-pages/yarden/assets/`**, todos recortes do próprio mockup: `hero-piscina-rooftop.{jpg,webp}`, `hero-piscina-rooftop-mobile.{jpg,webp}`, `interior-lounge-gourmet.{jpg,webp}`, `mapa-gleba-itororo.{jpg,webp}`, `familia-quer-saber-mais.{jpg,webp}`, `logo-yarden-creme.svg` e `logo-trifold-branco.svg` — `git check-ignore` não pega nenhum (o `.gitignore` local só cobre `.vercel`/`.claude`), então os 12 vão versionados. **2 correções de escrita em relação ao texto do mockup** (ortografia/pontuação, não copy nova): o rodapé lê "Todos os direitos reservados" e a linha da seção de localização lê "Quem escolhe investir, escolhe estar no...". **Teste obsoleto da era do placeholder corrigido, não removido:** `expect(HTML).not.toMatch(/(?:src\|href)="assets\//)` proibia **qualquer** referência a `assets/` — asserção correta quando a página não tinha imagem alguma (qualquer `assets/` seria clone acidental do Vind Residence virando 404), e falsa agora que há 12 assets legítimos. Em vez de apagar a proteção, ela foi **reapontada para os dois modos de falha reais**, com o diretório lido do disco (`readdirSync`): (a) toda referência `assets/` do HTML tem que existir em `assets/`, e (b) todo arquivo de `assets/` tem que ser referenciado pelo HTML (**asset órfão = sobra de clone publicada sem aparecer na página**) e nenhum nome/referência pode casar `/vind[-]?residence/` — que é o sintoma direto do bug original. O extrator passou a ler **`srcset` além de `src`/`href`**: as imagens do hero e das seções são `<picture>`, e é exatamente no `<source srcset>` que um caminho quebrado passa batido, porque o `<img>` de fallback continua carregando. Acrescentado **piso `toBeGreaterThanOrEqual(12)`** para o teste não passar por vacuidade: um merge que restaure o placeholder (zero imagens) tem que **falhar**, não passar em silêncio — sem o piso, (a) e (b) passariam os dois com o HTML sem asset nenhum. **Provado por mutação, não por relato — 3 mutações, 3 mataram teste:** `srcset="assets/hero-piscina-rooftop.webp"` → `...-v2.webp` (2 falhas: referência inexistente + órfão; e este caminho só existe em `srcset`, ou seja, mata também a regex antiga), `cp logo-yarden-creme.svg assets/hero-vind-residence.svg` (1 falha, pega o nome do outro empreendimento) e `(src\|srcset)="assets/` → `"placeholder/` simulando a volta do placeholder (2 falhas, incluindo `expected 0 to be greater than or equal to 12`); `index.html` restaurado e conferido por `sha256` idêntico, `assets/` de volta a 12 arquivos. **README atualizado** porque tinha virado documentação falsa: dizia "Status do conteúdo: **placeholder**" e a seção "Integrar o conteúdo definitivo" mandava executar passos já executados (inclusive "remova o `noindex`"). Virou "Alterar o conteúdo depois", com a tabela dos 3 formulários, o motivo do isolamento por formulário, a regra bidirecional de `assets/` e o "não reintroduza `noindex`". **Duas divergências registradas em vez de decididas por mim (as duas para @po, nenhuma bloqueia commit):** (1) **AC12 pede "os mesmos dois checkboxes da 86-11"; o mockup definitivo traz UM só.** O Vind Residence em produção tem o aceite `required` de políticas **mais** um opt-in **não-`required`** de "receber comunicações e ser contatado"; a versão definitiva do Yarden traz só o aceite `required` ("Políticas de privacidade"), nos três formulários. Não inventei o segundo: acrescentar UI que não está no mockup é justamente o que o Artigo IV e o AC12 proíbem, e o aceite/opt-in **não viaja no payload** (o `data` só leva `nome`/`whatsapp`/`email`/`empresa`), então a ausência não muda nada no CRM, no lead ou no CAPI — é decisão de consentimento/negócio, não técnica, e deve ser confirmada antes do T13. (2) **O texto do AC12 ainda descreve a página como "placeholder estrutural"** e trata a integração como "follow-up não numerado"; o código já passou desse ponto, mas seção de AC é alçada do @po (`story-lifecycle.md`) — não editei. **`86.12-QA-002` (checkbox de política sem link) segue aberto e agora tem 2 ocorrências:** o `<span>` do checkbox e o `<span class="politica">` do rodapé, nenhum com `href`. Na 86-11 o link existe mas aponta para `#`, então não havia URL de política para reusar — é conteúdo pendente do stakeholder, não fix de dev. **Validações:** `npx vitest run` **255 arquivos / 3155 passed + 6 expected fail, 0 failed** (o único vermelho do início da sessão era o teste obsoleto; +1 caso vs. 0.7 porque a asserção virou dois testes — os 50 casos do yarden nos 2 arquivos passam, e o `api-proxy.test.ts` não foi tocado nem afetado); `turbo run type-check --force` 8/8 com **0 cached**, mais `tsc` direto nos 2 `.test.ts` do yarden com o `tsconfig.json` da raiz (`strict`) — exit 0, já que `turbo` não tem task de type-check no projeto `yarden-landing`; `turbo run lint --force` 0 errors / 34 warnings, exatamente as mesmas pré-existentes, e `grep` por `yarden`/`landing-pages` na saída volta **vazio**. Nota de ambiente reconfirmada: `type-check` estoura o heap do V8 nesta máquina com o default do Node — roda limpo com `NODE_OPTIONS=--max-old-space-size=8192`; é ambiente, não erro de tipo. **Commit local apenas — sem `git push`, sem PR, sem deploy e sem criar o projeto Vercel `yarden` (alçada do @devops, T12/T13 seguem `[ ]`).** Status mantido em `InReview`. | @dev (Dex) |
| 2026-09-01 | 0.10 | **Divergência (1) do @dev sobre o AC12 FORMALIZADA como decisão travada do stakeholder: a landing do Yarden tem UM checkbox por formulário, não dois.** O AC12 foi redigido em 2026-08-26, antes de o mockup existir, e pedia "os mesmos dois checkboxes da 86-11" (aceite `required` de política **+** opt-in não-`required` de marketing). O mockup "Yarden LP v1.png" traz **1 checkbox `required` por formulário** e o stakeholder (lucas@trifold.eng.br) **confirmou em 2026-09-01: manter 1 só, como no mockup** — a redação antiga do AC12 está **revogada** e a paridade com a 86-11 **deixa de ser requisito**. O @dev agiu **corretamente** ao não inventar o segundo (Artigo IV, No Invention): a ausência é comportamento aceito, **não defeito**, e não é pendência de T13. Adicionada ao AC12 a seção "⚖️ Emenda do @po — 2026-09-01" com a decisão travada, o contraste verificado com a 86-11 (`landing-pages/vind-residence/index.html`, bloco `label.check` — dois checkboxes, o 2º sem `required`) e a tabela do estado real. **Estado real conferido pelo @po lendo `landing-pages/yarden/index.html`, não por relato — e isso CORRIGE o resumo da 0.9, que descreveu os três checkboxes como "Políticas de privacidade":** `leadForm` (519-522) e `leadFormMobile` (551-554) dizem "Políticas de privacidade", mas o do `leadFormSaber` (625-628) diz **"Concordo em fornecer meus dados para receber conteúdos e ofertas por e-mail ou outros meios."** — ou seja, o 3º formulário tem consentimento de **marketing**, não aceite de política. Conferido também que o `required` **de fato** vale apesar do `novalidate` nos três `<form>`, porque o handler chama `form.checkValidity()`+`reportValidity()` (`index.html:718`) — `novalidate` sozinho anularia o `required` e o aceite seria decorativo. **Divergência (2) do @dev também fechada:** o AC12 descrevia a página como "placeholder estrutural" e a integração do conteúdo como "follow-up não numerado"; reconciliado com o entregue na 0.9, e de passagem o "e-mail **opcional**" da redação original (os três formulários têm `email` `required`, `index.html:517`/`549`/`623`, seguindo o `placeholder="* E-mail"` do mockup). Ambas as divergências marcadas como **RESOLVIDAS** no Dev Agent Record para o @devops não travar T13 esperando decisão de consentimento. **4 observações registradas como abertas, nenhuma bloqueante, nenhuma reabrindo a decisão travada, todas para follow-up do stakeholder:** (a) o `leadFormSaber` **não tem aceite de política de privacidade** — leads daquele formulário nunca aceitam a política, assimetria vs. os dois do hero; (b) consentimento de marketing como `required` pode conflitar com a exigência de consentimento **livre** da LGPD (art. 8º) quando é condição de envio — juízo jurídico, fora da alçada de @po/@dev; (c) **nenhum consentimento é persistido** — os três checkboxes não têm `id`/`name` e não viajam no payload (`api/lead.js` manda só `nome`/`whatsapp`/`email`/`empresa`), então não há prova de quem aceitou o quê; (d) `86.12-QA-002` segue OPEN (sem URL de política, nem o checkbox nem o `<span class="politica">` do rodapé são link). **Nenhuma mudança de código, de teste ou de comportamento — só arquivo de story.** `landing-pages/yarden/README.md` **conferido e NÃO alterado**: não afirma nada sobre quantidade ou texto de checkbox (a seção "Alterar o conteúdo depois" fala de `id` de campo, `assets/`, Pixel e `noindex`), logo não estava desalinhado com a decisão. **Status mantido em `InReview`** — T12/T13 (projeto Vercel `yarden`, `LANDING_PAGE_WEBHOOK_SECRET`, deploy, AC13) seguem `[ ]` com @devops. Commit local, **sem `git push`**. | @po (Pax) |
| 2026-09-01 | 0.11 | **Texto do checkbox do 3º formulário (`leadFormSaber`, "Quer saber mais?") padronizado para o aceite de política de privacidade, por decisão do stakeholder (lucas@trifold.eng.br) de 2026-09-01.** Fecha a observação (a) da 0.10 — a assimetria em que os leads do `leadFormSaber` nunca aceitavam a política. Uma linha de HTML: `index.html:627` deixou de ser "Concordo em fornecer meus dados para receber conteúdos e ofertas por e-mail ou outros meios." (consentimento de **marketing**, fiel ao mockup "Yarden LP v1.png") e passou a ser **`<span>Políticas de privacidade</span>`**, idêntico ao dos outros dois. **Divergência deliberada e autorizada em relação ao mockup**, ao contrário da decisão da 0.10, que era de fidelidade a ele: o mockup segue com o texto de marketing nesse ponto e a página não — registrado aqui para uma futura comparação com o mockup não ler isso como defeito. **O texto foi copiado literalmente dos outros dois formulários, não parafraseado** — conferido depois da troca por `grep -A2 'class="check"'`: os três blocos `label.check` são agora byte-a-byte iguais (`<input type="checkbox" required />` + `<span>Políticas de privacidade</span>`), variando só a indentação, que segue o nível de aninhamento local. `required` **mantido** nos três, como pedido. Consequência colateral de escopo: a objeção (b) da 0.10 (consentimento de marketing `required` versus a exigência de consentimento **livre** do art. 8º da LGPD) **deixa de se aplicar** — não há mais consentimento de marketing na página; a observação (c) (**nenhum** consentimento é persistido: os três checkboxes seguem sem `id`/`name` e não viajam no payload de `api/lead.js`) **continua aberta e inalterada**, e agora vale para um aceite de política, não de marketing. **`86.12-QA-002` nem resolvido nem agravado, de propósito:** os outros dois checkboxes não têm link (`<span>` puro, sem `<a href>`), então replicar o texto sem link mantém os três consistentes — conferido no HTML antes de decidir, não presumido; a falta de URL de política segue conteúdo pendente do stakeholder. **Nenhum teste precisou de atualização — e isso foi verificado, não assumido:** `grep` por `Concordo`/`rivacidade`/`check`/`checkbox` nos dois arquivos de teste do yarden (`tracking-browser.test.ts`, `api-proxy.test.ts`) volta **vazio**; nenhum caso jamais asseverou o texto do checkbox, nem o antigo nem o novo. `grep "Concordo em fornecer"` no repo inteiro sobrou apenas em prosa de story/memória (registro histórico, correto manter) e **zero** em código. **Sem mudança de comportamento:** o texto é conteúdo de `<span>`, o `required` não mudou e o payload não carrega o campo — nada em `api/lead.js`, `api/track.js`, no Pixel ou no CAPI é afetado. **Validações:** `npx vitest run landing-pages/yarden` **2 arquivos / 50 passed**; `npx vitest run` **255 arquivos / 3155 passed + 6 expected fail, 0 failed** (idêntico à 0.9 — zero regressão, zero teste novo); `npm run type-check` 8/8 e `npm run lint` **0 errors / 34 warnings**, as mesmas pré-existentes de `packages/web`, nenhuma em `landing-pages/`. **Dívida de documentação deixada explícita porque não é minha alçada:** a tabela "estado real" do AC12 (linha ~489) e o corpo da "⚖️ Emenda do @po — 2026-09-01" ainda citam o texto de marketing para o `leadFormSaber` e ficaram **desatualizados** com esta troca; seção de AC é do @po (`story-lifecycle.md`), então **não editei** — fica sinalizado aqui em vez de silenciosamente falso. `README.md` do yarden conferido e **não alterado**: não afirma nada sobre texto de checkbox. **Status NÃO alterado (`InReview`)** e nenhum checkbox de task tocado. Commit local com pathspec explícito (a árvore tem trabalho em curso de outros agentes, não tocado), **sem `git push`** — alçada do @devops. | @dev (Dex) |
| 2026-09-01 | 0.12 | **Resíduo de documentação do AC12 corrigido + não-persistência de consentimento promovida a débito técnico formal.** Duas ações, nenhuma de código. **(1) O AC12 estava factualmente errado desde a 0.11** — a dívida de documentação que o @dev sinalizou por não ser alçada dele (seção de AC é do @po, `story-lifecycle.md`). Reconferido **lendo `landing-pages/yarden/index.html`, não o relato do @dev**: os três blocos `label.check` (`519-522`, `551-554`, `625-628`) têm hoje o mesmo `<span>Políticas de privacidade</span>`, com o `<input type="checkbox" required />` nas linhas `520`/`552`/`626`. A tabela "estado real" da "⚖️ Emenda do @po — 2026-09-01" ainda dizia que o `leadFormSaber` trazia "Concordo em fornecer meus dados para receber conteúdos e ofertas por e-mail ou outros meios." — corrigida, com o texto antigo **preservado como histórico explícito** logo abaixo, porque o mockup "Yarden LP v1.png" segue com a redação de marketing naquele ponto e uma comparação futura página↔mockup leria a diferença como defeito se a story não registrasse que a divergência foi autorizada (0.11). As "Observações abertas" do mesmo bloco também estavam desatualizadas e passaram a ter status por item: **(a) FECHADA** (o `leadFormSaber` sem aceite de política — a assimetria deixou de existir com a padronização da 0.11); **(b) NÃO SE APLICA MAIS** (consentimento de marketing `required` vs. art. 8º da LGPD — não há mais consentimento de marketing na página); **(c) e (d) seguem ABERTAS**. Corrigido de passagem um detalhe factual que a 0.10 herdou: o payload não é "só `nome`/`whatsapp`/`email`/`empresa`" nas duas pontas — o **browser** monta `{nome, whatsapp, email, empresa}` (`index.html:719-723`, `empresa` = honeypot) e o **proxy** repassa ao CRM `{nome, whatsapp, email, page: "yarden", tracking}` (`api/lead.js:188-192`, o honeypot é descartado em `lead.js:164-165` e nunca sai). Nenhuma das duas carrega consentimento — a conclusão não muda, a descrição fica correta. **(2) Nova seção `## Débitos técnicos conhecidos`** (antes de "Convenção de deploy"), criada porque a story não tinha uma e enterrar isto só no Change Log é como se perde débito. **DT-1 — o aceite de política não é persistido em lugar nenhum:** os três checkboxes não têm `id`/`name` (sem `name` o campo é inalcançável pelo handler — o honeypot é acessível justamente porque **tem** `name`), não viajam em nenhum dos dois payloads, e o aceite existe apenas como bloqueio de UI (`required` + `checkValidity()`/`reportValidity()`, `index.html:718`); nada é gravado em `leads`, `leads.metadata`, `webhook_logs` ou activity, logo **não há prova de consentimento recuperável**. **Decisão explícita do stakeholder (lucas@trifold.eng.br) em 2026-09-01: NÃO resolver agora** — débito para o futuro, **não** pendência de T12/T13, **não** bloqueio do `Done`, **não** defeito desta story. Razão registrada: é o mesmo padrão que já roda em produção no Vind Residence (86-11, que também não persiste), e resolver só no Yarden deixaria as duas landings divergentes — pior que o débito. Soluções plausíveis registradas como trabalho futuro (exigem story própria, não implementar avulso): dar `id`/`name` aos checkboxes → incluir no `data` do browser → repassar no proxy → gravar em `leads.metadata.consent` guardando **texto e versão** do que foi aceito, não só um booleano, e fazer o mesmo no Vind Residence para as duas não divergirem. Anotada a dependência de `86.12-QA-002`: sem URL de política publicada, um aceite persistido ainda apontaria para um texto que não existe publicamente. **DT-2** agrupa por visibilidade os débitos herdados que já estavam espalhados pela story (`86.11-QA-003` rate limit da rota `/track`, agora com superfície dobrada por duas landings; `86.11-QA-006`; proxies do Vind Residence sem timeout — o Yarden tem `CRM_TIMEOUT_MS = 8000` desde a 0.7; normalização de aspas em `landing-pages/*/api/*`). **Nenhuma mudança de código, de teste, de HTML ou de comportamento — só o arquivo da story.** Nenhum checkbox de task tocado; T12/T13 seguem `[ ]` com @devops. **Status NÃO alterado (`InReview`).** Commit local com pathspec explícito (a árvore tem trabalho em voo de outros agentes, não tocado), **sem `git push`** — alçada do @devops. | @po (Pax) |
| 2026-09-01 | 0.13 | **Branch de PR reconstruída sobre `origin/main` antes do push — a branch local estava com base obsoleta.** `feat/86-12-yarden-conteudo-definitivo` era filha de `412eb2cf`, o commit **anterior** ao squash do PR #512 (`0c2b4eb8`), e estava **37 commits atrás** de `origin/main`. Diagnóstico por `git merge-tree --write-tree origin/main HEAD` (probe, sem tocar em arquivo): **5 conflitos**, dos quais **3 são `add/add` falsos** em `landing-pages/yarden/index.html`, `README.md` e `tracking-browser.test.ts` — patologia clássica de base pré-squash, em que o git não enxerga ancestral comum para arquivos que `main` já tem. Pushar assim abriria um PR marcado `CONFLICTING`, com diff de ~3.6k linhas **reapresentando todo o #512 já mergeado** e mandando o CodeRabbit revisar de novo o que já foi aprovado. **Correção:** os **5** commits de escopo (`aee1fb54`, `8606f09b`, `b8ed634b`, `49954854`, `f2ad92e9`) foram transplantados por `cherry-pick` sobre `origin/main` (`b6812146`) na branch nova **`feat/86-12-yarden-conteudo-definitivo-v2`**, dentro de um **worktree** — a working tree principal, com ~30 arquivos não commitados de outros agentes, ficou intacta. Um único conflito real, no Change Log desta story (a `main` ganhou a linha 0.8 pelos commits `d3eeb6b0`/`f3b9d504` enquanto a branch ganhava a 0.9); resolvido **mantendo os dois lados**, nunca escolhendo um. **Rebase e não merge, excepcionalmente:** a regra do projeto é integrar `main` por merge porque rebase exige force-push que orfana preview e comentário de PR — mas esta branch **nunca foi pushada** (`git ls-remote` vazio, nenhum PR), então não havia nada para orfanar. **Prova de que os 6 commits antigos podiam ficar de fora:** `git diff 0c2b4eb8 5a115358` **vazio** nos paths da story — a árvore da ponta do #512 é idêntica à do squash em `main`, logo recarregá-los seria puro ruído. **Commit `8cf64d90` ("instala Microsoft Clarity na Home e na landing Vind Residence") deliberadamente EXCLUÍDO do PR.** Foi criado por um agente concorrente **na mesma branch** às 17:02:59 de 2026-09-01, no meio desta sessão (o `git log` de abertura da missão não o tinha). Três motivos: não é escopo da 86-12, não passou por este QA gate, e o `vercel.json` dele foi escrito contra a base pré-90-6 — cherry-pick reverteria as URLs limpas da Story 90-6 (`7c97ff93`). Ele segue vivo na branch local para quem o criou decidir o destino. **Artefatos de QA transplantados do working tree:** o gate `CONCERNS` da iteração 2 e a seção QA Results existiam apenas em disco, não commitados. Gate copiado inteiro (a `main` não tocou nesse arquivo desde o squash, conferido por `git log`); story aplicada por `git apply -3` para **não** atropelar as linhas 0.8 que a `main` ganhou. `sha256` dos dois arquivos reconferido imediatamente antes do transplante, para descartar edição concorrente em voo. **Defasagem assumida:** o cabeçalho do gate registra `branch: feat/86-12-yarden-conteudo-definitivo` e `commit: f2ad92e9` — era o fato correto no instante da review, e arquivo de QA não é meu para reescrever; o mapeamento para os SHAs novos está aqui. **Sem merge, sem deploy, sem criar o projeto Vercel `yarden`:** T12/T13 seguem `[ ]` e o AC13 continua não validado. Status mantido em `InReview`. | @devops (Gage) |
| 2026-09-02 | 0.14 | **Link da política de privacidade adicionado (fecha o achado Major do CodeRabbit e o `86.12-QA-002`) + afirmação falsa do README corrigida.** **(1) O defeito real:** os 3 checkboxes eram `required` — o visitante era **obrigado a aceitar** uma política que não tinha como ler, porque "Políticas de privacidade" era `<span>` puro, sem `<a>`. O stakeholder (lucas@trifold.eng.br) forneceu o PDF da política, copiado para **`landing-pages/yarden/assets/politica-de-privacidade.pdf`** (nome sem espaço/acento, convenção do resto de `assets/`; `md5` conferido idêntico ao original, e **não há `.gitattributes`** no repo que pudesse corromper o binário na normalização de fim de linha). **O PDF foi lido e conferido antes de ser publicado, não aceito por relato** (Artigo IV): é a política genérica da Trifold, "Atualizado em: 12/04/2025", 1 página, com as 7 seções (coleta, uso, compartilhamento, segurança, direitos, consentimento, alterações) e o canal de contato `contato@trifold.eng.br` — e é especificamente sobre **dados de formulário**, exatamente o caso desta landing, não uma política de site genérica fora de contexto. **Marcação:** `<span><a href="assets/politica-de-privacidade.pdf" target="_blank" rel="noopener">Políticas de privacidade</a></span>` nos três formulários (`leadForm`, `leadFormMobile`, `leadFormSaber`). **O texto visível não mudou** — só ganhou link, então a padronização travada na 0.11 e a decisão de checkbox único da 0.10 seguem intactas. **`required` conferido intacto nos três** depois da troca (`grep -c 'type="checkbox" required'` = **3**), e **zero** `<span>Políticas de privacidade</span>` sem link sobrou no arquivo. **CSS:** regra nova `.check a{color:inherit;text-decoration:underline}` — `inherit` porque a cor do texto do checkbox **muda por seção** (`--preto` no hero, `--marrom` na seção "Quer saber mais?", linhas 311/386), então cor fixa destoaria em uma das duas; só o sublinhado marca o link. Padrão inspirado no do Vind Residence (`landing-pages/vind-residence/index.html:523`), mas **não copiado**: lá o `href` é `#` (link morto) e a cor é fixa `var(--verde-escuro)`, que não existe na paleta do Yarden. **Clicar no link não marca o checkbox** — por spec, o `<label>` não repassa a ativação ao controle quando o clique cai em conteúdo interativo descendente; registrado em comentário para ninguém "consertar" com `preventDefault`. **4ª ocorrência incluída de propósito, e por isso o comentário do CSS foi reescrito:** o `<span class="politica">` do rodapé também virou `<a>`. O comentário que vivia ali dizia *"Não há URL de política de privacidade fornecida (...) vira `<a>` no commit em que a URL chegar"* — o gatilho que ele próprio documentava **acabou de disparar**, então deixá-lo como `<span>` obrigaria a manter na árvore um comentário factualmente falso prometendo uma garantia inexistente; o comentário foi reescrito para o estado novo e a regra ganhou `color:inherit` (mantém o `#eeeeee` do rodapé sobre o fundo navy). **Nenhum teste novo — e a proteção foi PROVADA viva, não presumida:** o teste de integridade de `assets/` da 0.9 já varre `href="assets/..."` nos dois sentidos, logo passou a cobrir o PDF automaticamente. Confirmado por **mutação**: apontando o `href` para `assets/politica-INEXISTENTE.pdf`, **2 testes falham** (referência inexistente + asset órfão); `index.html` restaurado e conferido por `md5` idêntico. É a mesma proteção contra "404 silencioso em produção" que o README promete. **(2) README corrigido** porque afirmava que a landing é "servida **em produção** sob `https://trifold.eng.br/yarden/`" — **falso hoje**: T12/T13 (criar o projeto Vercel, deploy) seguem `[ ]` e a URL não serve esta página. Virou destino **planejado**, com aviso explícito de que nada disso está no ar e de que o restante do documento descreve a configuração pretendida. **`.vercelignore` conferido antes de commitar** (`.claude`, `README.md`, `*.test.ts` — o PDF em `assets/` **vai** no deploy; se estivesse ignorado, o link seria 404 e o fix seria pior que o defeito), e `git check-ignore` no PDF volta vazio. **Validações (executadas na branch do PR `feat/86-12-yarden-conteudo-definitivo-v2`, a que está no #553):** `npx vitest run landing-pages/yarden` **2 arquivos / 50 passed**. Suíte completa `npx vitest run`: **43 failed / 3457 passed** — **idêntica ao baseline medido nesta mesma árvore com as minhas mudanças revertidas** (`git stash` + PDF removido), ou seja **0 regressão**; as 28 falhas são artefato de ambiente do worktree (`node_modules` linkado da checkout principal faz `@trifold/ai`/`@trifold/shared` resolverem para a branch de lá — ex. `Cannot find package '@trifold/ai/src/flows/loop-breaker'`), **não** da branch: o CI do PR #553 está verde. Mesmo método para os outros dois gates: `npm run type-check` e `npm run lint` rodados **antes e depois**, saídas comparadas por `diff` — **idênticas** (type-check: as mesmas 14 linhas de erro de resolução `@trifold/*`; lint: **0 errors / 30 warnings**, todas pré-existentes de `packages/web`, nenhuma em `landing-pages/`). Nota de ambiente reconfirmada: `type-check` precisa de `NODE_OPTIONS=--max-old-space-size=8192`. **Escopo mínimo, `vind-residence` NÃO tocado** (`git status` limpo lá) — o mesmo defeito de política sem link existe na 86-11 em produção e **segue aberto de propósito**, fora do escopo deste fix; resolver só aqui já deixa as duas landings divergentes nesse ponto, o que vale um follow-up próprio. **Documentação desatualizada que NÃO é minha alçada, sinalizada em vez de editada:** o `86.12-QA-002` ainda aparece como `low`/OPEN na tabela de achados e no Gate Status das **QA Results** (linhas ~1213/~1331) e como dependência em aberto no **DT-1** (`## Débitos técnicos conhecidos`, ~700) — QA Results é do @qa e a seção de débitos foi criada pelo @po, então a re-verificação e o fechamento formal do gate são deles. Dentro da minha alçada, a pendência (3) do Dev Agent Record foi marcada **RESOLVIDA**. **DT-1 (aceite não persistido) segue ABERTO e inalterado** — ter link para a política não grava consentimento nenhum; ao contrário, remove a objeção que o próprio DT-1 registrava ("um aceite persistido apontaria para um texto que não existe publicamente"). Nenhum checkbox de task tocado; T12/T13 seguem `[ ]` com @devops. **Status NÃO alterado (`InReview`).** Commit local com pathspec explícito (a árvore tem trabalho em voo de outros agentes, não tocado), **sem `git push`** — alçada do @devops. | @dev (Dex) |

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (`claude-opus-5[1m]`) — @dev (Dex), modo autônomo (YOLO).

### Escopo executado

**T0–T11 completas. T12/T13 NÃO iniciadas** — são de @devops (criar o projeto
Vercel `yarden`, replicar `LANDING_PAGE_WEBHOOK_SECRET`, deploy, validação
end-to-end no Test Events + não-regressão do Vind Residence em produção).
Nenhum `git push` foi executado.

Conforme o bloco "Pré-requisito de infraestrutura", a ausência do projeto Vercel
não bloqueou nada de T1–T11: `https://yarden.vercel.app` já é valor definitivo e
foi usado como tal em `ALLOWED_ORIGINS`, nos `rewrites` da CSP e nos dois
endpoints do `index.html`.

### Decisões autônomas

Registradas em `.ai/decision-log-86-12.md` (D1–D8). As que mudam algo que a story
prescrevia literalmente ou que introduzem comportamento não pedido:

- **D1 — `hasOwnProperty` no lugar do `slug in LANDING_CONFIGS` do esboço do AC5.**
  O operador `in` encontra propriedades herdadas de `Object.prototype`:
  `resolveLandingConfig("constructor")` cairia no ramo "slug conhecido" e
  devolveria a **função** `Object` como se fosse uma config —
  `contentCategory` viria `undefined` e o evento CAPI sairia sem categoria, em
  silêncio, a partir de um corpo JSON que qualquer chamador com o token controla.
  Há teste dedicado; ele falha com `in`.
- **D2 — o `montarTracking` do Yarden nunca devolve `null`.** Com `landing`
  sempre presente, o `if (tracking) payload.tracking = tracking` do proxy do Vind
  Residence virou código morto e não foi clonado. A divergência está comentada no
  arquivo. Sem `event_id` o CRM continua não disparando evento nenhum.
- **D3 — `connect-src` dos 3 blocos novos de CSP aponta para
  `https://yarden.vercel.app`**, não para `vind-residence.vercel.app`. O AC9
  deixava isso condicional; a condição se verifica, porque o `index.html` chama
  os dois endpoints por URL absoluta. Os blocos do Vind Residence não foram
  tocados.
- **D4/D5 — o placeholder NÃO clona o WhatsApp flutuante, o `href="#"` da
  política de privacidade nem nenhuma referência a `assets/`.** Não há número,
  URL de política nem imagens fornecidos (Artigo IV). Um número clonado mandaria
  lead do Yarden para a conversa do outro empreendimento; um `assets/` copiado
  publicaria renders do empreendimento errado. Os dois checkboxes obrigatórios do
  AC12 existem (o de política como texto sem link).
- **D6 — teste novo além do pedido:** `landing-pages/yarden/tracking-browser.test.ts`
  extrai os dois `<script>` inline do `index.html` e os executa com globais
  falsos (sem jsdom, que o projeto não usa). A story deixava o `index.html` como
  verificação **manual**, mas as classes de erro mais prováveis num arquivo
  clonado são todas silenciosas em produção: id do Pixel divergindo entre
  `fbq('init')` e o `<noscript>` (o próprio @po levantou isso no AC1), endpoints
  ainda apontando para `vind-residence.vercel.app`, e o `console.log('[lead
  capturado]', data)` (`86.11-QA-005`) voltando num merge. O mesmo harness
  automatiza os itens do AC11 que só existiriam como teste manual.
- **D7 — `<meta name="robots" content="noindex, nofollow">` no placeholder**
  (comportamento não pedido pela story). A URL hoje é 404; indexar uma página sem
  conteúdo cria um resultado de busca ruim para o nome do empreendimento. Não
  afeta tráfego pago nem o Pixel/CAPI. **Risco introduzido:** se ninguém remover
  a tag junto com o conteúdo definitivo, a landing final fica fora da busca
  orgânica em silêncio — está como **passo 0** do checklist "Integrar o conteúdo
  definitivo" no `README.md` do projeto.
- **D8 — comentários das rotas compartilhadas** deixaram de afirmar que servem
  "a landing do Vind Residence", porque depois do AC5 isso é falso. Nenhuma linha
  de lógica além do que AC6/AC7 pedem.

### Notas de implementação

- **AC10, defeito herdado NÃO clonado:** o `index.html` do Yarden não tem
  `console.log` nenhum. O branch `else { console.log('[lead capturado]', data) }`
  do Vind Residence (`86.11-QA-005`, OPEN — imprime `fbc`/`fbp` no console do
  browser) foi removido junto com a condicional `if (CONFIG.leadEndpoint)`, que
  no Yarden nunca é falsa. Há assert estático travando o retorno
  (`not.toMatch(/console\.(log|debug|info)/)`).
- **AC6 usa `tracking?.landing`** (opcional), não `tracking.landing` como no
  esboço da story: nessa rota `lerTracking` pode devolver `undefined` e o
  encadeamento direto não compila. `resolveLandingConfig(undefined)` cai no
  default, que é exatamente o comportamento desejado.
- **AC5, não-regressão provada por valor, não por confiança:** o teste compara
  `resolveLandingConfig(undefined)` e `resolveLandingConfig("vind_residence")`
  contra um objeto literal com as três strings da 86-11 escritas à mão no teste
  (`landing_vind_residence` / `Landing Vind Residence` /
  `https://trifold.eng.br/vindresidence/`). Se alguém mudar o `LANDING_CONFIGS`,
  o teste acusa em vez de acompanhar a mudança.
- **`page` vs `landing` são campos distintos e ambos foram trocados** (achado do
  @po no AC8): `page: "yarden"` (identidade do lead no CRM, só em `lead.js`) e
  `tracking.landing: "yarden"` (segmentação Meta, nos dois proxies). Há assert
  positivo dedicado para cada um, e um caso provando que um `landing` forjado
  pelo browser é sobrescrito pelo proxy.
- **`landing` NÃO foi adicionado a `TRACKING_FIELDS`/`TRACK_FIELDS`** — essas
  listas são de campos lidos do corpo do browser, e `landing` é constante do
  arquivo. É atribuição direta depois do loop, para sobrescrever qualquer
  tentativa de forja.
- `landing-pages/vind-residence/*` **não foi tocado** (fora de escopo explícito).
  Os proxies dele continuam sem enviar `landing` e caem no `DEFAULT_LANDING_SLUG`.
- **Sem migration, sem env nova no `trifold-crm`, sem rota nova.** A única env
  nova é `LANDING_PAGE_WEBHOOK_SECRET` replicada (mesmo valor) no projeto Vercel
  do Yarden — T12, @devops.
- CodeRabbit não rodou: `coderabbit_integration` continua ausente de
  `core-config.yaml` (desabilitado neste projeto).

### Validações executadas

| Comando | Resultado |
|---|---|
| `npx vitest run` (suíte completa, raiz) | ✅ **255 arquivos, 3146 passed + 6 expected fail** — zero regressão |
| `npx vitest run landing-pages packages/web/src/lib/meta packages/web/src/app/api/webhooks/landing-page` | ✅ 11 arquivos, 167 testes |
| `npm run type-check` (turbo, 8 tasks) | ✅ 8/8 successful |
| `npm run lint` (turbo, 8 tasks) | ✅ 8/8 successful — 0 errors, 34 warnings, **todas pré-existentes em arquivos não tocados por esta story** |
| Balanceamento de tags do `index.html` | ✅ nenhuma tag não fechada, nenhum fechamento fora de ordem |
| `node -e` parse de `vercel.json` | ✅ 2 redirects / 5 rewrites / 7 blocos de headers, catch-all `/((?!vindresidence\|yarden).*)` |

Testes novos: **41** (21 em `api-proxy.test.ts`, 20 em `tracking-browser.test.ts`)
+ 8 casos acrescentados aos 3 arquivos de teste existentes.

### Pendências (fora do controle do @dev)

1. **T12 (@devops)** — criar o projeto Vercel `yarden` e replicar
   `LANDING_PAGE_WEBHOOK_SECRET` (mesmo valor do `vind-residence`) via
   `scripts/vercel-env-set.sh` / REST API. **Nunca `vercel env add` via pipe** —
   grava valor vazio em silêncio (2 incidentes anteriores). Se o nome `yarden`
   estiver indisponível no scope, escalar ao stakeholder: o literal aparece em
   `ALLOWED_ORIGINS` (2 arquivos), nos `rewrites`/`connect-src` da CSP e nos 2
   endpoints do `index.html`.
2. **T13 (@devops)** — validação end-to-end com `META_CAPI_TEST_EVENT_CODE`
   (dataset `1337310707164669`, filtrar `content_category: "landing_yarden"`),
   **mais a não-regressão do Vind Residence em produção** (`landing_vind_residence`
   + `metadata.landing_page: "vind-residence"`), e remoção da env de teste.
   Os testes unitários provam a função `resolveLandingConfig`, não o deploy.
3. **Ordem de deploy** (sem ela o Pixel fica bloqueado mesmo com a landing no ar):
   (1) `packages/web` → (2) projeto `yarden` → (3)
   `landing-pages/trifold-design-system` (CSP).
4. **Conteúdo/copy definitivo** (AC12) — dependência externa do usuário. Checklist
   de integração em `landing-pages/yarden/README.md`, incluindo remover o
   `noindex` e preservar os `id` dos campos do formulário.

### File List

**Criados**

- `landing-pages/yarden/index.html`
- `landing-pages/yarden/api/lead.js`
- `landing-pages/yarden/api/track.js`
- `landing-pages/yarden/api-proxy.test.ts`
- `landing-pages/yarden/tracking-browser.test.ts`
- `landing-pages/yarden/package.json`
- `landing-pages/yarden/README.md`
- `landing-pages/yarden/.gitignore`
- `landing-pages/yarden/.vercelignore`
- `.ai/decision-log-86-12.md`
- `landing-pages/yarden/assets/` — **13 arquivos**: 12 recortes do mockup "Yarden
  LP v1.png" (rodada 0.9) + o PDF da política de privacidade (rodada 0.14).
  Nenhum é ignorado pelo git (`git check-ignore` vazio nos 13) e nenhum é órfão —
  há teste exigindo que os dois sentidos fechem
  (referência → arquivo e arquivo → referência):
  - `politica-de-privacidade.pdf` (política de privacidade da Trifold, PDF do
    stakeholder; alvo dos 4 links de política — 3 checkboxes + rodapé)
  - `hero-piscina-rooftop.jpg` / `hero-piscina-rooftop.webp` (hero, ≥980px)
  - `hero-piscina-rooftop-mobile.jpg` / `hero-piscina-rooftop-mobile.webp` (hero, mobile + fallback `<img>`)
  - `interior-lounge-gourmet.jpg` / `interior-lounge-gourmet.webp`
  - `mapa-gleba-itororo.jpg` / `mapa-gleba-itororo.webp`
  - `familia-quer-saber-mais.jpg` / `familia-quer-saber-mais.webp` (seção "Quer saber mais?")
  - `logo-yarden-creme.svg` (wordmark do hero + rodapé)
  - `logo-trifold-branco.svg` (rodapé)

**Modificados**

- `packages/web/src/lib/meta/landing-page-tracking.ts` (AC5 — `LandingSlug`,
  `LandingConfig`, `LANDING_CONFIGS`, `DEFAULT_LANDING_SLUG`,
  `resolveLandingConfig`, `TrackingLanding.landing?`; remoção das 3 constantes
  `LANDING_VIND_*`)
- `packages/web/src/lib/meta/landing-page-tracking.test.ts` (5 casos novos de
  `lerTracking` + bloco `resolveLandingConfig` com 6 casos)
- `packages/web/src/app/api/webhooks/landing-page/route.ts` (AC7)
- `packages/web/src/app/api/webhooks/landing-page/route.test.ts` (3 casos novos)
- `packages/web/src/app/api/webhooks/landing-page/track/route.ts` (AC6)
- `packages/web/src/app/api/webhooks/landing-page/track/route.test.ts` (3 casos novos)
- `landing-pages/trifold-design-system/vercel.json` (AC9)
- `docs/stories/86-12-pixel-capi-landing-yarden.story.md` (este registro)

**Não tocados de propósito:** `landing-pages/vind-residence/*` (fora de escopo
explícito — o default de `resolveLandingConfig` preserva o comportamento sem
precisar editar os proxies dele).

**Revisão CodeRabbit do PR #512 (2026-08-28)** — os 6 achados `Minor` foram
corrigidos nos arquivos que já constam acima; nenhum arquivo novo foi criado:

| Arquivo | Achado endereçado |
|---|---|
| `landing-pages/trifold-design-system/vercel.json` | #1 — `'unsafe-eval'` removido do `script-src` dos **3** blocos `/yarden*` |
| `landing-pages/yarden/api/lead.js` | #2 — token do CRM via `Authorization: Bearer` no lugar de `?token=` |
| `landing-pages/yarden/api/track.js` | #2 — idem |
| `landing-pages/yarden/api-proxy.test.ts` | #2 — stub de `fetch` passou a capturar headers; assertion de query string trocada por header + 1 caso novo cobrindo o `lead.js` |
| `landing-pages/yarden/index.html` | #3 — `role="status"`/`aria-live="polite"` no `#formMsg`; #4 — guarda de duplo submit |
| `landing-pages/yarden/tracking-browser.test.ts` | #3/#4 — 2 casos estáticos novos travando a live region e a guarda de duplo submit |
| `landing-pages/yarden/README.md` | #5 — `tracking-browser.test.ts` na árvore e na seção de testes; 2 pontos novos em "não pode regredir" (token no header, Pixel não precisa de `unsafe-eval`) |
| `packages/web/src/app/api/webhooks/landing-page/route.test.ts` | #6 — `toHaveLength(2)` nos 3 testes de batch CAPI + `content_category` conferida no **segundo** evento |

**Ainda com `'unsafe-eval'` de propósito:** os 3 blocos `/vindresidence*` e o
catch-all do `vercel.json`. São herança da 86-11 e do design system, fora do
escopo desta story — removê-los aqui misturaria um risco de regressão em
`trifold.eng.br` inteiro com um fix de landing.

**2ª rodada de revisão CodeRabbit do PR #512 (2026-08-28)** — 3 achados novos,
todos sobre o código da 1ª rodada. Nenhum arquivo novo criado:

| Arquivo | Achado endereçado |
|---|---|
| `landing-pages/yarden/api/lead.js` | #1 — `CRM_TIMEOUT_MS = 8000` + `AbortController`/`signal` na chamada ao CRM, `504` no timeout e `clearTimeout` no `finally`; #3 — aspas simples no bloco de opções do `fetch` |
| `landing-pages/yarden/api/track.js` | #1/#3 — idem |
| `landing-pages/yarden/api-proxy.test.ts` | #1 — `describe` novo com 5 casos de teto de tempo; `vi.useRealTimers()` no `afterEach` para os fake timers não vazarem para a suíte |
| `docs/stories/86-12-pixel-capi-landing-yarden.story.md` | #2 — MD056: `\|` escapado em `2 failed \| 42 passed` na linha 0.6 do Change Log |

**Por que 8000ms e não 10000ms:** `landing-pages/yarden/` **não tem
`vercel.json`**, então vale o `maxDuration` default da plataforma (10s). Um teto
igual ao da infraestrutura nunca dispararia primeiro — o fix seria decorativo, e
o browser continuaria recebendo o erro genérico da Vercel em vez do `504`
tratado. Os 10s de `AbortSignal.timeout(10_000)` em
`packages/web/src/lib/meta/*` **não** foram copiados por isso: lá o limite
externo é outro. Há teste travando o valor (mutação `8000` → `12000` derruba).

**Aspas simples só no bloco do `fetch`:** os dois proxies são 100%
duplas-aspas (clone do Vind Residence, `0` aspas simples antes desta rodada), e
a convenção do `.coderabbit.yaml` para `**/*.js` é simples. Converter o arquivo
inteiro seria ~106 trocas enterrando os fixes reais no diff a um commit do
merge; ficou só o trecho apontado. **A inconsistência residual é consciente** —
normalizar `landing-pages/{yarden,vind-residence}/api/*` inteiros é item de
débito técnico separado, não desta story. Nenhum linter cobre esses arquivos
hoje (`yarden-landing` não tem script de `lint`), então não há gate quebrado.

**Conteúdo/design definitivos (2026-09-01, rodada 0.9)** — nenhum arquivo novo
além dos 12 assets acima:

| Arquivo | O que mudou |
|---|---|
| `landing-pages/yarden/index.html` | placeholder → página definitiva do mockup "Yarden LP v1.png": hero `<picture>` responsivo, diferenciais, interior/lounge, mapa da Gleba Itororó, "Quer saber mais?" e rodapé; **3 marcações de formulário** (`leadForm`, `leadFormMobile`, `leadFormSaber`) ligadas pela mesma `ligarFormulario()`; `<meta name="robots" content="noindex, nofollow">` **removido**; Pixel/CAPI e os helpers do `<head>` **não recriados** |
| `landing-pages/yarden/tracking-browser.test.ts` | teste obsoleto da era do placeholder reapontado — a proibição de **todo** `assets/` virou integridade bidirecional HTML↔diretório (lê `assets/` do disco, cobre `srcset`, veta `/vind[-]?residence/`, piso de 12 referências contra passar por vacuidade) |
| `landing-pages/yarden/README.md` | "Status do conteúdo: placeholder" → definitivo; `assets/` na árvore; "Integrar o conteúdo definitivo" (passos já executados, incl. remover o `noindex`) → "Alterar o conteúdo depois", com a tabela dos 3 formulários e a regra de `assets/` |
| `docs/stories/86-12-pixel-capi-landing-yarden.story.md` | este registro + Change Log 0.9 |

**Não tocados nesta rodada:** `landing-pages/yarden/api/lead.js`, `api/track.js`
e `api-proxy.test.ts` — a mudança é de conteúdo/apresentação, o contrato dos
proxies não mexeu (os 2 arquivos de teste do yarden somam 50 casos, todos
verdes). `packages/web/*` e `landing-pages/trifold-design-system/vercel.json`
também intactos: os 3 formulários novos postam no **mesmo** `CONFIG.leadEndpoint`,
logo não há rota, CSP nem env a alterar.

**Divergências abertas para @po (nenhuma bloqueia commit ou merge):**

1. **AC12 pede "os mesmos dois checkboxes da 86-11"; o mockup definitivo traz um
   só.** O Vind Residence tem o aceite `required` de políticas **mais** um opt-in
   não-`required` de "receber comunicações e ser contatado"; o Yarden definitivo
   traz só o aceite `required`, nos três formulários. Não acrescentei o segundo:
   inventar UI ausente do mockup é o que o Artigo IV e o próprio AC12 proíbem.
   Impacto técnico **zero** — nenhum dos dois checkboxes viaja no payload (`data`
   leva só `nome`/`whatsapp`/`email`/`empresa`), então CRM, lead e CAPI são
   idênticos com ou sem ele. É decisão de consentimento/negócio, a confirmar
   antes do T13.
2. **O texto do AC12 ainda descreve a página como "placeholder estrutural"** e a
   integração do conteúdo como "follow-up não numerado ainda". O código passou
   desse ponto; seção de AC é alçada do @po (`story-lifecycle.md`), então não foi
   editada.
3. ~~**`86.12-QA-002` (checkbox de política sem link) segue aberto, agora com 2
   ocorrências:** o `<span>` do checkbox e o `<span class="politica">` do rodapé,
   nenhum com `href`. Na 86-11 o link existe mas aponta para `#` — não há URL de
   política publicada para reusar. É conteúdo pendente do stakeholder.~~
   **✅ RESOLVIDA em 2026-09-02 (Change Log 0.14).** O stakeholder forneceu o PDF
   da política; ele passou a viver em
   `landing-pages/yarden/assets/politica-de-privacidade.pdf` e as **4** ocorrências
   (3 checkboxes + rodapé) são `<a href>` de verdade. `86.12-QA-002` está fechado
   — a re-verificação do veredito é do @qa.

> **⚖️ RESOLVIDAS pelo @po em 2026-09-01 — (1) e (2) estão FECHADAS, não são mais
> pendências.** Fonte de verdade: a emenda no fim do **AC12** (Change Log 0.10).
> **(1)** Checkbox único confirmado pelo stakeholder — decisão **travada**, a
> ausência do segundo checkbox é o comportamento aceito e **não é pendência de
> T13**. **(2)** AC12 reconciliado com o entregue. **(3)** segue OPEN (conteúdo do
> stakeholder), `low`, **não bloqueia T12/T13**. Nada aqui exige mudança de código:
> `landing-pages/yarden/index.html` fica **como está**. @devops pode seguir para
> T12/T13 sem esperar decisão de consentimento.

## QA Results

### Review Date: 2026-08-26

### Reviewed By: Quinn (@qa — Test Architect)

**Veredito: PASS** · Gate: `docs/qa/gates/86.12-pixel-capi-landing-yarden.yml`

**Metadata conferida rodando `git`, não lida do contexto da sessão:** branch
`docs/86-12-story-draft`, HEAD `eac7d1eb` (só commits de @sm/@po — a
implementação T1–T11 está **não commitada** no working tree).
`git ls-remote --heads origin docs/86-12-story-draft` devolve **vazio**: o branch
não existe no remoto, **nenhum `git push` aconteceu**. Não há `.vercel/` em
`landing-pages/yarden/` — T12 não foi tentada.

#### Como revisei

Esta é a segunda cópia do padrão da 86-11, e o modo de falha dominante de um
clone é silencioso: o código funciona, os testes passam, e o dado sai rotulado
para o empreendimento errado. Nada foi aceito por relato do @dev — cada guarda
crítica foi **mutada** para confirmar que existe um teste que morre sem ela.

**8 mutações, 8 mataram teste:**

| # | Mutação | Resultado |
|---|---|---|
| M1 | `hasOwnProperty.call(...)` → `slug in LANDING_CONFIGS` | ❌ 1 falha |
| M2 | `page: PAGE_NAME` → `page: "vind-residence"` | ❌ 1 falha |
| M3 | remove `tracking.landing = LANDING_SLUG` | ❌ 5 falhas |
| M4 | id do `<noscript>` → outro dataset | ❌ 1 falha |
| M4b | `TRACK_ENDPOINT` → `vind-residence.vercel.app` | ❌ 1 falha |
| M4c | reintroduz `console.log('[lead capturado]', data)` | ❌ 1 falha |
| M5 / M6 | `resolveLandingConfig(tracking.landing)` → `(undefined)` | ❌ 1 / 2 falhas |
| M7 / M8 | `confiarEmClientIpDoCorpo: true` → `false` | ❌ 1 / 2 falhas |

Arquivos restaurados e conferidos por `sha256` contra o backup pré-mutação;
suíte completa re-executada depois, com o mesmo resultado.

#### Pontos de atenção — verificados um a um

- **AC5 — guarda de prototype chain (D1): CONFIRMADA.**
  `landing-page-tracking.ts:82` usa
  `Object.prototype.hasOwnProperty.call(LANDING_CONFIGS, slug)`, com teste
  cobrindo `constructor`/`toString`/`hasOwnProperty`/`__proto__`. M1 prova que o
  teste morre com `in`.
- **AC5 — não-regressão do Vind Residence: provada por VALOR, não presumida.**
  O teste compara `resolveLandingConfig(undefined)` e `("vind_residence")`
  contra um literal com as 3 strings da 86-11 escritas à mão
  (`landing_vind_residence` / `Landing Vind Residence` /
  `https://trifold.eng.br/vindresidence/`) — se alguém mudar o
  `LANDING_CONFIGS`, o teste acusa em vez de acompanhar.
- **AC8 — `payload.page`: correto.** `page: PAGE_NAME` com
  `const PAGE_NAME = "yarden"`, com assert **positivo**
  (`expect(payload.page).toBe("yarden")`). O achado do @po está travado (M2).
- **AC8 — trust boundary: no lugar certo.** `landing` é `const LANDING_SLUG`
  nos dois proxies, **fora** de `TRACKING_FIELDS`/`TRACK_FIELDS`, atribuído
  **depois** do loop da allowlist. Teste manda `landing: "vind_residence"` no
  corpo e assere que sai `"yarden"`.
- **AC7 — precedência de IP/UA: correta e não regredida.**
  `(confiaNoCorpo ? texto(corpo?.client_ip) : undefined) ?? ipDaRequest(request)`
  — corpo primeiro, request só como fallback, nunca o contrário. `form-capi.ts`
  **não aparece no `git diff`**: a alegação de não ter sido tocado é literal.
  M7/M8 provam que a precedência é testada de verdade nas duas rotas.
- **AC1 — dataset nos dois lugares: idênticos.** `1337310707164669` no
  `window.TRIFOLD_PIXEL_ID` (linha 30, usado no `fbq('init')` linha 39) e no
  `<noscript>` (linha 272), com teste comparando os dois entre si (M4).
- **AC9 — catch-all da CSP: `/((?!vindresidence|yarden).*)`.** Os dois no
  negative lookahead. Inventário do arquivo por parse: 2 redirects, 5 rewrites,
  7 blocos de headers. Blocos do Vind intocados exceto o regex.
- **AC10 / `86.11-QA-005`: defeito NÃO clonado.** Nenhum `console.*` executável
  no `index.html` do Yarden — só dois comentários explicando a omissão, com
  assert estático travando o retorno (M4c).
- **Suíte re-executada por mim** (não pelo relato): `npx vitest run` → 255
  arquivos, 3146 passed + 6 expected fail, exit 0. `type-check --force` → 8/8,
  **0 cached**. `lint --force` → 8/8, **0 errors**, 34 warnings, e grep confirma
  que **nenhuma** está em arquivo tocado por esta story.

#### Falsos positivos descartados

- `var VISITOR_KEY` "duplicado" era artefato do meu próprio comando (`sed` com
  ranges sobrepostos). `grep` confirma **uma** declaração.
- `.vercelignore` untracked é o estado normal de um diretório novo:
  `git check-ignore` nos 9 arquivos do projeto retorna **nenhum ignorado**, então
  ele será versionado. A armadilha que expôs `.claude` no `trifold-design-system`
  não se repete.
- Blocos novos de CSP sem `X-Frame-Options`: os do Vind também não têm, e
  `frame-ancestors 'none'` cobre. Clone fiel, não regressão.

#### Achados (nenhum bloqueante)

| ID | Sev | Achado | Ação sugerida |
|---|---|---|---|
| `86.12-QA-001` | low | `<meta robots noindex>` (D7) é comportamento não pedido; a mitigação é uma linha de README, não um teste — esquecê-la deixa a landing definitiva fora da busca orgânica em silêncio | Decisão aceitável para placeholder. Criar item de backlog amarrado à entrega do AC12 em vez de confiar só no README |
| `86.12-QA-002` | low | Checkbox de política de privacidade é `required` mas sem link (D4 — nenhuma URL fornecida) | Decisão correta (melhor sem link que com `href="#"` morto). Fornecer a URL junto com o conteúdo do AC12 |
| `86.12-QA-003` | low (herdado) | `86.11-QA-003` (sem rate limit em `/landing-page/track`) segue OPEN e esta story **dobra** a superfície: o proxy `yarden/api/track.js` também não tem. O CRM exige token (401 sem ele), então o alvo é o proxy | Fora de escopo pelo AC10 e correto assim. Manter no backlog da 86-11 com a nota da superfície dobrada |

#### Pendências que bloqueiam o deploy (não o merge)

T12 e T13 são de **@devops** e continuam abertas por desenho. Detalhamento em
`notas_para_devops` no arquivo de gate — em especial: a implementação está
**não commitada**; a ordem de deploy (`packages/web` → projeto `yarden` → CSP)
é carga viva; `LANDING_PAGE_WEBHOOK_SECRET` **nunca** via `vercel env add` por
pipe; e a não-regressão do Vind Residence em produção é obrigatória no AC13.

### Gate Status

Gate: PASS → `docs/qa/gates/86.12-pixel-capi-landing-yarden.yml`

**Status: mantido em `InReview`, liberado para @devops.** Não promovi para `Done`,
e o motivo é factual: `story-lifecycle.md` atribui a transição para `Done` ao
**@devops após o push** ("Done | @qa PASS, @devops pushes | @devops"), e neste
momento nada foi commitado, nada foi deployado e o **AC13 não foi validado**
(T12/T13 abertas). É o mesmo tratamento que a story-irmã 86-11 recebeu: gate PASS
na iteração 2 com `Status: InReview`, e `Done` só num commit posterior, depois de
o @devops verificar o AC11/T12 com browser real.

Marcar `Done` agora afirmaria "está em produção" sobre uma landing que não existe
em produção — exatamente a classe de rótulo silenciosamente errado que esta
revisão passou o tempo todo prevenindo. **O gate está PASS: não há nada pendente
do lado do @dev.** A transição para `Done` cabe ao @devops depois de T12
(projeto Vercel + secret), do push/deploy na ordem correta e de T13 (Test Events
com `content_category: "landing_yarden"` + não-regressão do Vind Residence).

— Quinn, guardião da qualidade 🛡️

---

### Review Date: 2026-09-01 — iteração 2 (conteúdo definitivo, 3 formulários)

### Reviewed By: Quinn (@qa — Test Architect)

**Veredito: CONCERNS** (não bloqueante) · Gate: `docs/qa/gates/86.12-pixel-capi-landing-yarden.yml`

**Metadata conferida rodando `git`/`gh`, não lida do contexto do spawn:** branch
`feat/86-12-yarden-conteudo-definitivo`, HEAD `f2ad92e9`, 5 commits novos desde o
gate da iteração 1 (`aee1fb54`, `8606f09b`, `b8ed634b`, `49954854`, `f2ad92e9`).
`git ls-remote --heads origin feat/86-12-yarden-conteudo-definitivo` → **vazio**;
`gh pr list --head feat/86-12-yarden-conteudo-definitivo` → **`[]`**. **Nenhum
push, nenhum PR.** Não há `.vercel/` em `landing-pages/yarden/` — T12 não tentada.
O PR #512 é da iteração 1 e está MERGED desde 2026-08-28 (squash `0c2b4eb8`).

#### Escopo real desta leva — delimitado por `git diff`, não por relato

`git diff 5a115358..HEAD --stat -- landing-pages/yarden/api landing-pages/trifold-design-system packages/`
volta **vazio**. Os proxies, a CSP e o CRM não foram tocados: o PASS da iteração 1
continua valendo na íntegra para AC5/AC6/AC7/AC8/AC9, sem re-verificação. Esta
revisão cobre o que mudou — `index.html` (775 linhas de diff), 12 assets novos,
`tracking-browser.test.ts` e `README.md`.

#### O que está certo (verificado no código, não no relato)

- **Isolamento dos 3 formulários — real.** `ligarFormulario(form, msg)` é chamada
  uma vez por par; `var enviando = false` (`index.html:710`) vive **dentro** do
  closure; o honeypot é lido por `form.empresa.value` (`:723`) — acesso nomeado do
  `HTMLFormElement`, escopado ao `<form>` — e nunca por `getElementById`; os 3
  honeypots têm `id` distintos (`uniq -d` sobre todos os `id` do arquivo volta
  vazio); `eventIdLead`/`eventIdCadastro` são gerados dentro do handler (`:732-733`),
  a cada submissão; `botaoEnviar` vem de `form.querySelector`, não de seletor global.
- **Dataset idêntico nos 2 pontos do `<head>`:** `1337310707164669` no
  `window.TRIFOLD_PIXEL_ID` (`:30`, usado no `fbq('init')` `:39`) e no `<noscript>`
  (`:474`).
- **AC10:** a **única** ocorrência de `console.` no arquivo inteiro está na linha
  790, **dentro de um comentário** que explica por que o log do Vind não foi clonado.
- **Checkbox padronizado:** os 3 blocos `label.check` (519-522 / 551-554 / 625-628 —
  exatamente as linhas da tabela do AC12) são **byte-a-byte idênticos**, md5
  `21132e2e14ba53163e602ca03cffeddc` após remover indentação.
- **`noindex` removido** (`git diff` mostra a linha `-  <meta name="robots" ...>`),
  com o README ganhando a proibição de reintroduzi-lo. Fecha `86.12-QA-001`.
- **Bijeção HTML↔assets exata:** 12 arquivos no disco, 12 referências únicas.
  Nenhum ignorado pelo git; o `.vercelignore` (`.claude`, `README.md`, `*.test.ts`)
  **não** exclui `assets/` — conferi, porque excluir seria 404 silencioso sob o hero.
- **Story bate com o código:** tabela "estado real" do AC12, DT-1 (checkboxes sem
  `id`/`name`, `data` em `:719-723`, payload do proxy em `api/lead.js:188-192`) e
  File List — todos **corretos** quando cruzados com o arquivo.

#### Mutação — 11 aplicadas, 6 mataram teste, **5 sobreviveram**

Cada mutação foi aplicada por script que aborta se o texto-alvo não aparecer
exatamente 1× (mutação não-aplicada é falso verde), e revertida por
`git checkout --` com `git status` limpo ao final.

**Mataram teste (a guarda é real):** srcset apontando para arquivo inexistente
(2 falhas); asset novo nomeado `hero-vind-residence.svg` (1); asset órfão no disco
(1); volta ao placeholder, zero refs (2, inclui o piso `>= 12`); id divergente no
`<noscript>` (1); retorno do `console.log('[lead capturado]', data)` (1).

**Sobreviveram — 23 passed em todas:**

| Mutação | Efeito real em produção |
|---|---|
| `var enviando` içada para fora do closure de `ligarFormulario` | trava de duplo-envio vira **global**: preencher o 2º formulário com o 1º em voo é barrado — exatamente o que o comentário do arquivo (`:691-698`) diz que não pode acontecer |
| remove `['leadFormMobile','formMsgMobile']` de `FORMULARIOS` (`:801`) | formulário do hero mobile fica **inerte**: sem listener, sem lead, sem CAPI |
| remove `tabindex`/`aria-hidden` do honeypot `empresaSaber` (`:610`) | honeypot entra na tabulação; usuário real o preenche e é classificado como bot |
| remove `role="status"`/`aria-live` do `#formMsgSaber` (`:630`) | leitor de tela não anuncia sucesso nem erro naquele formulário |
| apaga o `label.check` inteiro do `leadFormSaber` | 3º formulário volta a enviar lead sem aceite de política |

Causa comum: as asserções estáticas de `tracking-browser.test.ts` foram escritas na
era do formulário único e não acompanharam a passagem para 3 — `:106` lista só os 6
`id` do hero desktop, `:110-111` só `#empresa`, `:118-119` só `#formMsg`, e
`:126-131` procura literais que **sobrevivem** ao içamento da variável.

#### Achados

| ID | Sev | Achado | Ação sugerida |
|---|---|---|---|
| `86.12-QA-005` | medium | A garantia-título da leva (trava de duplo-envio **por formulário**) não tem teste: içar `var enviando` para fora do closure deixa a suíte verde | Caso que prove que submeter o form A não bloqueia o B, ou assert estrutural de que `var enviando` fica entre `function ligarFormulario(` e `form.addEventListener` |
| `86.12-QA-004` | medium | `leadFormMobile` e `leadFormSaber` são funcionalmente não testados — 4 mutações independentes sobreviveram, inclusive deixar um formulário inteiro inerte | Parametrizar as 3 asserções estáticas sobre a tabela dos 3 formulários + assert de que os 3 pares estão em `FORMULARIOS` + `exatamente 3` checkboxes `required` |
| `86.12-QA-006` | low | `index.html:617` — `nomeSaber` é `required` mas o placeholder é `"Nome"`, sem o `* ` que os outros 8 campos usam (inclusive os 2 do mesmo formulário) | Confirmar com @po se é fidelidade ao mockup naquele ponto ou esquecimento. Se for esquecimento, 1 caractere |
| `86.12-QA-007` | low | Resíduo factual no **Dev Agent Record** (D4/D5: "Os dois checkboxes obrigatórios do AC12 existem" — falso desde a emenda 0.10/0.11; D7 remete a seção de README que não existe mais; tabela de validações ainda com 3146 testes). AC12, DT-1, File List e README estão corretos — o desalinho é só nesse bloco, que é alçada do @dev | @dev: marcar D4/D5 e D7 como histórico superado, apontando para a emenda do @po e o Change Log 0.11/0.12 |
| `86.12-QA-008` | low | Buraco latente: o extrator de refs (`tracking-browser.test.ts:31-42`) só casa caminhos que começam literalmente com `assets/` — um `./assets/x.webp` inexistente escaparia. Hoje o HTML tem **zero** caminhos nessa forma | Normalizar `./`/`/` iniciais ou casar por `/(?:^\|\/)assets\//`. 2 linhas |

`86.12-QA-001` → **RESOLVIDO** (noindex removido). `86.12-QA-002` → OPEN,
inalterado. `86.12-QA-003` → INHERITED, inalterado (`api/track.js` não tocado).

**DT-1 não é achado meu** — conferi contra o código e a descrição da story está
correta; é débito aceito explicitamente pelo stakeholder.

#### Falsos positivos descartados

- **`name="empresa"` repetido nos 3 honeypots** parecia o bug clássico de `id`
  duplicado. Não é: os `id` são distintos e o handler usa `form.empresa`, resolvido
  dentro do `<form>`. Compartilhar o `name` é correto (é o que o proxy espera).
- **Dois formulários de hero no DOM ao mesmo tempo** não duplicam captação: as media
  queries são `min-width:980px` e `max-width:979.98px` — sem lacuna, sem sobreposição.
- **`InitiateCheckout` com flag global** é decisão documentada (mede o visitante, não
  o componente), não vazamento de isolamento.
- **Branch atrasada em relação a `origin/main`** — o `git diff main..HEAD` "apagando"
  Epic 87/90 é artefato de repo squash-merge, não conteúdo da branch.

#### Evidência que rodei eu mesmo (nada aceito por relato)

| Verificação | Resultado |
|---|---|
| `npx vitest run` (suíte completa) | **255 arquivos / 3155 passed + 6 expected fail**, exit 0 |
| `npx turbo run type-check --force` | 8/8, **0 cached**, exit 0 (cache hit não é evidência) |
| `npx turbo run lint --force` | 8/8, **0 cached**, **0 errors**, 34 warnings — todas em `packages/web`, zero em `landing-pages/` |
| `git diff 5a115358..HEAD` em `yarden/api`, `packages/`, `trifold-design-system/` | **vazio** |
| 11 mutações com verificação de aplicação + reversão | 6 mataram teste, 5 sobreviveram; `git status` limpo |
| `git ls-remote` / `gh pr list --head` | vazio / `[]` |

### Gate Status

Gate: CONCERNS → `docs/qa/gates/86.12-pixel-capi-landing-yarden.yml`

**Status: mantido em `InReview`.** Não promovi para `Done` — mesma lógica dos gates
anteriores: T12/T13 seguem `[ ]`, `trifold.eng.br/yarden/` não está no ar e o AC13
não foi validado. **CONCERNS não bloqueia o merge:** os 5 achados são 2 `medium` de
cobertura de teste e 3 `low` (UI, documentação, buraco latente). Nenhum é defeito de
comportamento — o conteúdo definitivo entrou correto em todos os ACs verificáveis
fora de produção. O que falta é rede de proteção para o próximo merge que tocar o
HTML, num arquivo que o próprio README avisa que vai ser mexido de novo.

— Quinn, guardião da qualidade 🛡️
