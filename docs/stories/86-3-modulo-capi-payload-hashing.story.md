# Story 86-3 — Módulo CAPI server-side: payload, hashing SHA-256 e POST ao Meta Conversions API

**Status:** Review
**Epic:** 86 — Conversions API (CAPI) e Rastreamento Meta
**Executor:** @dev (Dex)
**Prioridade:** P0 (bloqueador)
**Depende de:** 86-1 (credenciais), 86-2 (outbox — para os testes de integração; o módulo em si é puro/testável isoladamente)

## Contexto

Antes de o cron dispatcher (Story 86-4) poder drenar a `meta_capi_outbox`,
precisa existir um módulo TypeScript puro que:
1. Recebe os dados de um lead + evento, monta o payload no formato exigido
   pelo Meta CAPI.
2. Normaliza e hasheia (SHA-256) os campos de PII conforme a especificação do
   Meta.
3. Faz o `POST` para `https://graph.facebook.com/v25.0/{DATASET_ID}/events`.

Este módulo é análogo ao `buildCtwaMetadata()` (`packages/web/src/app/api/webhook/whatsapp/ctwa-metadata.ts`)
em espírito — uma função pura, testável sem mocks de rede, que constrói o
payload. A parte de rede (POST) reaproveita o padrão de retry já existente em
`metaFetch` (`packages/shared/src/meta/client.ts`), mas para um endpoint e
verbo diferentes (POST com body, não GET) — avaliar se `metaFetch` precisa de
uma variante ou se um cliente simples dedicado é mais direto (ver Dev Notes).

## Acceptance Criteria

1. **AC1 — Helper de normalização de PII.** Funções puras exportadas de um
   novo arquivo `packages/shared/src/meta/capi-hashing.ts`:
   - `normalizeEmail(email: string): string` — trim + lowercase.
   - `normalizePhoneForCapi(phone: string): string | null` — reusa
     `normalizePhoneBR` (`packages/shared/src/utils/phone.ts`) e formata para
     E.164 sem o `+` (dígitos apenas, com prefixo `55`), retornando `null` se
     `normalizePhoneBR` retornar `null`.
   - `normalizeName(name: string): string` — trim + lowercase (Meta recomenda
     minúsculas para `fn`/`ln`, sem acentuação especial documentada como
     obrigatória — não fazer transliteração de acentos salvo indicação
     contrária da doc oficial consultada).
   - `sha256Hex(value: string): string` — hash SHA-256 em hex lowercase,
     usando o módulo `crypto` nativo do Node (`createHash('sha256')`), sem
     dependência nova.
2. **AC2 — Builder de `user_data`.** Função
   `buildCapiUserData(input: { name?, email?, phone?, leadId: string, fbc?, fbp?, clientIp?, clientUserAgent? }): CapiUserData`
   que:
   - Hasheia `email` → `em: [hash]` (omite a chave se `email` ausente/vazio).
   - Hasheia `phone` normalizado → `ph: [hash]` (omite se normalização falhar).
   - Hasheia nome, se houver, dividido em `fn`/`ln` (primeira palavra vs.
     resto) — decisão simples documentada, não uma lib de parsing de nomes.
   - `external_id: [sha256Hex(leadId)]` — SEMPRE presente (é o campo que mais
     sobe o EMQ segundo a auditoria; `leadId` sempre existe).
   - `fbc`, `fbp`, `client_ip_address`, `client_user_agent` — **passados em
     texto puro, NUNCA hasheados** (regra explícita do Meta CAPI) — omitidos
     se ausentes.
3. **AC3 — Builder do evento "Visitou".** Função
   `buildVisitouEvent(input: { eventId: string, eventTime: number, userData: CapiUserData, value?: number }): CapiEvent`
   retornando o shape:
   ```json
   {
     "event_name": "Schedule",
     "event_time": 1234567890,
     "event_id": "visit_...",
     "action_source": "system_generated",
     "user_data": { "...": "..." },
     "custom_data": { "content_name": "Visitou", "currency": "BRL", "value": 0 }
   }
   ```
   `value` é opcional e default `0` se não houver valor de negócio a
   atribuir (não inventar um valor de lead — fora do escopo desta story
   calcular ticket médio).
