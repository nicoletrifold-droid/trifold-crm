# Story 86-12 — Pixel Meta + CAPI na landing do Yarden (landing nova, sem tracking nem conteúdo hoje)

**Status:** Draft
**Epic:** 86 — Conversions API (CAPI) e Rastreamento Meta
**Executor:** @dev (Dex)
**Quality Gate:** @qa (Quinn) — `*qa-gate` ao fim da implementação
**Prioridade:** P2 (não há tráfego pago ativo apontando para esta URL hoje — confirmado com o stakeholder, lucas@trifold.eng.br, em 2026-08-26, sem urgência de campanha)
**Estimativa:** 6 pontos (M) — menor que a 86-11 porque os módulos server-side e a rota `/track` já existem e são reusados sem criar nada novo no lado CRM; o ponto novo de complexidade é o discriminador multi-landing (AC5) e um projeto Vercel que ainda não existe
**Depende de:** 86-1 (credenciais CAPI, já em produção — nenhuma nova env no `trifold-crm`), 86-3 (módulo `packages/shared/src/meta/*`), **86-11** (Done — é a story-irmã cujos módulos server-side esta story reusa quase sem alteração)
**Bloqueado por decisão de negócio (ver AC1):** qual dataset/Pixel ID do Meta usar para o Yarden — não decidido nesta sessão. @po deve confirmar com o usuário **antes** do @dev iniciar a implementação do AC1.
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
  story exige que @devops **crie um projeto Vercel novo** antes do deploy
  final — ver "Pré-requisito de infraestrutura" abaixo. Isso não bloqueia a
  criação do código (que pode ser desenvolvido e testado localmente via
  `python3 -m http.server`, mesmo padrão da 86-11), só o deploy em produção.
- **Conteúdo/design da página não está pronto.** O usuário vai construir/
  fornecer copy, imagens e seções separadamente. Esta story trata isso como
  dependência externa — ver AC12.
- **Dataset/Pixel ID do Yarden não foi decidido.** O Vind Residence usa
  `1337310707164669` ("TRIFOLD - VIND"). Não foi definido nesta sessão se o
  Yarden usa o mesmo dataset ou um próprio — é uma decisão de conta de
  anúncios/negócio, não técnica. Ver AC1.

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

### AC1 — Pixel carregado na landing (browser) — dataset ID pendente de decisão de negócio

Em `landing-pages/yarden/index.html`, adicionar o Pixel Base Code oficial do
Meta no `<head>`, o mais cedo possível (mesma justificativa do `_fbp` da
86-11 AC1). `fbq('init', '<DATASET_ID>')` com o ID hardcoded como constante.

**[AUTO-DECISION]** Assumir, por default, o **mesmo dataset do Vind
Residence** (`1337310707164669`, conta "TRIFOLD - VIND") até segunda ordem —
reason: é a opção de menor atrito (nenhum ativo novo no Business Manager,
nenhuma credencial nova), e as duas landings já ficam segmentadas por
`content_category` (`landing_vind_residence` vs `landing_yarden`, AC5), então
Custom Conversions por empreendimento continuam possíveis mesmo com um único
dataset. **Isto NÃO é uma decisão travada** — é uma decisão de conta de
anúncios que só o usuário pode confirmar. **@po deve validar esta escolha com
o usuário antes do @dev implementar este AC**; se o usuário preferir um
dataset/Pixel próprio para o Yarden, o `DATASET_ID` hardcoded muda mas nenhum
outro AC desta story é afetado.

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

- `ALLOWED_ORIGINS`: trocar `"https://vind-residence.vercel.app"` pela origem
  do novo projeto Vercel do Yarden (ver "Pré-requisito de infraestrutura" —
  nome exato a confirmar com @devops antes do deploy; usar
  `https://yarden.vercel.app` como placeholder de desenvolvimento).
  `"https://trifold.eng.br"` e `"https://www.trifold.eng.br"` permanecem
  (mesmo domínio final).
- `CRM_WEBHOOK_URL`/`CRM_TRACK_URL`: **sem mudança** — mesmo `trifold-crm`.
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

- Adicionar 3 novos blocos de `headers` (clonados dos 3 blocos existentes de
  `/vindresidence*`, com `source` trocado), com `script-src` incluindo
  `https://connect.facebook.net`, `connect-src` incluindo
  `https://connect.facebook.net https://www.facebook.com` e (se o Pixel
  hospedar no domínio novo do Yarden algo além de `trifold.eng.br`) o próprio
  domínio Vercel do Yarden, e `img-src` incluindo `https://www.facebook.com`.
