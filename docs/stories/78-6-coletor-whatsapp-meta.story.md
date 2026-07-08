# Story 78-6 — Coletor WhatsApp/Meta (cron 1×/dia)

## Metadata
- **Epic:** 78 — Painel de Saúde & Billing da Plataforma
- **Story:** 78-6
- **Status:** Ready
- **Priority:** P2 — camada MÉDIA de automação (não bloqueia as camadas FORTE 78-3/78-4/78-5, mas é o único coletor cujo custo é confirmadamente automático hoje via decisão do usuário sobre OQ-1)
- **Complexity:** M (adapta o contrato `BillingCollector` da 78-3; sem migration; ~6-8h — inclui confirmação de formato de resposta da API + tratamento defensivo de COST ausente por categoria)
- **Created:** 2026-07-08
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @dev (Dex)
- **Quality Gate:** @architect (Aria)
- **Quality Gate Tools:** `[contract_adaptation_review, error_isolation_review, idempotency_test, cron_auth_review, defensive_parsing_review]`

> Mapping confirmado no Epic 78 (§7, tabela de stories): "78-6 | Coletor WhatsApp/Meta (cron 1×/dia) | ... | @dev | @architect".

---

## User Story

**Como** Trifold CRM (plataforma),
**Quero** um coletor de billing para WhatsApp/Meta que **adapta** (não recria) o contrato `BillingCollector` fixado na Story 78-3, chamando `GET /<WABA_ID>?fields=pricing_analytics` (granularidade diária, métricas COST+VOLUME) e gravando custo estimado + volume por categoria de conversa de forma idempotente em `service_cost_snapshots`,
**Para que** o Painel de Saúde & Billing (78-9) exiba o gasto real do WhatsApp — hoje cobrado **direto pela Meta** (decisão do usuário sobre OQ-1, 2026-07-08) — com o mesmo nível de automação das camadas FORTE, e degrade graciosamente (sem quebrar o painel nem inventar dado) caso o campo COST venha ausente para alguma categoria/dia específico.

---

## Context

O Epic 78 classifica o WhatsApp/Meta como camada **MÉDIA** de automação (§2.1 do épico): diferente de Anthropic/OpenAI/Vercel (camada FORTE, sempre automática), o custo do WhatsApp só é automático **se o WABA for cobrado direto pela Meta** — se fosse cobrado via BSP/parceiro, o campo `COST` de `pricing_analytics` viria vazio (CON-4 original do épico, OQ-1).

**Decisão do usuário (2026-07-08, resolve OQ-1):** o WhatsApp da Trifold **é cobrado direto pela Meta**, não via BSP. Isso significa que o campo `COST` **funciona e é populado automaticamente** — o custo do WhatsApp entra no painel com o mesmo nível de confiança que Anthropic/OpenAI/Vercel, sem fallback manual de valor (diferente de Supabase/Resend, Story 78-7). Ainda assim, esta story mantém tratamento defensivo para o caso de `COST` vir vazio para uma categoria/dia específico (a doc oficial da Meta chama os valores de `pricing_analytics` de "approximate charges" — não são garantidos linha a linha), gravando esse dia/categoria com `collection_status='no_data'` em vez de inventar um valor.

Esta story **adapta** o contrato de coletor fixado pela Story 78-3 (`BillingCollector`, `CostSnapshotRow`, `CollectorResult`, `runCollector()`) — não recria runner, upsert ou isolamento de falha. A única peça nova é o `collect(window)` específico do WhatsApp/Meta (chamada à Graph API + parsing de `pricing_analytics`) e a rota de cron correspondente.

**Padrão de chamada à Graph API já existente no projeto** (reusar convenção, não a implementação): `packages/web/src/app/api/webhook/whatsapp/route.ts` e `packages/web/src/app/api/webhooks/meta-ads/route.ts` já chamam `https://graph.facebook.com/v21.0/...` — esta story usa a **mesma versão de API** (`v21.0`) por consistência, mas com um endpoint e propósito diferentes (billing/pricing_analytics, não mensageria/leads).

**Diferença crítica de credencial:** o WABA é acessado com `META_SYSTEM_USER_TOKEN` (contrato já fixado na Story 78-2, escopo `whatsapp_business_management`) — **não** o `META_PAGE_ACCESS_TOKEN` já usado pelo webhook de mensagens (esse é escopo de página/mensageria, não de billing/analytics da conta WhatsApp Business).

---

## Scope

### IN (esta story entrega)

- **Coletor WhatsApp/Meta** (`packages/web/src/lib/billing-collectors/whatsapp.ts`): implementa `BillingCollector` (`serviceSlug: 'whatsapp'`), chamando `GET https://graph.facebook.com/v21.0/<WABA_ID>?fields=pricing_analytics...` com os params confirmados (ver Dev Notes) e mapeando a resposta em `CostSnapshotRow[]` — custo estimado (`cost_estimated`) + volume (`volume`), quebrados por categoria de conversa quando a API retornar essa dimensão.
- **Rota de cron autenticada**: `packages/web/src/app/api/cron/billing-collect-whatsapp/route.ts`, seguindo **exatamente** o mesmo padrão `CRON_SECRET` de `daily-report`/`supremo-sync` e da Story 78-3 (78-6 **adapta**, não reinventa esse padrão).
- **Registro no `vercel.json`**: novo entry de cron 1×/dia, horário livre (ver Dev Notes).
- **Tratamento defensivo de COST ausente**: quando a resposta da API não trouxer valor de custo para um dia/categoria específico, o coletor grava **apenas** a linha de `volume` para aquele dia/categoria com status normal, e (se aplicável) uma linha de custo com `collection_status='no_data'` em vez de omitir silenciosamente ou inventar `value=0` como sucesso.
- **Extensão pontual do contrato de env vars da Story 78-2**: introdução do identificador `WHATSAPP_BUSINESS_ACCOUNT_ID` (ver Dev Notes — gap identificado no contrato de 7 env vars da 78-2, que não incluiu o identificador do WABA).

