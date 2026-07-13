# Story 78-5 — Coletor Vercel (cron 1×/dia, parsing JSONL/FOCUS)

## Metadata
- **Epic:** 78 — Painel de Saúde & Billing da Plataforma
- **Story:** 78-5
- **Status:** InReview
- **Priority:** P1 — completa a camada FORTE de coleta automática (junto com 78-3 Anthropic e 78-4 OpenAI); Vercel é a hospedagem de produção (`crm.trifold.eng.br`), risco direto de corte de serviço se a fatura passar despercebida
- **Complexity:** M (adapta o contrato já fixado pela 78-3; complexidade concentrada no parsing JSONL e na regra de janela ≤ 1 ano; ~6-8h)
- **Created:** 2026-07-08
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @dev (Dex)
- **Quality Gate:** @architect (Aria)
- **Quality Gate Tools:** `[contract_adherence_review, jsonl_parsing_review, idempotency_test, cron_auth_review]`

> Mapping confirmado no Epic 78 (§7, tabela de stories): "78-5 | Coletor Vercel (cron 1×/dia) | ... | @dev | @architect".

---

## User Story

**Como** Trifold CRM (plataforma),
**Quero** um coletor de billing para a Vercel que consome `GET /v1/billing/charges` (formato FOCUS/FinOps, resposta em JSONL), parseia corretamente linha a linha, respeita a janela máxima de 1 ano da API, e grava snapshots de custo diários idempotentes em `service_cost_snapshots` **adaptando** (não recriando) o contrato `BillingCollector`/`runCollector()` fixado pela Story 78-3,
**Para que** o Painel de Saúde & Billing (78-9) tenha visibilidade automática do gasto com a hospedagem de produção (Vercel), sem exigir cadastro manual de valor, e sem duplicar o trabalho de auth/upsert/isolamento de falha já resolvido pela 78-3.

---

## Context

O Epic 78 classifica a Vercel na camada **FORTE** de automação (§2.1 da tabela de serviços): custo e uso vêm de uma API oficial (`GET /v1/billing/charges`), diferente de Supabase/Resend (camada FRACA, sem endpoint de fatura — Story 78-7) ou WhatsApp (camada MÉDIA — Story 78-6).

A Story 78-3 (Status: Draft nesta data, mas já com o contrato **fixado** nos seus Dev Notes) define:
1. A interface `BillingCollector` (`serviceSlug`, `collect(window)`) e os tipos `CostSnapshotRow`/`CollectorResult`, em `packages/web/src/lib/billing-collectors/types.ts`.
2. O runner genérico `runCollector(admin, collector, window)`, em `packages/web/src/lib/billing-collectors/run-collector.ts`, que resolve `service_id` por `slug`, faz upsert idempotente (`onConflict: 'service_id,snapshot_date,metric'`) e isola qualquer falha do coletor (nunca propaga exceção, grava linha `collection_status='error'` em vez de derrubar o cron).

Esta story **adapta** esse contrato para a Vercel (IDS: REUSE > ADAPT > CREATE — a 78-3 já é a story-âncora citada pelo próprio Epic §7: "78-3 cria o contrato de coletor; 78-4/78-5/78-6 adaptam, não recriam"). A única complexidade nova e específica da Vercel é o **formato de resposta**: `GET /v1/billing/charges` retorna **JSONL** (JSON Lines — um objeto JSON por linha, separado por `\n`, e **não** um array JSON único), no formato **FOCUS (FinOps Open Cost & Usage Specification) v1.3**. O próprio Dev Notes da 78-3 já antecipa isso: *"Vercel retorna JSONL em vez de JSON — CON-5 — pode exigir um parser prévio antes de chamar `collect()`, mas o retorno de `collect()` continua sendo `CostSnapshotRow[]`"*.

**Pré-condição de implementação:** se, ao assumir esta story, `packages/web/src/lib/billing-collectors/` ainda não existir no repositório (porque a Story 78-3 ainda não foi implementada), a 78-3 deve ser desenvolvida **primeiro** — esta story não deve recriar `types.ts`/`run-collector.ts` do zero. Isso é uma dependência de **sequenciamento de implementação**, não apenas de schema (diferente da relação com a 78-1, cujo schema já existe independentemente do código da 78-3).

---

## Scope

### IN (esta story entrega)

- **Coletor Vercel** (novo módulo, adapta o contrato): `packages/web/src/lib/billing-collectors/vercel.ts`, implementando `BillingCollector` com `serviceSlug: 'vercel'` — FR-4.
- **Parser JSONL**: função que lê o corpo da resposta como texto, separa por linha (`\n`), descarta linhas vazias, e faz `JSON.parse` linha a linha (nunca `response.json()` no corpo inteiro) — CON-5.
- **Mapeamento FOCUS → `CostSnapshotRow[]`**: agregação por dia (`snapshot_date`) do custo (`metric = 'cost_usd'`, `currency = 'USD'`), com possibilidade de métricas adicionais de uso (ex.: por serviço/recurso Vercel) em linhas separadas, sem moeda.
- **Validação de janela ≤ 1 ano** (CON-5): a rota rejeita explicitamente uma janela `from`/`to` que exceda 366 dias, **antes** de chamar a API Vercel — nunca deixa a API de terceiro validar isso por nós.
- **Rota de cron autenticada**: `packages/web/src/app/api/cron/billing-collect-vercel/route.ts`, reusando literalmente o mesmo padrão `CRON_SECRET` de `daily-report`/`supremo-sync`/78-3.
- **Registro no `vercel.json`**: novo entry de cron 1×/dia, em horário livre (ver Dev Notes).
- **Reuso explícito** de `runCollector()` da Story 78-3, sem modificá-lo.

### OUT (não entra nesta story)

- Qualquer alteração no contrato `BillingCollector`/`CostSnapshotRow`/`CollectorResult`/`runCollector()` definido pela 78-3 — se uma limitação real da Vercel exigir mudança no runner, isso exige revisão do @architect (nota explícita da 78-3), não uma alteração silenciosa aqui.
- Coletores de OpenAI (78-4), WhatsApp/Meta (78-6), Supabase/Resend (78-7) — stories irmãs, cada uma adapta o mesmo contrato para seu fornecedor.
- Qualquer migration nova — o schema já existe (Story 78-1, migration `164`); esta story só escreve dado nas tabelas existentes usando o slug `vercel` já seedado (`billing_url_confirmed = false`, conforme 78-1 — sem relação com esta story, que não altera catálogo).
- Provisionamento de `VERCEL_BILLING_TOKEN`/`VERCEL_TEAM_ID` — Story 78-2. Esta story **consome** os secrets; se ausentes, a rota degrada graciosamente (ver AC7), não falha na implementação.
- UI do painel — Story 78-9.
- Conversão de moeda BRL↔USD — NFR-7 proíbe inventar taxa.

