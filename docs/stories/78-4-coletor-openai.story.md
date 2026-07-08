# Story 78-4 — Coletor OpenAI (cron 1×/dia)

## Metadata
- **Epic:** 78 — Painel de Saúde & Billing da Plataforma
- **Story:** 78-4
- **Status:** Ready
- **Priority:** P2 — segunda implementação da camada FORTE (custo automático); adapta o contrato fixado na Story 78-3, não o redefine
- **Complexity:** P (contrato + runner já existem; esta story só adapta — 1 coletor + 1 rota de cron + vercel.json; ~4-6h)
- **Created:** 2026-07-08
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @dev (Dex)
- **Quality Gate:** @architect (Aria)
- **Quality Gate Tools:** `[adapter_conformance_review, error_isolation_review, idempotency_test, cron_auth_review]`

> Nota: mapeamento confirmado pela tabela de decomposição do épico (§7): `78-4 | @dev | @architect` — mesmo par da 78-3, pois é código de aplicação (TS + rota de API), não schema.

---

## User Story

**Como** Trifold CRM (plataforma),
**Quero** um coletor de billing para OpenAI (custo diário em USD via `organization/costs`) que **adapte** o contrato `BillingCollector` e o runner genérico definidos na Story 78-3, rodando via cron autenticado, gravando snapshots idempotentes em `service_cost_snapshots` e nunca derrubando o job em caso de falha da API,
**Para que** o Painel de Saúde & Billing (78-9) tenha o segundo dado de custo automático real (OpenAI é a segunda maior fonte de gasto de IA da plataforma — CON-2 do épico) sem reimplementar auth, upsert ou tratamento de erro, que já foram resolvidos e revisados na 78-3.

---

## Context

O Epic 78 entrega um Painel de Saúde & Billing (admin-only) que consolida 7 serviços, trazendo custo automático onde a API permite (camada FORTE: Anthropic, OpenAI, Vercel). A Story 78-1 (Status: Ready) já criou o schema (`platform_services`, `service_billing_reminders`, `service_cost_snapshots`), incluindo o slug `openai` já seedado com `billing_url_confirmed = true`. A Story 78-3 (Status: Draft) **define** o contrato reusável de coletor (`BillingCollector`, `CostSnapshotRow`, `CollectorResult` em `packages/web/src/lib/billing-collectors/types.ts`, e o runner `runCollector()` em `run-collector.ts`) e a primeira implementação concreta (Anthropic).

Esta story é a **segunda a escrever dado real** em `service_cost_snapshots`, e ela **adapta** — não recria — o contrato da 78-3 (IDS: REUSE > ADAPT > CREATE; nota explícita do épico §7: "78-3 cria o contrato de coletor; 78-4/78-5/78-6 adaptam, não recriam"). A única peça nova de lógica é `collectOpenAiCost(window)`: como buscar e normalizar o custo da API OpenAI. Runner, auth de cron, upsert idempotente e isolamento de falha são **os mesmos** já implementados/revisados na 78-3 — nada disso é redesenhado aqui.

**Diferença técnica central em relação à Anthropic (78-3):**
- Auth: `Authorization: Bearer ${OPENAI_ADMIN_KEY}` (não `x-api-key`).
- Janela de datas: a API OpenAI espera **Unix seconds** (`start_time`/`end_time`), não datas ISO como a Anthropic — o coletor precisa converter `window.from`/`window.to` (strings `YYYY-MM-DD`) para epoch antes de chamar a API.
- Granularidade: **só diária** (`bucket_width=1d`) — não há opção mais fina (CON-6 do épico, ainda mais restritivo que a Anthropic).

**Diferença crítica em relação a `packages/ai/src/rag/embeddings.ts` (uso existente de `OPENAI_API_KEY`):** aquele client usa `OPENAI_API_KEY` (chave de API de produto, escopo de embeddings) via SDK/`fetch` direto contra `https://api.openai.com/v1/embeddings`. O coletor desta story usa **`OPENAI_ADMIN_KEY`** (chave administrativa de organização, contrato de nome já fixado na Story 78-2) contra `https://api.openai.com/v1/organization/costs` — **não é a mesma chave, não é o mesmo escopo, e não deve reusar nenhum client de embeddings.**

---

## Scope

### IN (esta story entrega)

- **Coletor OpenAI** (novo arquivo): `packages/web/src/lib/billing-collectors/openai.ts`, implementando a interface `BillingCollector` (definida na 78-3) para o slug `openai` — FR-4.
- **Rota de cron autenticada**: `packages/web/src/app/api/cron/billing-collect-openai/route.ts`, seguindo exatamente o padrão `CRON_SECRET` já usado em `daily-report`/`billing-collect-anthropic` (78-3).
- **Registro no `vercel.json`**: novo entry de cron 1×/dia para `billing-collect-openai`, em horário que não colide com nenhum cron existente (incluindo o de `billing-collect-anthropic`, planejado na 78-3).
- Uso do `runCollector()` genérico (78-3) sem modificação — esta story não toca em `types.ts` nem em `run-collector.ts`.