### OUT (não entra nesta story)

- Qualquer migration nova — o schema já existe (Story 78-1, migration `164`); esta story só escreve dado nas tabelas existentes.
- Runner genérico, contrato de tipos (`BillingCollector`/`CostSnapshotRow`/`CollectorResult`) — já fixados pela Story 78-3; esta story **importa e adapta**, não redefine.
- Provisionamento do secret `META_SYSTEM_USER_TOKEN` em si (Story 78-2) — esta story **consome** o secret; se ainda não existir, a rota degrada graciosamente (ver AC8), não falha na implementação.
- Coletores de OpenAI (78-4), Vercel (78-5), fallback manual Supabase/Resend (78-7), Meta Ads spend (78-10 opcional).
- UI do painel (78-9), CRUD de vencimentos/lembretes (78-8).
- Conversão de moeda BRL↔USD — NFR-7 proíbe inventar taxa.
- Reconciliação entre o custo estimado do WhatsApp e a fatura real emitida pela Meta (o painel mostra a **estimativa** da própria API, não um valor auditado — nota "approximate charges", ver Dev Notes).

---

## Acceptance Criteria

- [ ] **AC1 — Coletor implementa `BillingCollector` sem redefinir o contrato:** `packages/web/src/lib/billing-collectors/whatsapp.ts` importa `BillingCollector`, `CostSnapshotRow` e `CollectorResult` de `packages/web/src/lib/billing-collectors/types.ts` (Story 78-3) e exporta um objeto/factory com `serviceSlug: 'whatsapp'` e `collect(window): Promise<CostSnapshotRow[]>`. Nenhum tipo é redeclarado localmente; nenhuma lógica de upsert/isolamento de falha é reimplementada (isso continua em `runCollector()`, reusado sem modificação, salvo limitação documentada — ver AC3).

- [ ] **AC2 — Chamada correta à Graph API (`pricing_analytics`, nunca `conversation_analytics`):** `collect(window)` chama `GET https://graph.facebook.com/v21.0/<WABA_ID>?fields=pricing_analytics.start(<start>).end(<end>).granularity(DAILY).metric_types(["COST","VOLUME"])` com header `Authorization: Bearer ${META_SYSTEM_USER_TOKEN}`, onde `<start>`/`<end>` são timestamps UNIX (segundos) calculados a partir de `window.from`/`window.to` (datas `YYYY-MM-DD` em `America/Sao_Paulo` — início do dia `from` e fim do dia `to`, NFR-8). O campo usado é **sempre** `pricing_analytics` — o código nunca referencia `conversation_analytics` (endpoint descontinuado pela Meta), nem em comentários como alternativa válida.

- [ ] **AC3 — Custo automático grava `metric='cost_estimated'` com `collection_status='ok'` (decisão do usuário sobre OQ-1):** Como o WABA da Trifold é cobrado direto pela Meta, quando a resposta trouxer valor de custo para um dia, o coletor grava `CostSnapshotRow` com `metric = 'cost_estimated'` (ou `cost_estimated_{categoria}` quando a API retornar quebra por `conversation_category` — ver Dev Notes), `currency` conforme informado pela resposta (ou `'USD'` como padrão documentado se a API não expuser moeda explícita — não é conversão, é a moeda de origem assumida, NFR-7), `collection_status = 'ok'`.

- [ ] **AC4 — Volume gravado por categoria, independente do sucesso do COST:** Para cada dia/categoria retornado pela API, o coletor grava também `metric = 'volume'` (ou `volume_{categoria}`), `value` = contagem retornada, `currency = null` (métrica não-monetária), `collection_status = 'ok'`. A gravação de volume **não depende** do sucesso da gravação de custo — mesmo se o COST vier ausente para aquele dia/categoria (AC5), o volume ainda é gravado normalmente.

- [ ] **AC5 — COST ausente degrada para `collection_status='no_data'`, nunca inventa valor:** Se a resposta da API não incluir valor de custo para um dia/categoria específico (comportamento documentado pela Meta como "approximate charges" — pode faltar em casos pontuais mesmo com billing direto), o coletor grava uma linha `metric='cost_estimated'` (ou por categoria) com `value = 0`, `currency = null`, `collection_status = 'no_data'` — **nunca** grava `collection_status='ok'` com valor inventado, e nunca omite a linha silenciosamente (a ausência deve ser visível no painel, não invisível).

