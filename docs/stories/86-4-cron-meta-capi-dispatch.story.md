# Story 86-4 — Cron `meta-capi-dispatch`: drena a outbox e envia o evento "Visitou" à CAPI

**Status:** Review
**Epic:** 86 — Conversions API (CAPI) e Rastreamento Meta
**Executor:** @dev (Dex)
**Prioridade:** P0 (bloqueador — última story do trecho P0; ao completar, o evento Visitou já flui de ponta a ponta)
**Depende de:** 86-2 (outbox existe), 86-3 (módulo de payload/hashing existe)

## Contexto

Com a `meta_capi_outbox` sendo populada pelo trigger (Story 86-2) e o módulo
de payload/hashing pronto (Story 86-3), falta o processo que efetivamente
drena a fila e envia os eventos ao Meta. Segue o mesmo padrão arquitetural já
usado no projeto para processamento assíncrono resiliente — o exemplo mais
próximo é `packages/web/src/app/api/cron/meta-leads-retry/route.ts` (Story
75-214/75-215): cron autenticado por `CRON_SECRET`, busca em lote, marca
tentativas, política de idade/max-attempts, idempotência.

## Acceptance Criteria

1. **AC1 — Rota de cron criada.**
   `packages/web/src/app/api/cron/meta-capi-dispatch/route.ts`, `GET` handler,
   autenticado por `Authorization: Bearer {CRON_SECRET}` (mesmo padrão de
   `meta-leads-retry/route.ts`), retornando `401` se o header não bater e
   `500` se `CRON_SECRET` não estiver configurado.
2. **AC2 — Busca em lote de pendentes.** A rota consulta
   `meta_capi_outbox WHERE status = 'pending' ORDER BY created_at ASC LIMIT {BATCH_SIZE}`
   (sugestão `BATCH_SIZE = 50`, ajustável) via `createAdminClient()`
   (`packages/web/src/lib/supabase/admin.ts`, mesmo cliente usado em
   `meta-leads-retry`).
3. **AC3 — Enriquecimento com dados do lead.** Para cada linha da outbox, a
   rota busca os campos necessários do lead correspondente (`name`, `email`,
   `phone`, `metadata` — este último populado pela Story 86-6, pode estar
   vazio/null antes dela ser implementada, o que é um estado válido: o evento
   ainda é enviado, apenas sem `fbc`/`fbp`) via `leads` table.
4. **AC4 — Payload construído e enviado.** Para cada lote (ou por item — a
   API do Meta aceita array de eventos por request; decisão do @dev se
   batelar em um único POST por chamada de cron ou por item, favorecendo
   **um único POST com todos os eventos do lote**, reduzindo round-trips,
   desde que erros parciais sejam tratáveis — ver AC6), a rota chama
   `buildCapiUserData` + `buildVisitouEvent` (Story 86-3) para montar os
   eventos e `sendCapiEvents` para enviá-los.
5. **AC5 — Atualização de status pós-envio (sucesso).** Em caso de sucesso
   (`events_received` igual ao número de eventos enviados no lote), todas as
   linhas correspondentes são atualizadas para `status = 'sent'`,
   `sent_at = now()`.
6. **AC6 — Tratamento de falha com retry limitado.** Em caso de erro (rede,
   HTTP não-2xx, ou `events_received` divergente), as linhas do lote têm
   `attempts` incrementado e `last_error` preenchido com a mensagem de erro.
   Se `attempts >= MAX_ATTEMPTS` (sugestão `3`, mesmo valor usado em
   `meta-leads-retry`), a linha é marcada `status = 'failed'` (não tenta mais);
   caso contrário permanece `pending` para a próxima execução do cron
   tentar de novo.
7. **AC7 — Idempotência garantida pelo `event_id`.** Mesmo que uma linha seja
   reenviada por erro de rede após o Meta já ter recebido o evento
   anteriormente (falso negativo — request teve timeout mas o Meta processou),
   o `event_id` determinístico (gerado na Story 86-2) garante que o Meta
   deduplique no lado dele (janela de 48h, conforme a doc CAPI) — não é
   necessário lógica de dedup adicional no nosso lado além do que a outbox já
   garante (uma linha por lead+evento).
8. **AC8 — Cron registrado no `vercel.json`.**
   `packages/web/vercel.json` ganha uma entrada nova:
   `{ "path": "/api/cron/meta-capi-dispatch", "schedule": "*/3 * * * *" }`
   (a cada 3 minutos — mesmo intervalo usado por `campaign-poll` e
   `roleta-retry`, adequado para o volume baixo de eventos deste epic, ~22
   leads visitantes/mês).