### OUT (não entra nesta story)

- Qualquer alteração no contrato `BillingCollector`/`CostSnapshotRow`/`CollectorResult` ou no runner genérico — pertencem à Story 78-3; se uma limitação real da API OpenAI exigir mudança no contrato, isso exige revisão do @architect antes (mesma regra documentada na 78-3).
- Coletores de Vercel, WhatsApp/Meta, Supabase, Resend — Stories 78-5/78-6/78-7.
- Qualquer migration nova — o schema já existe (Story 78-1, migration `164`); o slug `openai` já está seedado.
- Provisionamento do secret `OPENAI_ADMIN_KEY` em si (criação/rotação da chave) — Story 78-2. Esta story **consome** o secret; se ainda não existir no ambiente, a rota degrada graciosamente (AC5), não falha na implementação.
- UI do painel — Story 78-9. CRUD de vencimentos/lembretes — Story 78-8.
- Conversão de moeda BRL↔USD — NFR-7 proíbe inventar taxa.

---

## Acceptance Criteria

- [ ] **AC1 — Coletor OpenAI implementa `BillingCollector` sem redefinir o contrato:** `packages/web/src/lib/billing-collectors/openai.ts` **importa** `BillingCollector`, `CostSnapshotRow` e `CollectorResult` de `./types.ts` (78-3) e exporta um objeto/instância com `serviceSlug: 'openai'` e `collect(window)`. Nenhum tipo é redeclarado ou duplicado localmente.

- [ ] **AC2 — Rota de cron reusa o runner genérico sem modificação:** `packages/web/src/app/api/cron/billing-collect-openai/route.ts` chama `runCollector(admin, openaiCollector, window)` (importado de `./run-collector.ts`, 78-3) para resolver `service_id`, fazer upsert e isolar falhas — nenhuma lógica de upsert, resolução de slug ou tratamento de erro é reimplementada nesta rota.

- [ ] **AC3 — Custo diário em USD via `organization/costs`:** `collectOpenAiCost(window)` chama `GET https://api.openai.com/v1/organization/costs` com header `Authorization: Bearer ${OPENAI_ADMIN_KEY}`, query params `start_time` (Unix seconds, **obrigatório** — início da janela, convertido de `window.from`), `end_time` (Unix seconds, convertido de `window.to`), `bucket_width=1d` (única granularidade suportada — CON-6), e opcionalmente `limit`/`group_by`; mapeia cada bucket diário da resposta em uma `CostSnapshotRow` com `metric = 'cost_usd'`, `currency = 'USD'`, `collection_status = 'ok'`. Nomes exatos de campos da resposta (estrutura de `results`/`bucket`) devem ser confirmados via documentação oficial antes de implementar o parser (Artigo IV — não inventar formato de resposta); registrar o formato real encontrado em Completion Notes.

- [ ] **AC4 — Cron autenticado por `CRON_SECRET`:** `GET /api/cron/billing-collect-openai` segue exatamente o padrão de `daily-report`/`billing-collect-anthropic`: sem `CRON_SECRET` configurado → 503 `{ error: "Cron not configured" }`; header `Authorization` diferente de `Bearer ${CRON_SECRET}` → 401 `{ error: "Unauthorized" }`; com auth correta → prossegue para a coleta.

- [ ] **AC5 — Ausência do secret degrada graciosamente, não quebra:** Se `OPENAI_ADMIN_KEY` não estiver definida no ambiente, a rota retorna 503 `{ error: "OPENAI_ADMIN_KEY not set" }` **sem** tentar chamar a API OpenAI e **sem** gravar snapshot nenhum (nem um `collection_status='error'` — mesma regra da 78-3/AC8, ausência de config é diferente de falha de coleta). Cobre o caso real de a Story 78-2 (provisionamento do secret) ainda não ter concluído o pré-requisito humano da chave OpenAI.

- [ ] **AC6 — Falha da API não derruba o cron (best-effort, NFR-3):** Se `collectOpenAiCost()` lançar exceção (timeout, erro HTTP, resposta inesperada), o runner genérico (78-3, reusado sem modificação) captura o erro, grava uma linha `metric='collection_error'`, `collection_status='error'` em `service_cost_snapshots`, chama `logEvent(...)`, e a rota ainda retorna HTTP 200 com `{ ok: false, error: ... }` no corpo — nunca 500 por falha isolada de coletor.