- [ ] **AC6 — Falha da API não derruba o cron (best-effort, reusa NFR-3 via `runCollector()`):** Se `collect()` lançar exceção (timeout, erro HTTP, resposta malformada), o comportamento é **idêntico** ao já implementado pelo runner genérico da Story 78-3 — captura, grava linha `metric='collection_error'`/`collection_status='error'`, `logEvent(categoria='cron')`, retorna HTTP 200 com `{ ok: false }`. Esta story não reimplementa esse comportamento; apenas garante que exceções de parsing/rede dentro de `collect()` se propagam normalmente para o runner (não são engolidas silenciosamente dentro do coletor).

- [ ] **AC7 — Cron autenticado por `CRON_SECRET` (padrão idêntico a 78-3/`daily-report`):** `GET /api/cron/billing-collect-whatsapp` segue exatamente o padrão já usado: sem `CRON_SECRET` configurado → 503 `{ error: "Cron not configured" }`; header `Authorization` incorreto → 401 `{ error: "Unauthorized" }`; auth correta → prossegue.

- [ ] **AC8 — Ausência de `META_SYSTEM_USER_TOKEN` ou `WHATSAPP_BUSINESS_ACCOUNT_ID` degrada graciosamente, sem gravar dado:** Se qualquer uma das duas variáveis estiver ausente, a rota retorna 503 (`{ error: "META_SYSTEM_USER_TOKEN not set" }` ou `{ error: "WHATSAPP_BUSINESS_ACCOUNT_ID not set" }`, conforme o caso) **sem** tentar chamar a Graph API e **sem** gravar nenhum snapshot (nem `collection_status='error'`) — mesmo comportamento documentado como AC8 na Story 78-3 para `ANTHROPIC_ADMIN_KEY` ausente.

- [ ] **AC9 — Sem custo/volume duplicado por dia (idempotência, reusa NFR-4 via `runCollector()`):** Rodar o coletor duas vezes para a mesma janela resulta em **exatamente uma linha** por `(service_id, snapshot_date, metric)` em `service_cost_snapshots` (upsert via `onConflict: 'service_id,snapshot_date,metric'`, já garantido pelo runner da 78-3 — validado aqui apenas como confirmação de que o coletor não introduz uma chave de `metric` diferente a cada execução para o mesmo dia/categoria).

- [ ] **AC10 — `vercel.json` atualizado sem colisão de horário:** Novo entry em `packages/web/vercel.json` → `{ "path": "/api/cron/billing-collect-whatsapp", "schedule": "30 10 * * *" }` (10:30 UTC — livre; não colide com nenhum horário já ocupado, incluindo o `"0 10 * * *"` proposto pela Story 78-3 para o coletor Anthropic e o `"59 10 * * *"` do `daily-report`).

---

## Tasks / Subtasks

- [ ] **T1 — Preparação e confirmação de contrato/API** (AC1, AC2, AC3, AC5)
  - [ ] T1.1 — Ler Story 78-3 (`docs/stories/78-3-coletor-anthropic-padrao.story.md`) integralmente — contrato `BillingCollector`/`CostSnapshotRow`/`CollectorResult`, runner `runCollector()`, padrão de cron `CRON_SECRET` — confirmar que serão **adaptados**, não recriados
  - [ ] T1.2 — Ler Story 78-1 (`docs/stories/78-1-modelo-dados-billing.story.md`) — contrato de `service_cost_snapshots` (colunas, `UNIQUE(service_id, snapshot_date, metric)`, enum `collection_status`) e confirmar que o slug `whatsapp` está seedado (`billing_url_confirmed = true`)
  - [ ] T1.3 — Consultar a documentação oficial da Meta Graph API para `pricing_analytics` (via `context7`/busca web) para confirmar: (a) o formato exato da resposta (estrutura de `data[]`, campos de custo/volume por item), (b) o valor exato do enum de `dimensions` para quebra por categoria de conversa (ex. `CONVERSATION_CATEGORY`), (c) se a resposta expõe moeda explicitamente. **Não inventar nomes de campo** (Artigo IV) — documentar o formato real encontrado em Completion Notes, análogo à T1.4 da Story 78-3
  - [ ] T1.4 — Ler `packages/web/src/app/api/webhook/whatsapp/route.ts` e `packages/web/src/app/api/webhooks/meta-ads/route.ts` — confirmar a versão de API `v21.0` já usada no projeto e o padrão de chamada `fetch` à Graph API
  - [ ] T1.5 — Confirmar com @devops/usuário o status da Story 78-2 (contrato de `META_SYSTEM_USER_TOKEN`) e registrar a necessidade de estender o contrato daquela story com `WHATSAPP_BUSINESS_ACCOUNT_ID` (ver Dev Notes) — se o secret/identificador ainda não existir no ambiente, prosseguir mesmo assim com a implementação (AC8 cobre a ausência)