---

## Acceptance Criteria

- [x] **AC1 — Adapta o contrato `BillingCollector` sem modificá-lo:** `packages/web/src/lib/billing-collectors/vercel.ts` exporta um objeto/factory que implementa a interface `BillingCollector` da Story 78-3 (`serviceSlug: 'vercel'`, `collect(window): Promise<CostSnapshotRow[]>`), importado de `./types.ts` **sem** redefinir os tipos localmente. A rota de cron chama `runCollector(admin, vercelCollector, window)` — o mesmo runner da 78-3, sem cópia/fork de sua lógica de upsert ou isolamento de falha.

- [x] **AC2 — Parsing correto de JSONL (CON-5, ponto técnico central desta story):** O coletor busca `GET https://api.vercel.com/v1/billing/charges` e processa a resposta como **JSON Lines**, não como um array JSON único: lê o corpo via `response.text()`, separa por `\n`, filtra linhas vazias (`.filter(Boolean)`), e aplica `JSON.parse` em cada linha individualmente dentro de um `try/catch` por linha (uma linha malformada é logada e ignorada, sem derrubar o parsing das demais — nunca usar `response.json()` diretamente no corpo inteiro, o que falharia ou processaria incorretamente um payload JSONL).

- [x] **AC3 — Requisição com params e auth exatos:** A chamada usa `Authorization: Bearer ${VERCEL_BILLING_TOKEN}` e os query params `teamId=${VERCEL_TEAM_ID}` (via `URLSearchParams`), além de `from`/`to` no formato de data aceito pela API (formato ISO 8601 — **confirmar o nome exato do(s) parâmetro(s) de janela e o formato de data na documentação oficial da Vercel Billing API antes de implementar**, seguindo o mesmo princípio da Story 78-3/T1.4 de não inventar nomes de campo — Artigo IV). O nome real do(s) parâmetro(s) encontrado deve ser documentado em Completion Notes.

- [x] **AC4 — Mapeamento FOCUS → `CostSnapshotRow[]` com convenção de métrica compartilhada:** Cada linha JSONL (registro FOCUS — ex.: campos como período de cobrança, custo faturado/efetivo, nome do serviço/recurso) é agregada por `snapshot_date` (dia) em uma ou mais `CostSnapshotRow`. A métrica monetária principal usa `metric = 'cost_usd'` (mesma convenção adotada pelo coletor Anthropic da 78-3, para que a Story 78-9 possa somar `SUM(value) WHERE metric = 'cost_usd'` de forma uniforme entre coletores da camada FORTE); quando a resposta permitir quebra por serviço/recurso Vercel, métricas adicionais de uso podem ser gravadas com `metric` descritivo (ex.: prefixado por tipo de recurso) e `currency: null`. Múltiplas linhas JSONL do mesmo dia são **somadas** em um único valor de `cost_usd` por dia (não uma linha por registro bruto) — a granularidade de gravação em `service_cost_snapshots` é diária (CON-6 do épico), não por linha de charge.

- [x] **AC5 — Janela ≤ 1 ano validada antes da chamada (CON-5):** Se a rota receber `?from=YYYY-MM-DD&to=YYYY-MM-DD` com diferença superior a 366 dias, o coletor retorna erro claro (`collector.collect()` lança uma exceção tipada específica, ex. `VercelWindowTooLargeError`) **antes** de chamar a API Vercel; a rota trata esse erro retornando HTTP 400 `{ error: "Window exceeds 1 year limit" }` (distinto do fluxo de erro genérico do runner, que resultaria em `collection_status='error'` — aqui é erro de validação de input, não falha de coleta).

- [x] **AC6 — Custo diário gravado idempotente por serviço (NFR-4):** Rodar o coletor duas vezes para a mesma janela resulta em **exatamente uma linha** por `(service_id, snapshot_date, 'cost_usd')` em `service_cost_snapshots` — o `value` da segunda execução sobrescreve (upsert via `onConflict: 'service_id,snapshot_date,metric'`), nunca duplica linha. Mesmo padrão de validação da 78-3/AC7.

- [x] **AC7 — Cron autenticado e degradação graciosa quando secrets ausentes:** `GET /api/cron/billing-collect-vercel` segue exatamente o padrão `CRON_SECRET` de `daily-report`/78-3 (sem `CRON_SECRET` → 503; header incorreto → 401). Se `VERCEL_BILLING_TOKEN` ou `VERCEL_TEAM_ID` não estiverem definidos, a rota retorna 503 `{ error: "VERCEL_BILLING_TOKEN not set" }` (ou `VERCEL_TEAM_ID`, conforme o ausente) **sem** tentar chamar a API Vercel e **sem** gravar snapshot algum — cobre o caso real de a Story 78-2 ainda não ter concluído o provisionamento.

- [x] **AC8 — Falha da API isolada não derruba o cron (NFR-3, herdado do runner da 78-3):** Se a chamada à API Vercel falhar (timeout, erro HTTP, resposta que não é JSONL válido em nenhuma linha), o `runCollector()` da 78-3 captura o erro (propagado normalmente por `collect()`, sem tratamento especial no coletor Vercel além do parsing linha-a-linha do AC2), grava linha `collection_status='error'`, e a rota retorna HTTP 200 com `{ ok: false, error: ... }` — nunca 500 por falha isolada.

- [x] **AC9 — Backfill manual dentro do limite (FR-10):** A rota aceita `?from=YYYY-MM-DD&to=YYYY-MM-DD` opcionais para reprocessar um período passado (respeitando o limite de 1 ano do AC5); se ausentes, o default é o dia anterior (`ontem`, calculado em `America/Sao_Paulo` — NFR-8), igual ao padrão da 78-3.

- [x] **AC10 — `vercel.json` atualizado sem colisão:** Novo entry em `packages/web/vercel.json` em horário livre que não colide com nenhum cron existente nem com o da 78-3 (`billing-collect-anthropic` às `10:00 UTC`) — ver Dev Notes para o horário exato escolhido e a lista completa de horários já ocupados.

---

## Tasks / Subtasks