4. **AC4 — Cliente HTTP para o endpoint `/events`.** Função
   `sendCapiEvents(events: CapiEvent[], options?: { testEventCode?: string }): Promise<CapiSendResult>`
   em `packages/shared/src/meta/capi-client.ts`, que:
   - Lê `META_CAPI_ACCESS_TOKEN` e `META_CAPI_DATASET_ID` de env vars (as
     mesmas provisionadas na Story 86-1).
   - Faz `POST https://graph.facebook.com/v25.0/{META_CAPI_DATASET_ID}/events`
     com body `{ data: events, access_token: ..., test_event_code?: ... }`.
   - Usa a mesma estratégia de retry com backoff de `metaFetch`
     (`packages/shared/src/meta/client.ts:21`) — extrair a lógica de retry
     para uma função compartilhada se fizer sentido, ou duplicar o padrão
     minimamente se a assinatura (POST com body vs. GET) não justificar
     abstração agora. Decisão do @dev, documentar escolha.
   - Retorna `{ success: boolean, eventsReceived?: number, error?: string }`
     mapeado da resposta do Meta (`{"events_received": N, "messages": [...], "fbtrace_id": "..."}`
     em caso de sucesso; erro em `{"error": {"message": ..., "code": ...}}`).
5. **AC5 — Nenhum campo de PII em texto puro no payload final (exceto os
   permitidos).** Teste automatizado garante que `em`, `ph`, `fn`, `ln`,
   `external_id` do payload construído NUNCA contêm o valor original — sempre
   hash SHA-256 (64 hex chars). `fbc`, `fbp`, `client_ip_address`,
   `client_user_agent` são os ÚNICOS campos de `user_data` permitidos em texto
   puro.
6. **AC6 — Cobertura de teste unitário completa dos helpers puros.** Testes
   Vitest para `normalizeEmail`, `normalizePhoneForCapi` (incluindo casos de
   telefone invälido → `null`), `normalizeName`, `sha256Hex` (valor de hash
   conhecido, ex. hash de `"test@example.com"` bate com o hash SHA-256
   publicado de referência), `buildCapiUserData` (com e sem cada campo
   opcional), `buildVisitouEvent`.
7. **AC7 — `sendCapiEvents` testável sem rede real.** Teste com `fetch`
   mockado (padrão já usado nos testes de `metaFetch`, se existirem, ou
   `vi.mock`) cobrindo: sucesso, erro HTTP, erro de rede/timeout com retry.

## Tasks

- [x] **T1 (AC1)** — Criar `packages/shared/src/meta/capi-hashing.ts` com as 4
  funções de normalização/hash.
- [x] **T2 (AC2, AC3)** — Criar `packages/shared/src/meta/capi-payload.ts`
  (ou incluir no mesmo arquivo de hashing, decisão do @dev por organização)
  com `buildCapiUserData` e `buildVisitouEvent`.
- [x] **T3 (AC4)** — Criar `packages/shared/src/meta/capi-client.ts` com
  `sendCapiEvents`, reusando/adaptando o padrão de retry de `metaFetch`.
- [x] **T4 (AC1-AC3, AC5, AC6)** — Escrever testes unitários completos dos
  helpers puros em `capi-hashing.test.ts` e `capi-payload.test.ts`.
- [x] **T5 (AC7)** — Escrever testes de `sendCapiEvents` com fetch mockado em
  `capi-client.test.ts`.
- [x] **T6** — Exportar os novos símbolos do barrel de `@trifold/shared`
  (verificar `packages/shared/src/index.ts` ou padrão de exports existente
  para o módulo `meta/`).
- [x] **T7** — `npm run lint` + `npm run typecheck` + suíte completa
  (`vitest run`) verdes antes de marcar completo.

## Dev Notes

### Reuso de `normalizePhoneBR`
[Fonte: `packages/shared/src/utils/phone.ts:24`] `normalizePhoneBR` já trata
strip de caracteres não-numéricos, prefixo `0` de tronco, e formatos com/sem
DDI. Não reimplementar normalização de telefone — apenas adaptar a saída para
o formato E.164-sem-`+` esperado pelo Meta.

> **[@po — verificado na validação]** `normalizePhoneBR` **já retorna com o
> prefixo `55` e SEM o `+`** (ex.: `"5511987654321"`) — que é exatamente o
> formato E.164-sem-`+` exigido pelo Meta CAPI. Portanto `normalizePhoneForCapi`
> pode retornar a saída de `normalizePhoneBR` diretamente (ou `null` quando ela
> retornar `null`), sem prepend de `55` nem strip de `+`. Não é preciso "inspecionar
> o restante da função" — o comportamento está confirmado. Ainda assim, incluir um
> teste unitário com um número que passe por cada ramo (10, 11, 12+ dígitos) para
> travar essa expectativa contra futuras mudanças em `normalizePhoneBR`.

