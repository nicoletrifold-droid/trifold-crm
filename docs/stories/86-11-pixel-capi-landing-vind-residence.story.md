# Story 86-11 — Pixel Meta + CAPI na landing do Vind Residence (hoje sem nenhum tracking)

**Status:** Done
**Epic:** 86 — Conversions API (CAPI) e Rastreamento Meta
**Executor:** @dev (Dex)
**Quality Gate:** @qa (Quinn) — `*qa-gate` ao fim da implementação
**Validada por:** @po (Pax) em 2026-08-24 — GO, 9.0/10 (ver Change Log v0.3)
**Prioridade:** P1 (tráfego pago é direcionado para `/vindresidence/` hoje sem nenhum sinal chegando ao Meta)
**Estimativa:** 7 pontos (G) — dois runtimes (Next.js do CRM + função Node standalone sem bundler), dois projetos Vercel distintos (`trifold-crm`, `vind-residence`) e um terceiro tocado só para CSP (`trifold-design-system`)
**Depende de:** 86-1 (credenciais CAPI já provisionadas em prod — nenhuma nova env precisa ser criada), 86-3 (módulo `packages/shared/src/meta/*`, reusado sem duplicar)
**Beneficia de graça (sem trabalho extra):** 86-2/86-4 (outbox + cron "Visitou") — se um lead desta landing for depois movido para o stage `visitou` no kanban, o evento `Schedule` já sai com atribuição completa, porque esta story escreve `metadata.meta_ad` no mesmo formato que a 86-9 já usa.
**Não confundir com:** Story 86-10 (reservada, não criada ainda) — é o follow-up de e-mail opcional no passo de agendamento do *formulário de qualificação*, mencionado em "Fora de escopo" da 86-9. Tópico completamente diferente desta story.

## Contexto — por que esta story existe

`https://trifold.eng.br/vindresidence/` é a landing page do lançamento Vind
Residence. Verificado por leitura direta do código em produção: **não há
nenhum Pixel, nenhum `fbq`, nenhuma chamada `connect.facebook.net`, e o
formulário de captação de lead não coleta `fbclid`/`fbc`/`fbp` nem IP/UA do
visitante.** Qualquer campanha paga apontando para esta URL hoje perde 100%
do sinal de atribuição — o mesmo problema de fundo que a Story 86-9 corrigiu
no formulário de qualificação (`/formulario/[token]`), mas aqui em um runtime
completamente diferente.

Esta story é a irmã da 86-9: mesmo objetivo (Pixel + CAPI com deduplicação
browser↔servidor), adaptado para uma landing estática de página única, sem
framework, servida por um projeto Vercel separado do `trifold-crm`.

## Descoberta de runtime (verificado no repo antes de escrever esta story — não presumir)

- `trifold.eng.br` roda no projeto Vercel `trifold-design-system`. Seu
  `landing-pages/trifold-design-system/vercel.json` faz `rewrites` de
  `/vindresidence`, `/vindresidence/` e `/vindresidence/:path*` para
  `https://vind-residence.vercel.app/:path*` — **note bem:** o destino real
  configurado é `vind-residence.vercel.app`, **sem** `-teste` no nome. O
  `.vercel/project.json` de `landing-pages/vind-residence/` confirma
  `"projectName": "vind-residence"` (id `prj_bSyrklkya14GAfeXdOlUXdyntqWp`), e
  o próprio `CONFIG.leadEndpoint` dentro do `index.html` já aponta para
  `https://vind-residence.vercel.app/api/lead`. **Se existir um segundo
  projeto Vercel literalmente chamado `vind-residence-teste`, ele não é o que
  está em produção hoje — @devops deve confirmar com `vercel project ls`
  antes de tocar em qualquer env var, para não configurar o projeto errado.**
- `landing-pages/vind-residence/` é um projeto Vercel standalone, **fora do
  workspace pnpm** — `package.json` não tem `dependencies` nenhuma (nem
  `workspace:*`). É deployado direto do diretório local
  (`vercel deploy --prod --yes --scope trifold-s-projects`), sem passar por
  git/CI. Isso significa que **`packages/shared` não é importável ali** sem
  vendorizar/copiar código — ponto decisivo para a decisão arquitetural abaixo.
- `api/lead.js` é uma função serverless Node "crua" (`module.exports = async
  function handler(req, res)`), sem Express, sem framework, hoje sem CORS
  wildcard (allowlist fixa) e com honeypot anti-bot.
- `index.html` é uma página única, sem "passos": o card de formulário
  (`#leadForm`, dentro da seção `#cadastro`) tem nome, WhatsApp, e-mail
  opcional e dois checkboxes (aceite obrigatório de política de privacidade +
  opt-in de contato), tudo enviado num único POST síncrono. **Não existe uma
  segunda etapa** (agendamento, confirmação, etc.) depois do envio — isso
  importa para a decisão do AC4 sobre `CompleteRegistration`.
- `packages/web/src/app/api/webhooks/landing-page/route.ts` é o endpoint que
  hoje recebe o lead (via o proxy `api/lead.js`). Verificado: **é um endpoint
  genérico e compartilhado** — faz detecção de campo por nome para suportar
  WPForms, Contact Form 7, Elementor e payloads genéricos (`flattenIntoFields`,
  lista de aliases em `pick(fields, [...])`). Ele não é exclusivo do Vind
  Residence. Isso é o raio de impacto que a Opção A (abaixo) precisa respeitar.

## Decisão arquitetural (travada agora — não decidir em modo YOLO no @dev)

**Escolha: Opção A — o disparo CAPI server-side acontece no lado do CRM**,
dentro/ao lado de `POST /api/webhooks/landing-page` (`packages/web`), reusando
`packages/shared/src/meta/*` (client, payload, hashing) sem duplicar.

**Por quê, com evidência do código (não é uma preferência abstrata):**

1. **Opção B é tecnicamente mais cara do que parecia no brief.** O projeto
   `vind-residence` não tem NENHUMA dependência declarada — nem sequer
   `@supabase/supabase-js`. Ele não faz parte do build do monorepo. Para
   disparar CAPI de lá, seria preciso **copiar** `capi-hashing.ts` +
   `capi-payload.ts` + `capi-client.ts` para dentro de
   `landing-pages/vind-residence/api/`, reescritos em CommonJS puro, sem os
   testes que já existem para o módulo original — exatamente o cenário que a
   IDS (REUSE > ADAPT > CREATE) e o Artigo IV-A da Constitution pedem para
   evitar: duplicar um módulo sensível a PII/hashing sem justificativa de
   `evaluated_patterns`/`rejection_reasons`.