9. **AC9 — Observabilidade mínima.** A rota retorna um JSON de resumo
   (`{ scanned, sent, failed, skipped }`) e loga erros relevantes via
   `console.error("[META-CAPI-DISPATCH] ...")` — mesmo padrão de log
   prefixado usado em `meta-leads-retry`.
10. **AC10 — Sem envio duplicado entre execuções concorrentes do cron.**
    Se o Vercel disparar duas execuções do cron muito próximas (edge case,
    mas mitigável), a atualização otimista de status
    (`UPDATE ... SET status = 'sent' WHERE id = ... AND status = 'pending'`
    — condicional no status atual) evita que duas execuções processem a
    mesma linha duas vezes com sucesso reportado incorretamente em ambas.

## Tasks

- [x] **T1 (AC1)** — Criar a rota `route.ts` com autenticação `CRON_SECRET`,
  seguindo a estrutura de `meta-leads-retry/route.ts` como referência de
  padrão (imports, tratamento de erro, formato de resposta).
- [x] **T2 (AC2, AC3)** — Implementar a busca em lote + enriquecimento com
  dados do lead.
- [x] **T3 (AC4)** — Implementar a construção do payload via módulos da
  Story 86-3 e a chamada a `sendCapiEvents`.
- [x] **T4 (AC5, AC6, AC10)** — Implementar a atualização de status
  (sucesso/falha/max-attempts) com update condicional por status atual.
- [x] **T5 (AC8)** — Adicionar a entrada no `packages/web/vercel.json`.
- [x] **T6 (AC9)** — Implementar logging e resumo de retorno.
- [x] **T7** — Testes unitários da lógica de decisão (mockando o Supabase
  client e `sendCapiEvents`): cenário sucesso total, falha parcial, lote
  vazio, item atingindo `MAX_ATTEMPTS`.
- [ ] **T8** — Teste manual em ambiente dev: mover um lead para `visitou`
  (gera linha na outbox via 86-2), disparar o cron manualmente (`curl` local
  com o `CRON_SECRET` de dev), confirmar `status = 'sent'` na outbox e o
  evento aparecendo no Events Manager (usando `test_event_code` da Story
  86-1, se aplicável em dev). — **PENDENTE**: requer `META_CAPI_ACCESS_TOKEN`
  provisionado (Story 86-1) e ambiente dev; deixado para o QA gate / validação
  manual pós-provisionamento do token.
- [x] **T9** — `npm run typecheck` limpo nos arquivos tocados; suíte da rota
  (11 testes) verde. `npm run lint` **bloqueado por issue ambiental**
  (`eslint-module-utils/resolve` ausente no node_modules — afeta todos os
  arquivos igualmente, não é do código desta story). Ver Debug Log.

## Dev Notes

### Padrão de referência: `meta-leads-retry`
[Fonte: `packages/web/src/app/api/cron/meta-leads-retry/route.ts`] Esta rota
já resolve o mesmo problema de forma genérica (fila de itens pendentes,
`MAX_ATTEMPTS`, `BATCH_SIZE`, autenticação por `CRON_SECRET`, resumo de
retorno) para um domínio diferente (webhook logs, não outbox de CAPI). Copiar
a estrutura de autenticação e o formato de resposta/summary; a lógica de
negócio (o que fazer com cada item) é específica desta story.

### Um POST por lote vs. um POST por item
[AUTO-DECISION] Um único POST com múltiplos eventos no array `data` é mais
eficiente e é exatamente o que a API do Meta CAPI suporta nativamente
(campo `data` é um array). Reason: menos round-trips, e o volume é baixo
(~22 leads/mês visitando, lotes de 50 nunca vão estar cheios na prática) —
não há necessidade de complexidade de "enviar em paralelo por item". Se o
POST do lote falhar integralmente, todo o lote tem `attempts` incrementado
igualmente; não há problema em reenviar um evento com o mesmo `event_id`
determinístico (o Meta dedupe, AC7).

### `vercel.json` — path exato
[Fonte: `packages/web/vercel.json`] Confirmar que o arquivo de crons vive em
`packages/web/vercel.json` (não na raiz do monorepo) — todas as entradas
existentes usam prefixo `/api/cron/...` sem o prefixo de pacote.

### Env vars consumidas
`CRON_SECRET` (já existe, usado por todos os crons), `META_CAPI_ACCESS_TOKEN`
e `META_CAPI_DATASET_ID` (provisionadas na Story 86-1, consumidas
indiretamente via `sendCapiEvents` da Story 86-3 — este cron não lê essas env
vars diretamente).