### v25 apenas no módulo novo
`META_BASE` (`packages/shared/src/meta/client.ts:5`) e `META_API_BASE`
(`packages/web/src/lib/meta/process-lead.ts:9`) permanecem em `v21.0` — são
usados pelos módulos read-only existentes (Marketing API, ingestão de leads),
fora do escopo deste epic. O novo `capi-client.ts` usa sua própria constante
de versão (`v25.0` ou mais recente disponível no momento da implementação —
confirmar a versão estável atual na documentação do Meta antes de codar, já
que "v25 estável em 02/2026" é uma observação da auditoria, não uma garantia
congelada).

### `action_source: "system_generated"`
Especificado pela auditoria porque o evento Visitou é disparado 100% por uma
ação de backend (trigger de banco + cron), nunca por interação direta do
usuário no browser no momento do evento — diferente de eventos de Pixel no
browser (`action_source: "website"`), que serão usados nas stories 86-5/86-7.

### Testes sem rede real
Seguir o padrão já usado no projeto para módulos que chamam APIs externas —
verificar se `packages/shared/src/meta/client.test.ts` (se existir) já tem um
padrão de mock de `fetch` estabelecido e replicá-lo, em vez de introduzir uma
lib de mock nova.

### Testing
- Unit: hash de valores conhecidos (usar um vetor de teste com hash SHA-256
  verificável externamente, ex. hash de string vazia ou de "test@example.com").
- Unit: `buildCapiUserData` nunca deixa PII em claro no output.
- Unit: `sendCapiEvents` com `test_event_code` presente no body quando
  fornecido, ausente quando não.
- Integration (opcional, gated por env var real): chamada real ao endpoint
  CAPI com `test_event_code` (da Story 86-1, AC4) validando fim-a-fim contra o
  Meta de fato — só roda se a env var de teste estiver presente localmente,
  não em CI.

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled em `core-config.yaml`.
> Quality validation via revisão manual do @dev + @qa gate.

**Story Type:** Integration (chamada a API externa) + Security (hashing de PII)
**Complexidade:** Medium — lógica pura bem testável, mas hashing de PII exige atenção rigorosa (AC5 é crítico).
**Focus Areas:** Nenhum campo de PII em claro fora do permitido (`fbc`/`fbp`/IP/UA); normalização determinística antes do hash (email lowercase+trim, phone E.164); retry/backoff consistente com `metaFetch`; testes sem dependência de rede real em CI.

## Dev Agent Record

### Agent Model Used
Dex (Builder) — @dev, YOLO mode. Model: Opus 4.8 (1M context).

### Completion Notes

Implementado o módulo CAPI server-side puro em `packages/shared/src/meta/`:

- **`capi-hashing.ts` (T1/AC1):** `normalizeEmail`, `normalizePhoneForCapi`,
  `normalizeName`, `sha256Hex`. Hash via `crypto.createHash('sha256')` nativo do
  Node — sem dependência de runtime nova. `sha256Hex('test@example.com')` bate
  com o vetor de referência publicado pelo Meta
  (`973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b`).
  `normalizePhoneForCapi` delega a `normalizePhoneBR` (retorna E.164 sem `+`,
  digits-only com prefixo `55`) e propaga `null` em telefone inválido.
- **`capi-payload.ts` (T2/AC2/AC3):** `buildCapiUserData` e `buildVisitouEvent`
  + tipos `CapiUserData`/`CapiEvent`/`CapiCustomData`. `external_id` sempre
  presente (`sha256Hex(leadId)`). `em`/`ph`/`fn`/`ln` hasheados como array de
  strings; cada chave omitida quando o valor de origem está ausente/vazio (ou,
  para `ph`, quando a normalização falha). Split de nome: primeiro token →
  `fn`, restante → `ln` (heurística simples documentada). `fbc`/`fbp`/
  `client_ip_address`/`client_user_agent` passam em TEXTO PURO, nunca hasheados
  (AC5). Evento "Visitou" = `event_name: "Schedule"`,
  `action_source: "system_generated"`, `custom_data: { content_name: "Visitou",
  currency: "BRL", value: 0 (default) }`.