- [ ] **AC7 — Janela de datas configurável (FR-10):** A rota aceita query params opcionais `?from=YYYY-MM-DD&to=YYYY-MM-DD`; se ausentes, o default é o dia anterior (calculado em `America/Sao_Paulo` — NFR-8) para rodar 1×/dia via cron. O coletor converte `from`/`to` para `start_time`/`end_time` em Unix seconds (início e fim do dia em UTC, ou conforme confirmado na doc oficial) antes de chamar a API. Reprocessamento manual de um período passado é possível chamando a rota com `from`/`to` explícitos.

- [ ] **AC8 — Sem custo duplicado por dia (NFR-4):** Rodar o coletor duas vezes para a mesma janela resulta em **exatamente uma linha** por `(service_id, snapshot_date, 'cost_usd')` em `service_cost_snapshots`, com o `value` da segunda execução (upsert do runner genérico atualiza, não insere linha nova) — validado manualmente em DEV. Nenhuma lógica de deduplicação nova é criada nesta story (o `onConflict: 'service_id,snapshot_date,metric'` já resolve isso no runner).

- [ ] **AC9 (should-have) — Uso via `organization/usage/*` best-effort:** Quando a chamada a `organization/costs` for bem-sucedida, o coletor pode, best-effort e em try/catch isolado, também consultar o endpoint de uso da organização (`GET /v1/organization/usage/...` — endpoint-chave citado no épico §2.1; nome exato do subpath — ex. `completions` — deve ser confirmado na doc oficial antes de implementar, Artigo IV) e gravar métricas de uso adicionais (ex. `requests`) sem `currency`. Falha nesta chamada opcional **não** deve derrubar a gravação do `cost_usd` já obtido.

- [ ] **AC10 — `vercel.json` atualizado sem colisão de horário:** Novo entry em `packages/web/vercel.json` → `{ "path": "/api/cron/billing-collect-openai", "schedule": "15 10 * * *" }` (10:15 UTC = 07:15 America/Sao_Paulo). Horário escolhido por não colidir com nenhum cron existente nem com `billing-collect-anthropic` (`"0 10 * * *"`, planejado na Story 78-3) — ver lista completa de horários ocupados nos Dev Notes.

- [ ] **AC11 — Nenhuma confusão entre `OPENAI_API_KEY` (embeddings) e `OPENAI_ADMIN_KEY` (billing):** O código desta story usa exclusivamente `OPENAI_ADMIN_KEY` (nome já fixado na Story 78-2) para as chamadas de billing/admin; não importa, reusa ou referencia o client/chave de `packages/ai/src/rag/embeddings.ts` (`OPENAI_API_KEY`, escopo de embeddings — serviço diferente, não relacionado a billing).

---

## Tasks / Subtasks

- [ ] **T1 — Preparação e confirmação de contrato/API** (AC1, AC3, AC9, AC11)
  - [ ] T1.1 — Ler Story 78-3 (Status: Draft) na íntegra: `types.ts` (`BillingCollector`, `CostSnapshotRow`, `CollectorResult`) e `run-collector.ts` (`runCollector()`) — confirmar que esses arquivos existem no código antes de começar a implementar; se 78-3 ainda não tiver sido implementada, sinalizar bloqueio ao @sm/@po antes de prosseguir (ver Dependencies)
  - [ ] T1.2 — Ler Story 78-1 (contrato de dados de `service_cost_snapshots`) e confirmar que o slug `openai` está seedado
  - [ ] T1.3 — Ler `packages/web/src/app/api/cron/billing-collect-anthropic/route.ts` (78-3) como referência direta de estrutura de rota (troca de coletor, mesmo padrão de auth/janela)
  - [ ] T1.4 — Ler `packages/ai/src/rag/embeddings.ts` e confirmar que `OPENAI_API_KEY` (embeddings) é **diferente** de `OPENAI_ADMIN_KEY` (billing/admin) — não reusar aquele client/env var
  - [ ] T1.5 — Consultar a documentação oficial da OpenAI Admin API (`organization/costs`, opcionalmente `organization/usage/*`) — via `context7` ou busca web — para confirmar formato exato da resposta (nomes de campos dentro de `data`/`results`/`bucket`) **antes** de escrever o parser; não inventar nomes de campo (Artigo IV). Documentar o formato real encontrado em Completion Notes
  - [ ] T1.6 — Confirmar com @devops/usuário o status atual da Story 78-2 (secret `OPENAI_ADMIN_KEY`, pré-requisito humano) antes de tentar validação end-to-end com dado real; se ainda não provisionado, prosseguir mesmo assim com a implementação — AC5 cobre a ausência