- [ ] **T2 — Coletor WhatsApp/Meta** (AC1, AC2, AC3, AC4, AC5)
  - [ ] T2.1 — Criar `packages/web/src/lib/billing-collectors/whatsapp.ts` implementando `BillingCollector` (`serviceSlug: 'whatsapp'`)
  - [ ] T2.2 — Calcular `start`/`end` (UNIX timestamps) a partir de `window.from`/`window.to` em `America/Sao_Paulo` (mesma abordagem de timezone documentada na Story 78-3)
  - [ ] T2.3 — Montar a URL/params confirmados em T1.3 (`fields=pricing_analytics...`, `granularity(DAILY)`, `metric_types(["COST","VOLUME"])`, `dimensions([...])` opcional)
  - [ ] T2.4 — Parsear a resposta: para cada item de `data[]`, mapear custo → `CostSnapshotRow` (`metric='cost_estimated'` ou por categoria, `collection_status='ok'`) e volume → `CostSnapshotRow` (`metric='volume'` ou por categoria, `currency=null`, `collection_status='ok'`)
  - [ ] T2.5 — Tratamento defensivo: se o item não tiver valor de custo, gravar linha `cost_estimated`/`cost_estimated_{categoria}` com `value=0`, `collection_status='no_data'` — nunca omitir, nunca marcar `'ok'` sem valor real
  - [ ] T2.6 — Se `META_SYSTEM_USER_TOKEN` ou `WHATSAPP_BUSINESS_ACCOUNT_ID` ausentes, lançar erro tipado específico que a rota trata como 503 (AC8), distinto do erro genérico tratado pelo runner (AC6)

- [ ] **T3 — Rota de cron** (AC7, AC8, AC10)
  - [ ] T3.1 — Criar `packages/web/src/app/api/cron/billing-collect-whatsapp/route.ts` com auth `CRON_SECRET` (padrão idêntico a `daily-report`/78-3)
  - [ ] T3.2 — Ler query params opcionais `from`/`to`; default = ontem em `America/Sao_Paulo` (mesmo padrão da 78-3)
  - [ ] T3.3 — Checar `META_SYSTEM_USER_TOKEN` e `WHATSAPP_BUSINESS_ACCOUNT_ID` antes de chamar o coletor (AC8)
  - [ ] T3.4 — Chamar `runCollector(admin, whatsappCollector, window)` (reuso direto, sem modificar `run-collector.ts`) e retornar `CollectorResult` como JSON
  - [ ] T3.5 — `export const maxDuration = 60`
  - [ ] T3.6 — Adicionar entry em `packages/web/vercel.json` (AC10)

- [ ] **T4 — Validação manual em DEV** (AC6, AC7, AC8, AC9)
  - [ ] T4.1 — Chamar a rota sem header de auth → 401; sem `CRON_SECRET` configurado → 503
  - [ ] T4.2 — Chamar a rota sem `META_SYSTEM_USER_TOKEN`/`WHATSAPP_BUSINESS_ACCOUNT_ID` configurados → 503 sem gravar snapshot
  - [ ] T4.3 — Com secrets válidos, chamar a rota e confirmar linha(s) `cost_estimated`/`volume` em `service_cost_snapshots` para o `service_id` do slug `whatsapp`
  - [ ] T4.4 — Rodar a rota 2× para a mesma janela → confirmar 1 linha por métrica/dia/categoria (sem duplicata) — AC9
  - [ ] T4.5 — Se possível simular/observar um dia sem custo retornado pela API, confirmar gravação com `collection_status='no_data'` (AC5); caso não seja possível simular isso em DEV, documentar essa limitação em Completion Notes

- [ ] **T5 — Documentar decisões e formato real encontrado**
  - [ ] T5.1 — Registrar no Change Log / Completion Notes o formato real da resposta de `pricing_analytics` encontrado em T1.3
  - [ ] T5.2 — Registrar a extensão do contrato de env vars da Story 78-2 (`WHATSAPP_BUSINESS_ACCOUNT_ID`) para que @po/@sm possam atualizar aquela story se desejarem

---

## Dev Notes

### Arquivos a criar
- `packages/web/src/lib/billing-collectors/whatsapp.ts` — implementação concreta do coletor WhatsApp/Meta (adapta `BillingCollector` da 78-3)
- `packages/web/src/app/api/cron/billing-collect-whatsapp/route.ts` — rota de cron autenticada

### Arquivo a modificar
- `packages/web/vercel.json` — adicionar entry de cron (AC10)

### Arquivos de referência obrigatórios (ler antes de implementar)
- `docs/stories/78-3-coletor-anthropic-padrao.story.md` — **fonte de verdade do contrato** `BillingCollector`/`CostSnapshotRow`/`CollectorResult` + `runCollector()` + padrão de cron `CRON_SECRET`. Esta story **adapta**, não recria.
- `docs/stories/78-1-modelo-dados-billing.story.md` — contrato de dados de `service_cost_snapshots` (colunas exatas, `UNIQUE(service_id, snapshot_date, metric)`, enum de `collection_status`: `ok`/`manual`/`no_data`/`error`) — o caso `no_data` foi **desenhado especificamente** pensando no cenário "WhatsApp via BSP" (CON-4 original do épico); com OQ-1 resolvida (billing direto), esse status passa a ser usado apenas para o caso pontual de um dia/categoria sem custo retornado, não para o serviço inteiro
- `packages/web/src/lib/billing-collectors/types.ts` (criado pela 78-3) — importar `BillingCollector`, `CostSnapshotRow`, `CollectorResult` sem redeclarar
- `packages/web/src/lib/billing-collectors/run-collector.ts` (criado pela 78-3) — `runCollector()` reusado sem modificação
- `packages/web/src/app/api/cron/daily-report/route.ts` e `.../supremo-sync/route.ts` — padrão de auth `CRON_SECRET` a ser copiado literalmente
- `packages/web/src/app/api/webhook/whatsapp/route.ts` — confirma a versão de API `v21.0` já usada no projeto (`https://graph.facebook.com/v21.0/...`) e o fixture `__fixtures__/ctwa-referral.json` (`entry[0].id` = WABA ID observável em payloads reais já recebidos pelo webhook — confirma que o WABA ID é um dado já conhecido operacionalmente, não inventado)
- `packages/web/src/app/api/webhooks/meta-ads/route.ts` — outro exemplo de chamada à Graph API já existente no projeto (App "Ações Trifold", ID `1249990980457973`)
- `docs/stories/78-2-provisionamento-secrets-billing.story.md` — contrato de `META_SYSTEM_USER_TOKEN` (escopo `whatsapp_business_management` + `ads_read`, já fixado) — **usar exatamente esse nome**