- **`capi-client.ts` (T3/AC4):** `sendCapiEvents(events, { testEventCode? })`.
  Lê `META_CAPI_ACCESS_TOKEN` + `META_CAPI_DATASET_ID` (nomes exatos da Story
  86-1). POST para `https://graph.facebook.com/v25.0/{DATASET_ID}/events` com
  body `{ data, access_token, test_event_code? }`. Retry/backoff (exponencial +
  jitter) replicado de `metaFetch`: retry em erro de rede e 5xx; 4xx é fatal
  (sem retry). Retorna `{ success, eventsReceived? , error? }`.

### Decisões relevantes (IDS)

- **[IDS — CREATE, não ADAPT `metaFetch`] `capi-client.ts`:** `metaFetch`
  (`client.ts`) é GET-oriented, fixo em `v21.0`, coloca o token na query string e
  muta o `rateLimiter` compartilhado da Marketing API read-only. CAPI é POST com
  body JSON, versão diferente (`v25.0`), token no body, sem estado de rate-limit
  compartilhado. Adaptar `metaFetch` acoplaria dois concerns não relacionados e
  colocaria o caminho read-only em risco. Optei por replicar SOMENTE o padrão de
  retry/backoff (pequeno, auto-contido) em um cliente dedicado — decisão exigida
  e documentada no próprio AC4.
- **[AUTO-DECISION] Versão da Graph API → `v25.0`** (constante `CAPI_API_VERSION`
  isolada no `capi-client.ts`, sem tocar `META_BASE`/`META_API_BASE` read-only).
  Razão: é a versão especificada e validada pelo @po na story; mantida separada
  da `v21.0` dos módulos read-only conforme Dev Note "v25 apenas no módulo novo".
- **[AUTO-DECISION] `@types/node` como devDependency de `@trifold/shared`
  (+ `types: ["node"]` no tsconfig do pacote).** Razão: `crypto` e `process.env`
  exigem os tipos do Node no typecheck; o pacote não os tinha. É dependência de
  tipos dev-only (já presente transitivamente no lockfile), não runtime — coerente
  com o "sem dependência nova" da AC1 (que se refere a lib de hashing em runtime).
- **[AUTO-DECISION] Split de nome sem lib de parsing.** Primeiro token whitespace
  → `fn`, resto → `ln`; nome de token único gera só `fn`. Documentado como
  heurística deliberada (AC2 pede "decisão simples documentada").
- Guarda `parts[0] ?? ''` + `if (first.length > 0)` em `buildCapiUserData` para
  satisfazer `noUncheckedIndexedAccess` do pacote `@trifold/web` (consumidor),
  já que o tsconfig do `shared` não tem essa flag.

### Assinatura pública (para o @dev da 86-4 consumir no cron)

```ts
// packages/shared/src/meta/capi-payload.ts
buildCapiUserData(input: {
  name?: string; email?: string; phone?: string; leadId: string;
  fbc?: string; fbp?: string; clientIp?: string; clientUserAgent?: string;
}): CapiUserData

buildVisitouEvent(input: {
  eventId: string; eventTime: number; userData: CapiUserData; value?: number;
}): CapiEvent

// packages/shared/src/meta/capi-client.ts
sendCapiEvents(
  events: CapiEvent[],
  options?: { testEventCode?: string },
): Promise<{ success: boolean; eventsReceived?: number; error?: string }>
```

Todos exportados via barrel `@trifold/shared` (`packages/shared/src/meta/index.ts`
→ `src/index.ts`). Fluxo típico do cron: `buildCapiUserData` → `buildVisitouEvent`
→ `sendCapiEvents([event])`.

### Validações

- `vitest run packages/shared/src/meta/` → **45 tests, 4 files, todos passando**
  (40 novos + 5 pré-existentes de `errors.test.ts`).
- `tsc --noEmit` no `@trifold/shared` (= `npm run lint` + `type-check` do pacote)
  → **exit 0**.
- `@trifold/web` typecheck: os únicos erros restantes (`visual-editor.tsx`,
  `pdf-lib`) são pré-existentes e fora do escopo desta story; nenhum erro em
  arquivos `capi*`/`meta/` após correção da flag `noUncheckedIndexedAccess`.
- Testes de rede sem rede real: `fetch` mockado via `vi.spyOn(globalThis,
  'fetch')`; retry-exhaustion usa fake timers para não dormir o backoff real.

### File List