- [ ] **T2 — Coletor OpenAI** (AC1, AC3, AC7, AC9, AC11)
  - [ ] T2.1 — Criar `packages/web/src/lib/billing-collectors/openai.ts` implementando `BillingCollector` (`serviceSlug: 'openai'`), importando tipos de `./types.ts`
  - [ ] T2.2 — Função utilitária de conversão `YYYY-MM-DD` → Unix seconds (início/fim do dia) para `start_time`/`end_time`
  - [ ] T2.3 — `collect(window)`: `fetch` para `organization/costs` com headers corretos; mapear resposta → `CostSnapshotRow[]` (`metric: 'cost_usd'`)
  - [ ] T2.4 — Best-effort (should-have, AC9): endpoint de uso, isolado em seu próprio try/catch
  - [ ] T2.5 — Se `OPENAI_ADMIN_KEY` ausente, lançar erro tipado específico que a rota trata como 503 (AC5), distinto do erro genérico tratado pelo runner (AC6)

- [ ] **T3 — Rota de cron** (AC2, AC4, AC7, AC10)
  - [ ] T3.1 — Criar `packages/web/src/app/api/cron/billing-collect-openai/route.ts` com auth `CRON_SECRET` (padrão idêntico a `daily-report`/`billing-collect-anthropic`)
  - [ ] T3.2 — Ler query params opcionais `from`/`to`; default = ontem em `America/Sao_Paulo`
  - [ ] T3.3 — Checar `OPENAI_ADMIN_KEY` antes de chamar o coletor (AC5)
  - [ ] T3.4 — Chamar `runCollector(admin, openaiCollector, window)` (78-3, sem modificação) e retornar `CollectorResult` como JSON
  - [ ] T3.5 — `export const maxDuration = 60`
  - [ ] T3.6 — Adicionar entry em `packages/web/vercel.json` (AC10)

- [ ] **T4 — Validação manual em DEV** (AC4, AC5, AC6, AC8)
  - [ ] T4.1 — Chamar a rota sem header de auth → 401; sem `CRON_SECRET` configurado → 503
  - [ ] T4.2 — Chamar a rota sem `OPENAI_ADMIN_KEY` configurada → 503 sem gravar snapshot
  - [ ] T4.3 — Com secret válida, chamar a rota e confirmar linha(s) `cost_usd` em `service_cost_snapshots` para o `service_id` do slug `openai`
  - [ ] T4.4 — Rodar a rota 2× para a mesma janela → confirmar 1 linha por métrica/dia (sem duplicata) — AC8
  - [ ] T4.5 — Forçar falha (ex.: variável temporariamente inválida) → confirmar linha `collection_status='error'` + resposta 200 (não 500) — AC6

- [ ] **T5 — Documentar e fechar**
  - [ ] T5.1 — Registrar formato real da resposta OpenAI encontrado (T1.5) em Completion Notes
  - [ ] T5.2 — Confirmar que nenhuma alteração foi feita em `types.ts`/`run-collector.ts` (78-3) — diff deve mostrar apenas arquivos novos + `vercel.json`

---

## Dev Notes

### Arquivos a criar
- `packages/web/src/lib/billing-collectors/openai.ts` — implementação concreta do coletor OpenAI (adapta `BillingCollector` da 78-3)
- `packages/web/src/app/api/cron/billing-collect-openai/route.ts` — rota de cron autenticada

### Arquivo a modificar
- `packages/web/vercel.json` — adicionar entry de cron (AC10)

### Arquivos NÃO modificados por esta story (reuso explícito)
- `packages/web/src/lib/billing-collectors/types.ts` (78-3) — importado, não alterado
- `packages/web/src/lib/billing-collectors/run-collector.ts` (78-3) — importado e chamado, não alterado