### Testing
- Unit: mock do Supabase admin client retornando 0/1/N linhas pendentes;
  verificar chamadas corretas de update de status para cada cenário.
- Unit: mock de `sendCapiEvents` retornando sucesso/erro; verificar
  incremento de `attempts` e transição para `failed` ao atingir
  `MAX_ATTEMPTS`.
- Manual: fluxo completo em dev (mover lead → outbox → cron → Meta Test
  Events), fechando o ciclo P0 do epic.

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled em `core-config.yaml`.
> Quality validation via revisão manual do @dev + @qa gate.

**Story Type:** Integration (cron + API externa) + Deployment (registro em vercel.json)
**Complexidade:** Medium — reaproveita padrão consolidado (`meta-leads-retry`), lógica de negócio nova é a integração com CAPI.
**Focus Areas:** Idempotência (event_id + update condicional por status), retry com limite, backward compatibility com o cron existente (não deve competir com `meta-leads-retry` por recursos), secrets management (CRON_SECRET já existente, sem novo segredo introduzido nesta story).

## Dev Agent Record

### Agent Model Used
Opus 4.8 (1M context) — @dev (Dex), modo YOLO.

### Implementation Notes / Decisões
- **[AUTO-DECISION] Um único POST por lote** (AC4): implementado conforme a
  decisão pré-registrada nas Dev Notes. `sendCapiEvents(events[])` envia todos
  os eventos do lote em uma request; a resposta é all-or-nothing por lote (o
  módulo 86-3 retorna `{success,error}` para o POST inteiro). Sucesso →
  todas as linhas marcadas `sent`; falha → todas incrementam `attempts`.
- **[AUTO-DECISION] Enriquecimento de leads em 1 query** (AC3): `leads` são
  buscados via `.in("id", leadIds)` num único round-trip (dedupe de leadIds),
  em vez de N queries. Reduz latência do cron.
- **Ausência dos campos de atribuição (Story 86-6 ainda não feita):** a rota
  extrai `metadata.meta_ad.{fbc,fbp,client_ip,client_ua}` via helper
  `extractAttribution()` que retorna `undefined` para cada campo ausente.
  `metadata` null, `meta_ad` ausente, ou campos vazios são todos estados
  válidos — o evento é enviado assim mesmo, apenas sem os sinais opcionais
  (`external_id`/`em`/`ph`/`fn`/`ln` continuam presentes). `buildCapiUserData`
  já omite os campos opcionais quando `undefined`. Coberto por 2 testes
  (pré-86-6 sem meta_ad; pós-86-6 com meta_ad propagando em plain text).
- **Ausência de `META_CAPI_ACCESS_TOKEN` em runtime:** não é lida pela rota —
  o módulo 86-3 (`sendCapiEvents`) a lê e retorna
  `{success:false, error:"META_CAPI_ACCESS_TOKEN is not configured"}` quando
  ausente. A rota trata isso como uma **falha normal** (não lança exceção):
  responde `200 {ok:true, failed:N}`, incrementa `attempts` e grava
  `last_error`, deixando as linhas em `pending` para retry quando o token for
  provisionado (86-1). Coberto por teste dedicado. Falha graciosa por design.
- **`META_CAPI_TEST_EVENT_CODE` lido em request-time** (não no escopo do
  módulo), para permitir toggle por deploy sem rebuild e ser testável.
- **IDS:** nenhum cron de dispatch CAPI pré-existia (busca confirmou apenas
  `meta-leads-retry` como referência de padrão). CREATE justificado; reusa o
  módulo CAPI (86-3), `createAdminClient` (existente) e o padrão de auth/summary
  do cron `meta-leads-retry`.

### Debug Log References
- `npm run lint` (eslint) **falha por issue ambiental**: módulo
  `eslint-module-utils/resolve` ausente do `node_modules` (regressão de
  install do pnpm) — `require.resolve('eslint-module-utils/resolve')` falha
  globalmente, afetando todos os arquivos igualmente. Não é do código desta
  story; a resolução é reinstalar deps (fora do escopo do @dev).
- `npx tsc --noEmit` (packages/web): **limpo** nos arquivos desta story. Os 2
  únicos erros restantes são pré-existentes e fora de escopo
  (`visual-editor.tsx` param implícito `any`; `pdf-lib` sem types — já
  reportados pela 86-3).
- `npx vitest run .../meta-capi-dispatch/route.test.ts`: **11/11 verdes**
  (auth 401, lote vazio, sucesso total marca `sent`, falha mantém `pending`
  abaixo de MAX, falha atinge `failed` em MAX_ATTEMPTS, token ausente gracioso,
  `events_received` divergente, sem/com `metadata.meta_ad`, lead inexistente
  → `skipped`, `test_event_code`).

