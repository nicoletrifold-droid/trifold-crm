# Story 86-9 — Pixel Meta + eventos CAPI no formulário de qualificação (alvo EMQ ≥ 9)

**Status:** Ready
**Epic:** 86 — Conversions API (CAPI) e Rastreamento Meta
**Executor:** @dev (Dex)
**Prioridade:** P0 (o formulário vira a URL de destino das campanhas pagas)
**Estimativa:** 8 pontos (G) — 8 arquivos, dois runtimes, regra de dedup entre eles
**Depende de:** 86-3 (módulo CAPI/hashing) e 86-4 (dispatcher) — ambos em `Review`, código em produção.
**Substitui:** 86-5 (landing própria), 86-6 (captura fbclid/fbc/fbp), 86-7 (Advanced Matching) — ver "Correção de curso".

## Correção de curso (por que esta story existe)

As stories 86-5, 86-6 e 86-7 foram escritas em 2026-08-04 presumindo uma landing
nova com rota `POST /api/public/leads`. Essa landing **nunca foi criada**: o
Epic 89 (stories 75-330 a 75-337) entregou, no lugar dela, o formulário de
qualificação em `/formulario/[token]` com `POST /api/formulario/[token]`. As três
stories, portanto, apontam para arquivos que não existem — nenhuma delas é
implementável como está.

Esta story consolida os objetivos das três **no alvo real**, e acrescenta os
eventos de funil aprovados pelo stakeholder (Gabriel, 2026-08-17). As 86-5/6/7
devem ser marcadas como `Superseded` por @po.

## Contexto — medição de baseline (2026-08-17, via Meta MCP)

Dataset `1337310707164669` ("TRIFOLD [PIXEL]", business `924743777538632`,
`first_party_cookie_enabled`, `is_active: true`).

**Qualidade de correspondência (EMQ) hoje — canal `web`, evento `PageView`:**

| Chave | Cobertura |
|-------|-----------|
| `ip_address` | 100% |
| `user_agent` | 100% |
| `country` | 100% |
| `ct` (cidade) | 100% |
| `st` (estado) | 96,1% |
| **`fbp`** | **9,2%** |
| `em`, `ph`, `fn`, `ln`, `external_id` | **0% (ausentes)** |

**`composite_score` = 4,0 / 10.** Meta desta story: **≥ 9**.

**Volume em 7 dias:** `PageView` ~600, `Lead` 4, `Schedule` 3. Origem ~50%
`BROWSER` / ~50% `SERVER`. Nada disso sai deste repositório, exceto os 3
`Schedule` (o evento "Visitou" do cron 86-4, funcionando).

**A página `/formulario/5aafa2ee-…` não tem Pixel algum** — verificado no HTML
servido em produção: nenhum `fbq`, nenhum `connect.facebook.net`. Todo o tráfego
pago que for direcionado para lá hoje chega **sem qualquer sinal** para o Meta.

## Decisões de produto (travadas — stakeholder Gabriel, 2026-08-17)