### Arquivos de referência obrigatórios (ler antes de implementar)
- `docs/stories/78-3-coletor-anthropic-padrao.story.md` — **fonte primária desta story.** Contém o contrato completo (`BillingCollector`, `CostSnapshotRow`, `CollectorResult`) e o skeleton de `runCollector()` com upsert (`onConflict: 'service_id,snapshot_date,metric'`) e isolamento de falha. Esta story 78-4 **adapta** esse contrato — não deve copiar/colar o runner, deve **importar** os arquivos reais criados pela 78-3.
- `docs/stories/78-1-modelo-dados-billing.story.md` — contrato de dados de `service_cost_snapshots` (colunas exatas, `UNIQUE(service_id, snapshot_date, metric)`, enum de `collection_status`: `ok`/`manual`/`no_data`/`error`)
- `docs/stories/78-2-provisionamento-secrets-billing.story.md` — contrato de nome da env var `OPENAI_ADMIN_KEY` já fixado (linha 137: "Admin/Org key OpenAI — diferente de `OPENAI_API_KEY`") e teste de health-check de referência (linha 110: `GET /v1/organization/costs?start_time=<epoch hoje-1d>` com `Authorization: Bearer $OPENAI_ADMIN_KEY` — esperar 200)
- `packages/web/src/app/api/cron/billing-collect-anthropic/route.ts` (78-3) — estrutura de rota a replicar trocando apenas o coletor e a env var
- `packages/web/src/app/api/cron/daily-report/route.ts` — padrão de auth `CRON_SECRET` original (linhas 11-19)
- `packages/web/src/lib/supabase/admin.ts` — `createAdminClient()` (service_role, bypassa RLS)
- `packages/web/src/lib/logger.ts` — `logEvent({ level, category: 'cron', event_type, message, metadata })`, chamado internamente pelo runner genérico (78-3) em caso de falha — nenhuma chamada adicional necessária nesta story
- `packages/ai/src/rag/embeddings.ts` — **NÃO reusar.** Usa `OPENAI_API_KEY` (embeddings), escopo diferente de `OPENAI_ADMIN_KEY` (billing/admin da organização)

### Contrato reusado da Story 78-3 (referência, não redefinir aqui)
```ts
// packages/web/src/lib/billing-collectors/types.ts (definido na 78-3 — apenas IMPORTAR)
export interface CostSnapshotRow {
  snapshot_date: string // 'YYYY-MM-DD'
  metric: string
  value: number
  currency: "USD" | "BRL" | null
  collection_status: "ok" | "manual" | "no_data" | "error"
  raw_response?: unknown
}

export interface BillingCollector {
  serviceSlug: string
  collect(window: { from: string; to: string }): Promise<CostSnapshotRow[]>
}
```

### Coletor OpenAI — esqueleto de referência (adaptação)
```ts
// packages/web/src/lib/billing-collectors/openai.ts (esqueleto de referência)
import type { BillingCollector, CostSnapshotRow } from "./types"

function toUnixSeconds(dateStr: string): number {
  // 'YYYY-MM-DD' → epoch seconds (início do dia)
  return Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000)
}

export const openaiCollector: BillingCollector = {
  serviceSlug: "openai",
  async collect(window) {
    const adminKey = process.env.OPENAI_ADMIN_KEY
    if (!adminKey) {
      throw new OpenAiAdminKeyMissingError() // rota trata como 503 (AC5), distinto de erro genérico (AC6)
    }

    const startTime = toUnixSeconds(window.from)
    const endTime = toUnixSeconds(window.to)

    const url = new URL("https://api.openai.com/v1/organization/costs")
    url.searchParams.set("start_time", String(startTime))
    url.searchParams.set("end_time", String(endTime))
    url.searchParams.set("bucket_width", "1d") // única granularidade suportada — CON-6

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${adminKey}` },
    })
    if (!res.ok) {
      throw new Error(`OpenAI costs API ${res.status}: ${await res.text()}`)
    }
    const body = await res.json()

    // NOTA: formato exato de `body` (nomes de campos dentro de results/bucket)
    // deve ser confirmado via doc oficial (T1.5) antes de finalizar este mapeamento —
    // não inventar a estrutura de resposta (Artigo IV).
    const rows: CostSnapshotRow[] = mapCostsResponseToRows(body)
    return rows
  },
}
```
O runner genérico (`runCollector()`, 78-3) é chamado exatamente como na rota de Anthropic — resolve `service_id` pelo slug `openai`, faz upsert com `onConflict: 'service_id,snapshot_date,metric'`, e isola qualquer exceção lançada por `collect()` gravando `collection_status='error'`. **Nenhum código de upsert é escrito nesta story.**

### Coletor OpenAI — detalhes técnicos exatos (do discovery do épico, §2.1, e da Story 78-2)
- **Endpoint custo:** `GET https://api.openai.com/v1/organization/costs`
- **Endpoint uso (opcional/best-effort, AC9):** `GET https://api.openai.com/v1/organization/usage/...` — subpath exato (ex. `completions`) não confirmado nos documentos do projeto; confirmar na doc oficial antes de implementar (T1.5)
- **Auth:** `Authorization: Bearer ${OPENAI_ADMIN_KEY}` (header padrão Bearer, diferente do `x-api-key` da Anthropic)
- **Params obrigatórios:** `start_time` (Unix seconds — **não** string de data como a Anthropic)
- **Params opcionais confirmados no épico:** `end_time` (Unix seconds), `bucket_width=1d`, `limit`, `group_by`
- **Granularidade:** **só diária** — `bucket_width=1d` é a única opção suportada (CON-6, mais restritivo que a Anthropic, que ao menos tem essa granularidade como padrão)
- **Env var:** `OPENAI_ADMIN_KEY` — contrato de nome já fixado na Story 78-2 (distinto de `OPENAI_API_KEY`, usado em `packages/ai/src/rag/embeddings.ts` para escopo de embeddings); secret de alto privilégio (NFR-1); se ainda não provisionada, a rota deve responder 503 sem tentar a chamada (AC5), nunca com a chave vazia/undefined enviada ao header