- [x] **T1 — Preparação e confirmação de contrato/API** (AC1, AC3)
  - [x] T1.1 — Confirmar se `packages/web/src/lib/billing-collectors/{types.ts,run-collector.ts}` já existem (Story 78-3 implementada); se não existirem, sinalizar bloqueio e priorizar a implementação da 78-3 antes de prosseguir
  - [x] T1.2 — Ler a Story 78-3 (Dev Notes: contrato `BillingCollector`, `CostSnapshotRow`, `CollectorResult`, esqueleto de `runCollector()`) e o coletor Anthropic como referência de estrutura de arquivo
  - [x] T1.3 — Ler `packages/web/src/app/api/cron/daily-report/route.ts` (padrão de auth `CRON_SECRET`, confirmado: `authHeader !== \`Bearer ${cronSecret}\`` → 401; ausência de `cronSecret` → 503)
  - [x] T1.4 — Consultar a documentação oficial da Vercel Billing API (`GET /v1/billing/charges`) via `context7` ou busca web para confirmar: nomes exatos dos query params de janela de data, formato de data aceito, estrutura exata dos campos FOCUS retornados por linha (nome do serviço/recurso, campo de custo faturado vs. efetivo, campo de período). **Não inventar nomes de campo** (Artigo IV) — documentar o formato real encontrado em Completion Notes, seguindo o mesmo processo da 78-3/T1.4 para a Anthropic Admin API

- [x] **T2 — Parser JSONL** (AC2)
  - [x] T2.1 — Implementar leitura via `response.text()` + split por `\n` + filter de linhas vazias
  - [x] T2.2 — `JSON.parse` por linha dentro de `try/catch` individual; linha malformada é logada (`console.warn` ou `logEvent`) e ignorada, sem interromper o parsing das demais linhas
  - [ ] T2.3 — Unit test (se o projeto tiver Vitest configurado para `packages/web/src/lib/`) cobrindo: JSONL válido multi-linha, linha vazia no meio, uma linha malformada entre linhas válidas

- [x] **T3 — Mapeamento FOCUS → `CostSnapshotRow[]`** (AC4)
  - [x] T3.1 — Agrupar registros parseados por `snapshot_date` (dia)
  - [x] T3.2 — Somar o valor de custo faturado/efetivo (campo confirmado em T1.4) por dia → uma `CostSnapshotRow` com `metric: 'cost_usd'`, `currency: 'USD'`, `collection_status: 'ok'`
  - [ ] T3.3 — (Opcional, se os dados permitirem sem invenção) gravar métricas de uso adicionais por tipo de recurso, `currency: null`

- [x] **T4 — Validação de janela ≤ 1 ano** (AC5)
  - [x] T4.1 — Calcular diferença em dias entre `from` e `to` antes de montar a requisição
  - [x] T4.2 — Se > 366 dias, lançar `VercelWindowTooLargeError` (tipo específico) sem chamar a API

- [x] **T5 — Coletor Vercel** (AC1, AC3)
  - [x] T5.1 — Criar `packages/web/src/lib/billing-collectors/vercel.ts` implementando `BillingCollector` (`serviceSlug: 'vercel'`)
  - [x] T5.2 — Montar requisição com `Authorization: Bearer ${VERCEL_BILLING_TOKEN}` + `URLSearchParams({ teamId: VERCEL_TEAM_ID, ...params de janela confirmados em T1.4 })`
  - [x] T5.3 — Se `VERCEL_BILLING_TOKEN` ou `VERCEL_TEAM_ID` ausente, lançar erro tipado específico que a rota trata como 503 (AC7), distinto do erro genérico tratado pelo runner (AC8)

- [x] **T6 — Rota de cron** (AC5, AC7, AC9, AC10)
  - [x] T6.1 — Criar `packages/web/src/app/api/cron/billing-collect-vercel/route.ts` com auth `CRON_SECRET` idêntica ao padrão existente
  - [x] T6.2 — Ler query params opcionais `from`/`to`; default = ontem em `America/Sao_Paulo`
  - [x] T6.3 — Checar `VERCEL_BILLING_TOKEN`/`VERCEL_TEAM_ID` antes de chamar o coletor (AC7)
  - [x] T6.4 — Capturar `VercelWindowTooLargeError` explicitamente → 400 (AC5), antes de delegar ao `runCollector()` (que trataria como erro genérico 200/error)
  - [x] T6.5 — Chamar `runCollector(admin, vercelCollector, window)` e retornar `CollectorResult` como JSON
  - [x] T6.6 — `export const maxDuration = 60`
  - [x] T6.7 — Adicionar entry em `packages/web/vercel.json` (AC10)

- [ ] **T7 — Validação manual em DEV** (AC2, AC6, AC7, AC8, AC9)
  - [ ] T7.1 — Chamar a rota sem header de auth → 401; sem `CRON_SECRET` configurado → 503
  - [ ] T7.2 — Chamar a rota sem `VERCEL_BILLING_TOKEN`/`VERCEL_TEAM_ID` configurados → 503 sem gravar snapshot
  - [ ] T7.3 — Com secrets válidos (pós-78-2), chamar a rota e confirmar linha(s) `cost_usd` em `service_cost_snapshots` para o `service_id` do slug `vercel`
  - [ ] T7.4 — Rodar a rota 2× para a mesma janela → confirmar 1 linha por métrica/dia (sem duplicata) — AC6
  - [ ] T7.5 — Chamar com janela > 366 dias → confirmar 400, sem chamada à API Vercel (checar logs/mocks) — AC5
  - [ ] T7.6 — Forçar falha de rede/resposta inválida → confirmar linha `collection_status='error'` + resposta 200 (não 500) — AC8

- [x] **T8 — Documentar formato real encontrado**
  - [x] T8.1 — Registrar em Completion Notes o formato exato de query params e campos FOCUS confirmados na doc oficial (T1.4)
  - [x] T8.2 — Registrar decisões no Change Log

---

## Dev Notes

### Arquivos a criar
- `packages/web/src/lib/billing-collectors/vercel.ts` — implementação concreta do coletor Vercel (adapta o contrato da 78-3)
- `packages/web/src/app/api/cron/billing-collect-vercel/route.ts` — rota de cron autenticada

### Arquivo a modificar
- `packages/web/vercel.json` — adicionar entry de cron (AC10)