### Contrato de coletor — reusado da Story 78-3 (não redefinir)
```ts
// packages/web/src/lib/billing-collectors/whatsapp.ts (esqueleto de referência — ADAPT, não CREATE)
import type { BillingCollector, CostSnapshotRow } from "./types"

const GRAPH_API_VERSION = "v21.0" // mesma versão já usada em webhook/whatsapp e webhooks/meta-ads

export const whatsappCollector: BillingCollector = {
  serviceSlug: "whatsapp",
  async collect(window) {
    const token = process.env.META_SYSTEM_USER_TOKEN
    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
    if (!token) throw new MissingSecretError("META_SYSTEM_USER_TOKEN not set")
    if (!wabaId) throw new MissingSecretError("WHATSAPP_BUSINESS_ACCOUNT_ID not set")

    const start = toUnixStartOfDaySaoPaulo(window.from)
    const end = toUnixEndOfDaySaoPaulo(window.to)

    const url =
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}` +
      `?fields=pricing_analytics.start(${start}).end(${end}).granularity(DAILY)` +
      `.metric_types(["COST","VOLUME"])` // dimensions([...]) opcional — confirmar valor exato do enum em T1.3
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`WhatsApp pricing_analytics failed: ${res.status}`)
    const json = await res.json()

    // Mapeamento exato de `json.pricing_analytics.data[]` depende do formato confirmado em T1.3.
    // Cada item deve gerar 1 CostSnapshotRow de volume + 1 de custo (ou 'no_data' se custo ausente — AC5).
    const rows: CostSnapshotRow[] = [] // preenchido pelo parser real, ver T2.4/T2.5
    return rows
  },
}
```
Este esqueleto **não substitui** `runCollector()` nem redefine `CostSnapshotRow`/`BillingCollector` — apenas implementa `collect()` para o fornecedor WhatsApp/Meta, exatamente como a Story 78-3 previu para as adaptações futuras ("Vercel retorna JSONL... WhatsApp/BSP pode retornar COST vazio, CON-4, mapeado como `collection_status='no_data'` dentro do próprio `collect()`, sem mudar o runner").

### Por que `pricing_analytics`, nunca `conversation_analytics`
`conversation_analytics` é o endpoint **descontinuado** pela Meta para dados de custo/volume de conversas WhatsApp Business. `pricing_analytics` é o substituto atual e é o único endpoint que esta story deve usar — nenhuma referência a `conversation_analytics` deve aparecer no código, nem como fallback, nem como comentário sugerindo uso futuro.

### Nota "approximate charges" (por que o tratamento defensivo existe mesmo com billing direto confirmado)
A decisão do usuário sobre OQ-1 (WhatsApp cobrado direto pela Meta) resolve a dúvida de **se** o campo COST é populado — a resposta é sim, de forma automática. Mas a documentação oficial da Meta caracteriza os valores de `pricing_analytics` como "approximate charges" (aproximações, não uma fatura auditada linha a linha) — por isso esta story ainda trata defensivamente o caso pontual de um dia/categoria sem valor de custo retornado (AC5), em vez de assumir que a ausência nunca vai acontecer. Isso é diferente do cenário original CON-4 (BSP inteiro sem COST) — aqui é uma degradação pontual e esperada, não um bloqueio estrutural do coletor.

### Extensão do contrato de env vars da Story 78-2 (gap identificado)
A Story 78-2 fixou 7 env vars, incluindo `META_SYSTEM_USER_TOKEN` (credencial de auth), mas **não incluiu um identificador para o WhatsApp Business Account ID** (`WABA_ID`) — necessário para montar a URL do endpoint (`GET /<WABA_ID>?fields=...`). Esta story introduz `WHATSAPP_BUSINESS_ACCOUNT_ID` como uma 8ª variável de configuração (não é secret de alto privilégio — é um identificador, análogo a `VERCEL_TEAM_ID`/`SUPABASE_ORG_SLUG` que a própria 78-2 já tratou como "config" ao lado de suas credenciais correspondentes).
- **Como obter o valor real (sem inventar):** o WABA ID já é um dado **observável hoje** nos payloads reais recebidos pelo webhook de mensagens do WhatsApp (`entry[0].id` no corpo do webhook — confirmado pelo fixture `__fixtures__/ctwa-referral.json`, que nomeia esse campo literalmente `"test_waba_id"`). O valor de produção pode ser lido de um evento real já processado, ou confirmado via Business Manager → WhatsApp Manager → Configurações da conta.
- Deve ser gravado **da mesma forma segura** que as demais variáveis de 78-2 (`scripts/vercel-env-set.sh`, nunca `vercel env add` via stdin), mesmo não sendo um secret de alto privilégio, por consistência operacional.
- **Recomendação para @po/@sm:** atualizar a tabela de contrato da Story 78-2 (Dev Notes, AC1) para incluir esta variável formalmente, evitando que uma futura story precise redescobrir esse gap.

### Timezone e janela padrão (NFR-8)
Idêntico ao padrão já documentado na Story 78-3: "ontem" (janela padrão) calculado em `America/Sao_Paulo`, não UTC, para evitar erro de borda de dia. `start`/`end` da Graph API são UNIX timestamps (segundos) — a conversão de `window.from`/`window.to` (strings `YYYY-MM-DD` locais) para os timestamps de início/fim do dia deve ser feita dentro do coletor (T2.2), não no runner genérico.

### `vercel.json` — horário de cron escolhido
Horários já ocupados (conferir `packages/web/vercel.json` antes de editar — lista confirmada em 2026-07-08): `*/30min` (enrich-leads, webhook-health, calendly-sync), `0 */2h` (followup), `*/3min` (campaign-poll, roleta-retry), `0 8` (keep-alive), `0 */4h` (meta-sync-entities, meta-sync-health), `0 9` (meta-sync-insights), `0 11` (email-automations, meta-ads-intelligence), `0 * * * *` (email-queue), `0 12` (appointment-email-reminders), `*/30min` (appointment-whatsapp-reminders), `0 2 seg` (analytics-report), `0 6 seg` (meta-sync-placement), `0 */6h` (obras-approval-reminder), `0 4` (purge-rejected-uploads), `59 10` (daily-report), `*/10min` (sla-alerts), `*/5min` (bolsao-rebalance), `0 12,15,18,21` (boleto-scan). A Story 78-3 propõe `"0 10 * * *"` para o coletor Anthropic (ainda não presente no `vercel.json` até a 78-3 ser implementada). Esta story usa **`"30 10 * * *"`** (10:30 UTC) — livre, distinto de `"0 10"` (78-3) e `"59 10"` (daily-report), sem colisão.

### Testing Standards
- Não há suíte de testes automatizados para os coletores neste momento (mesmo padrão observado nas Stories 78-3/78-1/52-1 para código de cron/schema) — validação é manual em DEV chamando a rota diretamente e inspecionando `service_cost_snapshots`
- Se o @dev optar por adicionar testes Vitest com mock de `fetch` (útil aqui especificamente para simular o caso "COST ausente" de AC5, difícil de reproduzir com dado real em DEV), é um adicional bem-vindo, não bloqueante

---

## Testing

### Abordagem
- Validação manual em ambiente DEV (Supabase `xnxvygyfyyyzwhiuoehz`), chamando a rota `/api/cron/billing-collect-whatsapp` diretamente com os headers corretos/incorretos
- Sem suíte automatizada nesta story — mock de `fetch` com Vitest é adicional bem-vindo especificamente para o cenário de AC5 (COST ausente), difícil de forçar com a API real

### Cenários de teste

1. **Auth ausente:** Chamar a rota sem header `Authorization` → 401.
2. **Secret de cron não configurado:** Em ambiente sem `CRON_SECRET` → 503 `"Cron not configured"`.
3. **`META_SYSTEM_USER_TOKEN` ausente:** Com `CRON_SECRET` correto mas sem o token Meta → 503, e **nenhuma linha nova** em `service_cost_snapshots`.
4. **`WHATSAPP_BUSINESS_ACCOUNT_ID` ausente:** Com `CRON_SECRET` e `META_SYSTEM_USER_TOKEN` corretos mas sem o WABA ID → 503, e **nenhuma linha nova** em `service_cost_snapshots`.
5. **Coleta bem-sucedida:** Com todos os secrets/config configurados, chamar a rota → linha(s) `metric='cost_estimated'` (`collection_status='ok'`) e `metric='volume'` aparecem em `service_cost_snapshots` para o `service_id` do slug `whatsapp`.
6. **Idempotência (AC9):** Rodar a rota duas vezes para a mesma janela → `count(*)` por `(service_id, metric, snapshot_date)` retorna exatamente `1`, com o `value` da segunda chamada.
7. **Falha da API isolada (AC6):** Simular falha (ex.: token temporariamente inválido) → resposta da rota é HTTP 200 com `status: 'error'` no corpo, e uma linha `metric='collection_error', collection_status='error'` é gravada — a rota não retorna 500.
8. **Janela customizada:** Chamar a rota com `?from=2026-07-01&to=2026-07-03` → snapshots são gravados para os 3 dias solicitados (backfill).
9. **COST ausente (AC5):** Se for possível observar/simular um dia/categoria sem valor de custo na resposta real, confirmar linha `collection_status='no_data'`, `value=0` — se não for possível reproduzir isso em DEV com dado real, documentar a limitação e cobrir via teste unitário com mock de `fetch`, se implementado.

---

## Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| R1 | Formato exato da resposta de `pricing_analytics` (estrutura de `data[]`, nomes de campo de custo/volume/categoria) não confirmado nos documentos do projeto — risco de parser incorreto se inventado | Média | T1.3 exige consultar doc oficial antes de implementar o parser (Artigo IV); Completion Notes deve registrar o formato real encontrado |
| R2 | `WHATSAPP_BUSINESS_ACCOUNT_ID` não está no contrato de 7 env vars da Story 78-2 — risco de nome inconsistente se outra story/pessoa inventar um nome diferente no futuro | Baixa | Dev Notes documenta explicitamente o nome escolhido (`WHATSAPP_BUSINESS_ACCOUNT_ID`) e recomenda atualização formal da 78-2 |
| R3 | Confundir `META_SYSTEM_USER_TOKEN` (billing/analytics do WABA) com `META_PAGE_ACCESS_TOKEN` (mensageria, já usado no webhook) — uso da credencial errada quebra o coletor ou expõe escopo indevido | Média | Dev Notes explicita a diferença; nomes de variável distintos no código |
| R4 | Decisão do usuário sobre OQ-1 (billing direto) mudar no futuro (ex.: migração para BSP) tornando o campo COST vazio estruturalmente, não apenas pontualmente | Baixa | AC5 já trata graciosamente linha a linha (`no_data`); se a mudança estrutural ocorrer, o painel simplesmente passa a mostrar `no_data` com mais frequência, sem quebrar — não exige nova story para o caso degradado, só uma nova decisão de produto se quiser fallback manual (como a 78-7) |
| R5 | Cron novo em `vercel.json` colidir de horário com cron existente ou com o horário proposto (ainda não aplicado) pela Story 78-3 | Baixa | Dev Notes lista todos os horários já ocupados; `"30 10 * * *"` escolhido como livre e distinto do `"0 10 * * *"` da 78-3 |
| R6 | Runner genérico (`runCollector()`) precisar de ajuste não previsto pela 78-3 para acomodar múltiplas linhas de `metric` por categoria no mesmo dia | Baixa | O contrato já suporta múltiplas `CostSnapshotRow` por chamada de `collect()` (retorno é um array) — não deveria exigir mudança no runner; se exigir, isso é sinalizado ao quality gate (@architect) como desvio a ser revisado, não implementado unilateralmente |

---

## Dependencies

- **Depende de:** Story 78-1 (Status: Ready — schema `platform_services`/`service_cost_snapshots`, migration `164`, slug `whatsapp` já seedado com `billing_url_confirmed = true`), Story 78-2 (Status: Draft — secret `META_SYSTEM_USER_TOKEN`; identificador `WHATSAPP_BUSINESS_ACCOUNT_ID` ainda não fixado formalmente lá, ver Dev Notes), Story 78-3 (Status: Draft — contrato `BillingCollector`/`CostSnapshotRow`/`CollectorResult` + `runCollector()`, que esta story **adapta**).
- **Bloqueada parcialmente por:** Story 78-2 (pré-requisito humano #3 — Meta System User token com escopo `whatsapp_business_management` — ainda `PENDENTE` na data de criação desta story). A implementação e revisão de código podem prosseguir sem o secret real (AC8 garante degradação graciosa); a validação end-to-end completa (T4.3/T4.4) depende do secret + do WABA ID estarem provisionados.
- **Bloqueada parcialmente por:** Story 78-3 (contrato de coletor) — o código desta story não pode ser finalizado sem `types.ts`/`run-collector.ts` existirem; se a 78-3 ainda não tiver sido implementada quando esta story for assumida pelo @dev, os arquivos de referência devem ser lidos a partir do próprio arquivo da Story 78-3 (que já documenta o esqueleto completo) até a implementação real estar disponível no repositório.
- **Não bloqueia:** Stories 78-4 (OpenAI), 78-5 (Vercel), 78-7 (Supabase/Resend), 78-10 (Meta Ads) — coletores independentes entre si, todos adaptando o mesmo contrato da 78-3 em paralelo.
- **Bloqueia parcialmente:** Story 78-9 (UI) — no que se refere a ter dado real de WhatsApp para exibir (a UI pode ser construída antes, mas sem dado de WhatsApp até esta story rodar em produção).
- **Dependências técnicas:**
  - `packages/web/src/lib/billing-collectors/types.ts` e `run-collector.ts` (Story 78-3)
  - `packages/web/src/lib/supabase/admin.ts` (`createAdminClient()`)
  - `packages/web/src/lib/logger.ts` (`logEvent()`)
  - `packages/web/vercel.json` (registro de cron)
  - Padrão de auth de `packages/web/src/app/api/cron/daily-report/route.ts`

---

## Definition of Done

- [ ] `packages/web/src/lib/billing-collectors/whatsapp.ts` criado, implementando `BillingCollector` sem redeclarar tipos do contrato da 78-3
- [ ] `packages/web/src/app/api/cron/billing-collect-whatsapp/route.ts` criado com auth `CRON_SECRET` idêntico ao padrão existente
- [ ] `packages/web/vercel.json` atualizado com o novo cron (`"30 10 * * *"`), sem colisão de horário
- [ ] Validação manual em DEV: auth ausente (401), secret de cron ausente (503), `META_SYSTEM_USER_TOKEN` ausente (503 sem gravar), `WHATSAPP_BUSINESS_ACCOUNT_ID` ausente (503 sem gravar), coleta com sucesso (linhas `cost_estimated`/`volume`), idempotência (sem duplicata), falha isolada (200 + `collection_status='error'`)
- [ ] Tratamento defensivo de COST ausente implementado e testado ou documentado como limitação de ambiente (AC5)
- [ ] Nenhuma referência a `conversation_analytics` no código (apenas `pricing_analytics`)
- [ ] Formato real da resposta da API documentado em Completion Notes (T1.3)
- [ ] Gap do contrato de env vars da Story 78-2 (`WHATSAPP_BUSINESS_ACCOUNT_ID`) registrado para follow-up de @po/@sm
- [ ] @architect executou quality gate com verdict PASS ou CONCERNS documentados e aceitos (foco: correta adaptação do contrato da 78-3, tratamento defensivo de COST ausente, e uso do endpoint correto `pricing_analytics`)
- [ ] @devops fez push do commit final

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não está habilitado em `core-config.yaml` (chave `coderabbit_integration` ausente, mesmo estado observado nas Stories 78-1/78-2/78-3).
> Validação de qualidade usará processo de revisão manual pelo @architect (quality gate desta story, conforme tabela de decomposição do Épico 78 §7).

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-07-08 | 0.1 | Story criada a partir do Epic 78 (§7, story 78-6) e da decisão do usuário sobre OQ-1 (WhatsApp cobrado direto pela Meta, resolvida 2026-07-08). Coletor WhatsApp/Meta **adapta** (não recria) o contrato `BillingCollector`/`CostSnapshotRow`/`CollectorResult`/`runCollector()` fixado pela Story 78-3, chamando `GET /<WABA_ID>?fields=pricing_analytics` (granularidade diária, `metric_types=[COST,VOLUME]`, `dimensions` opcional), gravando custo estimado automático (`collection_status='ok'`) e volume por categoria, com tratamento defensivo de COST ausente pontual (`collection_status='no_data'`, nunca inventando valor). [AUTO-DECISION] Executor = @dev / Quality Gate = @architect → reason: tabela de decomposição do Épico 78 (§7) já define este mapeamento explicitamente para 78-6. [AUTO-DECISION] Introdução de `WHATSAPP_BUSINESS_ACCOUNT_ID` como 8ª variável de configuração, estendendo (não violando) o contrato de 7 env vars da Story 78-2 → reason: a 78-2 fixou `META_SYSTEM_USER_TOKEN` (credencial de auth) mas não incluiu um identificador para o WABA, necessário para montar a URL do endpoint; o valor é observável hoje em payloads reais do webhook de mensagens (`entry[0].id`), não é um dado inventado. Recomendado follow-up para @po/@sm atualizarem formalmente o contrato da 78-2. [AUTO-DECISION] Nomes exatos de campos da resposta de `pricing_analytics` (estrutura de `data[]`, enum de `dimensions`) não fixados nesta story → reason: Artigo IV (No Invention) — @dev deve confirmar via documentação oficial (T1.3) antes de implementar o parser, mesma abordagem usada pela Story 78-3 para a Anthropic Admin API. [AUTO-DECISION] Horário de cron `"30 10 * * *"` escolhido por não colidir com nenhum horário já ocupado em `vercel.json` nem com o horário proposto (ainda não aplicado) pela Story 78-3 (`"0 10 * * *"`) → reason: evitar picos de execução simultânea de crons de billing. [AUTO-DECISION] Tratamento defensivo de COST ausente mantido mesmo com OQ-1 resolvida (billing direto confirmado) → reason: documentação oficial da Meta caracteriza os valores de `pricing_analytics` como "approximate charges" (não garantidos linha a linha); reduzir esse tratamento a "não é mais necessário" seria uma leitura excessivamente otimista da decisão do usuário, que resolve *se* o custo é automático, não *garante* 100% de cobertura linha a linha. | @sm (River) |
| 2026-07-08 | 0.2 | **Validação cruzada do backlog do Epic 78 (@po Pax) — GO, Status Draft → Ready.** Gap de env var levantado por esta story **RESOLVIDO**: `WHATSAPP_BUSINESS_ACCOUNT_ID` foi formalmente adicionado ao contrato da Story 78-2 (agora 8 vars) durante esta validação cruzada — o follow-up recomendado nos Dev Notes/DoD desta story está atendido (ver Change Log 78-2 v0.2). Uso de `pricing_analytics` (nunca `conversation_analytics`), tratamento defensivo de COST ausente (`no_data`, sem inventar valor) e `META_SYSTEM_USER_TOKEN` (≠ `META_PAGE_ACCESS_TOKEN`) validados. Horário de cron `"30 10"` confirmado livre, sem colisão com 78-3/78-4/78-5. | @po (Pax) |

---

## Dev Agent Record

_A ser preenchido pelo @dev durante a implementação._

### Agent Model Used
—

### Debug Log References
—

### Completion Notes List
—

### File List
—

---

## QA Results

_A ser preenchido pelo @architect durante o quality gate._