### Timezone e janela padrão (NFR-8)
"Ontem" (janela padrão do cron diário) deve ser calculado em `America/Sao_Paulo`, mesma abordagem já usada/documentada na Story 78-3. A conversão para Unix seconds (`start_time`/`end_time`) acontece **depois** de determinar as datas `YYYY-MM-DD` no timezone correto — não confundir o cálculo do dia local com a conversão de epoch (que é sempre UTC por definição).

### `vercel.json` — horário de cron escolhido
Horários já ocupados em `packages/web/vercel.json` (confirmar antes de editar, pois novos crons podem ter sido adicionados por outras stories): `*/30min` (enrich-leads, webhook-health, calendly-sync, appointment-whatsapp-reminders), `0 */2h` (followup), `*/3min` (campaign-poll, roleta-retry), `08:00` (keep-alive), `0 */4h` (meta-sync-entities, meta-sync-health), `09:00` (meta-sync-insights), `0 * * * *` (email-queue), `11:00` (email-automations, meta-ads-intelligence), `12:00` (appointment-email-reminders), `02:00 seg` (analytics-report), `06:00 seg` (meta-sync-placement), `0 */6h` (obras-approval-reminder), `04:00` (purge-rejected-uploads), `10:59` (daily-report), `*/10min` (sla-alerts), `*/5min` (bolsao-rebalance), `12,15,18,21:00` (boleto-scan), e (planejado, ainda não aplicado) `"0 10 * * *"` = `billing-collect-anthropic` (78-3). Esta story usa **`"15 10 * * *"`** (10:15 UTC = 07:15 BRT) — livre, próximo ao coletor Anthropic (mesma janela operacional de coleta de billing) mas sem colidir, e antes do `daily-report` (10:59 UTC).

### Dependências explícitas (críticas)
- **Depende de Story 78-1 (Status: Ready)** — schema de `service_cost_snapshots`/`platform_services` já existe (migration `164`); esta story não cria nem altera schema, apenas escreve nas tabelas existentes usando o slug `openai` já seedado.
- **Depende de Story 78-3 (Status: Draft) — dependência de CÓDIGO, não só de dado.** Diferente da relação 78-1→78-4 (schema já aplicado), o contrato (`types.ts`) e o runner (`run-collector.ts`) da 78-3 **ainda não existem no repositório** na data de criação desta story (78-3 está em Draft, não implementada). O @dev que assumir esta story **deve confirmar que os arquivos de 78-3 existem** (T1.1) antes de escrever `openai.ts` — se 78-3 ainda não tiver sido implementada/mergeada, esta story não pode ser implementada literalmente por adaptação (poderia, na pior hipótese, duplicar o contrato temporariamente, mas isso violaria o princípio ADAPT>CREATE do épico e criaria retrabalho); a sequência recomendada do épico (§7) já prevê 78-3 antes de 78-4.
- **Depende de Story 78-2 (Status: Draft — secret `OPENAI_ADMIN_KEY`)** — mesma lógica de dependência funcional (não bloqueante de implementação) documentada na 78-3: o código pode e deve ser implementado mesmo sem o secret presente no ambiente (AC5 garante 503 claro). A validação end-to-end completa com dado real só é possível após a 78-2 concluir o pré-requisito humano da chave OpenAI.

### Testing Standards
- Não há suíte de testes automatizados para os coletores neste momento (mesmo padrão observado nas Stories 78-1/78-3) — validação é manual em DEV chamando a rota diretamente e inspecionando `service_cost_snapshots`
- Se o @dev optar por adicionar testes Vitest com mock de `fetch` (mesmo padrão sugerido na 78-3), é um adicional bem-vindo, não bloqueante

---

## Testing

### Abordagem
- Validação manual em ambiente DEV (Supabase `xnxvygyfyyyzwhiuoehz`), chamando a rota `/api/cron/billing-collect-openai` diretamente com os headers corretos/incorretos
- Sem suíte automatizada nesta story (ver Testing Standards acima)

### Cenários de teste