### Arquivos de referência obrigatórios (ler antes de implementar)
- `docs/stories/78-3-coletor-anthropic-padrao.story.md` — **fonte de verdade do contrato**: interface `BillingCollector`, tipos `CostSnapshotRow`/`CollectorResult`, esqueleto de `runCollector()` (upsert `onConflict: 'service_id,snapshot_date,metric'`, isolamento de falha via try/catch, linha `collection_status='error'` no catch). Esta story 78-5 **adapta**, não recria, esse runner.
- `docs/stories/78-1-modelo-dados-billing.story.md` — contrato de dados de `service_cost_snapshots` (colunas exatas, `UNIQUE(service_id, snapshot_date, metric)`, valores permitidos de `collection_status`: `ok`/`manual`/`no_data`/`error`; slug `vercel` já seedado com `billing_url_confirmed = false`, sem relação com a coleta de custo desta story)
- `docs/stories/78-2-provisionamento-secrets-billing.story.md` — contrato de nomes das env vars `VERCEL_BILLING_TOKEN` (Secret) e `VERCEL_TEAM_ID` (Config) — **usar exatamente esses nomes, sem variação**; na data desta story, 78-2 está em Status Draft e essas 2 credenciais **não** dependem de pré-requisito humano de owner externo (diferente de Anthropic/OpenAI/Meta) — podem ser provisionadas pelo próprio @devops com acesso à conta Vercel do projeto
- `packages/web/src/app/api/cron/daily-report/route.ts` — padrão de auth `CRON_SECRET` a ser copiado literalmente (linhas 11-19: `cronSecret` ausente → 503; `authHeader !== \`Bearer ${cronSecret}\`` → 401)
- `packages/web/src/lib/supabase/admin.ts` — `createAdminClient()` (service_role, bypassa RLS)
- `packages/web/src/lib/logger.ts` — `logEvent({ level, category: 'cron', event_type, message, metadata })` para observabilidade de falhas (NFR-6) e para logar linhas JSONL malformadas descartadas

### Por que esta story é "ADAPT", não "CREATE" (IDS)
O Epic 78 (§7, nota de sequenciamento) já determina: *"78-3 cria o contrato de coletor; 78-4/78-5/78-6 adaptam, não recriam."* Isso significa que **nenhum código novo de upsert, resolução de `service_id` por slug, ou isolamento de falha deve ser escrito nesta story** — tudo isso já existe em `run-collector.ts` (78-3). O único código genuinamente novo aqui é: (a) o parser JSONL, (b) a validação de janela ≤ 1 ano, e (c) o mapeamento FOCUS → `CostSnapshotRow`. Se, durante a implementação, ficar claro que o runner genérico da 78-3 **não** suporta algo que a Vercel exige, isso deve ser levado ao @architect como um pedido de revisão do contrato — não resolvido silenciosamente forkando o runner aqui (mesma regra explicitada nos Dev Notes da 78-3).

### Ponto técnico central — parsing JSONL (CON-5)

`GET https://api.vercel.com/v1/billing/charges` retorna a resposta no formato **JSONL** (JSON Lines / newline-delimited JSON), seguindo a especificação **FOCUS (FinOps Open Cost & Usage Specification) v1.3**. Isso é fundamentalmente diferente de um JSON array (`[{...}, {...}]`): cada **linha** do corpo da resposta é um objeto JSON **independente**, separado por `\n`. Consequências práticas para a implementação:

- **Nunca usar `await response.json()`** no corpo inteiro — isso falharia (JSON.parse de múltiplos objetos concatenados não é JSON válido) ou, dependendo do runtime/fetch, poderia silenciosamente processar apenas a primeira linha como se fosse o payload inteiro.
- **Padrão correto:**
  ```ts
  const text = await response.text()
  const lines = text.split("\n").filter((line) => line.trim().length > 0)
  const records: FocusChargeRecord[] = []
  for (const line of lines) {
    try {
      records.push(JSON.parse(line))
    } catch (err) {
      logEvent({ level: "warn", category: "cron", event_type: "vercel_jsonl_parse_error", message: String(err), metadata: { line } })
      // linha malformada é descartada, não derruba o parsing das demais
    }
  }
  ```
- **Os nomes exatos dos campos FOCUS retornados por linha** (ex.: período de cobrança, custo faturado, custo efetivo, nome do serviço/recurso Vercel) **não estão confirmados nos documentos do projeto** — T1.4 exige checar a documentação oficial da Vercel Billing API antes de escrever o mapeamento de campos. Não inventar nomes de campo (Artigo IV — mesma exigência que a 78-3 fez para os query params da Anthropic Admin API).
- **Agregação diária:** como o épico documenta granularidade diária (CON-6) mas a resposta FOCUS pode trazer múltiplas linhas por dia (por recurso/serviço), o coletor deve **somar** o custo de todas as linhas do mesmo dia numa única `CostSnapshotRow` com `metric = 'cost_usd'` — não gravar uma linha em `service_cost_snapshots` por registro bruto do JSONL (isso violaria a granularidade diária esperada pela UI da 78-9 e poderia gerar `UNIQUE` conflitando com múltiplos valores para a mesma chave, exigindo uma decisão arbitrária de qual "vence").

### Auth e params (confirmar formato exato em T1.4 antes de codar)
- **Endpoint:** `GET https://api.vercel.com/v1/billing/charges`
- **Header:** `Authorization: Bearer ${VERCEL_BILLING_TOKEN}`
- **Params confirmados pelo épico:** `teamId` (ou `slug`, conforme a doc oficial confirmar) identificando o time; janela de datas via parâmetros que devem ser confirmados na doc oficial antes de implementar (formato ISO 8601 esperado, mas o(s) nome(s) exato(s) do(s) parâmetro(s) — ex. `from`/`to` vs. `startDate`/`endDate` — não estão confirmados nos documentos do projeto)
- **Janela máxima:** ≤ 1 ano (CON-5) — validar no coletor **antes** de montar a requisição (AC5)
- **Granularidade:** diária (mesmo padrão de CON-6 do épico)

### Convenção de métrica compartilhada entre coletores da camada FORTE
Para que a Story 78-9 (UI) possa somar o "gasto do mês" de forma uniforme entre Anthropic (78-3), OpenAI (78-4, se seguir o mesmo padrão) e Vercel (esta story), todos os coletores da camada FORTE devem gravar o custo monetário principal com `metric = 'cost_usd'` e `currency = 'USD'`. Esta story fixa essa convenção para a Vercel; qualquer desvio deve ser documentado explicitamente e comunicado ao @architect antes de a 78-9 ser desenhada, para evitar que a UI precise de lógica especial por serviço.