- Adicionar 3 novos blocos de `rewrites` (clonados de `/vindresidence*`),
  apontando para o domínio de produção do projeto Vercel do Yarden (a
  confirmar — ver "Pré-requisito de infraestrutura").
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

### AC11 — Degradação graciosa

Mesmas quatro garantias da 86-11 AC10: ad-blocker não impede o envio do lead;
sem `localStorage` o `visitor_id` cai para memória; falha de rede no
`/api/track` do Yarden não afeta o envio do lead; `tracking` ausente ou
malformado no CRM não impede a criação do lead (o `landing` ausente/inválido
cai no `DEFAULT_LANDING_SLUG`, nunca em erro).

### AC12 — Conteúdo da página: placeholder estrutural, não copy de marketing

**Fora de escopo desta story:** copy, imagens, seções de marketing, design
visual definitivo do Yarden — isso é fornecido pelo usuário separadamente
(ver Contexto/Descoberta) e **não deve ser inventado** pelo @dev (Artigo IV,
No Invention).

**Dentro de escopo:** `landing-pages/yarden/index.html` deve existir como uma
página funcional mínima — página única, replicando a estrutura de
`vind-residence/index.html` **sem o conteúdo de marketing**: um formulário de
captação equivalente (nome, WhatsApp, e-mail opcional, aceite obrigatório de
política de privacidade + opt-in de contato, mesmos dois checkboxes da
86-11), com os elementos de tracking do AC1-AC4 já ligados a esse formulário
(Pixel base code, helpers de `visitor_id`/`fbc`/`fbp`/`fbclid`, disparo dos 5
eventos, `CONFIG.leadEndpoint`/`TRACK_ENDPOINT` apontando para o proxy do
Yarden). Seções de marketing (hero, galeria, localização, etc.) podem ser
placeholders textuais simples (ex.: um `<h1>Yarden</h1>` e um comentário
`<!-- conteúdo definitivo pendente -->`) — o objetivo é que a infraestrutura
de tracking já esteja completa e testável (AC13) antes do conteúdo chegar.

**Quando o conteúdo definitivo for fornecido** (fora desta story, follow-up
não numerado ainda): quem for integrá-lo deve preservar os `id`s dos campos
de formulário usados pelo `<script>` de tracking (ou atualizar o `<script>`
junto, documentando a mudança) — não recriar o Pixel/CAPI do zero.

### AC13 — Validação de ponta a ponta antes de considerar pronta

Mesma mecânica da 86-11 AC11: com `META_CAPI_TEST_EVENT_CODE` setada no
projeto `trifold-crm` (nenhum projeto novo envolvido — as credenciais CAPI
já vivem lá), uma visita real seguida de um preenchimento do formulário
placeholder em `https://trifold.eng.br/yarden/` produz, no Test Events do
Events Manager (dataset confirmado no AC1):

- `PageView` (browser).
- `ViewContent` x2 (browser + servidor, deduplicados).
- `InitiateCheckout` x2 (idem).
- `Lead` x2 (idem, `content_category: "landing_yarden"`).
- `CompleteRegistration` x2 (idem).

Env removida e `trifold-crm` redeployado ao fim da validação. **Depende de**
o projeto Vercel do Yarden estar em produção (ver "Pré-requisito de
infraestrutura") e do AC1 ter o dataset ID confirmado.

## Pré-requisito de infraestrutura (bloqueia o deploy final, não bloqueia o desenvolvimento do código)

Diferente da 86-11, **não existe hoje nenhum projeto Vercel para o Yarden**.
Antes do AC9/AC13 poderem ser validados em produção, @devops precisa:

1. Criar um novo projeto Vercel (nome sugerido: `yarden`, para espelhar
   `vind-residence` — confirmar disponibilidade do nome antes).
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

O desenvolvimento do HTML/JS/proxies (AC1-AC8, AC12) não depende deste
pré-requisito — pode ser feito e testado localmente
(`python3 -m http.server`, mesmo fluxo da 86-11) antes do projeto Vercel
existir. Só o AC9 (CSP com o domínio real) e o AC13 (validação em produção)
dependem dele.

## Fora de escopo (explícito, não invente na implementação)

- **Copy, imagens, design visual definitivo da página** (AC12) — dependência
  externa do usuário.
- **Dataset/Pixel ID definitivo** (AC1) — decisão de negócio pendente,
  default documentado como AUTO-DECISION reversível.
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

1. **Nome do projeto Vercel do Yarden pode já estar em uso ou divergir do
   sugerido** — @devops confirma antes do deploy (mesma cautela do risco #1
   da 86-11).
2. **EMQ é métrica lagged** (mesmo risco já registrado nas stories
   anteriores).
3. **Volume desta landing é desconhecido** (empreendimento novo, sem
   histórico) — pode ser ainda mais baixo que o do Vind Residence.
4. **Honeypot devolve `200 ok` sem criar lead** — mesma mitigação já
   implementada e reusada da 86-11 (`tracked: false`).
5. **Consentimento (LGPD)** — mesma ressalva já registrada nas stories
   anteriores (Pixel dispara `PageView` antes de qualquer aceite explícito).
6. **Conteúdo definitivo pode introduzir uma segunda etapa real** (ex.:
   agendamento) — ver ressalva no `CompleteRegistration` da tabela de
   eventos. Se isso acontecer, é um follow-up de ajuste de gatilho, não uma
   falha desta story.

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
  `client_ua` da 86-11 `86.11-QA-001`).
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