1. **Auth ausente:** Chamar a rota sem header `Authorization` → 401.
2. **Secret de cron não configurado:** Em ambiente sem `CRON_SECRET` → 503 `"Cron not configured"`.
3. **Secret OpenAI ausente:** Com `CRON_SECRET` correto mas sem `OPENAI_ADMIN_KEY` → 503, e **nenhuma linha nova** em `service_cost_snapshots` (nem `collection_status='error'`).
4. **Coleta bem-sucedida:** Com ambos os secrets configurados, chamar a rota → linha(s) `metric='cost_usd', collection_status='ok'` aparecem em `service_cost_snapshots` para o `service_id` do slug `openai`.
5. **Idempotência (AC8):** Rodar a rota duas vezes para a mesma janela → `SELECT count(*) FROM service_cost_snapshots WHERE service_id = (SELECT id FROM platform_services WHERE slug='openai') AND metric='cost_usd' AND snapshot_date = '<data>'` retorna exatamente `1`.
6. **Falha da API isolada (AC6):** Simular falha (ex.: `OPENAI_ADMIN_KEY` temporariamente com valor inválido causando 401 da OpenAI) → resposta da rota é HTTP 200 com `status: 'error'` no corpo, e uma linha `metric='collection_error', collection_status='error'` é gravada — a rota não retorna 500.
7. **Janela customizada (AC7):** Chamar a rota com `?from=2026-07-01&to=2026-07-03` → snapshots são gravados para os dias solicitados (backfill), com `start_time`/`end_time` convertidos corretamente para Unix seconds.
8. **Sem colisão de cron (AC10):** Conferir `packages/web/vercel.json` após a mudança — `"15 10 * * *"` não duplica nem colide com nenhum horário existente.
9. **Uso opcional (AC9, se implementado):** Se o endpoint de uso responder com sucesso, confirmar métrica adicional gravada; se falhar isoladamente, confirmar que `cost_usd` ainda foi gravado normalmente.

---

## Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| R1 | Story 78-3 ainda em Draft (código do contrato/runner pode não existir no momento em que 78-4 for pega para desenvolvimento) | Alta (conhecida) | T1.1 exige confirmar existência dos arquivos antes de codificar; sequência recomendada do épico já prevê 78-3 primeiro; se necessário, esta story aguarda 78-3 ser implementada |
| R2 | Nomes exatos de campos da resposta de `organization/costs` (e do endpoint de uso) não confirmados nos documentos do projeto — risco de parser incorreto se inventado | Média | T1.5 exige consultar doc oficial antes de implementar o parser (Artigo IV); Completion Notes deve registrar o formato real encontrado |
| R3 | Confundir `start_time`/`end_time` (Unix seconds) com formato de data ISO usado pela Anthropic — bug de conversão de timezone/epoch | Média | Dev Notes documenta explicitamente a diferença; função utilitária dedicada de conversão (T2.2) isolada e testável |
| R4 | `OPENAI_ADMIN_KEY` ainda não provisionada (78-2 pré-requisito humano pendente) impede validação end-to-end completa | Alta (conhecida, mesma da 78-3) | AC5 garante degradação graciosa (503) sem quebrar o desenvolvimento; testes 4/5/6 ficam pendentes até 78-2 concluir |
| R5 | Confundir `OPENAI_API_KEY` (embeddings, `packages/ai/src/rag/embeddings.ts`) com `OPENAI_ADMIN_KEY` (billing) | Média | AC11 + Dev Notes explicitam a diferença; nomes de env var distintos no código |
| R6 | Cron novo em `vercel.json` colide de horário com `billing-collect-anthropic` (78-3) ou outro cron existente | Baixa | Dev Notes lista todos os horários já ocupados incluindo o planejado pela 78-3; `"15 10 * * *"` escolhido como livre |

---

## Dependencies

- **Depende de:** Story 78-1 (Status: Ready — schema `platform_services`/`service_cost_snapshots`, migration `164`, slug `openai` seedado), Story 78-3 (Status: Draft — **dependência de código**: `types.ts`/`run-collector.ts` devem existir antes desta story ser implementada por adaptação), Story 78-2 (Status: Draft — secret `OPENAI_ADMIN_KEY`, dependência funcional não bloqueante de implementação, ver Dev Notes)
- **Bloqueia diretamente:** Story 78-9 (UI) parcialmente — no que se refere a ter dado real de OpenAI para exibir (a UI pode ser construída antes, mas sem dado de OpenAI até esta story rodar em produção)
- **Bloqueada parcialmente por:** Story 78-3 (contrato/runner ainda não implementados no momento da criação desta story) e Story 78-2 (secret ainda `PENDENTE` — mesmo estado documentado na 78-3)
- **Dependências técnicas:**
  - `packages/web/src/lib/billing-collectors/types.ts` e `run-collector.ts` (78-3)
  - `packages/web/src/lib/supabase/admin.ts` (`createAdminClient()`)
  - `packages/web/vercel.json` (registro de cron)
  - Padrão de auth de `packages/web/src/app/api/cron/billing-collect-anthropic/route.ts` (78-3)