### Janela ≤ 1 ano — validação explícita (AC5)
```ts
// packages/web/src/lib/billing-collectors/vercel.ts (esqueleto de referência)
const MAX_WINDOW_DAYS = 366

export class VercelWindowTooLargeError extends Error {}

function assertWindowWithinLimit(window: { from: string; to: string }) {
  const days = (new Date(window.to).getTime() - new Date(window.from).getTime()) / 86_400_000
  if (days > MAX_WINDOW_DAYS) {
    throw new VercelWindowTooLargeError(`Window of ${days} days exceeds Vercel's 1-year limit`)
  }
}
```
A rota deve capturar `VercelWindowTooLargeError` **antes** de delegar ao `runCollector()` genérico (que trataria como um erro de coleta comum, resultando em `collection_status='error'` gravado — mas aqui é um erro de **input inválido do chamador**, não uma falha da API, então deve ser um 400 explícito, não um 200 com status de erro).

### Timezone e janela padrão (NFR-8)
Idêntico ao padrão da 78-3: "ontem" calculado em `America/Sao_Paulo`, não UTC, para o default do cron diário.

### `vercel.json` — horário de cron escolhido
Horários já ocupados (conferir `packages/web/vercel.json` antes de editar): `*/30 * * * *` (enrich-leads, webhook-health, calendly-sync, appointment-whatsapp-reminders), `0 */2 * * *` (followup), `*/3 * * * *` (campaign-poll, roleta-retry), `0 8 * * *` (keep-alive), `0 */4 * * *` (meta-sync-entities, meta-sync-health), `0 9 * * *` (meta-sync-insights), `0 11 * * *` (email-automations, meta-ads-intelligence), `0 * * * *` (email-queue), `0 12 * * *` (appointment-email-reminders), `0 2 * * 1` (analytics-report), `0 6 * * 1` (meta-sync-placement), `0 */6 * * *` (obras-approval-reminder), `0 4 * * *` (purge-rejected-uploads), `59 10 * * *` (daily-report), `*/10 * * * *` (sla-alerts), `*/5 * * * *` (bolsao-rebalance), `0 12,15,18,21 * * *` (boleto-scan), e o novo `0 10 * * *` da Story 78-3 (`billing-collect-anthropic`). Esta story usa **`"20 10 * * *"`** (10:20 UTC = 07:20 BRT) — livre, sequenciado logo após o coletor Anthropic (10:00 UTC) e antes do `daily-report` (10:59 UTC), sem colisão.

### Dependências explícitas (críticas)
- **Depende de Story 78-1 (Status: Ready)** — schema já existe (migration `164`), slug `vercel` já seedado no catálogo.
- **Depende de Story 78-2 (Status: Draft)** — `VERCEL_BILLING_TOKEN`/`VERCEL_TEAM_ID` ainda não confirmados como provisionados nesta data; **diferente** das credenciais Anthropic/OpenAI/Meta, estas 2 **não** têm pré-requisito humano de owner externo bloqueante (78-2, T3) — podem ser provisionadas assim que o @devops assumir a 78-2, sem depender de terceiros. Ainda assim, o código desta story deve funcionar corretamente com os secrets ausentes (AC7 — 503 gracioso), permitindo implementação/revisão antes da conclusão da 78-2.
- **Depende de Story 78-3 (Status: Draft)** — contrato `BillingCollector`/`runCollector()` **fixado no texto da story** mesmo sem código implementado ainda; esta story (78-5) só pode ser codificada de fato depois que a 78-3 tiver `types.ts`/`run-collector.ts` mergeados no repositório (dependência de sequenciamento de implementação, não apenas de schema — ver T1.1).

---

## Testing

### Abordagem
- Validação manual em ambiente DEV (Supabase `xnxvygyfyyyzwhiuoehz`), chamando a rota `/api/cron/billing-collect-vercel` diretamente com os headers/params corretos e incorretos
- Se o projeto tiver Vitest configurado para módulos de `packages/web/src/lib/`, adicionar teste unitário do parser JSONL com fixtures de linhas válidas/malformadas/vazias (mock de `fetch`, sem chamar a API real) — adicional bem-vindo, não bloqueante (mesmo critério aplicado pela 78-3)

### Cenários de teste

1. **Auth ausente:** Chamar a rota sem header `Authorization` → 401.
2. **Secret de cron não configurado:** Em ambiente sem `CRON_SECRET` → 503 `"Cron not configured"`.
3. **Secrets Vercel ausentes:** Com `CRON_SECRET` correto mas sem `VERCEL_BILLING_TOKEN`/`VERCEL_TEAM_ID` → 503, e nenhuma linha nova em `service_cost_snapshots`.
4. **Parsing JSONL válido:** Fixture com 3+ linhas JSONL válidas de dias diferentes → coletor retorna `CostSnapshotRow[]` agregado corretamente por dia.
5. **Parsing JSONL com linha malformada:** Fixture com uma linha JSON inválida no meio de linhas válidas → parser descarta apenas a linha malformada (loga o erro), processa as demais normalmente, sem lançar exceção que interrompa o parsing.
6. **Janela > 1 ano:** Chamar a rota com `?from=2024-01-01&to=2026-06-01` (> 366 dias) → 400, e nenhuma chamada é feita à API Vercel (confirmar via mock/log que a validação ocorreu antes do `fetch`).
7. **Coleta bem-sucedida:** Com secrets configurados (pós-78-2), chamar a rota → linha(s) `metric='cost_usd', collection_status='ok'` aparecem em `service_cost_snapshots` para o `service_id` do slug `vercel`.
8. **Idempotência (AC6):** Rodar a rota duas vezes para a mesma janela → `SELECT count(*) FROM service_cost_snapshots WHERE service_id = (SELECT id FROM platform_services WHERE slug='vercel') AND metric='cost_usd' AND snapshot_date = '<data>'` retorna exatamente `1`.
9. **Falha da API isolada (AC8):** Simular falha de rede/resposta inválida → resposta da rota é HTTP 200 com `status: 'error'` no corpo, e uma linha `metric='collection_error', collection_status='error'` é gravada — a rota não retorna 500.
10. **Backfill (AC9):** Chamar a rota com `?from=2026-07-01&to=2026-07-03` (dentro do limite) → snapshots gravados para os 3 dias solicitados.

---

## Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| R1 | Nomes exatos de query params/campos FOCUS da Vercel Billing API não confirmados nos documentos do projeto — risco de implementação incorreta se inventados | Média | T1.4 exige consultar doc oficial antes de implementar o parser/mapeamento (Artigo IV); Completion Notes deve registrar o formato real encontrado |
| R2 | Parsing incorreto do JSONL (ex.: usar `response.json()` no corpo inteiro) causa falha silenciosa ou exceção não tratada | Alta | AC2 explicita o padrão correto (`response.text()` + split + parse por linha); T2.3 sugere teste unitário com fixtures |
| R3 | Agregação diária incorreta gera múltiplas linhas conflitantes para a mesma chave `UNIQUE(service_id, snapshot_date, metric)` | Média | AC4 exige soma explícita por dia antes do upsert — uma única `CostSnapshotRow` de `cost_usd` por dia |
| R4 | `VERCEL_BILLING_TOKEN`/`VERCEL_TEAM_ID` ainda não provisionados (78-2 pendente) impede validação end-to-end completa nesta story | Média (menor que Anthropic/OpenAI/Meta — sem pré-requisito humano externo) | AC7 garante degradação graciosa (503); T7.3–T7.6 (validação com dado real) ficam pendentes até 78-2 concluir T3 |
| R5 | Runner genérico da 78-3 não suportar algum caso específico da Vercel (ex.: múltiplas métricas por dia com necessidade de tratamento especial) | Baixa/Média | Se identificado, escalar ao @architect antes de modificar `run-collector.ts` — não fork silencioso (nota explícita nos Dev Notes da 78-3) |
| R6 | Cron novo em `vercel.json` colide de horário com cron existente (incluindo o novo da 78-3) | Baixa | Dev Notes lista todos os horários já ocupados; `"20 10 * * *"` escolhido como livre |
| R7 | Janela > 1 ano ser silenciosamente aceita e a API Vercel retornar erro genérico não tratado, sendo confundido com "falha de coleta" | Baixa | AC5 valida a janela **antes** da chamada, retornando 400 explícito e distinto do fluxo de erro do runner |

---

## Dependencies

- **Depende de:** Story 78-1 (Status: Ready — schema `platform_services`/`service_cost_snapshots`, migration `164`, slug `vercel` seedado), Story 78-2 (Status: Draft — secrets `VERCEL_BILLING_TOKEN`/`VERCEL_TEAM_ID`, sem pré-requisito humano bloqueante), Story 78-3 (Status: Draft — contrato `BillingCollector`/`CostSnapshotRow`/`CollectorResult`/`runCollector()` fixado no texto; código precisa estar implementado/mergeado antes desta story ser codificada de fato)
- **Bloqueia diretamente:** Story 78-9 (UI) parcialmente — no que se refere a ter dado real de custo Vercel para exibir (a UI pode ser construída antes, mas sem dado de Vercel até esta story rodar em produção)
- **Bloqueada parcialmente por:** Story 78-2 (secrets) e Story 78-3 (contrato de código) — ver "Dependências explícitas" nos Dev Notes
- **Dependências técnicas:**
  - `packages/web/src/lib/billing-collectors/types.ts` e `run-collector.ts` (Story 78-3)
  - `packages/web/src/lib/supabase/admin.ts` (`createAdminClient()`)
  - `packages/web/src/lib/logger.ts` (`logEvent()`)
  - `packages/web/vercel.json` (registro de cron)
  - Padrão de auth de `packages/web/src/app/api/cron/daily-report/route.ts`

---

## Definition of Done

- [x] `packages/web/src/lib/billing-collectors/vercel.ts` criado, implementando `BillingCollector` sem redefinir o contrato da 78-3
- [x] Parser JSONL implementado corretamente (`response.text()` + split por linha + `JSON.parse` por linha, com isolamento de linha malformada)
- [x] Validação de janela ≤ 1 ano implementada, com erro 400 explícito antes de qualquer chamada à API Vercel
- [x] Mapeamento FOCUS → `CostSnapshotRow` grava `metric='cost_usd'`/`currency='USD'` agregado por dia (mesma convenção do coletor Anthropic)
- [x] `packages/web/src/app/api/cron/billing-collect-vercel/route.ts` criado com auth `CRON_SECRET` idêntica ao padrão existente
- [x] `packages/web/vercel.json` atualizado com o novo cron (`"20 10 * * *"`), sem colisão
- [ ] Validação manual em DEV: auth ausente (401), secret de cron ausente (503), secrets Vercel ausentes (503 sem gravar), janela > 1 ano (400 sem chamar API), coleta com sucesso (linha `cost_usd`), idempotência (sem duplicata), falha isolada (200 + `collection_status='error'`)
- [x] Nenhuma modificação em `run-collector.ts`/`types.ts` da 78-3 sem revisão explícita do @architect
- [ ] @architect executou quality gate com verdict PASS ou CONCERNS documentados e aceitos (foco: correção do parsing JSONL e aderência ao contrato da 78-3)
- [ ] @devops fez push do commit final

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não está habilitado em `core-config.yaml` (chave `coderabbit_integration` ausente, mesmo estado observado nas Stories 78-1 e 78-3).
> Validação de qualidade usará processo de revisão manual pelo @architect (quality gate desta story, conforme tabela de decomposição do Épico 78 §7).

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-07-08 | 0.1 | Story criada a partir do Epic 78 (§7, story 78-5). Adapta o contrato `BillingCollector`/`runCollector()` fixado pela Story 78-3 para a Vercel, com foco no ponto técnico central desta story: parsing de resposta **JSONL** (não JSON array) no formato FOCUS/FinOps v1.3, agregação diária de custo em `metric='cost_usd'` e validação explícita de janela ≤ 1 ano (CON-5) antes de chamar a API. [AUTO-DECISION] Executor = @dev / Quality Gate = @architect → reason: tabela de decomposição do Épico 78 (§7) já define este mapeamento explicitamente para 78-5, idêntico ao padrão da 78-3/78-4/78-6. [AUTO-DECISION] Nomes exatos de query params e campos FOCUS da Vercel Billing API não fixados nesta story, apenas os já confirmados pelo discovery do épico (endpoint, JSONL, janela ≤ 1 ano) → reason: Artigo IV (No Invention) — @dev deve confirmar via documentação oficial (T1.4) antes de implementar o parser/mapeamento, mesmo padrão exigido pela 78-3 para a Anthropic Admin API. [AUTO-DECISION] Convenção `metric='cost_usd'`/`currency='USD'` fixada como padrão compartilhado entre coletores da camada FORTE (Anthropic, OpenAI, Vercel) → reason: permitir que a Story 78-9 (UI) some o "gasto do mês" de forma uniforme, sem lógica especial por serviço. [AUTO-DECISION] Horário de cron `"20 10 * * *"` escolhido por não colidir com nenhum horário já ocupado em `vercel.json`, incluindo o novo cron da 78-3 (`10:00 UTC`) → reason: sequenciar os coletores da camada FORTE em horários próximos mas não simultâneos, evitando picos de execução. [AUTO-DECISION] Dependência de sequenciamento de implementação com a Story 78-3 explicitada (código, não só contrato textual) → reason: `runCollector()`/`types.ts` precisam existir fisicamente no repositório antes desta story poder importar e adaptar o contrato; evita que o @dev desta story recrie o runner por engano caso assuma 78-5 antes de 78-3 estar implementada. | @sm (River) |
| 2026-07-08 | 0.2 | **Validação cruzada do backlog do Epic 78 (@po Pax) — GO, Status Draft → Ready.** Ponto técnico central (parsing JSONL/FOCUS via `response.text()` + parse por linha, nunca `response.json()` no corpo inteiro) bem especificado; validação de janela ≤ 1 ano (400 antes da chamada, distinto do fluxo de erro do runner) coerente com CON-5. Convenção `metric='cost_usd'`/`currency='USD'` alinhada com 78-3 e com a agregação da 78-9. Horário de cron `"20 10"` confirmado livre, sem colisão com `"0 10"` (78-3) nem `"15 10"` (78-4). | @po (Pax) |
| 2026-07-13 | 0.3 | **Implementação (@dev Dex) — Status Ready → InReview.** Contrato da Vercel Billing API confirmado na OpenAPI oficial (T1.4): `Content-Type: application/jsonl`, params `from` (inclusivo)/`to` (**exclusivo**)/`teamId`, campos FOCUS v1.3 `BilledCost`/`BillingCurrency`/`ChargePeriodStart`. Criados `vercel.ts` (coletor + parser JSONL defensivo + `assertVercelWindow` + agregação diária de `BilledCost` em `cost_usd`/USD) e `route.ts` (auth CRON_SECRET, 503 gracioso p/ credenciais ausentes, 400 p/ janela > 1 ano antes do runCollector). `runCollector`/`types.ts` da 78-3 REUSADOS sem modificação (IDS ADAPT). Cron `"20 10 * * *"` adicionado em `vercel.json`. Lint e typecheck limpos nos arquivos novos (restam apenas os 4 erros pré-existentes não relacionados: react-email-editor ×3, pdf-lib). [AUTO-DECISION] Métrica de uso por serviço (T3.3, opcional) não implementada → reason: `ConsumedUnit` varia por linha, somar unidades distintas seria invenção (Artigo IV); só `cost_usd` gravado. [AUTO-DECISION] Unit test (T2.3) não adicionado → reason: `packages/web` sem runner de teste unitário (só Playwright e2e), idêntico à 78-3; item não-bloqueante. T7.3–T7.6 (validação E2E com secrets reais) pendentes até 78-2 provisionar credenciais no ambiente. | @dev (Dex) |

---

## Dev Agent Record

### Agent Model Used
Opus 4.8 (1M) — @dev (Dex), modo autônomo YOLO.

### Debug Log References
- Confirmação do contrato da API via OpenAPI oficial da Vercel (`https://openapi.vercel.sh`, spec pública sem auth): endpoint `GET /v1/billing/charges`, `Content-Type: application/jsonl`, schema FOCUS v1.3.
- Probe do endpoint sem token → `403 forbidden / missingToken` (confirma que o endpoint existe e exige `Authorization: Bearer`).