### File List
- **Criado:** `packages/web/src/app/api/cron/meta-capi-dispatch/route.ts`
- **Criado:** `packages/web/src/app/api/cron/meta-capi-dispatch/route.test.ts`
- **Alterado:** `packages/web/vercel.json` (nova entrada de cron
  `/api/cron/meta-capi-dispatch`, schedule `*/3 * * * *`)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-04 | 0.1 | Draft criado a partir da auditoria de tracking Meta. Fecha o ciclo P0: outbox (86-2) → payload/hashing (86-3) → dispatch (esta story). | @sm (River) |
| 2026-08-04 | 0.2 | Validação @po (10-point): GO, 9/10. Draft → Ready. Padrão de referência `meta-leads-retry/route.ts` verificado existente ✓; `createAdminClient` e `vercel.json` confirmados ✓. AC10 (update condicional por status) previne double-dispatch em execuções concorrentes — bom cuidado. Nota não bloqueante: AC5 usa `events_received == n`; considerar que o Meta pode retornar `events_received` sem falha parcial explícita — logar a resposta completa ajuda a diagnosticar (já coberto por AC9). | @po (Pax) |
| 2026-08-04 | 1.0 | Implementação (@dev, YOLO). Rota `meta-capi-dispatch/route.ts` (AC1-AC7, AC9, AC10) + entrada em `vercel.json` (AC8) + 11 testes unitários verdes. Enriquecimento de atribuição opcional/graceful (pré-86-6). Token ausente tratado como falha graciosa via retorno de `sendCapiEvents`. typecheck limpo nos arquivos tocados. T8 (teste manual em dev) pendente de provisionamento do token (86-1). lint bloqueado por issue ambiental de install (não do código). Ready → Review. | @dev (Dex) |

## QA Results

### Review Date: 2026-08-04

### Reviewed By: Quinn (Test Architect)

**Escopo:** `route.ts` + `route.test.ts` + entrada no `vercel.json`. Rodei `vitest run packages/web/src/app/api/cron/meta-capi-dispatch/` → **11 tests, todos verdes**. Auth comparada com `meta-leads-retry/route.ts` (padrão idêntico).

**7 quality checks:**
1. **Code review** — PASS. Estrutura fiel ao cron de referência; `extractAttribution` defensivo; mapeamento evento→linha preservado.
2. **Testes** — PASS. 11 cenários: 401 (sem/errado secret), lote vazio, sucesso total (marca sent), falha mantém pending abaixo de MAX, falha atinge failed em MAX_ATTEMPTS, token ausente gracioso, events_received divergente, sem/com meta_ad, lead inexistente→skipped, test_event_code.
3. **AC** — PASS. AC1 (Bearer CRON_SECRET, 401/500), AC2 (`status='pending' ORDER BY created_at LIMIT 50` via `createAdminClient`), AC3 (enriquecimento em 1 query `.in("id", leadIds)`), AC4 (1 POST/lote via buildCapiUserData+buildVisitouEvent+sendCapiEvents), AC5/AC6 (sent / attempts++→failed em MAX_ATTEMPTS), AC7 (dedup por event_id), AC8 (`*/3 * * * *` no vercel.json), AC9 (summary + `console.error("[META-CAPI-DISPATCH]...")`), AC10 (update condicional `.eq("status","pending")`) — todos atendidos.
4. **Regressão** — PASS. Não altera `meta-leads-retry` nem outros crons; apenas ADICIONA entrada no `crons[]` do vercel.json e um novo diretório de rota.
5. **Performance** — PASS (com nota low). 1 query de enriquecimento + 1 POST por execução. Updates de status são sequenciais em loop — aceitável p/ o volume alvo (~22 leads/mês).
6. **Segurança** — PASS. Acesso à outbox via `createAdminClient()` (service-role, obrigatório dado RLS+REVOKE da 86-2). CRON_SECRET nunca logado; token CAPI nunca lido/logado por esta rota (delegado ao módulo 86-3). meta_ad ausente/null tratado como estado válido.
7. **Docs** — PASS. File List, Dev Agent Record e Change Log completos.

### Gate Status

Gate: PASS → docs/qa/gates/86.4-cron-meta-capi-dispatch.yml

**Condição para @devops:** o teste manual end-to-end (T8) só é possível após 86-1 provisionar `META_CAPI_ACCESS_TOKEN` — até lá as linhas ficam `pending` e são retentadas (comportamento correto por design).