- [ ] **T0 (bloqueante para AC1)** — @po confirma com o usuário o dataset/Pixel ID do Yarden (mesmo dataset do Vind Residence ou um novo)
- [ ] **T1 (AC1)** — Pixel base code + `fbq('track', 'PageView', ...)` em `landing-pages/yarden/index.html`
- [ ] **T2 (AC2)** — helper vanilla JS de `visitor_id` (clonado da 86-11)
- [ ] **T3 (AC3)** — helper vanilla JS de captura `fbc`/`fbp`/`fbclid` (clonado da 86-11)
- [ ] **T4 (AC4)** — disparo dos eventos browser-side com `event_id` compartilhado; listener de primeiro foco para `InitiateCheckout`; dois UUIDs para `Lead`/`CompleteRegistration`
- [ ] **T5 (AC5)** — ADAPT `packages/web/src/lib/meta/landing-page-tracking.ts`: `LandingSlug`, `LANDING_CONFIGS`, `DEFAULT_LANDING_SLUG`, `resolveLandingConfig`, `TrackingLanding.landing?` + testes
- [ ] **T6 (AC6)** — ajustar `landing-page/track/route.ts` para usar `resolveLandingConfig(tracking.landing)`
- [ ] **T7 (AC7)** — ajustar `landing-page/route.ts` (`dispararEventosCapi`) para usar `resolveLandingConfig(tracking.landing)`
- [ ] **T8 (AC8)** — criar `landing-pages/yarden/api/lead.js` e `api/track.js` (clonados do Vind Residence, `ALLOWED_ORIGINS` + `landing: "yarden"` fixo)
- [ ] **T9 (AC12)** — criar `landing-pages/yarden/index.html` placeholder (formulário funcional + tracking completo, sem copy de marketing) + `package.json`/`.vercelignore`/`README.md` clonados
- [ ] **T10 (AC9)** — atualizar CSP em `landing-pages/trifold-design-system/vercel.json`: 3 blocos novos (`/yarden`, `/yarden/`, `/yarden/:path*`), 1 redirect novo, atualizar regex catch-all para `/((?!vindresidence|yarden).*)`
- [ ] **T11 (AC11)** — testes de degradação graciosa
- [ ] **T12 (infra, @devops)** — criar projeto Vercel do Yarden + replicar `LANDING_PAGE_WEBHOOK_SECRET` (mesmo valor do Vind Residence) via `scripts/vercel-env-set.sh`
- [ ] **T13 (AC13, @devops)** — validação end-to-end com `META_CAPI_TEST_EVENT_CODE` + remoção da env de teste

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-26 | 0.1 | Story criada a partir da constatação de que `trifold.eng.br/y/` (landing WordPress antiga do Yarden) está 404 em produção e o usuário decidiu reconstruir em `trifold.eng.br/yarden/`, replicando o padrão Done da Story 86-11. Achado crítico verificado nesta sessão: os módulos server-side reusados da 86-11 hardcodam identificadores "Vind Residence" — introduzido o AC5 (discriminador multi-landing, ADAPT em `landing-page-tracking.ts`) para resolver isso sem duplicar rotas/módulo. Duas decisões de negócio deixadas explicitamente abertas para @po validar com o usuário: dataset/Pixel ID (AC1) e a inexistência de conteúdo definitivo da página (AC12, tratado como dependência externa). | @sm (River) |

## Dev Agent Record

_A ser preenchido pelo @dev durante a implementação._

## QA Results

_A ser preenchido pelo @qa após o `*qa-gate`._