---

## Definition of Done

- [ ] `packages/web/src/lib/billing-collectors/openai.ts` criado: implementa `BillingCollector` (78-3) sem redefinir tipos, `organization/costs` obrigatório + endpoint de uso opcional/isolado (should-have)
- [ ] `packages/web/src/app/api/cron/billing-collect-openai/route.ts` criado com auth `CRON_SECRET` idêntico ao padrão existente, reusando `runCollector()` (78-3) sem modificação
- [ ] `packages/web/vercel.json` atualizado com o novo cron (`"15 10 * * *"`), sem colisão de horário
- [ ] Validação manual em DEV: auth ausente (401), secret de cron ausente (503), secret OpenAI ausente (503 sem gravar), coleta com sucesso (linha `cost_usd`), idempotência (sem duplicata), falha isolada (200 + `collection_status='error'`)
- [ ] Nenhum código reusa `OPENAI_API_KEY`/client de embeddings (`packages/ai/src/rag/embeddings.ts`) para o coletor de billing
- [ ] Nenhuma alteração feita em `types.ts`/`run-collector.ts` (78-3) — confirmado no diff
- [ ] @architect executou quality gate com verdict PASS ou CONCERNS documentados e aceitos (foco: conformidade da adaptação ao contrato, não redesenho)
- [ ] @devops fez push do commit final

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não está habilitado em `core-config.yaml` (chave `coderabbit_integration` ausente, mesmo estado observado nas Stories 78-1/78-3).
> Validação de qualidade usará processo de revisão manual pelo @architect (quality gate desta story, conforme tabela de decomposição do Épico 78 §7).

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-07-08 | 0.1 | Story criada a partir do Epic 78 (§7, story 78-4). Adapta o contrato `BillingCollector`/`runCollector()` fixado na Story 78-3 para implementar o coletor OpenAI (`organization/costs`, USD diário via `bucket_width=1d`) + rota de cron autenticada. [AUTO-DECISION] Executor = @dev / Quality Gate = @architect → reason: tabela de decomposição do Épico 78 (§7) define este mapeamento explicitamente para 78-4, idêntico à 78-3. [AUTO-DECISION] Quality Gate Tools renomeados para `adapter_conformance_review` (em vez de `contract_review` da 78-3) → reason: esta story ADAPTA um contrato já revisado, não o cria — o foco do quality gate é conformidade com o contrato existente, não o design do contrato em si. [AUTO-DECISION] Dependência de código explícita da Story 78-3 (Status: Draft) documentada como bloqueio real de implementação (não apenas funcional) → reason: diferente da relação com a 78-1 (schema já aplicado/Ready), os arquivos `types.ts`/`run-collector.ts` da 78-3 podem ainda não existir no repositório quando esta story for pega para desenvolvimento; T1.1 exige confirmação antes de codificar, evitando duplicação de contrato (violaria ADAPT>CREATE). [AUTO-DECISION] Params `start_time`/`end_time` em Unix seconds (não string de data) → reason: confirmado no contrato de secrets da Story 78-2 (linha 110, teste de health-check com `start_time=<epoch>`) e no discovery do épico (§2.1, "Granularidade máxima... é diária... OpenAI notadamente" + CON-6); nomes exatos de campos da resposta NÃO fixados nesta story (Artigo IV) — @dev deve confirmar via doc oficial (T1.5) antes de implementar o parser. [AUTO-DECISION] Horário de cron `"15 10 * * *"` escolhido por não colidir com nenhum horário já ocupado em `vercel.json`, incluindo o horário planejado (ainda não aplicado) pela Story 78-3 (`"0 10 * * *"`) → reason: evitar picos de execução simultânea de crons de billing. [AUTO-DECISION] AC11 adicionado explicitamente sobre não reusar `OPENAI_API_KEY`/`embeddings.ts` → reason: única variável `OPENAI_*` já existente no projeto antes desta story, risco real de confusão de escopo (billing vs. embeddings) se não explicitado. | @sm (River) |
| 2026-07-08 | 0.2 | **Validação cruzada do backlog do Epic 78 (@po Pax) — GO, Status Draft → Ready.** Adaptação do contrato da 78-3 corretamente escopada (importa `types.ts`/`run-collector.ts` sem redefinir; AC2/DoD exigem diff só com arquivos novos + `vercel.json`). Uso de `OPENAI_ADMIN_KEY` (contrato 78-2) distinto de `OPENAI_API_KEY` de embeddings validado (AC11). Horário de cron `"15 10"` confirmado livre e sem colisão com `"0 10"` (78-3). Dependência de código da 78-3 (Ready após esta validação) corretamente sinalizada. | @po (Pax) |

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