### Completion Notes List

**Contrato da Vercel Billing API confirmado na OpenAPI oficial (T1.4 — Artigo IV, sem invenção):**
- **Endpoint:** `GET https://api.vercel.com/v1/billing/charges`
- **Content-Type da resposta:** `application/jsonl` — confirma formalmente JSONL (não array JSON). Parsing via `response.text()` + `split('\n')` + `JSON.parse` por linha (AC2).
- **Query params (nomes exatos confirmados na spec):**
  - `from` — **required**, ISO 8601 date-time UTC, "Inclusive start of the date range".
  - `to` — **required**, ISO 8601 date-time UTC, **"Exclusive end of the date range"**. Como `to` é EXCLUSIVO, para a janela civil `[from, to]` inclusiva o coletor envia `to = (window.to + 1 dia) às 00:00Z` (mesmo padrão do `ending_at` exclusivo da Anthropic na 78-3).
  - `teamId` — opcional (usado com `VERCEL_TEAM_ID`); alternativa `slug` também aceita.
- **Campos FOCUS v1.3 confirmados no schema da resposta 200 (usados pelo coletor):**
  - `BilledCost` (number) — "Charge amount serving as the basis for invoicing" → **métrica de custo principal** somada em `cost_usd`.
  - `BillingCurrency` (string, enum `["USD"]`) → mapeado para `currency='USD'`; linha com moeda ≠ USD é descartada defensivamente (nunca ocorre pelo enum, mas evita mistura de moeda numa soma USD — NFR-7).
  - `ChargePeriodStart` (string, ISO 8601 UTC, inclusivo) → usado para alocar o custo no dia (`snapshot_date = ChargePeriodStart.slice(0,10)`).
  - Outros campos disponíveis não usados nesta story: `EffectiveCost`, `ChargePeriodEnd`, `ChargeCategory` (Adjustment/Credit/Purchase/Tax/Usage), `ServiceName`, `ServiceCategory`, `Tags` (ProjectId/ProjectName), `ConsumedQuantity`/`ConsumedUnit`, `PricingCategory`, etc.