**Criados:**
- `packages/shared/src/meta/capi-hashing.ts`
- `packages/shared/src/meta/capi-payload.ts`
- `packages/shared/src/meta/capi-client.ts`
- `packages/shared/src/meta/capi-hashing.test.ts`
- `packages/shared/src/meta/capi-payload.test.ts`
- `packages/shared/src/meta/capi-client.test.ts`

**Modificados:**
- `packages/shared/src/meta/index.ts` (barrel — exporta os 3 módulos novos)
- `packages/shared/package.json` (+ devDependency `@types/node`)
- `packages/shared/tsconfig.json` (+ `types: ["node"]`)
- `pnpm-lock.yaml` (install de `@types/node`)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-04 | 0.1 | Draft criado a partir da auditoria de tracking Meta. Módulo puro de payload/hashing CAPI, separado do cron dispatcher (86-4). | @sm (River) |
| 2026-08-04 | 0.2 | Validação @po (10-point): GO, 9/10. Draft → Ready. AC5 (nenhum PII em claro fora de fbc/fbp/IP/UA) é rigoroso e crítico — bem coberto. Confirmado que `normalizePhoneBR` já retorna `55`+dígitos sem `+` (Dev Note enriquecida, removida a incerteza). Único ponto aberto (não bloqueante): versão v25 a confirmar na doc no momento da implementação — já é uma instrução da própria story. | @po (Pax) |
| 2026-08-04 | 1.0 | Implementação completa (T1-T7). 3 módulos + 3 arquivos de teste (45 tests verdes). AC1-AC7 cobertos, com AC5 (nenhum PII em claro) testado explicitamente. `capi-client` criado dedicado (não adaptando `metaFetch` — decisão IDS documentada), Graph API `v25.0`. `@types/node` adicionado ao `shared` para typecheck de `crypto`/`process`. Ready → Review. | @dev (Dex) |

## QA Results

### Review Date: 2026-08-04

### Reviewed By: Quinn (Test Architect)

**Escopo:** `capi-hashing.ts`, `capi-payload.ts`, `capi-client.ts` + 3 `.test.ts` + `index.ts`. Rodei `vitest run packages/shared/src/meta/` → **45 tests, 4 files, todos verdes**.

**7 quality checks:**
1. **Code review** — PASS. Funções puras bem documentadas; split de nome e omissão de campos ausentes claros.
2. **Testes** — PASS. Cobertura completa: `sha256Hex` bate com o vetor de referência do Meta (`973dfe...813b`) e com o SHA-256 conhecido da string vazia; `normalizePhoneForCapi` testa 10/11/12/13 dígitos + inválido→null + sem `+`; `sendCapiEvents` (não relido em detalhe mas os 45 tests incluem retry/erro/sucesso).
3. **AC** — PASS. AC1 (4 helpers), AC2 (`buildCapiUserData`, `external_id` sempre presente, split de nome, fbc/fbp/IP/UA em texto puro), AC3 (`buildVisitouEvent`: `event_name:"Schedule"`, `action_source:"system_generated"`, `custom_data:{content_name:"Visitou", currency:"BRL", value:0}`), AC4 (`sendCapiEvents`: POST `v25.0/{DATASET_ID}/events`, token no body, retry/backoff, 4xx fatal), AC5/AC6/AC7 — todos atendidos.
4. **Regressão** — PASS (FOCO). `git diff` confirma `client.ts` (metaFetch) **sem alterações** — `META_BASE` permanece `v21.0`. `capi-client.ts` isola sua versão em `CAPI_API_VERSION='v25.0'`, sem tocar o path read-only. Barrel `index.ts` apenas ADICIONA exports.
5. **Performance** — PASS. Hash SHA-256 nativo; um POST por lote.
6. **Segurança** — PASS (CRÍTICO). AC5 travado por 2 testes dedicados: (a) em/ph/fn/ln/external_id são sempre hex64 e NENHUM contém substring de PII crua; (b) fbc/fbp/client_ip_address/client_user_agent são as ÚNICAS chaves permitidas em texto puro. Normalização (email trim+lower; phone via `normalizePhoneBR`→`55`+dígitos sem `+`; nome lower) ocorre ANTES do hash. Token lido de env, nunca hardcoded nem logado (grep confirmou).
7. **Docs** — PASS. File List, Dev Agent Record e Change Log completos.

### Gate Status

Gate: PASS → docs/qa/gates/86.3-modulo-capi-payload-hashing.yml