1. **E-mail** não entra como campo obrigatório do formulário. Ele é pedido de
   forma **opcional no passo de agendamento** ("para onde enviamos a
   confirmação?") — implementação na Story 86-10, não nesta.
2. **Cidade/UF derivadas do DDD do WhatsApp.** Ressalva técnica aplicada pelo
   @dev e aceita: o DDD determina a **UF** de forma confiável (44 → PR), mas
   **não a cidade** (o DDD 44 cobre Maringá, Umuarama, Campo Mourão e dezenas de
   municípios). Portanto: **envia-se `st`, não se envia `ct`**. Uma `ct` inferida
   errada não é neutra — o hash que não casa conta como chave coberta e não
   correspondida, e **derruba** o EMQ em vez de subir. Ver AC7.
3. **Eventos do funil aprovados:** `ViewContent`, `InitiateCheckout`,
   `CompleteRegistration`, `Contact`, somados aos já existentes `Lead` e
   `Schedule` ("Visitou").

## Acceptance Criteria

### AC1 — Pixel carregado na página pública do formulário

`packages/web/src/components/tracking/meta-pixel.tsx` (novo, client component)
injeta o Pixel Base Code oficial do Meta (`connect.facebook.net/en_US/fbevents.js`)
via `next/script` com `strategy="afterInteractive"`, chama
`fbq('init', <NEXT_PUBLIC_META_PIXEL_ID>)` e `fbq('track', 'PageView', {}, { eventID })`.

- É montado em `packages/web/src/app/formulario/[token]/page.tsx` — **somente**
  nessa rota pública. O layout raiz (`app/layout.tsx`) **não** é alterado: o CRM
  autenticado não carrega Pixel.
- Sem `NEXT_PUBLIC_META_PIXEL_ID` configurada, o componente retorna `null` sem
  erro e sem log ruidoso (mesma degradação graciosa de `sendCapiEvents`).
- O Pixel carrega **antes de qualquer interação do usuário** — é o que faz o
  cookie `_fbp` existir a tempo de ser lido no primeiro POST. Cobrir os 9,2% de
  `fbp` é o maior ganho isolado de EMQ desta story.

### AC2 — `visitor_id` estável como `external_id` desde o primeiro evento

`packages/web/src/lib/meta/visitor-id.ts` (novo) gera um UUID v4 na primeira
visita e o persiste em `localStorage` sob a chave `trifold_visitor_id`, com
fallback para memória quando o storage está indisponível (navegação anônima).

- Esse `visitor_id` é enviado como `external_id` em **todos** os eventos desta
  story, inclusive nos que ocorrem antes de o lead existir (`ViewContent`,
  `InitiateCheckout`).
- Quando o lead já nasceu, o `external_id` do payload CAPI é o **array com os
  dois valores**: `[sha256(visitor_id), sha256(lead_id)]`. O Meta aceita
  múltiplos `external_id` e casa por qualquer um deles; isso preserva a
  compatibilidade com o evento "Visitou" (86-3/86-4), que usa `sha256(lead_id)`,
  **sem** quebrar a ligação com os eventos anteriores da mesma sessão.
- `buildCapiUserData` (`packages/shared/src/meta/capi-payload.ts`) passa a
  aceitar `externalIds?: string[]` além do `leadId` atual. A assinatura antiga
  continua funcionando (o cron 86-4 não é alterado nesta story).

### AC3 — Captura de `fbc`/`fbp`/`fbclid` no browser

`packages/web/src/lib/meta/browser-attribution.ts` (novo, client):

- Lê os cookies `_fbp` e `_fbc` (populados pelo próprio Pixel).
- Quando `_fbc` está ausente mas há `fbclid` na URL, monta
  `fb.1.${Date.now()}.${fbclid}` — sem isso, o clique pago não é atribuído.
- Persiste o `fbclid` bruto em `sessionStorage` para sobreviver à navegação
  interna do formulário.
- Nunca lança: qualquer falha de acesso a cookie/storage retorna `{}`.

O `FormRunner` inclui o resultado dessa função no corpo de **todo** POST para
`/api/formulario/[token]`, sob a chave `tracking`.

### AC4 — Captura de IP e User-Agent no servidor

`POST /api/formulario/[token]` extrai o IP (`x-forwarded-for` primeiro valor,
fallback `x-real-ix`… — reusar `ipDaRequisicao`, que já existe no arquivo em
`route.ts:58`) e o header `user-agent`. Ambos vão **em texto puro** para o
`user_data` do CAPI. Nunca hasheados, nunca logados.

### AC5 — Persistência em `leads.metadata.meta_ad`

Ao criar (ou completar) o lead, grava-se no namespace `metadata.meta_ad`, com
merge preservando as demais chaves do JSONB (padrão de `buildCtwaMetadata`):

```json
{
  "meta_ad": {
    "fbc": "fb.1.<ms>.<fbclid>",
    "fbp": "fb.1.<ms>.<random>",
    "fbclid": "<bruto>",
    "client_ip": "<ip>",
    "client_ua": "<user-agent>",
    "visitor_id": "<uuid>",
    "captured_at": "<ISO 8601>"
  }
}
```

Isso é o que faz o evento "Visitou" (cron 86-4, disparado dias depois) sair
**com** `fbc`/`fbp`/IP/UA — hoje ele sai sem nenhum deles, porque
`extractAttribution` (`meta-capi-dispatch/route.ts:48`) lê um campo que nunca
foi escrito por ninguém.

### AC6 — Os cinco eventos do funil, com deduplicação browser ↔ servidor

| # | Evento Meta | Gatilho | Browser (`fbq`) | Servidor (CAPI) |
|---|-------------|---------|-----------------|-----------------|
| 1 | `PageView` | carregar a página | ✅ | ❌ |
| 2 | `ViewContent` | carregar a página | ✅ | ✅ |
| 3 | `InitiateCheckout` | 1ª resposta confirmada (`responder()`) | ✅ | ✅ |
| 4 | `Lead` | lead nasce (nome + telefone válidos) | ✅ | ✅ |
| 5 | `CompleteRegistration` | `finalizar: true` aceito | ✅ | ✅ |

- Cada evento tem um `event_id` UUID **gerado no browser** e enviado ao servidor
  no mesmo POST. Browser e servidor usam o **mesmo** `event_id` → o Meta
  deduplica (janela 48h) e o evento conta uma vez, com a união dos dois
  conjuntos de sinais. Sem isso a contagem infla e a campanha otimiza errado.
- Todos os eventos server-side desta story usam `action_source: "website"` e
  `event_source_url` com a URL real da página. (O "Visitou" do cron continua
  `system_generated` — não é alterado.)
- `custom_data`: `content_name` = nome do formulário; `content_category` =
  `"form_qualificacao"`. No `CompleteRegistration`, inclui também
  `value: <qualification_score>` e `currency: "BRL"` — o score já é calculado em
  `calcularScore` e é o sinal de qualidade que a campanha pode usar depois.
- O envio server-side roda dentro de `after()` — **nunca** `void`. A justificativa
  está no comentário de `route.ts:296`: na Vercel a invocação congela quando a
  resposta sai, e um `void` solto morre no meio. Um evento perdido aqui é um
  evento que nunca chega ao Meta.

### AC7 — `st` derivado do DDD, `ct` deliberadamente ausente

`packages/shared/src/meta/uf-from-ddd.ts` (novo, puro, testado) mapeia o DDD do
telefone já normalizado (`normalizePhoneBR` → `55DDNNNNNNNNN`) para a sigla da
UF, e retorna `null` para DDD inexistente. O `user_data` recebe
`st: [sha256('pr')]` (minúsculo, 2 letras — normalização Meta).

**`ct` NÃO é enviado.** Teste explícito garante que nenhuma cidade inferida entre
no payload — este AC não pode regredir por "melhoria" futura.

### AC8 — Advanced Matching no Pixel após a coleta dos dados

Assim que nome e telefone são confirmados no formulário, o browser re-invoca
`fbq('init', <PIXEL_ID>, { external_id, fn, ln, ph })` **antes** do
`fbq('track', 'Lead', …)`. O Pixel hasheia esses campos sozinho no client —
**não hashear manualmente no browser** (ao contrário do server, que fala direto
com a API e precisa hashear).

O telefone passado ao Pixel usa a mesma normalização do servidor
(`normalizePhoneBR`, de `@trifold/shared`). Confirmar que a função é isomórfica
(sem dependência de `node:crypto` ou similar) antes de importá-la no client; se
não for, extrair a parte de formatação para um módulo isomórfico — sem duplicar
a regra de negócio.

### AC9 — Nada de PII em texto puro, nada de hash indevido

- Hasheados (SHA-256 hex minúsculo, após normalização): `em`, `ph`, `fn`, `ln`,
  `external_id`, `st`.
- Texto puro, **nunca** hasheados: `fbc`, `fbp`, `client_ip_address`,
  `client_user_agent`.
- Nenhum desses campos aparece em `console.log`/`console.error` em nenhum caminho,
  inclusive nos de erro.
- Teste de não-regressão cobre as duas listas.

### AC10 — Degradação graciosa

Tráfego orgânico (sem `fbclid`), navegação anônima (sem `localStorage`),
bloqueador de anúncios (sem `fbq`, sem `_fbp`) e ausência de env var **não**
podem quebrar o formulário em nenhum ponto. O caminho de captação de lead é
soberano: falha de tracking é silenciosa e o lead continua nascendo.

### AC11 — Validação de ponta a ponta antes de contar como pronta

Com `META_CAPI_TEST_EVENT_CODE` setada, um preenchimento real do formulário
produz, no Test Events do Events Manager, os 5 eventos com:
- `event_id` idêntico entre browser e servidor (marcados como deduplicados);
- `fbp` presente;
- `fbc` presente quando a URL tem `fbclid`;
- `external_id`, `ph`, `fn`, `ln`, `st`, IP e UA presentes a partir do `Lead`.

A env é **removida** e o projeto redeployado ao fim da validação — eventos de
teste não contam para otimização de campanha.

## Fora de escopo (vai para a Story 86-10)

- E-mail opcional no passo de agendamento e o `em` que ele habilita.
- Evento `Schedule` do agendamento feito **pelo formulário** (o `Schedule` do
  stage "visitou" já existe e não é tocado).
- Evento `Contact` no handoff para o corretor.
- Custom Conversions, Lookalike e mudança de otimização de campanha (86-8).

## Riscos e itens fora do nosso controle

1. **O `PageView` server-side do WordPress derruba o EMQ do dataset.** Metade do
   volume atual é `SERVER` sem `fbp` — é o que segura o composite em 4,0. Nosso
   código não alcança essa origem. Enquanto o WordPress continuar enviando, o EMQ
   **do `PageView`** seguirá baixo mesmo com esta story perfeita. Os eventos que
   esta story cria (`ViewContent`, `Lead`, `CompleteRegistration`) têm EMQ
   **próprio** e é neles que a meta de ≥9 deve ser medida. Auditar/desligar a
   origem WordPress é item de @devops, fora desta story.
2. **EMQ é métrica lagged.** O Meta recalcula com alguns dias de volume. O AC11
   valida a *presença dos sinais*; a nota ≥9 é verificada em acompanhamento
   pós-deploy, não no gate de merge.
3. **Volume baixo** (~22 leads/mês) atrasa o cálculo do EMQ dos eventos de fundo
   de funil. `ViewContent` terá volume desde o primeiro dia e é o melhor
   termômetro precoce.
4. **Consentimento (LGPD).** O formulário só coleta o aceite no fim, mas o Pixel
   dispara no carregamento. É o mesmo comportamento da landing WordPress atual,
   então não é uma regressão — mas é uma decisão que merece revisão jurídica.
   Registrado, não bloqueia.

## Dev Notes

- Módulo CAPI existente e reusável: `packages/shared/src/meta/` — `capi-client.ts`
  (POST v25 com retry/backoff), `capi-payload.ts` (`buildCapiUserData`),
  `capi-hashing.ts` (`sha256Hex`, `normalizeEmail`, `normalizePhoneForCapi`).
  **Estender, não duplicar** (IDS: ADAPT).
- `normalizePhoneBR` vive em `packages/shared/src/utils/phone.ts` e já produz
  E.164 sem `+` com o 9º dígito — exatamente o formato que o Meta pede.
- O formulário salva parciais a cada passo e no `visibilitychange`
  (`form-runner.tsx:137`). O `Lead` deve disparar **uma única vez**, no POST em
  que o lead nasce — usar `useRef` como trava, no mesmo padrão do `ultimoEnviado`.
- Env nova: `NEXT_PUBLIC_META_PIXEL_ID = 1337310707164669`. Provisionamento é do
  @devops e **precisa** ser feito via REST API — `vercel env add` por pipe grava
  valor vazio em silêncio (dois incidentes registrados no `CLAUDE.md`). Helper
  pronto: `scripts/vercel-env-set.sh`.
- `META_CAPI_ACCESS_TOKEN` e `META_CAPI_DATASET_ID` já estão provisionadas
  (86-1) — o cron `meta-capi-dispatch` está entregando eventos em produção.

## CodeRabbit Integration

**Story Type Analysis:** Frontend + Integration (tracking), sem migration de schema.
**Complexity:** Alta — 8 arquivos, dois runtimes (browser/servidor), regra de dedup.

- Primary: @dev · Supporting: @qa (payload/PII), @devops (env + deploy)
- [ ] Pre-Commit (@dev): `coderabbit --prompt-only -t uncommitted`
- [ ] Pre-PR (@devops): `coderabbit --prompt-only -t committed --base main`

**Focus areas:** vazamento de PII em log; `fbc`/`fbp`/IP/UA hasheados por engano;
`event_id` divergente entre browser e servidor; disparo duplicado de `Lead`;
`void` no lugar de `after()`; quebra do formulário quando o tracking falha.

## Tasks / Subtasks

- [x] **T1 (AC1)** — `components/tracking/meta-pixel.tsx` + montagem em `formulario/[token]/page.tsx`
- [x] **T2 (AC2)** — `lib/meta/visitor-id.ts` + `externalIds[]` em `buildCapiUserData`
- [x] **T3 (AC3)** — `lib/meta/browser-attribution.ts` + envio de `tracking` no POST
- [x] **T4 (AC7)** — `shared/src/meta/uf-from-ddd.ts` + testes (inclui o teste que proíbe `ct`)
- [x] **T5 (AC4, AC5, AC6, AC9)** — envio CAPI dentro de `after()` em `api/formulario/[token]/route.ts` + persistência em `metadata.meta_ad`
- [x] **T6 (AC6, AC8)** — disparos `fbq` e geração de `event_id` no `form-runner.tsx`
- [x] **T7 (AC10)** — testes de degradação graciosa
- [ ] **T8 (AC11)** — validação no Test Events + remoção da env de teste (@devops) — **pendente: exige deploy**

## Dev Agent Record

**Agent Model Used:** claude-opus-5

### Decisões tomadas (modo YOLO)

1. **Quem decide quais eventos saem é o SERVIDOR, não o browser.** O browser
   propõe os `event_id` no corpo do POST; o servidor dispara `Lead` só quando o
   lead de fato nasceu e `CompleteRegistration` só quando a resposta foi
   finalizada, e devolve em `eventos: string[]` o que enviou. O browser espelha
   essa lista no Pixel. *Alternativa descartada:* o browser decidir sozinho — um
   telefone recusado pelo servidor faria os dois lados divergirem, e o Meta
   contaria duas conversões em vez de deduplicar uma. Como efeito colateral bom,
   o endpoint público deixa de aceitar "me manda um `Lead`".
2. **Rota separada `POST /api/formulario/[token]/tracking`** para `ViewContent` e
   `InitiateCheckout`. *Alternativa descartada:* pendurar no POST principal —
   ele só existe quando há respostas para gravar, então o `ViewContent` mediria
   apenas quem já respondeu algo, perdendo justamente o número que diz se o
   criativo traz gente que abre e desiste. A rota aceita **somente** esses dois
   eventos.
3. **`external_id` com dois valores** (`visitor_id` do browser + `lead_id` do
   CRM). O `lead_id` só existe depois de nome e telefone; sem um id próprio, os
   eventos de topo de funil sairiam sem `external_id` e o Meta veria dois
   desconhecidos na mesma sessão. O `lead_id` vai primeiro, preservando o
   contrato do evento "Visitou" (86-3/86-4).
4. **`st` sim, `ct` não** (AC7) — decisão de produto ajustada com base no que o
   DDD realmente determina. Teste dedicado impede que um "melhoramento" futuro
   reintroduza a cidade inferida.
5. **`request.url` no lugar de `request.nextUrl.origin`** para montar a URL de
   fallback: mesma resolução de origem, sem acoplar a rota ao tipo `NextRequest`
   (que o teste teria de fabricar).
6. **Rate limit extraído** para `lib/forms/rate-limit.ts`, sem mudança de
   comportamento — a rota nova precisa da mesma proteção, e manter o Map com poda
   duplicado em dois arquivos era pedir para os dois divergirem.
7. **`normalizePhoneBR` reusada no client** em vez de replicada. Verificado que é
   pura (só operações de string) e que client components do projeto já importam
   de `@trifold/shared`, com `optimizePackageImports` configurado no
   `next.config.ts` para isso.

### Validações executadas

| Verificação | Resultado |
|---|---|
| `vitest run` (suíte completa) | **208 arquivos, 2618 testes passando**, 6 expected-fail. Zero regressão |
| `tsc --noEmit` (packages/web) | limpo |
| `eslint` (arquivos tocados) | 0 erros (2 warnings pré-existentes no `form-runner.tsx`, não introduzidos) |
| Testes novos | 12 (rota de tracking) + 15 (payload/UF) + 8 (uf-from-ddd) |

⚠️ **`pnpm`, não `npm`.** O worktree é um workspace pnpm (`workspace:*` no
`package.json`); `npm install` falha com `EUNSUPPORTEDPROTOCOL` e deixa um
`package-lock.json` espúrio para trás.

### Completion Notes

- AC1 a AC10 implementados e cobertos por teste automatizado.
- **AC11 não pode ser fechado sem deploy**: depende de `NEXT_PUBLIC_META_PIXEL_ID`
  provisionada e de um preenchimento real observado no Test Events. É a única
  tarefa restante e é do @devops.
- O EMQ ≥ 9 é métrica *lagged* — a verificação é de acompanhamento pós-deploy,
  não de gate de merge, conforme o risco 2 da story.

### File List

**Criados**
- `packages/shared/src/meta/uf-from-ddd.ts`
- `packages/shared/src/meta/uf-from-ddd.test.ts`
- `packages/shared/src/meta/capi-payload-form.test.ts`
- `packages/web/src/lib/meta/visitor-id.ts`
- `packages/web/src/lib/meta/browser-attribution.ts`
- `packages/web/src/lib/meta/pixel-events.ts`
- `packages/web/src/lib/meta/form-capi.ts`
- `packages/web/src/lib/forms/rate-limit.ts`
- `packages/web/src/components/tracking/meta-pixel.tsx`
- `packages/web/src/app/api/formulario/[token]/tracking/route.ts`
- `packages/web/src/app/api/formulario/[token]/tracking/route.test.ts`

**Modificados**
- `packages/shared/src/meta/capi-payload.ts`
- `packages/shared/src/meta/index.ts`
- `packages/web/src/app/api/formulario/[token]/route.ts`
- `packages/web/src/app/formulario/[token]/page.tsx`
- `packages/web/src/app/formulario/[token]/form-runner.tsx`
- `docs/stories/86-5-…`, `86-6-…`, `86-7-…` (marcadas `Superseded` pelo @po)

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-08-17 | 0.1 | Story criada como correção de curso das 86-5/6/7 (que apontavam para uma landing inexistente), com baseline de EMQ medido via Meta MCP e as decisões do stakeholder de 17/08. | @sm (River) |