**Decisões de implementação (IDS: ADAPT do coletor Anthropic 78-3):**
- REUSE sem modificação: `types.ts` (`BillingCollector`, `CostSnapshotRow`, `CollectWindow`), `run-collector.ts` (`runCollector` — upsert idempotente `onConflict:'service_id,snapshot_date,metric'` + isolamento de falha), `logger.logEvent`, `createAdminClient`.
- CREATE (código genuinamente novo, ~30% do artefato): parser JSONL, `assertVercelWindow` (janela ≤ 366 dias), `aggregateDailyCost` (FOCUS → `CostSnapshotRow`).
- **Agregação diária:** `BilledCost` de todas as linhas do mesmo `ChargePeriodStart`-dia é **somado** numa única `CostSnapshotRow` `metric='cost_usd'`/`currency='USD'` (CON-6 — granularidade diária, não uma linha por charge bruto). Somar `BilledCost` (não `EffectiveCost`) porque é a "base para faturamento" — reflete o valor que a fatura cobra, já com sinal de créditos/ajustes.
- **`raw_response`:** grava um resumo `{ charge_count, billed_cost_total }` por dia (não o payload bruto inteiro, que pode ser volumoso) — suficiente para auditoria/depuração.
- **Validação de janela (AC5):** exportei `assertVercelWindow` + `VercelWindowTooLargeError`; a **rota** valida ANTES de chamar `runCollector` → HTTP 400 explícito (`{ error: "Window exceeds 1 year limit" }`), distinto do fluxo de erro do runner (que geraria `collection_status='error'` + 200). O coletor também revalida internamente como rede de segurança.
- **503 gracioso (AC7):** a rota checa `VERCEL_BILLING_TOKEN` e `VERCEL_TEAM_ID` antes de qualquer chamada; ausência → 503 com a env var específica no corpo, sem gravar snapshot. O coletor tem `MissingVercelCredentialsError` como rede de segurança.