2. **Zero segredo novo para provisionar em lugar nenhum.**
   `META_CAPI_ACCESS_TOKEN` e `META_CAPI_DATASET_ID` já estão em produção no
   projeto `trifold-crm` (Story 86-1). Com a Opção A, esta story **não precisa
   de nenhuma env var nova** — nem no `trifold-crm`, nem no `vind-residence`.
   Com a Opção B, o token teria que ser duplicado num segundo projeto Vercel,
   exatamente o risco que o usuário pediu para evitar ("amplia a superfície
   de onde esse token vive").
3. **Trade-off aceito (documentado, não ignorado):** `/api/webhooks/landing-page`
   é compartilhado com outras origens (WordPress). Mitigação: todo campo novo
   (`tracking: {...}`) é **estritamente opcional e aditivo**. Quando ausente
   — o caso de qualquer chamador que não seja esta landing — o comportamento
   do endpoint é **byte a byte idêntico ao de hoje**. Nenhum campo existente
   muda de nome, tipo ou obrigatoriedade. Um teste de regressão cobre
   explicitamente "payload sem `tracking` continua criando lead normalmente".
4. **Nova sub-rota dedicada para eventos de topo de funil.** `ViewContent` e
   `InitiateCheckout` acontecem **antes** de existir um lead (a página é
   visitada, o form nem foi enviado). Pendurá-los em
   `/api/webhooks/landing-page` forçaria ou (a) fabricar um "lead vazio" —
   contaminando a mesma lógica que decide se um lead nasceu ou não — ou (b)
   overload de contrato. A Story 86-9 já tomou exatamente essa decisão
   ("rota separada `/tracking`", ver Dev Agent Record da 86-9, decisão #2) —
   aqui replicamos o mesmo princípio com uma rota nova:
   `POST /api/webhooks/landing-page/track`.

## Escopo dos eventos — os 5 eventos completos do funil (mesmo padrão da 86-9), com justificativa por evento

A landing é uma página única com envio atômico — os 5 eventos da 86-9 não
mapeiam 1:1 em termos de *momento temporal*, mas o usuário pediu
explicitamente para incluir os 5 (não só 3), para manter o mesmo padrão de
funil da 86-9 disponível nas Custom Conversions do Meta. Analisados um a um,
contra o fluxo real verificado em `index.html`:

| Evento 86-9 | Existe aqui? | Decisão |
|---|---|---|
| `PageView` | Sim | Mantido — dispara ao carregar, só browser. |
| `ViewContent` | Sim | Mantido — dispara ao carregar, browser + servidor. |
| `InitiateCheckout` | Adaptado | **[AUTO-DECISION]** Gatilho = primeiro `focus` em `#nome` ou `#whats` → decisão: "engajou com o formulário". Reason: a landing não tem passos/perguntas sequenciais como o formulário de qualificação, mas o primeiro foco num campo é um sinal real de intenção (equivalente a "primeira resposta confirmada" da 86-9), não um gatilho artificial — verificado que HOJE ninguém mede esse momento. Confirmado que `#nome` e `#whats` são campos DOM distintos e reais (não uma suposição). |
| `Lead` | Sim | Mantido — dispara quando o POST ao CRM retorna sucesso (lead criado/atualizado). |
| `CompleteRegistration` | Incluído (**sem gatilho temporal distinto de `Lead`** — ressalva documentada) | **[AUTO-DECISION]** Incluído a pedido do usuário, mas **sem inventar uma etapa que não existe**: revendo `index.html`/o JS do `#leadForm`, o único POST síncrono já contém nome+WhatsApp+e-mail opcional+aceite LGPD, e a UI pós-envio é apenas uma mensagem de sucesso inline (`#formMsg`) — não há tela, redirecionamento ou estado de confirmação separado (diferente da 86-9, onde `CompleteRegistration` marca `finalizar: true`, um segundo passo genuíno do fluxo de agendamento). Reason/decisão de produto: `CompleteRegistration` dispara **no mesmo instante que `Lead`** — mesma condição de disparo (o servidor confirma que o lead foi criado/atualizado com sucesso) —, cada um com seu **próprio `event_id`** gerado no browser. Os dois eventos são disparados juntos, deliberadamente, para que os 5 eventos padrão do Meta fiquem disponíveis para Custom Conversions/otimização de campanha; isso não é um erro nem uma duplicação sem sentido — é a ausência genuína de um segundo marco temporal nesta landing, documentada aqui para quem for implementar (@dev) e validar (@po). |

## Acceptance Criteria

### AC1 — Pixel carregado na landing (browser)

Em `landing-pages/vind-residence/index.html`, adicionar o Pixel Base Code
oficial do Meta (script `connect.facebook.net/en_US/fbevents.js`) o mais cedo
possível no `<head>` (antes de qualquer interação do usuário — é o que faz o
cookie `_fbp` existir a tempo do primeiro evento). `fbq('init', '1337310707164669')`
— ID hardcoded como constante (é público, mesmo raciocínio já usado em
`sendCapiEvents`/86-9: "o token é segredo, o dataset ID não"). Dispara
`fbq('track', 'PageView', {}, { eventID: <uuid> })` imediatamente ao carregar.
Sem contraparte servidor — página anônima, sem lead ainda, sem correlato
confiável no backend.

### AC2 — `visitor_id` estável como `external_id` (browser, vanilla JS, sem import de `packages/*`)

Novo helper inline no `<script>` de `index.html` (runtime não tem bundler —
duplicação mínima e deliberada, documentada, não é ADAPT nem REUSE possível
aqui): gera UUID v4 (`crypto.randomUUID()` com fallback próprio em JS puro
para navegadores sem suporte) e persiste em `localStorage` como
`trifold_visitor_id`, com fallback em memória se `localStorage` não estiver
disponível. Enviado como `visitor_id` em todo evento. Quando o lead nasce
(evento `Lead`), o servidor usa **dois** valores de `external_id`
(`visitor_id` + `leadId`, ambos hasheados) — mesmo padrão de
`buildCapiUserData({ leadId, externalIds })` já existente (86-9), sem
nenhuma mudança na assinatura da função.

### AC3 — Captura de `fbc`/`fbp`/`fbclid` (browser, vanilla JS reimplementado)

Reimplementação mínima e deliberada (mesma justificativa do AC2) da mesma
lógica de `packages/web/src/lib/meta/browser-attribution.ts` (86-9): lê
cookies `_fbp`/`_fbc`; quando `_fbc` está ausente mas há `fbclid` na URL,
monta `fb.1.${Date.now()}.${fbclid}`; persiste o `fbclid` bruto em
`sessionStorage`. Nunca lança exceção — qualquer falha de acesso a
cookie/storage retorna valores vazios, sem quebrar o carregamento da página.

### AC4 — Os 5 eventos do funil, com `event_id` gerado no browser e dedup 48h

Ver tabela em "Escopo dos eventos" acima. Regras de implementação:

- `event_id` (mesmo helper de UUID do AC2) gerado no browser é enviado ao
  servidor no mesmo request e usado no `fbq('track', ..., {}, { eventID })`
  correspondente — é o que o Meta usa para deduplicar (janela 48h).
- **O servidor decide se `Lead`/`CompleteRegistration` realmente saem**, não
  o browser (mesmo princípio da 86-9, decisão #1): só dispara CAPI se o CRM
  de fato criou/atualizou um lead. Se o POST falhar (ex.:
  `LANDING_PAGE_WEBHOOK_SECRET` ausente, erro 5xx), o servidor não dispara
  nenhum dos dois e o browser não deve assumir que disparou — mas o browser
  não precisa "desfazer" nada porque a UI de erro (`fail()` em `index.html`)
  já cobre esse caminho hoje.
- `Lead` e `CompleteRegistration` disparam **juntos, no mesmo instante**,
  quando o lead nasce — mesma condição de disparo para os dois, cada um
  com seu próprio `event_id` gerado no browser no momento do envio do
  formulário (ver "Escopo dos eventos" para a ressalva sobre a ausência de
  um segundo marco temporal genuíno nesta landing, diferente da 86-9).
- `ViewContent`/`InitiateCheckout` não dependem de um lead existir — usam
  só `visitor_id` como `external_id`.
- `action_source: "website"` e `event_source_url` com a URL real da página
  em todos os 5 eventos (nenhum é `system_generated`).
- `custom_data.content_category = "landing_vind_residence"` (distinto de
  `"form_qualificacao"` da 86-9, para segmentar Custom Conversions depois) em
  todos os eventos, inclusive `Lead` e `CompleteRegistration`. Nenhum dos
  dois inclui `value`/`currency` de score de qualificação (diferente do
  `CompleteRegistration` da 86-9, que carrega `qualification_score`) — esta
  landing não calcula nenhum score; `value` fica no default `0` de
  `buildFormEvent`.

### AC5 — Nova rota `POST /api/webhooks/landing-page/track` (ViewContent + InitiateCheckout)

Novo arquivo `packages/web/src/app/api/webhooks/landing-page/track/route.ts`.

- Autenticação: mesmo token (`LANDING_PAGE_WEBHOOK_SECRET`), mesmo padrão de
  aceitar `?token=` ou `Authorization: Bearer` do endpoint principal.
- Body: `{ event_name: "ViewContent" | "InitiateCheckout", event_id, visitor_id, fbc?, fbp?, fbclid?, page_url, client_ip?, client_ua? }`.
- `event_name` validado contra allowlist fixa (`["ViewContent", "InitiateCheckout"]`)
  — valor fora da lista retorna `400`, não silenciosamente ignorado.
  **`CompleteRegistration` não entra nesta allowlist**: por definição ele só
  dispara quando um lead existe (ver "Escopo dos eventos" e AC6), então vive
  no endpoint principal (`/landing-page`, AC6) ao lado de `Lead`, nunca
  nesta rota de pré-lead.
- Monta `user_data` via `buildCapiUserData({ externalIds: [visitor_id], fbc, fbp, clientIp: client_ip, clientUserAgent: client_ua })`
  (sem `leadId` — ainda não existe).
- Monta o evento via `buildFormEvent` (ver AC6 sobre o parâmetro novo
  `contentCategory`) e envia com `sendCapiEvents` (`packages/shared/src/meta/capi-client.ts`,
  sem modificação).
- **[PO] Reuso obrigatório — `packages/web/src/lib/meta/form-capi.ts` (86-9).**
  Este módulo **já existe** e já resolve a maior parte desta rota
  (`extrairSinais`, `comMetaAd`, `enviarEventoFormulario`, incluindo o
  `META_CAPI_TEST_EVENT_CODE` do AC11 e a degradação graciosa "nunca lança").
  A regra IDS (REUSE > ADAPT > CREATE) se aplica: **não reimplementar** esse
  fluxo do zero na rota nova. Três ADAPTs pontuais são necessários e estão
  autorizados por esta story — ver AC6, bloco "[PO] ADAPTs em `form-capi.ts`".
- Disparo dentro de `after()` (`next/server`) — é telemetria de marketing,
  não o caminho crítico de criação de lead; perder timing aqui não perde
  dado de negócio, só um evento de topo de funil. **Diferente** da decisão já
  tomada no endpoint principal (ver AC6) de não usar `after()` para a
  criação do lead em si — são duas preocupações diferentes, não uma
  contradição.
- Sem gravação em `webhook_logs`/`leads` — esta rota não cria/atualiza
  nenhum registro, só encaminha telemetria ao Meta.

### AC6 — `POST /api/webhooks/landing-page` estendido (aditivo) para `Lead` + `CompleteRegistration` + `metadata.meta_ad`

Em `route.ts` (existente), aceitar um novo campo **opcional** no body JSON:

```json
{
  "nome": "...", "whatsapp": "...", "email": "...",
  "tracking": {
    "event_id": "<uuid>",
    "complete_registration_event_id": "<uuid>",
    "visitor_id": "<uuid>",
    "fbc": "fb.1.<ms>.<fbclid>",
    "fbp": "fb.1.<ms>.<random>",
    "fbclid": "<bruto>",
    "client_ip": "<ip do visitante, ver AC7>",
    "client_ua": "<user-agent do visitante>",
    "page_url": "https://trifold.eng.br/vindresidence/"
  }
}
```

`event_id` e `complete_registration_event_id` são **dois UUIDs distintos**,
gerados no browser no mesmo instante do envio do formulário (mesmo helper de
UUID do AC2) — um para `Lead`, outro para `CompleteRegistration`. Tecnicamente
seria seguro reaproveitar o mesmo valor para os dois (a deduplicação do Meta
usa o par `event_name` + `event_id`, não o `event_id` isolado — eventos com
nomes diferentes não colidem), mas usar dois valores distintos deixa os Test
Events do Events Manager (AC11) auditáveis sem ambiguidade: cada evento tem
sua própria identidade rastreável nos logs.

Quando `tracking` está presente **e** um lead foi criado/localizado com
sucesso:

1. Grava em `leads.metadata.meta_ad` (merge preservando as demais chaves do
   JSONB, mesmo padrão de `buildCtwaMetadata`):
   `{ fbc, fbp, fbclid, client_ip, client_ua, visitor_id, captured_at }` —
   **mesmo formato exato da Story 86-9 AC5**, reusado sem alteração. Isso é
   o que faz o evento "Visitou" (86-2/86-4), se este lead for movido para o
   stage `visitou` depois, sair já com atribuição — sem nenhum trabalho
   adicional nesta story.
2. Monta `user_data` uma única vez via
   `buildCapiUserData({ leadId, externalIds: [visitor_id], name, phone, email, fbc, fbp, clientIp: client_ip, clientUserAgent: client_ua })`
   e dispara **dois** eventos CAPI, no mesmo `after()` (marketing, não
   bloqueia a resposta), em uma única chamada de `sendCapiEvents` (batch):
   `Lead` via `buildFormEvent({ eventName: FORM_CAPI_EVENTS.LEAD, eventId: tracking.event_id, ..., contentCategory: "landing_vind_residence" })`
   e `CompleteRegistration` via
   `buildFormEvent({ eventName: FORM_CAPI_EVENTS.COMPLETE_REGISTRATION, eventId: tracking.complete_registration_event_id, ..., contentCategory: "landing_vind_residence" })`
   — ver "Escopo dos eventos" para a justificativa de os dois dispararem no
   mesmo instante, sem um segundo marco temporal distinto nesta landing.
   `FORM_CAPI_EVENTS.COMPLETE_REGISTRATION` já existe em `capi-payload.ts`
   (criada na 86-9) — nenhuma constante nova.

Quando `tracking` está **ausente** (qualquer chamador que não seja esta
landing, inclusive todo o tráfego WordPress atual): **nenhuma mudança de
comportamento** — sem `metadata.meta_ad`, sem chamada CAPI. Teste de
regressão obrigatório cobrindo este caminho.

**ADAPT (não CREATE) em `packages/shared/src/meta/capi-payload.ts`:**
`buildFormEvent` hoje hardcoda `content_category: 'form_qualificacao'`.
Adicionar parâmetro opcional `contentCategory` (default
`'form_qualificacao'`, preservando 100% de compatibilidade com o único
chamador existente, o endpoint `/formulario/[token]`). Mudança < 5 linhas,
não quebra a 86-9.

**[PO] ADAPTs em `packages/web/src/lib/meta/form-capi.ts` (verificado no
código — três divergências reais entre o helper da 86-9 e o que esta story
pede; nenhuma delas é opcional):**

1. **`enviarEventoFormulario` envia UM evento por chamada**
   (`sendCapiEvents([evento], ...)`). Este AC pede um **batch único de 2
   eventos**. ADAPT: extrair/aceitar uma variante que receba N eventos e faça
   uma só chamada a `sendCapiEvents`, mantendo o comportamento "nunca lança"
   e o `META_CAPI_TEST_EVENT_CODE`. Não duplicar o módulo.
2. **`enviarEventoFormulario` injeta `st` incondicionalmente**
   (`state: ufFromDDD(normalizePhoneBR(telefone) ?? telefone)`). Esta story
   coloca `st`/`ct` **fora de escopo** (ver "Fora de escopo"). ADAPT: tornar a
   derivação de UF opcional/desligável por chamador, com o default preservado
   para o chamador atual (`/formulario/[token]`) — reusar o helper com `st`
   ligado aqui seria implementar escopo que esta story excluiu explicitamente.
3. **`enviarEventoFormulario` não repassa `contentCategory`** ao
   `buildFormEvent`. ADAPT: threading do parâmetro novo até o builder, com o
   mesmo default `'form_qualificacao'`.

**[PO] Reusar `comMetaAd(metadataAtual, sinais)` do mesmo módulo** para o item
1 acima (gravação de `metadata.meta_ad`) — é literalmente a função que produz
o "mesmo formato exato da Story 86-9 AC5" que este AC exige, incluindo o merge
que preserva as demais chaves do JSONB. Não reescrever o objeto à mão.

### AC7 — IP/UA capturados no ponto certo (o proxy, não o CRM) — AC explícito, não pode regredir

- `landing-pages/vind-residence/api/lead.js` (e o novo `api/track.js`, AC5)
  leem `req.headers['x-forwarded-for']` (primeiro valor) e
  `req.headers['user-agent']` — **este** é o ponto da cadeia que efetivamente
  vê o IP real do visitante, porque o browser chama esta função diretamente.
  Encaminham ambos como `tracking.client_ip` / `tracking.client_ua` no corpo
  JSON enviado ao CRM.
- **[PO] O proxy hoje NÃO repassa o corpo recebido — ele monta um payload
  novo.** Verificado em `api/lead.js`:
  `const payload = { nome, whatsapp, email, page: "vind-residence" }`. Ou seja,
  um `tracking` enviado pelo browser é **descartado hoje**, silenciosamente.
  Portanto o AC7 exige duas coisas em `api/lead.js`, não uma:
  (a) **montar** `payload.tracking` a partir de `rawBody.tracking` (os campos
  que só o browser conhece: `event_id`, `complete_registration_event_id`,
  `visitor_id`, `fbc`, `fbp`, `fbclid`, `page_url`), e
  (b) **sobrescrever/preencher** `client_ip`/`client_ua` com os headers do
  proxy — o browser nunca dita esses dois. Aplicar `sanitizeField()` (ou
  equivalente, `MAX_FIELD_LENGTH`) a cada campo string do bloco `tracking`,
  descartando silenciosamente qualquer chave fora dessa allowlist — o proxy
  não vira um encaminhador cego de corpo arbitrário para o CRM.
- **Regra explícita, com teste dedicado:** `packages/web/src/app/api/webhooks/landing-page/route.ts`
  e a nova rota `/track` **NUNCA** devem usar o IP/UA da requisição que
  recebem quando `tracking.client_ip`/`tracking.client_ua` estiverem
  presentes — essa requisição vem servidor-a-servidor do proxy Vercel do
  `vind-residence`, e o IP dela é o do proxy, não o do visitante. Usá-lo
  silenciosamente degradaria o match quality exatamente como o bug
  `86.9-QA-001` (evento saindo sem o sinal que deveria ter, sem erro
  visível). Teste unitário garante que o campo vencedor é sempre o de
  `tracking.client_ip`/`client_ua` quando presente.
- **[PO] 🔴 Armadilha concreta, nomeada — `extrairSinais()` do
  `packages/web/src/lib/meta/form-capi.ts` faz HOJE exatamente o errado para
  este caso.** Verificado no código: ela deriva o IP via
  `ipDaRequest(request)` → `request.headers.get("x-forwarded-for")` e o UA via
  `request.headers.get("user-agent")`, **sempre da própria request**; e sua
  interface `CorpoTracking` **não tem** os campos `client_ip`/`client_ua`, ou
  seja, não existe nem a possibilidade de o corpo vencer. Na 86-9 isso estava
  certo (o browser chamava a rota do CRM diretamente); aqui está errado (há um
  proxy no meio). Se o @dev reusar `extrairSinais(request, body.tracking)`
  como está — que é o caminho natural sob a regra IDS de reuso — **todo evento
  desta landing sairá com o IP do proxy Vercel**, sem erro, sem log, com
  aparência de sucesso no Events Manager. ADAPT obrigatório: estender
  `CorpoTracking` com `client_ip?`/`client_ua?` e fazer o valor do corpo ter
  **precedência** sobre o header da request, mantendo o header como fallback
  (o chamador `/formulario/[token]` continua sem enviar esses campos, então
  seu comportamento não muda). O teste unitário desta story deve cobrir
  precisamente essa precedência.

### AC8 — CSP atualizada em `landing-pages/trifold-design-system/vercel.json` (bloqueante)

Sem esta mudança, o Pixel é bloqueado silenciosamente pelo navegador mesmo
depois de instalado (verificado: a CSP atual, aplicada aos 3 blocos de
headers `/vindresidence`, `/vindresidence/` e `/vindresidence/:path*`, não
inclui `connect.facebook.net` nem `www.facebook.com`).

- `script-src`: adicionar `https://connect.facebook.net` (os 3 blocos).
- `connect-src`: adicionar `https://connect.facebook.net https://www.facebook.com` (os 3 blocos).
- **[PO] `img-src`: adicionar `https://www.facebook.com` (os 3 blocos).**
  A CSP atual é `img-src 'self' data: https://img.youtube.com` — sem
  `www.facebook.com`. O Pixel Base Code oficial que o AC1 manda instalar
  inclui o beacon `<noscript><img src="https://www.facebook.com/tr?id=...&ev=PageView&noscript=1">`
  (é assim em `packages/web/src/components/tracking/meta-pixel.tsx`, a
  implementação da 86-9), e o `fbevents.js` também cai para image beacon em
  alguns caminhos. Sem `img-src`, o critério de sucesso deste próprio AC
  ("console sem **nenhum** erro de CSP relacionado a facebook.com") é
  inalcançável. Se o @dev optar por omitir o `<noscript>` do base code, isso
  precisa ser uma decisão registrada no Dev Agent Record — não um silêncio.
- **Não tocar** no 4º bloco de headers (`/((?!vindresidence).*)`) — cobre o
  resto do domínio `trifold.eng.br`, sem relação com esta story.
- **[PO] Nota para @dev/@devops:** existe também um `redirects` no mesmo
  `vercel.json` (`/vindresidence` → `/vindresidence/`, não permanente), então
  o bloco de headers `[0]` raramente é o que serve HTML. Atualizar os 3 mesmo
  assim (custo zero, evita depender do comportamento do redirect).
- Validação manual pós-deploy (@devops): console do navegador sem nenhum erro
  de CSP relacionado a `facebook.net`/`facebook.com` ao carregar a página e
  ao submeter o formulário.

### AC9 — Hasheados vs. texto puro (reforço, sem lógica nova)

Mesma regra já implementada em `capi-hashing.ts`/`capi-payload.ts` (86-3/86-9),
reusada sem alteração: `em`/`ph`/`fn`/`ln`/`external_id` sempre SHA-256 hex;
`fbc`/`fbp`/`client_ip_address`/`client_user_agent` sempre texto puro, nunca
hasheados. Nenhum desses campos aparece em `console.log`/`console.error` em
nenhum caminho (incluindo os de erro do proxy `api/lead.js`/`api/track.js`,
que hoje já logam `err` genérico — confirmar que não vazam o body inteiro da
requisição). Teste de não-regressão cobre as duas listas.

### AC10 — Degradação graciosa

- Ad-blocker (sem `fbq`, sem `_fbp`/`_fbc`): a submissão do formulário
  continua funcionando e o lead nasce normalmente — o `<script>` do Pixel
  falhando silenciosamente nunca pode impedir o `fetch` do `CONFIG.leadEndpoint`.
- Sem `localStorage` (navegação anônima/restritiva): `visitor_id` cai para um
  valor em memória (válido só para aquele carregamento de página) — não
  quebra nada, apenas reduz a persistência entre sessões.
- Falha de rede no envio de `ViewContent`/`InitiateCheckout` (proxy `api/track.js`
  fora do ar, timeout): não afeta o envio do lead — são chamadas
  independentes, `fetch` "fire-and-forget" com `.catch()` silencioso no
  browser.
- `tracking` ausente ou malformado no corpo recebido pelo CRM: o
  `/api/webhooks/landing-page` cria o lead normalmente e apenas pula o bloco
  de CAPI/`metadata.meta_ad` — nunca retorna erro por causa disso.

### AC11 — Validação de ponta a ponta antes de considerar pronta

Com `META_CAPI_TEST_EVENT_CODE` setada no projeto `trifold-crm` (Vercel — já é
o projeto onde as credenciais CAPI vivem, nenhum projeto novo envolvido), uma
visita real seguida de um preenchimento do formulário em
`https://trifold.eng.br/vindresidence/` produz, no Test Events do Events
Manager:

- `PageView` (browser).
- `ViewContent` x2 (browser + servidor, `event_id` idêntico, marcados
  deduplicados).
- `InitiateCheckout` x2 (idem, disparado ao focar em nome ou WhatsApp).
- `Lead` x2 (idem, com `external_id` contendo os dois hashes, `fbp`, `fbc`
  quando a URL tiver `fbclid`, IP e UA do visitante — não do proxy).
- `CompleteRegistration` x2 (idem, disparado no mesmo instante que `Lead`,
  com `event_id` próprio — ver "Escopo dos eventos" sobre a ausência de um
  segundo marco temporal distinto nesta landing).

Env removida e o projeto `trifold-crm` (não o `vind-residence` — nenhum
redeploy lá é necessário para isso) redeployado ao fim da validação.

## Fora de escopo (explícito, não invente na implementação)

- **`st`/`ct` (UF/cidade via DDD)** — tecnicamente reaproveitável
  (`uf-from-ddd.ts` da 86-9 é uma função pura, IDS: REUSE trivial), mas o
  telefone aqui passa por `normalizePhone()` local do
  `landing-page/route.ts` (formato `+55DDNNNNNNNNN`), **diferente** do
  `normalizePhoneBR`/`normalizePhoneForCapi` que `ufFromDDD` espera como
  contrato. Trocar o normalizador de telefone deste endpoint é uma mudança
  de raio maior (afeta todo tráfego WordPress que passa pelo mesmo
  endpoint), então fica fora desta story — candidato a follow-up pequeno e
  isolado.
- **Advanced Matching no Pixel** (segundo `fbq('init', ..., { external_id, fn, ln, ph })`
  antes do `track('Lead')`, como a 86-9 AC8) — **[AUTO-DECISION]** adiado
  para follow-up. Reason: mesmo havendo e-mail disponível aqui (diferente da
  86-9), esta story já soma dois runtimes + mudança de CSP + uma rota nova;
  entregar o Pixel+CAPI base primeiro, validar EMQ real (AC11), e então
  decidir se Advanced Matching é o próximo incremento é mais seguro do que
  aumentar o raio de um único PR sem necessidade.
- **Custom Conversions, Lookalike, otimização de campanha** (mesmo escopo
  excluído na 86-8/86-9).
- **Provisionamento de env vars / deploy em si** — não há env var nova
  (Opção A não precisa). O deploy é tarefa de @devops na fase de Push, com o
  fluxo específico descrito em "Convenção de deploy" abaixo.

## Riscos e itens fora do nosso controle

1. **Confirmar o domínio de destino do rewrite antes de mexer em CSP/env.**
   Ver "Descoberta de runtime" — o `vercel.json` aponta para
   `vind-residence.vercel.app`, não `vind-residence-teste.vercel.app`. Se
   existir um projeto "teste" separado em uso paralelo, @devops precisa
   confirmar qual é o de produção real antes do deploy final (`vercel project ls`).
2. **EMQ é métrica lagged** (mesmo risco da 86-9) — o AC11 valida presença de
   sinal, não a nota composta, que só é calculada com volume ao longo de
   dias.
3. **Volume desta landing é specificamente baixo** (é uma landing de
   lançamento, não o funil principal do CRM) — `ViewContent` deve ser o
   termômetro mais rápido, `Lead` vai demorar mais para acumular volume
   suficiente para EMQ próprio.
4. **[PO] Honeypot devolve `200 ok` sem criar lead — o browser não sabe
   disso.** Verificado em `api/lead.js:50-53`: quando o campo-armadilha
   `empresa` vem preenchido, o proxy responde `200 {status:"ok"}`
   **deliberadamente**, sem repassar nada ao CRM (para não sinalizar ao bot).
   Como o browser dispara o `fbq('track','Lead'/'CompleteRegistration')` no
   `r.ok`, um bot produziria **evento de browser sem contraparte de servidor**
   — 1 evento em vez de 2, sem dedup, poluindo levemente o dataset. Não é
   bloqueante (volume esperado é residual e o lado servidor, que é o que
   alimenta a otimização, permanece limpo). Mitigação sugerida ao @dev, se sair
   barato: o proxy devolver um marcador no corpo do 200
   (ex.: `{ status: "ok", tracked: false }`) e o browser só disparar `fbq`
   quando `tracked !== false` — mantendo a resposta indistinguível em
   **status HTTP**, que é o que importa para o bot. Se ficar caro, documentar
   como aceito e seguir.
5. **Consentimento (LGPD).** O Pixel dispara `PageView` ao carregar, antes
   de qualquer aceite explícito — mesmo comportamento de qualquer landing
   com Pixel hoje (inclusive a variante WordPress atual do domínio
   `vindresidence.com.br`, fora deste repo). Não é uma regressão introduzida
   por esta story, mas registrado — mesma ressalva já feita na 86-9.

## Convenção de deploy (diferente do fluxo normal do CRM — anotar para @devops)

- **[QA-002 / v1.2] ATUALIZAÇÃO — `trifold-design-system/` deixou de ser
  untracked.** A v0.3 registrava que só `vind-residence/` era versionado e que
  `trifold-design-system/` vivia "só na máquina", com a CSP fora de qualquer PR.
  Isso ficou obsoleto: o **PR #501** ("docs: registra vercel.json do proxy
  trifold-design-system"), mergeado em `main` em 2026-08-24, passou a versionar
  `landing-pages/trifold-design-system/vercel.json` e `README.md`. Verificado
  com `git ls-tree origin/main` + `diff` — o `vercel.json` em `main` é
  **byte a byte idêntico** à cópia no working tree, ou seja, já contém as três
  adições de CSP do AC8. Não existe mais ponto cego de auditoria: a CSP tem diff
  versionado em `main`. (No working tree o arquivo ainda aparece como untracked
  apenas porque o `main` local está atrás de `origin/main`; um `git fetch` +
  rebase o traz como arquivo já rastreado — ver `86.11-QA-002` no gate.)

  | Diretório | Versionado no git? | Como o código entra | Como o site sobe |
  |---|---|---|---|
  | `landing-pages/vind-residence/` | **SIM — 61 arquivos tracked** | commit + **PR** (histórico real: #478, #483, #494 — o último é `8dbc6000`) | `vercel deploy --prod` do diretório local (não há CI git-linked) |
  | `landing-pages/trifold-design-system/` | **SIM — desde o PR #501 (`vercel.json` + `README.md`)** | commit + PR, como qualquer outro | `vercel deploy --prod` do diretório local |

  Consequência prática para @devops: a mudança em
  `landing-pages/vind-residence/` (`index.html`, `api/lead.js`, `api/track.js`)
  **entra no mesmo PR** de `packages/web` e passa por CI/review normalmente;
  o que **não** acontece por CI é a publicação — essa é sempre manual, via
  `vercel deploy --prod --yes --scope trifold-s-projects` rodado de dentro do
  diretório. A mudança de CSP em `landing-pages/trifold-design-system/vercel.json`
  **já está em `main`** (PR #501); a versão no working tree é idêntica, então na
  prática o AC8 não gera diff novo. Ao rebasear em `origin/main`, tratar o
  arquivo como **já rastreado** — sem isso o `git pull` aborta com "untracked
  working tree file would be overwritten" e uma resolução com `checkout -f` teria
  a aparência de descartar a CSP (ver `86.11-QA-002`).
- Comando de deploy dos dois: `vercel deploy --prod --yes --scope trifold-s-projects`,
  executado **de dentro de cada diretório** (cada um tem seu próprio
  `.vercel/project.json`; `vind-residence` = `prj_bSyrklkya14GAfeXdOlUXdyntqWp`).
- `packages/web` (a metade desta story que vive no CRM) **segue o fluxo
  normal**: commit, PR, CI, `@devops *push`.
- Ordem de deploy recomendada para @devops: (1) `packages/web` primeiro (a
  rota `/track` e a extensão de `/landing-page` precisam existir antes do
  browser começar a chamá-las); (2) `landing-pages/vind-residence/` (novo
  HTML/JS + `api/track.js` + `api/lead.js` atualizado); (3)
  `landing-pages/trifold-design-system/` (CSP) — pode ir em paralelo com (2),
  mas sem (3) o Pixel fica bloqueado mesmo com (2) já no ar.
- **Nenhuma env var nova precisa ser criada** nesta story (ver Decisão
  Arquitetural, item 2). Se, ao implementar, o @dev perceber que precisa de
  alguma, a regra do `CLAUDE.md` vale: nunca `vercel env add` via pipe/stdin
  (grava valor vazio em silêncio) — usar a REST API ou `scripts/vercel-env-set.sh`.

## Dev Notes

- **[PO] Mapa dos módulos que a 86-9 já deixou prontos** (todos verificados
  como existentes — leia antes de escrever qualquer linha):

  | Arquivo | O que já resolve | Uso nesta story |
  |---|---|---|
  | `packages/web/src/lib/meta/form-capi.ts` | `extrairSinais`, `comMetaAd`, `enviarEventoFormulario` | **ADAPT** (3 mudanças — AC6) + ⚠️ armadilha de IP (AC7) |
  | `packages/web/src/lib/meta/visitor-id.ts` | `getVisitorId()`, chave `trifold_visitor_id`, fallback em memória | **Referência** para a reimplementação vanilla do AC2 (copiar a semântica, não o arquivo) |
  | `packages/web/src/lib/meta/browser-attribution.ts` | leitura de `_fbp`/`_fbc`, derivação de `fbc` a partir de `fbclid` | **Referência** para o AC3 (idem) |
  | `packages/web/src/components/tracking/meta-pixel.tsx` | base code + `<noscript>` beacon + `fbq('init')` | **Referência** para o AC1 (idem) + origem do requisito de `img-src` no AC8 |
  | `packages/shared/src/meta/capi-payload.ts` | `buildCapiUserData`, `buildFormEvent`, `FORM_CAPI_EVENTS` | **REUSE** + 1 ADAPT (`contentCategory`) |
  | `packages/shared/src/meta/capi-client.ts` | `sendCapiEvents` (aceita array → batch nativo) | **REUSE**, sem modificação |
  | `packages/web/src/app/api/formulario/[token]/tracking/route.ts` | rota de telemetria pré-lead da 86-9, com `after()` | **Modelo direto** para a rota `/track` do AC5 |

  Os 4 marcados "Referência" só são reimplementados em JS puro porque o
  runtime da landing não tem bundler (ver restrição abaixo) — a duplicação é a
  exceção justificada do AC2/AC3, **não** uma licença para reimplementar
  também o lado servidor, onde o reuso é obrigatório.
- Módulo CAPI a reusar sem duplicar: `packages/shared/src/meta/capi-client.ts`
  (`sendCapiEvents`), `capi-payload.ts` (`buildCapiUserData`, `buildFormEvent`
  — este último recebe o novo parâmetro opcional `contentCategory`, ver AC6),
  `capi-hashing.ts` (`sha256Hex`, `normalizeEmail`, `normalizePhoneForCapi`).
- `FORM_CAPI_EVENTS` (`capi-payload.ts`) já define os nomes de evento padrão
  Meta usados (`VIEW_CONTENT`, `INITIATE_CHECKOUT`, `LEAD`,
  `COMPLETE_REGISTRATION`) — todos criados na 86-9, nenhuma constante nova
  aqui. Reusar as constantes existentes em vez de strings soltas na nova
  rota e no endpoint principal.
- O runtime de `landing-pages/vind-residence/` **não tem TypeScript, não tem
  bundler, não tem `node_modules` de projeto** (nenhuma dependência
  declarada) — todo código novo ali é JS puro (ES2020+, o runtime Node é
  `24.x` conforme `package.json#engines`), sem `import` de pacotes do
  monorepo. Isso é uma restrição de runtime, não uma escolha de estilo — não
  tentar contornar com `require('@trifold/shared')`, vai falhar no deploy.
- **[PO] `flattenIntoFields()` (`route.ts:310`) DESCARTA objetos aninhados.**
  Verificado: o `else if` final é
  `v !== null && v !== undefined && typeof v !== "object"`. Um
  `tracking: { ... }` no body JSON, portanto, **nunca chega** ao mapa `fields`
  nem a `processLandingPageLead(fields, ctx)`. Duas consequências:
  1. **É a prova do "aditivo byte a byte" do AC6/Decisão Arquitetural item 3.**
     Nenhum chamador WordPress atual muda de caminho, porque o campo novo é
     invisível para o pipeline existente. E nenhuma sub-chave de `tracking`
     colide com os aliases de `pick()` (`nome|name|email|telefone|phone|whatsapp|mensagem|...`)
     — conferido uma a uma. Este é o argumento que dispensa uma segunda
     revisão de @architect: o isolamento é estrutural, não uma promessa.
  2. **Mas o @dev precisa ler `tracking` do JSON bruto**, antes/ao lado do
     `flattenIntoFields`, e passá-lo explicitamente adiante (via `ctx` ou um
     parâmetro novo). **Não** "consertar" o `flattenIntoFields` para achatar
     objetos aninhados — isso mudaria o comportamento para todos os chamadores
     e quebraria a garantia do item 1.
- **[PO] `processLandingPageLead` hoje devolve só `{ ok: boolean }`.** O AC6
  precisa do `leadId` (para `external_id` e para o merge de
  `metadata.meta_ad`). Estender o `ProcessResult` com `leadId?: string` é
  esperado e está dentro do escopo — o handler `POST` continua respondendo
  igual (`200 {status:"ok"}` / `500`), sem mudança de contrato externo.
- **[PO] Cuidado com PII em `webhook_logs.payload` e `leads.metadata.raw_fields`.**
  Os dois hoje persistem o mapa `fields` inteiro (`route.ts:78` e `:223`). Como
  `tracking` é descartado pelo `flattenIntoFields` (acima), IP/UA do visitante
  **não** vazam para lá por acidente — desde que o @dev não achate o
  `tracking` dentro de `fields`. O único lugar onde IP/UA devem ser
  persistidos é `metadata.meta_ad` (AC6), que é a decisão já tomada e validada
  na 86-9.
- `packages/web/src/app/api/webhooks/landing-page/route.ts` hoje faz o
  processamento do lead **de forma síncrona** (`await`, não `after()`) — essa
  decisão foi tomada deliberadamente após um incidente de perda silenciosa de
  leads (comentário no próprio arquivo, linha ~85-94). **Não reverter isso**:
  o `after()` desta story é só para o disparo CAPI (telemetria), nunca para
  a criação do lead em si.
- O `.single()` em vez de `.maybeSingle()` na busca de lead duplicado
  (`route.ts:189`) é um padrão pré-existente no arquivo, fora do escopo desta
  story — não introduzir o mesmo padrão em código novo, mas também não é
  obrigação desta story corrigi-lo no código existente.
- `normalizePhone()` local do `route.ts` (linha ~341) é **diferente** de
  `normalizePhoneBR`/`normalizePhoneForCapi` do `packages/shared` — produz
  `+55DDNNNNNNNNN` (com `+`), enquanto o CAPI espera dígitos sem `+`.
  `buildCapiUserData`/`normalizePhoneForCapi` já lidam com isso internamente
  (chamam `normalizePhoneBR` por conta própria a partir da string bruta) —
  não é necessário harmonizar os dois formatos, só garantir que o campo
  `phone`/`whatsapp` bruto chegue até `buildCapiUserData` sem transformação
  adicional que o confunda.
- CSP a editar: `landing-pages/trifold-design-system/vercel.json` — blocos
  `headers[0]`, `headers[1]`, `headers[2]` (sources `/vindresidence`,
  `/vindresidence/`, `/vindresidence/:path*`). **Não** o `headers[3]`
  (source `/((?!vindresidence).*)`).
- `coderabbit_integration` não está configurado em `core-config.yaml` — sem
  chave presente, portanto CodeRabbit está desabilitado neste projeto (mesmo
  padrão já observado em stories recentes do Epic 75/86); seção abaixo
  reflete isso.

### Testing

- `packages/shared/src/meta/capi-payload.test.ts` — cobrir o novo parâmetro
  `contentCategory` de `buildFormEvent` (default preservado + valor
  customizado).
- `packages/web/src/app/api/webhooks/landing-page/route.test.ts` (novo — não
  existe hoje) — cobrir: (a) payload sem `tracking` cria lead exatamente como
  hoje (regressão); (b) payload com `tracking` grava `metadata.meta_ad` no
  formato exato da 86-9 e chama `sendCapiEvents` com um batch de 2 eventos
  (`Lead` + `CompleteRegistration`), cada um com o `event_id` correto
  (`tracking.event_id` / `tracking.complete_registration_event_id`); (c)
  `client_ip`/`client_ua` do `tracking` sempre vencem sobre qualquer header
  da própria requisição (AC7); (d) nenhuma PII hasheada incorretamente/logada
  (AC9).
- `packages/web/src/app/api/webhooks/landing-page/track/route.test.ts` (novo)
  — cobrir: allowlist de `event_name` (400 para valor inválido), disparo
  correto de `ViewContent`/`InitiateCheckout`, ausência de gravação em
  `leads`/`webhook_logs`.
- Testes manuais (não automatizáveis neste runtime sem bundler/test
  framework): `landing-pages/vind-residence/index.html`/`api/lead.js`/
  `api/track.js` — validar visualmente via `python3 -m http.server` local +
  Test Events do Meta (AC11), já que este runtime não tem Vitest configurado.
- Rodar `pnpm vitest run` (não `npm`) na raiz para a suíte de
  `packages/shared`/`packages/web` — confirmar zero regressão nos testes já
  existentes de `capi-payload`/`capi-client`/`landing-page`.

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled in `core-config.yaml`.
> Quality validation will use manual review process only.
> To enable, set `coderabbit_integration.enabled: true` in core-config.yaml

## Tasks / Subtasks

- [x] **T1 (AC1)** — Pixel base code + `fbq('track', 'PageView', ...)` em `landing-pages/vind-residence/index.html`
- [x] **T2 (AC2)** — helper vanilla JS de `visitor_id` (UUID v4 + `localStorage` + fallback em memória)
- [x] **T3 (AC3)** — helper vanilla JS de captura `fbc`/`fbp`/`fbclid`
- [x] **T4 (AC4)** — disparo dos eventos browser-side (`PageView`, `ViewContent`, `InitiateCheckout` via `fbq` + POST) com `event_id` compartilhado; listener de primeiro `focus` em `#nome`/`#whats` para `InitiateCheckout`; geração de dois UUIDs adicionais (`event_id`, `complete_registration_event_id`) no envio do formulário, para os eventos `Lead`/`CompleteRegistration` que o servidor dispara em T6
- [x] **T5 (AC6)** — ADAPT `buildFormEvent` (`packages/shared/src/meta/capi-payload.ts`) com `contentCategory` opcional + teste
- [x] **T5b (AC6, AC7)** — ADAPT `packages/web/src/lib/meta/form-capi.ts`: (a) `CorpoTracking` ganha `client_ip?`/`client_ua?` e `extrairSinais` dá **precedência ao corpo** sobre os headers da request; (b) envio em batch de N eventos numa só chamada a `sendCapiEvents`; (c) `contentCategory` repassado ao `buildFormEvent`; (d) derivação de `st` via `ufFromDDD` tornada opcional (default ligado, para não mudar `/formulario/[token]`). Testes cobrindo cada uma + não-regressão da 86-9
- [x] **T6 (AC6, AC7, AC9)** — estender `packages/web/.../landing-page/route.ts`: ler `tracking` do JSON **bruto** (o `flattenIntoFields` o descarta — ver Dev Notes), propagar até `processLandingPageLead`, devolver `leadId` no `ProcessResult`, gravar `metadata.meta_ad` via `comMetaAd`, disparar `Lead` + `CompleteRegistration` (batch único) via `after()`, garantir precedência de `tracking.client_ip`/`client_ua`
- [x] **T7 (AC5)** — criar `packages/web/.../landing-page/track/route.ts` (ViewContent/InitiateCheckout), espelhando `packages/web/src/app/api/formulario/[token]/tracking/route.ts`
- [x] **T8 (AC7)** — `landing-pages/vind-residence/api/lead.js`: montar `payload.tracking` a partir de `rawBody.tracking` (allowlist + `sanitizeField`) **e** sobrescrever `client_ip`/`client_ua` com `x-forwarded-for`/`user-agent`. Atenção: o payload atual é construído do zero e hoje descarta qualquer `tracking` recebido
- [x] **T9 (AC5, AC7)** — criar `landing-pages/vind-residence/api/track.js` (proxy para a nova rota `/track`, mesmo padrão de CORS/honeypot/`LANDING_PAGE_WEBHOOK_SECRET` de `api/lead.js` — a env já existe nesse projeto Vercel)
- [x] **T10 (AC8)** — atualizar CSP em `landing-pages/trifold-design-system/vercel.json` (3 blocos, não o 4º): `script-src`, `connect-src` **e `img-src`**
- [x] **T11 (AC10)** — testes de degradação graciosa (ad-blocker, sem localStorage, tracking ausente/malformado, falha de rede no `/track`)
- [x] **T12 (AC11)** — validação end-to-end com `META_CAPI_TEST_EVENT_CODE` (@devops, pós-deploy) + remoção da env de teste — **CONCLUÍDA (2026-08-26, 14:06–14:23 BRT).** A metade **server-side** já estava verificada com evidência direta na rodada anterior (AC5/AC6/AC7/AC9, incluindo o IP real do visitante em `metadata.meta_ad` e a rejeição do IP forjado pelo browser) e a CSP live cobre 100% dos recursos da página. Nesta rodada o Lucas fechou a metade **browser** com sessão real em `trifold.eng.br/vindresidence/?fbclid=TESTE123`: os **5 eventos** apareceram "Ativo" no Meta Pixel Helper (`PageView`, `ViewContent`, `InitiateCheckout`, `Lead`, `CompleteRegistration`) e o Events Manager marcou `Lead`/`CompleteRegistration` como **"Desduplicado"** — prova do pareamento por `event_id` entre browser e servidor. Env `META_CAPI_TEST_EVENT_CODE` removida do `trifold-crm` e prod redeployada; leads de teste apagados. Ver "Fechamento do T12 — 2026-08-26" no Dev Agent Record
  - _Fora do alcance do @dev: depende dos 3 deploys em produção (ver "Convenção de deploy"). Roteiro no Dev Agent Record._

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (`claude-opus-4-6-20260401`) — @dev (Dex), modo interativo/cuidadoso.

### Decisões tomadas durante a implementação

Todas as decisões abaixo são **complementos** ao que a story já travava; nenhuma
contraria AC ou Dev Notes.

1. **`enviarEventoFormulario` virou um atalho sobre `enviarEventosFormulario(N)`,
   em vez de duas funções paralelas.** O ADAPT pedido pelo AC6 (batch de N)
   poderia ter virado uma segunda função com a lógica de `montarEvento` copiada.
   Extraí `montarEvento()` (pura) e deixei o caminho de 1 evento delegando ao de
   N — o chamador da 86-9 (`/formulario/[token]`) mantém a mesma assinatura, e
   `META_CAPI_TEST_EVENT_CODE` + "nunca lança" ficam num lugar só.
2. **`derivarUf?: boolean` (default `true`) para desligar o `st`,** em vez de
   `state?: string` recebido pronto. Um parâmetro de valor faria o chamador da
   landing precisar saber *como* a UF é derivada; um booleano com default ligado
   preserva 100% do comportamento da 86-9 sem exigir nada do chamador antigo.
3. **Módulo novo `packages/web/src/lib/meta/landing-page-tracking.ts` (CREATE,
   justificado).** `lerTracking()`/`eventIdValido()` e as três constantes
   (`content_category`, `content_name`, URL padrão) são usadas pelas DUAS rotas
   do CRM (`/landing-page` e `/landing-page/track`). Alternativas rejeitadas:
   exportá-las do `route.ts` (Next.js reclama de exports que não sejam handlers
   ou config em arquivos de rota) e duplicar em ambos (a allowlist é fronteira de
   segurança — duas cópias divergem em silêncio). Não cabia em `form-capi.ts`,
   que é o módulo do formulário de qualificação.
4. **`event_id` validado por `/^[A-Za-z0-9._-]{8,64}$/`, não por UUID estrito.**
   `/formulario/[token]/tracking` (86-9) exige UUID, mas o helper vanilla desta
   landing cai num id `e-<base36>-<base36>` quando `crypto.randomUUID` não existe
   (contexto inseguro / navegador antigo). Exigir UUID descartaria em silêncio os
   eventos justamente dos navegadores mais frágeis. O que importa para dedup é o
   id ser o MESMO dos dois lados; o formato é indiferente. Teste dedicado cobre
   os dois formatos e recusa injeção (`espaço`, `../`, `<script>`).
5. **`<noscript>` do base code fica no `<body>`, não no `<head>`.** O AC8 previa
   registrar a decisão caso o `<noscript>` fosse omitido — ele NÃO foi omitido,
   só reposicionado: um `<img>` dentro de `<noscript>` no `<head>` é inválido e
   encerraria o parsing do head. O requisito de `img-src https://www.facebook.com`
   na CSP continua valendo integralmente.
6. **Espera pelo cookie `_fbp` antes do POST server-side (`quandoFbpPronto`).**
   Não estava nos ACs, mas é o defeito `86.9-QA-004` medido em produção: o
   snippet do Meta define `window.fbq` de forma síncrona (é só um stub que
   enfileira), enquanto o `fbevents.js` real — que grava o `_fbp` — carrega
   depois. Sem a espera, o `ViewContent` desta landing sairia com `fbp` ausente,
   que é exatamente o sintoma que a story veio corrigir. Teto de 5s (bloqueador
   de anúncios nunca deixa o cookie nascer); passado o teto, o evento sai mesmo
   assim, sem `fbp`.
7. **Mitigação do risco #4 (honeypot) implementada — saiu barata.** O proxy
   devolve `{ status: "ok", tracked: false }` no caminho do honeypot e
   `tracked: true` no envio real; o browser só dispara `Lead`/`CompleteRegistration`
   no Pixel quando `tracked !== false`. O **status HTTP continua 200** nos dois
   casos, que é o que o bot observa. Corpo ilegível → o browser assume `tracked`,
   preservando o caminho normal.
8. **Testes automatizados para os proxies, apesar de a story os declarar
   manuais.** `api/lead.js` e `api/track.js` são CommonJS comum e testáveis via
   `createRequire`. Como metade do AC7 (a armadilha nomeada pelo @po) vive
   justamente ali, deixá-los sem rede de proteção seria manter descoberto o ponto
   mais frágil da story. Custou duas linhas de config:
   `landing-pages/**/*.test.ts` no `vitest.config.ts` e `*.test.ts` no
   `.vercelignore` do projeto. O arquivo mora FORA de `api/` de propósito — tudo
   dentro de `api/` viraria uma função serverless no deploy.
9. **`select("id")` → `select("id, metadata")` na busca de duplicata.** O merge
   de `metadata.meta_ad` num lead que já existe precisa do JSONB atual para não
   apagar as demais chaves. A coluna extra é lida para todos os chamadores, mas
   só é usada quando há `tracking` — nenhuma mudança de comportamento.
10. **O update de `metadata` é um comando próprio, separado do update de UTM.**
    O update de UTM existente é condicionado a `.is("utm_campaign", null)`;
    pendurar `metadata` nele faria a atribuição do clique depender de o lead não
    ter campanha — um bug silencioso. Teste cobre os filtros do update.
11. **Telefone enviado ao `buildCapiUserData` é o `+55DDNNNNNNNNN` do
    normalizador local,** não o `rawPhone`. `normalizePhoneForCapi` remove o `+`
    e devolve os 13 dígitos canônicos; o formato local sempre tem DDI, o bruto
    nem sempre. Nenhum normalizador foi trocado (raio do endpoint compartilhado).

### Debug Log References

Nenhum bloqueio. Duas correções durante a implementação:

- Mock do Supabase no teste de `landing-page/route.ts` inicializava `op: "insert"`,
  fazendo `resolveOrgId` cair no ramo errado do resolver ("Nenhuma org ativa
  encontrada" → 500 em 12 testes). Corrigido para `op: "select"` como default.
- `tsc` apontou `'metadata.meta_ad' is possibly 'undefined'` num assert do teste;
  resolvido com optional chaining.

### Correção pós-QA — `86.11-QA-001` (forja de `client_ip`/`client_ua` nas rotas da 86-9)

**O defeito.** O ADAPT do AC7 deu a `client_ip`/`client_ua` do CORPO precedência
sobre os headers dentro de `extrairSinais` — correto e necessário para esta
story, onde existe o proxy `api/lead.js` entre o browser e o CRM. Mas
`extrairSinais` é compartilhada com DUAS rotas da 86-9 que já estão em produção e
são chamadas **direto pelo browser**, sem proxy nenhum:

- `packages/web/src/app/api/formulario/[token]/route.ts:173`
- `packages/web/src/app/api/formulario/[token]/tracking/route.ts:82` — e ali o
  corpo é o JSON **bruto**, apenas *castado* para `CorpoPost extends CorpoTracking`;
  uma interface do TypeScript não filtra chave nenhuma em runtime.

Depois da 86-11, qualquer visitante de um link público de formulário podia mandar
`{"client_ip":"1.2.3.4","client_ua":"..."}` e o valor ia literalmente para
`client_ip_address`/`client_user_agent` do evento CAPI — forja de
geografia/dispositivo no dataset do Meta. Não é vazamento de PII e não afeta a
criação do lead.

**A correção (opção (a) da recomendação do @qa): a precedência virou opt-in.**

| Ponto | Mudança |
|---|---|
| `form-capi.ts` | Nova interface `OpcoesSinais` com `confiarEmClientIpDoCorpo?: boolean` (default `false`). `extrairSinais(request, corpo, opcoes?)` só olha o corpo quando o flag é `true` — e não como *fallback*: sem o opt-in é como se os campos não existissem. |
| `webhooks/landing-page/route.ts:135` | Passa `{ confiarEmClientIpDoCorpo: true }` — quem chama é o proxy `api/lead.js`. |
| `webhooks/landing-page/track/route.ts:101` | Passa `{ confiarEmClientIpDoCorpo: true }` — quem chama é o proxy `api/track.js`. |
| `formulario/[token]/route.ts:173` | **NÃO passa nada.** Comportamento idêntico ao anterior à 86-11. |
| `formulario/[token]/tracking/route.ts:82` | **NÃO passa nada.** Idem. |

Nenhuma das duas rotas da 86-9 foi editada — o default seguro é o que as protege,
e não uma linha que alguém possa remover sem perceber. O que trava a regressão é
o teste, não a convenção.

**Testes acrescentados (5):**

| Arquivo | Teste |
|---|---|
| `lib/meta/form-capi.test.ts` | `SEGURANÇA 86.11-QA-001: sem o opt-in, IP/UA do corpo são IGNORADOS` |
| `lib/meta/form-capi.test.ts` | `SEGURANÇA 86.11-QA-001: confiarEmClientIpDoCorpo: false explícito também ignora` |
| `formulario/[token]/tracking/route.test.ts` | `SEGURANÇA 86.11-QA-001: client_ip/client_ua forjados no corpo são IGNORADOS` — POST real na rota pública com `client_ip: "1.2.3.4"` no corpo e `x-forwarded-for: 187.1.2.3` no header; assere que o evento CAPI leva o IP do header e que o valor forjado **não aparece em canto nenhum** do que iria à CAPI. |
| `formulario/[token]/route.test.ts` | `client_ip/client_ua forjados em tracking são IGNORADOS — vale o IP real da request` (mesma assertiva, no POST principal; confere também que os sinais legítimos como `fbp` seguem passando — a trava é só de IP/UA). |
| `formulario/[token]/route.test.ts` | `NÃO-REGRESSÃO 86-9: sem nada forjado, IP/UA seguem vindo dos headers` |

O `formulario/[token]/route.test.ts` não tinha mocks de CAPI; foram acrescentados
os mesmos dois já usados na rota irmã (`after()` que roda na hora e
`enviarEventoFormulario` interceptado), sem tocar em nenhum teste existente.

**Não regrediu o AC7 desta story:** os testes de precedência do lado da landing
(`form-capi.test.ts` AC7, `webhooks/landing-page/route.test.ts:278` e
`track/route.test.ts:138` — "o IP do datacenter `76.76.21.21` não aparece no
payload") continuam verdes, agora com o opt-in explícito.

### Validações executadas

| Verificação | Comando | Resultado |
|---|---|---|
| Suíte completa (após a correção do `86.11-QA-001`) | `npx vitest run` | **249 arquivos, 3051 testes passando** (+ 6 `expected fail` pré-existentes), 0 falhas |
| Suíte completa (implementação original) | `npx vitest run` | **249 arquivos, 3046 testes passando** (+ 6 `expected fail` pré-existentes), 0 falhas |
| Type-check (igual ao CI) | `npx turbo type-check` | 8/8 pacotes OK |
| Lint (igual ao CI) | `npx turbo lint` | 8/8 OK — **0 erros**, 30 warnings, todos pré-existentes em arquivos não tocados |
| Sintaxe dos 3 blocos `<script>` do `index.html` | `node --check` por bloco | OK |
| Sintaxe dos proxies | `node --check api/lead.js api/track.js` | OK |
| Aninhamento HTML do `index.html` | parser Python | 0 tags não fechadas |
| CSP — só os 3 blocos certos | parse do `vercel.json` | `/vindresidence`, `/vindresidence/`, `/vindresidence/:path*` com `facebook`; `/((?!vindresidence).*)` **intocado** |

**Baseline antes desta story:** 3038 testes. **Depois da implementação:** 3046
(+68 testes novos, distribuídos em 5 arquivos). **Depois da correção do
`86.11-QA-001`:** 3051 (+5 testes de regressão de segurança, em 3 arquivos).
Zero regressão em qualquer um dos dois marcos.

Smoke tests manuais do JS do browser (fora da suíte, com DOM stubado):

- Carregamento normal → `PageView` (só Pixel) + `ViewContent` (Pixel + POST com
  o MESMO `event_id`), `fbc` derivado do `fbclid` da URL, `fbp` lido do cookie,
  `visitor_id` estável entre chamadas.
- Bloqueador de anúncios + `localStorage`/`sessionStorage`/`document.cookie`
  lançando + sem `crypto.randomUUID` → nada quebra; `visitor_id` cai para memória
  e permanece estável; o POST sai após o teto de 5s, sem `fbp`/`fbc`.
- Primeiro `focus` em `#nome` **ou** `#whats` → `InitiateCheckout` uma única vez
  por carregamento (3 focos = 1 evento).
- Envio do formulário → `tracking` com dois `event_id` distintos e **sem**
  `client_ip`/`client_ua` (o browser não os dita); no `r.ok` com `tracked:true`,
  `Lead` e `CompleteRegistration` disparam no Pixel com os ids correspondentes.
- Resposta `tracked:false` (honeypot) → nenhum disparo no Pixel, UI de sucesso
  inalterada.

### Roteiro do T12 para o @devops (AC11)

1. Deploy na ordem da story: (1) `packages/web` via PR/CI; (2)
   `landing-pages/vind-residence/` (`vercel deploy --prod --yes --scope trifold-s-projects`
   de dentro do diretório); (3) `landing-pages/trifold-design-system/` (CSP).
   Sem (3) o Pixel fica bloqueado mesmo com (2) no ar.
2. Confirmar antes com `vercel project ls` que o projeto de produção é
   `vind-residence` (risco #1 da story).
3. `META_CAPI_TEST_EVENT_CODE` no projeto **`trifold-crm`** (nenhum outro).
   ⚠️ Nunca via `vercel env add` por pipe/stdin — usar `scripts/vercel-env-set.sh`.
4. Visitar `https://trifold.eng.br/vindresidence/?fbclid=TESTE123`, focar no
   campo nome, preencher e enviar. Esperado no Test Events: `PageView` (1x),
   `ViewContent` (2x dedup), `InitiateCheckout` (2x dedup), `Lead` (2x dedup),
   `CompleteRegistration` (2x dedup) — os 4 últimos com `fbp`, `fbc` e o **IP do
   visitante, não o do datacenter Vercel**.
5. Console do navegador sem nenhum erro de CSP com `facebook.net`/`facebook.com`.
6. Remover a env de teste e redeployar o `trifold-crm`.
7. **Registrar o valor final da CSP no comentário do PR** — o diretório
   `trifold-design-system/` é untracked e não haverá diff versionado para
   consultar depois (ponto cego de auditoria conhecido, ver "Convenção de deploy").

### Execução do T12 pelo @devops — 2026-08-26 (PARCIAL, T12 segue aberta)

**Resumo: os 3 deploys estão confirmados em produção e toda a metade
server-side do AC11 foi verificada com evidência direta. O que falta é
exclusivamente a observação humana no painel Test Events do Events Manager
(item 4 do roteiro) — não tenho credencial Meta nem browser nesta sessão, e
não existe endpoint de API que leia aquele painel.**

#### 1. Deploys — os 3 já estavam no ar antes desta sessão (nenhum novo deploy de conteúdo foi necessário)

| Componente | Como foi confirmado | Estado |
|---|---|---|
| (a) `packages/web` | REST API `/v6/deployments?target=production` → deployment `dpl_ErG5rBwkp3V35dQZEgYFGjucmndF` com `githubCommitSha = 0a037103` (descendente de `3c26163e`, o merge do PR #502). Rota nova comprovada viva: `POST /api/webhooks/landing-page/track` responde **401** sem token (existe + exige auth), enquanto um path irmão inexistente responde 404 | ✅ em prod |
| (b) `landing-pages/vind-residence/` | Deploy de produção `dpl_2GUUahYBfYETXHkN14dv48aXqcY9` em 2026-08-25 16:18 (10 min após o merge). `index.html` servido é **byte a byte idêntico** ao working tree (sha256 `cee2bd4e1515656178aae8a9c9e60c87b0bcb8252c665d23a2a2f24ac81214b7` nos dois lados). Proxies na versão nova: `api/lead.js` devolve `{"status":"ok","tracked":false}` no honeypot (mitigação do risco #4, que só existe nesta story) e `api/track.js` responde encaminhando ao CRM | ✅ em prod |
| (c) `landing-pages/trifold-design-system/` | Header `Content-Security-Policy` servido por `https://trifold.eng.br/vindresidence/` é **idêntico ao valor final registrado na "Nota de auditoria"** abaixo, com as 3 adições do AC8 | ✅ em prod |

#### 2. AC8 / item 5 do roteiro (CSP) — verificado de forma determinística, sem browser

Extraídas todas as origens externas realmente referenciadas pelo `index.html` e
conferida cada uma contra a diretiva correspondente da CSP **live**:
`connect.facebook.net` (`script-src` ✅, `connect-src` ✅), `www.facebook.com`
(`connect-src` ✅, `img-src` ✅ — cobre o beacon `<noscript><img src=".../tr?...">`,
que está presente no HTML), `vind-residence.vercel.app` (`connect-src` ✅),
`fonts.googleapis.com` (`style-src` ✅), `fonts.gstatic.com` (`font-src` ✅),
`img.youtube.com` (`img-src` ✅), `www.youtube.com` / `www.google.com`
(`frame-src` ✅). **Nenhum recurso da página fica fora da CSP** — não há como
haver violação de `facebook.net`/`facebook.com` no console. Fica pendente apenas
a confirmação visual no console de um browser real.

#### 3. Smoke test server-side em produção — AC5/AC6/AC7/AC9 verificados com evidência

`META_CAPI_TEST_EVENT_CODE` foi setada no projeto `trifold-crm` (só nele) via
`scripts/vercel-env-set.sh` (REST API, valor conferido não-vazio — **nunca**
`vercel env add` por pipe), production redeployada (`dpl_ErG5…` → `trifold-m8hz1l2eh`),
e o fluxo do browser foi simulado com `curl` **atravessando os proxies reais de
produção** (`vind-residence.vercel.app/api/track` e `/api/lead`), com
`fbclid=TESTE123` e — de propósito — `client_ip: "1.2.3.4"` /
`client_ua: "UA-FORJADO-PELO-BROWSER"` no corpo, para testar a armadilha do AC7
pelos dois lados de uma vez.

| Verificação | Resultado |
|---|---|
| `ViewContent` via `/api/track` | `200 {"status":"ok"}` |
| `InitiateCheckout` via `/api/track` | `200 {"status":"ok"}` |
| `Lead` + `CompleteRegistration` via `/api/lead` | `200 {"status":"ok","tracked":true}` (lead criado) |
| **AC7 — IP do visitante, não do datacenter** | `leads.metadata.meta_ad.client_ip` gravado = o **IP público real do cliente que originou o `curl`** (conferido contra `api.ipify.org` na mesma sessão; valor não transcrito aqui por ser dado pessoal). Nenhum IP de datacenter Vercel em canto nenhum do registro. ✅ |
| **AC7 — browser não dita IP/UA** | O `client_ip: "1.2.3.4"` e o `client_ua: "UA-FORJADO-PELO-BROWSER"` enviados no corpo foram **descartados**: o `client_ua` gravado é o UA real do cliente. A sobrescrita do proxy funciona em produção. ✅ |
| **AC6 — `metadata.meta_ad`** | Gravado no formato exato da 86-9 AC5: `{fbc, fbp, fbclid, client_ip, client_ua, visitor_id, captured_at}`, com `fbc = fb.1.<ms>.TESTE123` derivado do `fbclid`. ✅ |
| **AC9 — contenção de PII** | `metadata.raw_fields` tem só `{nome, page, email, whatsapp}` e `webhook_logs.payload` só `{fields, page, utm}` — **sem** IP, UA, `fbp`, `fbc` ou `event_id`. O `flattenIntoFields` segue descartando o `tracking` em produção. ✅ |
| **Disparo CAPI** | Logs de runtime do deployment: os 3 POSTs em `200`, e **nenhuma linha `[form-capi] falha ao enviar …`** (o único log de erro desse caminho). Os 4 eventos server-side foram aceitos pelo Meta. ✅ |

Limpeza feita: o lead de smoke test (`78cfa087-ba1c-45c7-9a5d-17d4f8e1b5e1`)
foi **deletado**; `SELECT` de confirmação devolve 0 linhas. Efeito colateral
registrado: a distribuição automática atribuiu o lead a um corretor antes da
remoção, então pode ter havido uma notificação órfã. A linha correspondente em
`webhook_logs` foi deixada intacta de propósito (log de auditoria não se
adultera) e é inofensiva — não contém nenhum sinal de atribuição.

Env de teste **removida** e `trifold-crm` redeployada sem ela
(`dpl_8dQoXBxyqEwzg8vspA4hM6AkQq2A`, aliasada em `crm.trifold.eng.br`,
`/api/ping` 200, rota `/track` ainda 401 sem token). `vercel env ls production`
não lista mais `META_CAPI_TEST_EVENT_CODE`.

#### 4. O que continua faltando para fechar o T12 (e por quê) — ⚠️ SUPERADO em 2026-08-26 14:23 BRT

> **Nota (2026-08-26):** esta subseção descreve o estado da rodada **anterior** e está
> mantida como histórico. O gap descrito abaixo foi fechado — ver
> "Fechamento do T12 — 2026-08-26" logo adiante.

O `test_event_code` usado no smoke test (`TEST8611GAGE`) foi **gerado por mim**,
não obtido do Events Manager — a aba "Test Events" só existe na UI do
`business.facebook.com` e não há endpoint de Graph API que a leia ou que emita o
código. Nenhum código real está documentado no repo (a **T4 da Story 86-1**, que
era justamente "obter o `test_event_code` do Events Manager", também segue
`[ ]`, e a **T8 da 86-9** está no mesmo estado). Consequência: os 4 eventos do
smoke test foram marcados como teste (logo, **fora** do reporting/otimização de
produção — o objetivo do AC11), mas **não** apareceram em nenhum painel
observável.

Falta, portanto, uma passada **humana com browser + login Meta**, que precisa
ser feita numa única sessão porque os passos são acoplados:

1. Events Manager → dataset `1337310707164669` (conta "TRIFOLD - VIND") → aba
   **Test Events** → copiar o código exibido.
2. `scripts/vercel-env-set.sh META_CAPI_TEST_EVENT_CODE <código> production` +
   `vercel redeploy` do `trifold-crm` (procedimento já validado nesta sessão).
3. Abrir `https://trifold.eng.br/vindresidence/?fbclid=TESTE123`, focar o campo
   nome, preencher e enviar; conferir o console (esperado: zero violação de CSP,
   ver item 2).
4. Conferir no painel os 5 eventos: `PageView` 1x, e `ViewContent` /
   `InitiateCheckout` / `Lead` / `CompleteRegistration` 2x cada, marcados como
   deduplicados. **A metade servidor de cada par já está comprovada (item 3);
   o que essa passada acrescenta é a metade browser (`fbq`) e o pareamento por
   `event_id`.**
5. Remover a env e redeployar; apagar o lead de teste.

### Fechamento do T12 — 2026-08-26 (AC11 VERIFICADO, story `Done`)

A passada humana descrita no item 4 acima foi executada pelo **Lucas** em
`https://trifold.eng.br/vindresidence/?fbclid=TESTE123`, entre **14:06 e 14:23
BRT de 2026-08-26**, com o `test_event_code` real `TEST15571` obtido na UI do
Events Manager (dataset `1337310707164669`, conta "TRIFOLD - VIND"). A evidência
é **visual e real** (prints de tela), não simulada. Quatro fontes independentes:

1. **Servidor (Events Manager → Eventos de teste, código `TEST15571`):** 5 eventos
   recebidos via CAPI ao longo do teste — `Ver conteúdo` (ViewContent, "Processado"),
   `Iniciar finalização da compra` (InitiateCheckout, "Processado"), `Lead`
   ("Desduplicado") e `Concluir inscrição` (CompleteRegistration, "Desduplicado").
   O selo **"Desduplicado"** em `Lead`/`CompleteRegistration` é a prova direta de que
   o Meta casou o `event_id` do servidor com a cópia vinda do browser pelo canal ao
   vivo (não-teste): a dedup de 48h do AC4 funciona **de verdade em produção**, não
   só em teste unitário.
2. **Browser (aba Rede do DevTools):** `fbevents.js` carregado, arquivo de config do
   pixel `1337310707164669` carregado, e requisições `tr` para `www.facebook.com`
   disparando — beacons de evento reais saindo do browser.
3. **Browser (extensão oficial Meta Pixel Helper) — confirmação definitiva:** os
   **5 eventos** listados como "Ativo" na página: `PageView`, `ViewContent`,
   `InitiateCheckout` (após focar o campo Nome, conforme AC3) e, depois do envio do
   formulário, `Lead` e `CompleteRegistration`.
4. **Console do navegador:** **zero** erro de CSP / `facebook.net` / `facebook.com`
   → AC8 confirmado com browser real, fechando o que a conferência determinística
   da rodada anterior já indicava.

**Por que o `PageView` não aparece no painel de Test Events (e não é defeito):** o
SDK JS (`fbq()`) não tem como carregar um `test_event_code` — esse parâmetro só
existe no payload da Conversions API. Logo, o painel filtrado por `TEST15571` só
enxerga a metade **servidor** de cada par e **nunca** exibiria um evento
client-only como o `PageView`. É limitação da ferramenta do Meta. Quem prova o
`PageView` é o Pixel Helper (fonte 3). Registrado aqui porque essa assimetria
painel-vs-browser é armadilha garantida em qualquer revalidação futura.

**Encerramento operacional (executado pelo @devops nesta sessão):**

- Env `META_CAPI_TEST_EVENT_CODE` **removida** do projeto `trifold-crm` (target
  `production`) e ausência **reconferida** com `vercel env ls production` — só
  `META_CAPI_DATASET_ID` e `META_CAPI_ACCESS_TOKEN` permanecem. Prod redeployada
  sem ela (`https://trifold-88krb748r-trifold-s-projects.vercel.app`, aliasada em
  `crm.trifold.eng.br`, build Ready). A partir daqui os eventos CAPI de produção
  voltam a contar para reporting/otimização.
- **4 leads de teste** desta sessão apagados do banco de produção, com os
  dependentes: `a59043fb` ("teste", `+556949495305`, 17:23Z), `127a9709`
  ("teste2", `+5559583838384`, 17:15Z), `904cc007` ("teste", `+557858483838`,
  17:06Z) e `e1a9394e` ("teste", `+5544599999999`, 16:59Z) — todos com
  `metadata.landing_page = vind-residence`. Junto: 12 `activities`, 5
  `lead_distribution_log` (CASCADE) e os 4 `webhook_logs` correspondentes
  (`source=landing_page`, `event_type=lead_submission`), mapeamento 1:1 conferido
  antes do DELETE. Reconferência pós-limpeza: 0 linhas em todas as tabelas.
  Os leads reais do dia (3 `whatsapp_organic`/`whatsapp_click_to_ad` + 1) **não
  foram tocados** — o filtro foi por ID explícito, nunca por data.

**Resultado:** AC11 ✅. Os **12 de 12 ACs** da story estão entregues e verificados.
`86.11-QA-007` fechado (RESOLVED). Nada mais pendente para o `Done`.

### Nota de auditoria — CSP aplicada (o diretório é untracked)

Valor final do header `Content-Security-Policy` nos **3** blocos
`/vindresidence`, `/vindresidence/` e `/vindresidence/:path*` de
`landing-pages/trifold-design-system/vercel.json` (o 4º bloco,
`/((?!vindresidence).*)`, **não foi tocado**):

```
default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://connect.facebook.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https://img.youtube.com https://www.facebook.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://vind-residence.vercel.app https://connect.facebook.net https://www.facebook.com; frame-src https://www.youtube.com https://www.google.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self'
```

Diferenças em relação ao valor anterior: `+https://connect.facebook.net` em
`script-src`; `+https://www.facebook.com` em `img-src`;
`+https://connect.facebook.net https://www.facebook.com` em `connect-src`.

### Registro IDS (REUSE > ADAPT > CREATE)

| Artefato | Decisão | Justificativa |
|---|---|---|
| `packages/shared/src/meta/capi-client.ts` (`sendCapiEvents`) | **REUSE** | Já aceita array → batch nativo. Zero modificação. |
| `packages/shared/src/meta/capi-hashing.ts` | **REUSE** | Zero modificação. |
| `packages/shared/src/meta/capi-payload.ts` (`buildFormEvent`) | **ADAPT** | +1 parâmetro opcional `contentCategory` com default; 3 linhas; nenhum consumidor quebrado. |
| `packages/web/src/lib/meta/form-capi.ts` | **ADAPT** (4 pontos) | `client_ip`/`client_ua` no `CorpoTracking` com precedência **opt-in** (`OpcoesSinais.confiarEmClientIpDoCorpo`, default `false` — correção do `86.11-QA-001`); batch de N; `contentCategory`; `derivarUf`. Todos com default preservando a 86-9. |
| `comMetaAd()` | **REUSE** | Produz o formato exato da 86-9 AC5, com o merge do JSONB. Não reescrito à mão. |
| `packages/web/.../formulario/[token]/tracking/route.ts` | **Modelo** | A rota `/track` espelha sua estrutura (allowlist, `after()`, sem gravação). |
| `visitor-id.ts` / `browser-attribution.ts` / `meta-pixel.tsx` | **Referência → reimplementação vanilla** | Exceção justificada do AC2/AC3: o runtime da landing não tem bundler; `import`/`require` de `packages/*` falharia no deploy. Só a semântica foi copiada, só no lado browser. |
| `landing-page-tracking.ts` | **CREATE** | Ver decisão #3 acima. |
| `landing-pages/vind-residence/api/track.js` | **CREATE** (com duplicação deliberada de ~30 linhas de `lead.js`) | Um `require` entre funções serverless num projeto sem bundler, com publicação manual e sem CI, acrescentaria risco de deploy maior que o ganho de DRY. |

### File List

**Modificados — `packages/shared`:**
- `packages/shared/src/meta/capi-payload.ts`
- `packages/shared/src/meta/capi-payload-form.test.ts`

**Modificados — `packages/web`:**
- `packages/web/src/lib/meta/form-capi.ts` — inclui a correção do `86.11-QA-001` (`OpcoesSinais`/`confiarEmClientIpDoCorpo`)
- `packages/web/src/app/api/webhooks/landing-page/route.ts`
- `packages/web/src/app/api/formulario/[token]/route.test.ts` — ⚠️ arquivo da **86-9**, tocado só para acrescentar os testes de regressão de segurança do `86.11-QA-001` (+ mocks de `after()` e `enviarEventoFormulario`). A rota `route.ts` **não** foi modificada.
- `packages/web/src/app/api/formulario/[token]/tracking/route.test.ts` — ⚠️ idem: só o teste de regressão do `86.11-QA-001`. A rota `route.ts` **não** foi modificada.

**Criados — `packages/web`:**
- `packages/web/src/lib/meta/landing-page-tracking.ts`
- `packages/web/src/lib/meta/landing-page-tracking.test.ts`
- `packages/web/src/lib/meta/form-capi.test.ts`
- `packages/web/src/app/api/webhooks/landing-page/route.test.ts`
- `packages/web/src/app/api/webhooks/landing-page/track/route.ts`
- `packages/web/src/app/api/webhooks/landing-page/track/route.test.ts`

**Modificados — `landing-pages/vind-residence` (versionado no git):**
- `landing-pages/vind-residence/index.html`
- `landing-pages/vind-residence/api/lead.js`
- `landing-pages/vind-residence/.vercelignore`
- `landing-pages/vind-residence/README.md`

**Criados — `landing-pages/vind-residence` (versionado no git):**
- `landing-pages/vind-residence/api/track.js`
- `landing-pages/vind-residence/api-proxy.test.ts`

**Modificados — raiz:**
- `vitest.config.ts`

**Modificados — `landing-pages/trifold-design-system` (⚠️ NÃO versionado — só existe no disco e no deploy; conteúdo registrado na "Nota de auditoria" acima):**
- `landing-pages/trifold-design-system/vercel.json`

### Completion Notes

- **11 dos 12 ACs entregues e cobertos por teste.** O AC11/T12 é validação em
  produção, dependente dos 3 deploys — roteiro completo acima para o @devops.
- **`86.11-QA-001` fechado neste mesmo PR**, como o @qa recomendou (é código que
  esta story tocou). A precedência do corpo sobre os headers virou opt-in; as
  duas rotas da 86-9 ficaram com o **comportamento seguro por default** e não
  precisaram ser editadas. Ver a seção "Correção pós-QA" acima. Os demais
  achados do gate seguem como estavam: `86.11-QA-002` é roteiro do @devops
  (rebase em `origin/main`), `QA-003`/`QA-005`/`QA-007` continuam OPEN e
  `QA-004`/`QA-006` foram ACCEPTED pelo próprio gate.
- **A armadilha do AC7 tem teste dos dois lados:** no proxy (o corpo é montado
  com o `x-forwarded-for` que só ele enxerga, e sobrescreve qualquer
  `client_ip`/`client_ua` que o browser tenha tentado ditar) e no CRM (o corpo
  vence o header, e o IP do datacenter não aparece em canto nenhum do payload
  nem do banco).
- **Não-regressão da 86-9 travada por testes nomeados:** `content_category`
  continua `form_qualificacao` sem categoria explícita, `st` continua sendo
  enviado em `/formulario/[token]`, `extrairSinais` **sem o opt-in** continua
  lendo IP/UA dos headers e ignorando o que vier no corpo (inclusive forjado), e
  `enviarEventoFormulario` continua mandando 1 evento por chamada.
- **`flattenIntoFields` NÃO foi tocado.** Um teste dedicado falha se alguém o
  "consertar": ele verifica que `webhook_logs.payload` e `metadata.raw_fields`
  não contêm IP, UA, `fbp` nem `event_id`.
- **Nada foi commitado.** `git add`/`commit`/`push` e a criação do PR são do
  @devops (REGRA ZERO). Lembrete: `landing-pages/trifold-design-system/` é
  untracked de propósito — **não** adicionar ao git.

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-08-24 | 0.1 | Story criada como irmã arquitetural da 86-9, adaptando Pixel+CAPI para o runtime standalone da landing Vind Residence (sem framework, sem workspace). Decisão travada: Opção A (CAPI disparado pelo CRM, reusando `packages/shared/src/meta/*`), por ausência de dependências no projeto `vind-residence` e por não exigir nenhuma env var nova. | @sm (River) |
| 2026-08-24 | 0.2 | Revisão a pedido do usuário: incluídos os 5 eventos do funil (antes só 3-4 estavam realmente em escopo, apesar do cabeçalho da seção dizer "3"), para alinhar com o funil completo da 86-9. `CompleteRegistration` agora entra em escopo, mas **sem inventar um segundo passo que não existe** — dispara no mesmo instante que `Lead` (mesma condição de sucesso do servidor), com `event_id` próprio; ressalva documentada em "Escopo dos eventos" e AC4/AC6. Atualizados: título da seção "Escopo dos eventos", tabela de eventos, AC4 (título + regras), AC5 (nota explícita de que `CompleteRegistration` não entra na allowlist da rota `/track`), AC6 (JSON de exemplo com `complete_registration_event_id`, disparo em batch de 2 eventos), AC11 (adicionada validação de `CompleteRegistration` x2), "Fora de escopo" (removida a linha de `CompleteRegistration`), Dev Notes e Testing (menção a `FORM_CAPI_EVENTS.COMPLETE_REGISTRATION`, já existente desde a 86-9 — nenhuma constante nova), Tasks T4/T6. Nenhuma mudança na decisão arquitetural (Opção A) nem na descoberta de runtime (`vind-residence.vercel.app`). Status permanece `Draft` — transição para `Ready` é exclusiva do @po. | @sm (River) |
| 2026-08-24 | 0.3 | **`*validate-story-draft` executada — veredito GO, 9.0/10. Status `Draft` → `Ready`.** Checklist de 10 pontos: título 1.0, descrição 1.0, AC testáveis 0.5, escopo IN/OUT 1.0, dependências 1.0, estimativa 1.0, valor de negócio 1.0, riscos 0.75, critério de pronto 1.0, alinhamento com epic 0.75. Toda a "Descoberta de runtime" foi reconferida contra o código (não aceita da v0.2): `projectName: vind-residence` + `prj_bSyrklkya…`, rewrites/CSP nos 3+1 blocos, `package.json` sem dependências (`engines: node 24.x`), `api/lead.js` como handler cru com honeypot e CORS allowlist, `#nome`/`#whats`/`#formMsg`/`fail()` reais no `index.html` (zero ocorrências de `fbq`/`facebook`), `flattenIntoFields`/`pick` genéricos em `route.ts`, `FORM_CAPI_EVENTS` com as 4 constantes, `buildCapiUserData({externalIds})` e `content_category` hardcoded em `buildFormEvent`, `trifold_visitor_id` em `visitor-id.ts`. **Correções aplicadas pelo @po (autoridade de AC/escopo):** (1) **AC7** — nomeada a armadilha concreta: `extrairSinais()` de `form-capi.ts` deriva IP/UA **sempre da própria request** e `CorpoTracking` sequer tem `client_ip`/`client_ua`; reusá-la como está faria todo evento sair com o IP do proxy Vercel, silenciosamente (análogo exato do `86.9-QA-001`) → ADAPT obrigatório com precedência do corpo + teste dedicado. (2) **AC7** — `api/lead.js` monta um payload novo (`{nome, whatsapp, email, page}`) e **descarta** qualquer `tracking` recebido hoje; o AC agora exige montar `payload.tracking` com allowlist + `sanitizeField`, além dos headers. (3) **AC6** — reconciliação com `packages/web/src/lib/meta/form-capi.ts`, que a v0.2 não citava: 3 ADAPTs reais (batch de N eventos vs. 1 por chamada; `st`/`ufFromDDD` injetado incondicionalmente vs. `st` **fora de escopo** nesta story; `contentCategory` não repassado) + reuso obrigatório de `comMetaAd`. (4) **AC8** — faltava `img-src https://www.facebook.com`: o base code oficial inclui o beacon `<noscript><img src="…facebook.com/tr…">` (como em `meta-pixel.tsx`) e a CSP atual é `img-src 'self' data: https://img.youtube.com`, o que tornaria o próprio critério de sucesso do AC8 inalcançável. (5) **Convenção de deploy** — corrigida afirmação incorreta da v0.2: `landing-pages/vind-residence/` **é versionado** (61 arquivos, PRs #478/#483/#494), só `trifold-design-system/` é untracked (0 arquivos); tabela nova separando "como o código entra" de "como o site sobe", com o ponto cego de auditoria da CSP registrado. (6) **Dev Notes** — `flattenIntoFields` descarta objetos aninhados (é a **prova estrutural** do "aditivo byte a byte" da Opção A, e ao mesmo tempo a razão de o `tracking` ter que ser lido do JSON bruto); `ProcessResult` precisa devolver `leadId`; alerta de PII em `webhook_logs.payload`/`metadata.raw_fields`; mapa dos 7 módulos já prontos da 86-9 com REUSE/ADAPT/Referência por arquivo. (7) **Riscos** — novo risco #4: honeypot devolve `200 ok` sem criar lead, o que faria um bot gerar evento de browser sem contraparte de servidor. (8) **Tasks** — nova T5b (ADAPT de `form-capi.ts`); T6/T7/T8/T9/T10 reescritas com os achados. **Decisão sobre revisão extra de @architect: dispensada** — o isolamento do endpoint compartilhado é estrutural e verificável (objetos aninhados nunca chegam ao `pick()`, e nenhuma sub-chave de `tracking` colide com os aliases existentes), não uma promessa de design; somado a isso, o padrão é cópia da 86-9, já em produção com QA PASS. | @po (Pax) |
| 2026-08-24 | 1.0 | **Implementação concluída (`*develop`, modo interativo). Status `Ready` → `Ready for Review`.** T1–T11 entregues; T12 (AC11) é validação em produção e fica com o @devops (roteiro no Dev Agent Record). Lado CRM: `buildFormEvent` ganhou `contentCategory` opcional (default `form_qualificacao` preservado); `form-capi.ts` recebeu os 4 ADAPTs do AC6/AC7 (`client_ip`/`client_ua` no `CorpoTracking` com **precedência sobre os headers**, batch de N eventos numa só chamada a `sendCapiEvents`, `contentCategory` repassado, `derivarUf` desligável); `/api/webhooks/landing-page` lê `tracking` do JSON **bruto** (o `flattenIntoFields` segue intocado), devolve `leadId`, grava `metadata.meta_ad` via `comMetaAd` e dispara `Lead`+`CompleteRegistration` em batch dentro de `after()`; nova rota `/api/webhooks/landing-page/track` para `ViewContent`/`InitiateCheckout`, sem gravar em `leads`/`webhook_logs`. Lado landing: Pixel base code no `<head>` + `<noscript>` beacon no `<body>` (decisão #5), helpers vanilla de `visitor_id`/`fbc`/`fbp`/`fbclid`, os 5 eventos com `event_id` compartilhado, `InitiateCheckout` no primeiro `focus` em `#nome`/`#whats`, `api/lead.js` passando a repassar `tracking` (allowlist + `sanitizeField`) com IP/UA reais do visitante, e novo `api/track.js`. CSP atualizada nos 3 blocos (`script-src`, `connect-src` e `img-src`), com o valor final registrado no Dev Agent Record por ser diretório untracked. Extras não pedidos, documentados como decisões: espera pelo cookie `_fbp` antes do POST server-side (defeito `86.9-QA-004`), mitigação do risco #4 do honeypot via `tracked:false` no corpo do 200, e testes automatizados dos proxies (o AC7 vive metade ali). Validação: **3046 testes passando em 249 arquivos** (+68 novos, zero regressão sobre a baseline de 3038), `turbo type-check` 8/8 e `turbo lint` com 0 erros. Nada commitado — git é do @devops. | @dev (Dex) |
| 2026-08-24 | 1.1 | **Correção do `86.11-QA-001` (medium, security) — fechada no mesmo PR, como o gate recomendou. Status permanece `Ready for Review`.** A precedência de `client_ip`/`client_ua` do corpo sobre os headers, introduzida em `extrairSinais` pelo ADAPT do AC7, vazava para as duas rotas da **86-9** que são chamadas direto pelo browser (`/api/formulario/[token]` e `/api/formulario/[token]/tracking`) — onde o corpo é digitado pelo próprio visitante e, na rota `/tracking`, é o JSON bruto apenas *castado* para `CorpoPost extends CorpoTracking` (interface do TS não filtra chave em runtime). Qualquer visitante podia forjar geografia/dispositivo no dataset do Meta. Aplicada a **opção (a)** da recomendação do @qa: nova interface `OpcoesSinais` com `confiarEmClientIpDoCorpo?: boolean` (default `false`), e a leitura do corpo deixou de ser *fallback* — sem o opt-in é como se `client_ip`/`client_ua` não existissem. Ligado explicitamente nas duas rotas da 86-11 (`webhooks/landing-page/route.ts` e `webhooks/landing-page/track/route.ts`), que ficam atrás dos proxies servidor-a-servidor `api/lead.js`/`api/track.js`. As duas rotas da 86-9 **não foram editadas**: ficam com o comportamento seguro por default, anterior a esta story — a proteção é o default, não uma linha que alguém possa apagar sem perceber. +5 testes de regressão de segurança em 3 arquivos (2 unitários em `form-capi.test.ts`, 1 na rota `/formulario/[token]/tracking`, 2 na rota `/formulario/[token]`), todos com POST real mandando `client_ip: "1.2.3.4"`/`client_ua: "UA-forjado-pelo-visitante"` no corpo e assertiva de que o valor forjado não aparece em canto nenhum do que iria à CAPI. O AC7 desta story não regrediu — os testes de precedência do lado da landing (incluindo "o IP do datacenter `76.76.21.21` não aparece no payload") seguem verdes. Suíte: **249 arquivos, 3051 testes passando** (+6 `expected fail`), `turbo type-check` 8/8, `turbo lint` 0 erros / 30 warnings pré-existentes. Nada commitado. | @dev (Dex) |
| 2026-08-25 | 1.3 | **Re-QA (`*qa-gate`, iteração 2) — veredito PASS. Status `Ready for Review` → `InReview`.** Re-verificação após as correções 1.1/1.2. `86.11-QA-001` fechado: precedência do corpo virou opt-in verdadeiro (`OpcoesSinais.confiarEmClientIpDoCorpo`, default `false`) — verificado no diff real de `form-capi.ts` (linhas 127/135/137, não é fallback) e nos 4 call-sites por grep (86-11 passam `true`, 86-9 não passam nada e não foram editadas); 5 testes novos de segurança existem, testam o cenário certo (forja no corpo IGNORADA nas rotas da 86-9, IP do header vence, valor forjado não sobrevive na CAPI) e passam. `86.11-QA-002` fechado: seção "Convenção de deploy" reflete o PR #501. Suíte re-executada por mim: 249 arquivos, 3051 testes passando + 6 expected fail, 0 falhas; type-check 8/8; lint 0 erros / 30 warnings pré-existentes. Restam só achados LOW aceitos como dívida (QA-003/005 OPEN, 004/006 ACCEPTED, 007 pós-deploy) — nenhum bloqueia. Liberado para @devops seguir com commit/PR/push; AC11/T12 (validação Test Events) permanece pós-deploy e bloqueia só o `Done`. | @qa (Quinn) |
| 2026-08-26 | 1.4 | **T12/AC11 executada pelo @devops — PARCIAL. Status permanece `InReview` (NÃO virou `Done`).** `main` local sincronizada com `origin/main` (`0a037103`) por fast-forward. `vercel project ls` confirmou os 3 projetos reais (`trifold-crm`, `trifold-design-system`, `vind-residence` — o `-teste` do risco #1 não existe mais). **Os 3 deploys já estavam no ar e foram confirmados, não presumidos:** (a) `packages/web` em `dpl_ErG5rBwkp3V35dQZEgYFGjucmndF` / commit `0a037103` ⊇ `3c26163e`, com a rota `/api/webhooks/landing-page/track` respondendo 401 sem token (existe) contra 404 num path irmão inexistente; (b) `vind-residence` em `dpl_2GUUahYBfYETXHkN14dv48aXqcY9`, com o `index.html` servido **byte a byte idêntico** ao working tree (sha256 `cee2bd4e…`) e os proxies na versão nova (honeypot devolvendo `{"status":"ok","tracked":false}`, marcador que só existe nesta story); (c) `trifold-design-system` servindo a CSP **exatamente igual** ao valor final da "Nota de auditoria". **AC8 verificado de forma determinística:** cada origem externa referenciada pelo `index.html` foi conferida contra a diretiva correspondente da CSP live — `connect.facebook.net` (`script-src`+`connect-src`), `www.facebook.com` (`connect-src`+`img-src`, cobrindo o beacon `<noscript>` que está presente), e mais 6 origens pré-existentes; nada da página fica fora da CSP. **Smoke test server-side em produção** (env `META_CAPI_TEST_EVENT_CODE` setada só no `trifold-crm` via `scripts/vercel-env-set.sh` + redeploy, fluxo simulado com `curl` atravessando os proxies reais, com `fbclid=TESTE123` e `client_ip`/`client_ua` **forjados no corpo de propósito**): os 3 endpoints em 200 (`tracked:true` = lead criado), e no banco de produção `metadata.meta_ad.client_ip` = **IP público real do cliente**, com o `1.2.3.4` e o `UA-FORJADO-PELO-BROWSER` do corpo **descartados** — a armadilha do AC7 está fechada nos dois lados **em produção**, não só em teste unitário. `metadata.raw_fields` (`{nome,page,email,whatsapp}`) e `webhook_logs.payload` (`{fields,page,utm}`) sem nenhum sinal de atribuição → AC9 confirmado em prod. Logs de runtime sem nenhuma linha `[form-capi] falha ao enviar` → os 4 eventos server-side foram aceitos pelo Meta. Lead de smoke test deletado (0 linhas na reconferência); env de teste removida e `trifold-crm` redeployada sem ela (`dpl_8dQoXBxyqEwzg8vspA4hM6AkQq2A`, `/api/ping` 200). **Por que a T12 NÃO foi marcada e o status NÃO virou `Done`:** o `test_event_code` só é obtenível na UI do Events Manager (não há endpoint de Graph API que o leia ou emita) e nenhum código real está documentado no repo — a T4 da 86-1 e a T8 da 86-9 seguem `[ ]` pelo mesmo motivo. O código usado no smoke test foi autogerado, o que manteve os eventos fora do reporting de produção (o objetivo do AC11) mas os tornou invisíveis em qualquer painel. Falta uma passada humana com login Meta + browser para observar `PageView` 1x e os outros 4 eventos 2x deduplicados — roteiro de 5 passos no Dev Agent Record. `86.11-QA-007` continua OPEN. | @devops (Gage) |
| 2026-08-25 | 1.2 | **Correção do `86.11-QA-002` (medium, process) — atualizada a seção "Convenção de deploy". Status permanece `Ready for Review`.** A v0.3/1.0 afirmava que `landing-pages/trifold-design-system/` era untracked e que a CSP do AC8 vivia num "ponto cego de auditoria" sem diff versionado. Isso ficou obsoleto: o **PR #501** ("docs: registra vercel.json do proxy trifold-design-system"), mergeado em `main` em 2026-08-24, passou a versionar `landing-pages/trifold-design-system/vercel.json` e `README.md` — confirmado por `git ls-tree origin/main` + `diff`, o conteúdo em `main` é byte a byte idêntico ao do working tree, já com as três adições de CSP do AC8. Reescrita a tabela "Como o código entra / Como o site sobe" para os dois diretórios como versionados; adicionado alerta para o @devops sobre o `main` local estar atrás de `origin/main` (o rebase precisa tratar `vercel.json` como arquivo já rastreado, não como untracked, para não abortar com "untracked working tree file would be overwritten"). Nenhuma mudança de código — só documentação. | @dev (Dex) |
| 2026-08-26 | 1.5 | **T12/AC11 FECHADA — validação end-to-end concluída com evidência visual real. Status `InReview` → `Done`.** O gap deixado pela v1.4 (a metade **browser** do AC11, que exigia login Meta + browser e não tinha caminho por API) foi fechado pelo **Lucas** em sessão real em `https://trifold.eng.br/vindresidence/?fbclid=TESTE123`, entre **14:06 e 14:23 BRT**, com o `test_event_code` real `TEST15571` obtido na UI do Events Manager (dataset `1337310707164669`, conta "TRIFOLD - VIND"). Quatro fontes independentes, todas por print de tela: (1) **Events Manager → Eventos de teste:** 5 eventos recebidos via CAPI — `Ver conteúdo` (ViewContent, "Processado"), `Iniciar finalização da compra` (InitiateCheckout, "Processado"), `Lead` ("Desduplicado") e `Concluir inscrição` (CompleteRegistration, "Desduplicado"); o selo **"Desduplicado"** prova que o Meta casou o `event_id` do servidor com a cópia do browser vinda pelo canal ao vivo — a dedup de 48h do AC4 funciona em produção, não só em teste unitário. (2) **Aba Rede do DevTools:** `fbevents.js` + arquivo de config do pixel `1337310707164669` carregados e requisições `tr` para `www.facebook.com` disparando. (3) **Extensão oficial Meta Pixel Helper — confirmação definitiva:** os **5 eventos** como "Ativo" na página — `PageView`, `ViewContent`, `InitiateCheckout` (após focar o campo Nome, conforme AC3) e, pós-submit, `Lead` e `CompleteRegistration`. (4) **Console:** zero erro de CSP/`facebook.net`/`facebook.com` → AC8 confirmado com browser real. **O `PageView` nunca aparece no painel de Test Events e isso não é defeito:** o SDK JS (`fbq()`) não tem como carregar `test_event_code` (o parâmetro só existe no payload da CAPI), então o painel filtrado por `TEST15571` só enxerga a metade servidor de cada par e jamais exibiria um evento client-only — quem prova o `PageView` é o Pixel Helper. **Encerramento operacional pelo @devops:** env `META_CAPI_TEST_EVENT_CODE` **removida** do `trifold-crm` (target production) com ausência **reconferida** por `vercel env ls production` (restam só `META_CAPI_DATASET_ID` e `META_CAPI_ACCESS_TOKEN`), e prod redeployada sem ela (`trifold-88krb748r`, aliasada em `crm.trifold.eng.br`, Ready) — eventos CAPI voltam a contar para reporting/otimização; **4 leads de teste** da sessão apagados de produção (`a59043fb`, `127a9709`, `904cc007`, `e1a9394e` — todos `metadata.landing_page=vind-residence`) junto de 12 `activities`, 5 `lead_distribution_log` (CASCADE) e os 4 `webhook_logs` pareados 1:1, com reconferência em 0 linhas e **nenhum lead real tocado** (DELETE por ID explícito, nunca por data). **12 de 12 ACs entregues e verificados**; `86.11-QA-007` fechado (RESOLVED). | @devops (Gage) |

## QA Results

### Review Date: 2026-08-24

### Reviewed By: Quinn (Test Architect)

> ⚠️ **REGISTRO HISTÓRICO — SUPERADO.** Esta é a iteração 1. A tabela de issues
> abaixo mostra `86.11-QA-001` e `86.11-QA-002` como OPEN, que era verdade em
> 2026-08-24. Os dois foram fechados e verificados na **iteração 2 (2026-08-25)** —
> pular para "Re-Review Date: 2026-08-25" no fim desta seção para o estado atual.

**Veredito: CONCERNS** — os 10 ACs implementáveis estão entregues e cobertos por
teste, a cadeia de IP/UA (o risco mais caro desta story) está correta e verificada
elo por elo, e o endpoint compartilhado com o WordPress não regrediu. O que impede
o PASS são dois itens `medium`: um efeito colateral do ADAPT em `extrairSinais`
que atinge as rotas da 86-9 **já em produção**, e um fato de repositório que
apareceu hoje e invalida a "Convenção de deploy" da story.

#### Evidência executada por mim (nada aceito de segunda mão)

| Verificação | Comando | Resultado |
|---|---|---|
| Suíte completa | `npx vitest run` | **249 arquivos, 3046 testes passando** + 6 `expected fail`, exit 0 — confere com o relatado |
| Type-check | `npx turbo type-check` | 8/8 pacotes OK |
| Lint | `npx turbo lint` | 8/8, **0 erros**, 30 warnings (todos pré-existentes, em arquivos de teste não tocados) |
| CSP — os 4 blocos | parse do `vercel.json` | blocos 0/1/2 com `connect.facebook.net` (`script-src`), `www.facebook.com` (`img-src`) e ambos (`connect-src`); bloco 3 `/((?!vindresidence).*)` **byte a byte intocado** |
| Divergência com `origin/main` | `git fetch` + `git ls-tree` + `diff` | ver `86.11-QA-002` |

#### Os 4 pontos herdados da validação do @po

1. **AC7 / precedência de IP — ✅ CORRETO.** Verificado lendo o código, não o
   relato. `index.html:811-822` não manda `client_ip`/`client_ua`;
   `api/lead.js:61-78` copia só a allowlist (que não os inclui) e **depois**
   escreve os dois a partir de `x-forwarded-for[0]`/`user-agent`, sobrescrevendo
   qualquer valor que o browser tenha tentado ditar; `extrairSinais`
   (`form-capi.ts:106-107`) dá precedência ao corpo; `buildCapiUserData` os
   emite em texto puro. `route.test.ts:273` assere que o IP simulado do
   datacenter (`76.76.21.21`) **não aparece em canto nenhum** do payload nem das
   escritas no banco. A armadilha nomeada pelo @po foi fechada dos dois lados.
2. **Não-regressão do endpoint compartilhado — ✅ CORRETO.** O `git diff` do
   `route.ts` é aditivo; a única mudança que toca o caminho de todo chamador é
   `select("id")` → `select("id, metadata")`. `flattenIntoFields` **não foi
   tocado**, então `tracking` continua invisível para o pipeline WordPress e
   para `webhook_logs.payload`/`metadata.raw_fields` — isolamento estrutural,
   com teste que quebra se alguém "consertar" o flatten. Testes de regressão
   verdes para JSON sem `tracking` e para `form-urlencoded`.
3. **`/formulario/[token]` intacto — ⚠️ FUNCIONALMENTE SIM, MAS.** Os defaults
   (`contentCategory` ausente → `form_qualificacao`; `derivarUf` ausente → `st`
   derivado) estão preservados e travados por testes nomeados "NÃO-REGRESSÃO
   86-9". **Porém** o ADAPT de IP/UA mudou a superfície de ataque das duas rotas
   públicas da 86-9 — ver `86.11-QA-001`.
4. **AC8 completo — ✅ CORRETO** nos 3 blocos, com `img-src` incluído e o 4º
   bloco intocado. Mas o roteiro de deploy do AC8 mudou — ver `86.11-QA-002`.

#### Issues

| ID | Sev | Título | Status |
|---|---|---|---|
| 86.11-QA-001 | medium | Precedência do corpo vazou para as rotas públicas da 86-9 — browser pode forjar `client_ip`/`client_ua` no evento CAPI | OPEN |
| 86.11-QA-002 | medium | Premissa de deploy obsoleta: o `vercel.json` da CSP já foi versionado e mergeado em `main` (PR #501) | OPEN |
| 86.11-QA-003 | low | `/landing-page/track` sem rate limit, ao contrário da rota-modelo da 86-9 | OPEN |
| 86.11-QA-004 | low | `quandoFbpPronto` atrasa o par server-side em até 5s (bounce < 5s perde o evento de servidor) | ACCEPTED |
| 86.11-QA-005 | low | Desvio literal do AC9: `console.log('[lead capturado]', data)` passa a logar `fbc`/`fbp` (caminho morto em prod) | OPEN |
| 86.11-QA-006 | low | `api/lead.js` anexa `tracking:{client_ip,client_ua}` mesmo sem tracking do browser → IP/UA persistidos em todo lead | ACCEPTED |
| 86.11-QA-007 | low | AC11/T12 só verificável pós-deploy | RESOLVED (2026-08-26, @devops — ver "Fechamento do T12") |

**`86.11-QA-001` em uma frase:** `extrairSinais` é compartilhada, e os outros dois
chamadores — `formulario/[token]/route.ts:173` e `formulario/[token]/tracking/route.ts:82`
(este passando o **JSON bruto**, apenas *castado* para `CorpoPost extends CorpoTracking`,
nunca estreitado em runtime) — são chamados direto pelo browser. Antes desta story
o corpo não tinha como influenciar IP/UA; agora qualquer visitante de um link público
de formulário pode enviar `"client_ip":"1.2.3.4"` e o valor vai literal para o CAPI.
Impacto é integridade de atribuição no dataset do Meta, não vazamento de PII, e não
afeta a 86-11. Correção: tornar a precedência opt-in (3º parâmetro, default `false`)
ou estreitar o corpo nas duas rotas da 86-9, + 1 teste.

**`86.11-QA-002` em uma frase:** PR #501 (MERGED 2026-08-24T20:10Z) versionou
`landing-pages/trifold-design-system/vercel.json` em `main`, e o `diff` contra a
cópia no working tree é **vazio** — a CSP do AC8 já está em `main`. O `main` local
está 12 commits atrás de `origin/main` e o arquivo ainda consta como untracked: um
`git pull` vai abortar com "untracked working tree file would be overwritten", e uma
resolução com `checkout -f` teria a aparência de descartar o trabalho de CSP.

#### Decisões do @dev fora do spec — avaliadas

Todas as 6 **aceitas**, sem push-back. O `event_id` relaxado é a mais discutível e
está certa: o id não é fronteira de autenticação, só precisa ser o mesmo dos dois
lados, e exigir UUID descartaria em silêncio os navegadores do fallback vanilla —
justamente os mais frágeis; o regex recusa espaço, `/`, `<` e `..`, com teste de
injeção. Espera do `_fbp`, testes dos proxies e `<noscript>` no `<body>` são
melhorias reais sobre o que a story pedia. Detalhamento no gate file.

#### Gate Status

Gate: CONCERNS → `docs/qa/gates/86.11-pixel-capi-landing-vind-residence.yml`

#### Pendências antes do @devops seguir para deploy

1. **Bloqueante de processo:** rebasear em `origin/main` tratando
   `trifold-design-system/vercel.json` como arquivo já versionado (`86.11-QA-002`).
   `origin/main` também já traz `api/lead.js`/`index.html` alterados pelo PR #499
   (`-teste` → domínio canônico) — o working tree converge, mas confira, não presuma.
2. Confirmar com `vercel project ls` que o projeto de produção é `vind-residence`
   (risco #1 da story).
3. `86.11-QA-001`: recomendo fechar no MESMO PR (~5 linhas + 1 teste, em código que
   esta story tocou). Se for adiado, tem que virar item de backlog com dono — não
   uma nota.
4. AC11/T12 pós-deploy: `META_CAPI_TEST_EVENT_CODE` **só** no `trifold-crm`, via
   `scripts/vercel-env-set.sh` (nunca `vercel env add` por pipe), validar os 5
   eventos no Test Events, remover a env e redeployar. Só então `Done`.

---

### Re-Review Date: 2026-08-25 (iteração 2)

### Reviewed By: Quinn (Test Architect)

**Veredito: PASS** — Status `Ready for Review` → `InReview` (liberado para @devops
seguir com commit/PR/push). Re-verificação após as correções das iterações 1.1
(`86.11-QA-001`) e 1.2 (`86.11-QA-002`) do @dev. Os dois achados `medium` que
impediam o PASS na iteração 1 estão fechados e **verificados no código**, não na
descrição do Change Log.

#### `86.11-QA-001` (security, medium) — RESOLVIDO ✅

Verificado lendo o diff real de `packages/web/src/lib/meta/form-capi.ts` e os 4
call-sites por grep (não aceitei o relato de segunda mão):

- **Opt-in verdadeiro, não fallback.** Nova interface `OpcoesSinais` com
  `confiarEmClientIpDoCorpo?: boolean` (default `false`). Em `extrairSinais`:
  `confiaNoCorpo = opcoes?.confiarEmClientIpDoCorpo === true` (linha 127) e
  `clientIp: (confiaNoCorpo ? texto(corpo?.client_ip) : undefined) ?? ipDaRequest(request)`
  (linha 135, e idêntico para `clientUa` na 137). Sem o opt-in, o corpo é tratado
  como inexistente — exatamente como recomendei na opção (a).
- **Call-sites conferidos:** 86-11 (`landing-page/route.ts:135`,
  `track/route.ts:106`) passam `{ confiarEmClientIpDoCorpo: true }`; 86-9
  (`formulario/[token]/route.ts:173`, `tracking/route.ts:82`) não passam nada e
  **não foram editadas** — a proteção é o default, não uma linha removível.
- **5 testes de segurança novos, testando o cenário certo e passando:** 2 em
  `form-capi.test.ts` (sem opt-in e com `false` explícito o corpo é ignorado), 1
  em `formulario/[token]/tracking/route.test.ts` e 2 em
  `formulario/[token]/route.test.ts` (POST real com
  `client_ip: "1.2.3.4"`/`client_ua: "UA-forjado-pelo-visitante"` no corpo,
  assertiva de que o IP do header `187.1.2.3` vence e o valor forjado não aparece
  em canto nenhum do que iria à CAPI). Os testes de precedência do lado da 86-11
  (opt-in) continuam verdes — o IP do datacenter `76.76.21.21` segue não
  aparecendo no payload.

#### `86.11-QA-002` (process, medium) — RESOLVIDO ✅

A seção "Convenção de deploy" (linhas 496-524) e o Change Log v1.2 refletem
corretamente a realidade atual: `landing-pages/trifold-design-system/` deixou de
ser untracked (PR #501, mergeado), a CSP do AC8 tem diff versionado em `main`, e o
alerta de rebase em `origin/main` está presente para o @devops. Só documentação,
como declarado.

#### Evidência re-executada por mim (nada de segunda mão)

| Verificação | Comando | Resultado |
|---|---|---|
| Suíte dos 5 arquivos afetados | `npx vitest run <5 arquivos>` | 70 testes passando |
| Suíte completa | `npx vitest run` | 249 arquivos, **3051 testes passando** + 6 expected fail, 0 falhas |
| Só os testes do achado | `npx vitest run -t "86.11-QA-001"` | **5 passed, 3 arquivos** (246 arquivos skipped) — os 5 declarados existem e rodam, um a um |
| As rotas da 86-9 realmente não foram editadas | `git diff -- '.../formulario/[token]/route.ts' '.../formulario/[token]/tracking/route.ts'` | **diff VAZIO nos dois.** `git status` lista só os dois `route.test.ts` como modificados |
| Type-check **sem cache** | `npx turbo type-check --force` | 8/8 pacotes OK |
| Lint **sem cache** | `npx turbo lint --force` | 8/8, **0 erros**, 30 warnings pré-existentes (`kanban-board.tsx`, `logger.test.ts`, `alert-credencial-morta.test.ts`, `distributor.test.ts` — nenhum tocado por esta story) |
| AC7 não regrediu | execução verbose dos 5 arquivos | todos os testes `AC7 —` verdes dos dois lados, incl. "o evento sai com o IP do corpo, nunca com o do datacenter Vercel" |

Confere com o Change Log v1.1 (3046 → 3051, +5 testes de segurança).

⚠️ Rodei `turbo type-check`/`lint` com `--force` de propósito: sem a flag o turbo
devolvia `FULL TURBO` / 8 cached, e cache hit não é evidência de compilação.

#### Duas coisas que eu quis confirmar além do que o @dev relatou

**1. O raio do defeito era maior do que o achado original registrou — e a correção
cobre o excedente.** O `86.11-QA-001` descrevia o impacto só sobre o evento CAPI.
Relendo o código: `formulario/[token]/route.ts` também persiste o MESMO objeto
`sinais` em `leads.metadata.meta_ad` via `comMetaAd` (linhas 229 e 285). O IP
forjado seria portanto **gravado no banco** e depois relido pelo evento "Visitou"
do cron (86-2/86-4) — a forja sobreviveria dias ao request que a originou. Como as
duas saídas derivam do mesmo `sinais`, o opt-in fecha as duas de uma vez: a
correção está no ponto de estrangulamento certo, não no sintoma. Conferi também
que `lerTracking` (a allowlist que aceita `client_ip`/`client_ua`) só tem dois
chamadores, ambos da 86-11 — não há caminho alternativo pelo qual o corpo alcance
`SinaisTracking` nas rotas da 86-9.

**2. Os 5 testes não passam por vacuidade.** Teste de segurança que passa sem
exercitar nada é pior do que teste nenhum, então verifiquei um a um:

- `form-capi.test.ts:92` e `:107` chamam `extrairSinais` DIRETO e asserem o valor
  do header — inverter o default quebra os dois na hora.
- `formulario/[token]/route.test.ts` assere `expect(eventosCapi).toHaveLength(1)`
  ANTES de olhar o conteúdo: se o mock de `enviarEventoFormulario` nunca fosse
  chamado, o teste **falha** em vez de passar vazio.
- `tracking/route.test.ts` lê `enviados[0]?.sinais` e acessa `.clientIp` — com a
  lista vazia, lança.
- Os dois testes de rota asserem `JSON.stringify(...)` **não conter** o valor
  forjado, não só que o valor certo está presente. É a forma que pega a regressão
  real, e não só o caminho feliz.

#### ⚠️ Correção de metadata do gate: de onde esta story realmente parte

Conferido rodando git (`git branch --show-current`, `git log -1`, `git fetch`), não
lido do contexto da sessão:

- As mudanças da 86-11 estão **NÃO COMMITADAS** sobre `main` @ `8dbc6000`, que está
  **13 commits atrás** de `origin/main`.
- O branch `feat/86-meta-capi-tracking` (@ `006d8868`) **existe**, mas é das stories
  86-1..86-8 (outbox/cron) e **não está com checkout aqui**. @devops: não commitar
  em cima dele por engano — criar branch a partir de `origin/main`.
- `landing-pages/trifold-design-system/vercel.json` segue tracked em `origin/main` e
  untracked no disco, com conteúdo **idêntico** (diff vazio). Nenhum trabalho de CSP
  pode se perder no rebase; o risco é só de resolução confusa, e a "Convenção de
  deploy" já corrigida diz como resolver.

#### Achados remanescentes (não bloqueiam o PASS — dívida aceita)

- `86.11-QA-003` (low) — `/landing-page/track` sem rate limit. OPEN, registrar em
  backlog com dono.
- `86.11-QA-005` (low) — `console.log` no caminho morto do `leadEndpoint` vazio.
  OPEN, cosmético.
- `86.11-QA-008` (low, **novo nesta iteração**) — a correção do `86.11-QA-002`
  atualizou a seção autoritativa ("Convenção de deploy"), mas sobraram duas frases
  com a premissa antiga: o **item 7 do roteiro do T12** ("o diretório
  `trifold-design-system/` é untracked e não haverá diff versionado... ponto cego de
  auditoria") e o **título "Nota de auditoria — CSP aplicada (o diretório é
  untracked)"**. Ambas falsas desde o PR #501, e contradizem a seção corrigida.
  Cosmético e não bloqueia: a seção que o @devops vai efetivamente seguir está certa,
  e o pior caso é colar o valor da CSP num comentário de PR desnecessariamente —
  trabalho a mais, nunca trabalho errado. Corrigir no próximo toque na story; não
  vale um round-trip com o @dev só para isto.
- `86.11-QA-004`/`86.11-QA-006` (low) — ACCEPTED no gate da iteração 1.
- `86.11-QA-007` (low) — AC11/T12 só verificável pós-deploy (bloqueia o `Done`,
  não o merge). **RESOLVED em 2026-08-26** pela validação com browser real
  (Pixel Helper + Events Manager); ver "Fechamento do T12 — 2026-08-26" no Dev
  Agent Record. Deixou de bloquear o `Done`.

#### Escopo desta re-revisão

Re-auditei **só o delta** desde a iteração 1: `OpcoesSinais` + as 4 linhas de
`extrairSinais` + os 2 argumentos nos call-sites da 86-11 + os 5 testes + as seções
"Correção pós-QA" e "Convenção de deploy" da story. Não re-auditei o que já havia
passado (hashing SHA-256 vs. texto puro, dedup de `event_id`, degradação graciosa,
CSP dos 4 blocos, isolamento de PII no `flattenIntoFields`) — nada no delta toca
esses caminhos, e a suíte completa cobre a regressão.

#### Gate Status

Gate: PASS → `docs/qa/gates/86.11-pixel-capi-landing-vind-residence.yml`
(verdict_history iteração 2)