**Incertezas / desvios registrados:**
- **T3.3 (métricas de uso por serviço/recurso — OPCIONAL) NÃO implementada.** Motivo: `ConsumedUnit` varia por linha FOCUS (GB, requests, invocations, etc.); somar `ConsumedQuantity` por dia entre unidades diferentes seria semanticamente inválido e exigiria inventar uma agregação (Artigo IV). Fica como métrica de uso não coletada — só o custo monetário `cost_usd` é gravado (que é o exigido pelo DoD e pela convenção compartilhada da camada FORTE). Escalável ao @architect se a 78-9 precisar de breakdown por serviço.
- **T2.3 (unit test do parser) NÃO adicionada.** Motivo: `packages/web` não tem runner de teste unitário configurado (só Playwright e2e) — mesmo estado observado na 78-3, que também não adicionou testes unitários. T2.3 é explicitamente "não bloqueante" na story.
- **T7.3–T7.6 (validação E2E com secrets reais) PENDENTES** até a Story 78-2 provisionar `VERCEL_BILLING_TOKEN`/`VERCEL_TEAM_ID` (a mission indica que já foram provisionados na Vercel produção, mas não estão no ambiente DEV local desta implementação). Caminhos de degradação graciosa (401/503/400) são determinísticos e validáveis por leitura de código.

### File List
- **Criado:** `packages/web/src/lib/billing-collectors/vercel.ts` — coletor Vercel (implementa `BillingCollector`, parser JSONL, `assertVercelWindow`, `aggregateDailyCost`).
- **Criado:** `packages/web/src/app/api/cron/billing-collect-vercel/route.ts` — rota de cron autenticada (`CRON_SECRET`), 503 gracioso, 400 janela > 1 ano, delega a `runCollector`.
- **Modificado:** `packages/web/vercel.json` — novo cron `"20 10 * * *"` para `/api/cron/billing-collect-vercel`.

---

## QA Results

### Review Date: 2026-07-13

### Reviewed By: Quinn (Test Architect) — @qa

### Escopo
Quality gate estático da Story 78-5 (Coletor Vercel), 7 quality checks do fluxo QA + os focos específicos da mission (parsing JSONL/FOCUS, janela ≤1 ano, aderência ao contrato 78-3, degradação graciosa, segurança, convenções). Sem aplicação em banco, sem commit/push. Correções de código, se necessárias, são do @dev.

### Evidências
- **Typecheck** (`npx tsc --noEmit` em `packages/web`): apenas os **4 erros pré-existentes** não relacionados (`react-email-editor` ×3, `pdf-lib` ×1). **Zero** erros em `vercel.ts`/`route.ts`.
- **Lint** (`npx eslint` nos 2 arquivos novos): **sem erros**.
- **Contrato 78-3 inalterado**: `git status` confirma `types.ts`/`run-collector.ts` **não modificados** — só `vercel.ts` (novo) + `vercel.json` (cron adicionado). IDS ADAPT respeitado (REUSE do runner sem fork).
- **Cron sem colisão**: `grep` confirma `"20 10 * * *"` como único nesse horário (anthropic `0 10`, openai `15 10`, daily-report `59 10`).

### 7 Quality Checks
| Check | Resultado | Nota |
|-------|-----------|------|
| 1. Code review (padrões/legibilidade) | ✅ PASS | Coletor defensivo, tipagem FOCUS explícita, erros tipados (`VercelWindowTooLargeError`, `MissingVercelCredentialsError`). |
| 2. Parsing JSONL/FOCUS | ✅ PASS | `response.text()`+`split('\n')`+`JSON.parse` por linha em try/catch individual; linha malformada logada e isolada; **nunca** `response.json()`. `BilledCost`/`BillingCurrency`/`ChargePeriodStart` mapeados; agregação diária somada em `cost_usd`/USD. |
| 3. Acceptance Criteria (AC1–AC10) | ✅ PASS | Todos rastreados (ver gate file). AC6/e2e diferido. |
| 4. Sem regressões (contrato 78-3) | ✅ PASS | Runner/types reusados sem alteração. |
| 5. Performance | ✅ PASS | `maxDuration=60`, `AbortSignal.timeout(30s)`, `raw_response` resumido (não payload bruto). |
| 6. Segurança | ✅ PASS | Token só em header `Bearer`; nunca logado (logs carregam linha/erro da API, não a credencial); `trim()` nas envs. |
| 7. Documentação/convenções | ✅ PASS | Completion Notes documentam formato real da API (T1.4, Artigo IV); lint/typecheck limpos. |

### Focos específicos da mission
- **Parsing (Check 2):** correto e defensivo. Descarte por linha sem derrubar as demais confirmado em `parseJsonl`; linhas sem `ChargePeriodStart` ou `BilledCost` não-finito também isoladas em `aggregateDailyCost`.
- **Janela ≤1 ano (Check 3):** `assertVercelWindow` (>366d → `VercelWindowTooLargeError`) validada **na rota antes** do `runCollector` → 400 explícito, distinto do fluxo `collection_status='error'` do runner. `to` exclusivo tratado (`to = window.to + 1 dia` @ 00:00Z).
- **Contrato 78-3 (Check 4):** ADAPTA (importa types/runner), não recria. Upsert idempotente via runner (`onConflict:service_id,snapshot_date,metric`).
- **Degradação & auth (Check 5):** `CRON_SECRET` ausente→503, header errado→401; `VERCEL_BILLING_TOKEN`/`VERCEL_TEAM_ID` ausente→503 **antes** de qualquer chamada/gravação; falha de API isolada pelo runner → HTTP 200.
- **Segurança (Check 6):** token nunca exposto; `Bearer` correto.
- **Convenções (Check 7):** lint/typecheck limpos; cron `20 10` sem colisão.

### Observações (não bloqueantes)
- **REL-001 (low):** para janela civil de exatamente 366 dias, o `to` exclusivo (+1 dia) cobre 367 dias-calendário; se a Vercel aplicar limite estrito de 1 ano no range, um backfill no limite máximo pode receber erro genérico — degrada com segurança (runner isola → `error` + 200, sem corrupção). Padrão herdado do +1 exclusivo da 78-3. Monitorar no 1º backfill largo.
- **TEST-001 (low):** validação E2E com dado real (T7.3–T7.6) **pendente do redeploy pós-78-2** (secrets já provisionados em produção conforme mission). Caminhos de degradação (401/503/400) determinísticos e validados por leitura estática.
- **TEST-002 (low):** unit test do parser (T2.3) não adicionado — `packages/web` sem runner unitário (só Playwright e2e), idêntico à 78-3; explicitamente não-bloqueante.

### Gate Status

Gate: PASS → docs/qa/gates/78.5-coletor-vercel.yml

### Próximo passo
APROVADO para push (@devops). Após redeploy, executar T7.3–T7.6 (validação E2E com dado real) e fechar os checkboxes de validação manual + DoD restantes.
