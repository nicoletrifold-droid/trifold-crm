# Story 78-10 — Módulo Meta Ads Spend (Seção Separada de Budget de Mídia)

## Metadata
- **Epic:** 78 — Painel de Saúde & Billing da Plataforma
- **Story:** 78-10
- **Status:** Ready
- **Priority:** P2 — fecha o escopo do épico (OQ-2 resolvida 2026-07-08: Meta Ads **incluído** como módulo separado, não mais opcional); não bloqueia o MVP de billing de infraestrutura (78-1..78-9)
- **Complexity:** M (1 coletor adaptado do contrato da 78-3 + 1 migration de 1 linha + cron autenticado; ~5-6h)
- **Created:** 2026-07-08
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @dev (Dex)
- **Quality Gate:** @architect (Aria)
- **Quality Gate Tools:** `[contract_adherence_review, categorization_review, idempotency_test, cron_auth_review]`

> Mapping confirmado no Epic 78 (§7, tabela de stories): "78-10 | Módulo Meta Ads spend (seção separada) | ... | @dev | @architect" — mesmo mapping da 78-3 (código de aplicação, não schema/UI).

---

## User Story

**Como** Trifold CRM (plataforma),
**Quero** um coletor de gasto de mídia do Meta Ads (`insights.spend`, granularidade diária), implementando o contrato `BillingCollector` fixado pela Story 78-3, gravando snapshots idempotentes em `service_cost_snapshots` categorizados como **budget de mídia** (não conta a pagar de infraestrutura), com o módulo `meta_ads` do catálogo ativado,
**Para que** o Painel de Saúde & Billing (78-9) possa exibir o gasto de anúncios numa **seção própria e claramente rotulada**, sem jamais somá-lo ao total "a pagar" das faturas de infraestrutura (CON-8), fechando o escopo completo do Epic 78 conforme a decisão do usuário de 2026-07-08 (OQ-2 resolvida).

---

## Context

O Epic 78 entrega um Painel de Saúde & Billing que consolida 7 serviços. A Story 78-1 (Status: Ready) já criou o schema e seedou o placeholder `meta_ads` em `platform_services` com `enabled = false` e `automation_tier = 'media'`, aguardando a resolução da OQ-2 do épico. Essa questão foi **resolvida em 2026-07-08**: o usuário decidiu incluir Meta Ads como **módulo separado** — não é mais opcional, mas também **não é conta a pagar de infraestrutura**: é orçamento de mídia (budget de campanha), com natureza contábil e visual diferente dos outros 6 serviços do épico.

A Story 78-3 (Status: Draft) já define e fixa o **contrato de coletor reusável** (`BillingCollector`, `CostSnapshotRow`, `CollectorResult` em `packages/web/src/lib/billing-collectors/`, e o runner genérico `runCollector()` com upsert idempotente e isolamento de falha) e a primeira implementação concreta (Anthropic). Esta story **adapta** esse contrato — não recria o runner, o padrão de cron autenticado nem a lógica de upsert (IDS: REUSE > ADAPT > CREATE, mesma nota do épico §7: "78-3 cria o contrato de coletor; 78-4/78-5/78-6 adaptam, não recriam" — 78-10 se soma a esse grupo de adaptações).

A Story 78-9 (Status: Draft) já define, no lado da UI, que a seção Meta Ads é **condicional a `platform_services.meta_ads.enabled = true`** (hoje oculta) e que o "gasto total consolidado" da UI **já exclui `meta_ads` explicitamente** (AC5/AC6 da 78-9: "soma... excluindo `meta_ads`"). Ou seja, **a separação visual/contábil já está prevista e implementada do lado do consumidor (78-9)** — esta story só precisa (a) gravar o dado correto com a categorização correta, e (b) ativar o flag `enabled = true` para que a seção passe a aparecer.

**Diferença importante em relação à integração Meta Ads já existente no projeto (Epic 19 — Meta Ads Intelligence):** o projeto já tem uma sincronização de insights do Meta Ads (`packages/web/src/app/api/cron/meta-sync-insights/route.ts`), que lê a tabela `meta_ad_accounts` (multi-tenant, `org_id` + `meta_account_id` + `access_token` **por organização**) e grava em `meta_insights_daily` (métricas de campanha para CPL/funil — Epic 19, não billing). **Esta story NÃO reusa esse fluxo nem escreve em `meta_insights_daily`.** Ela é uma peça do Epic 78 (billing/custo da plataforma), grava em `service_cost_snapshots` (sem `org_id`, schema da 78-1), e usa autenticação **diferente**: o secret de plataforma `META_SYSTEM_USER_TOKEN` (contrato já fixado na Story 78-2, escopo `ads_read` reservado especificamente para esta story), em vez do `access_token` por-organização já armazenado em `meta_ad_accounts`. Isso segue o mesmo princípio de separação de credenciais de alto privilégio do NFR-1 do épico (billing/admin ≠ credenciais de produto/integração). O **`meta_account_id`** (identificador da conta de anúncios, ex. `act_1234567890`), no entanto, **é reusado** da tabela `meta_ad_accounts` já existente (Epic 19) — não se inventa um novo identificador nem um novo campo de configuração para isso (ver Dev Notes).

**Reuso adicional confirmado:** o projeto já tem um cliente HTTP genérico para a Graph API do Meta — `metaFetch<T>()` em `packages/shared/src/meta/client.ts` (retry com backoff exponencial, rate-limit tracking, tratamento de erro OAuth/permissão via `MetaOAuthException`/`MetaPermissionError`). Esta story **reusa `metaFetch`** para chamar o endpoint de `insights`, em vez de implementar `fetch()` bruto como fez a Story 78-3 para a Anthropic (que não tinha um cliente genérico prévio). Isso é uma diferença de implementação **documentada e esperada** em relação ao esqueleto da 78-3 — o contrato `BillingCollector`/`CollectorResult` continua idêntico; só a forma de chamar a API do fornecedor muda internamente ao `collect()`.

---

## Scope

### IN (esta story entrega)

- **Coletor Meta Ads** (`packages/web/src/lib/billing-collectors/meta-ads.ts`): implementa `BillingCollector` (`serviceSlug: 'meta_ads'`), buscando `insights.spend` diário via `metaFetch` — FR-11.
- **Rota de cron autenticada**: `packages/web/src/app/api/cron/billing-collect-meta-ads/route.ts`, seguindo o mesmo padrão `CRON_SECRET` de `daily-report`/`supremo-sync`/78-3.
- **Registro no `vercel.json`**: novo entry de cron 1×/dia.
- **Migration de ativação** (`165_enable_meta_ads_billing_module.sql`): `UPDATE platform_services SET enabled = true WHERE slug = 'meta_ads'` (idempotente) — a única alteração de schema/dado desta story; nenhuma tabela nova, nenhuma coluna nova.
- **Categorização explícita do dado gravado** para que a UI (78-9, já implementada com a exclusão por `slug = 'meta_ads'`) continue funcionando corretamente: `metric = 'ad_spend'`, `currency` preenchida a partir da conta de anúncios.

### OUT (não entra nesta story)

- Qualquer alteração na Story 78-9 (UI) — a seção condicional e a exclusão do total consolidado **já existem** na 78-9 (Draft) e não precisam ser tocadas; esta story só faz o flag `enabled` passar de `false` para `true`, o que já é suficiente para a seção aparecer.
- Qualquer alteração no fluxo Epic 19 (`meta-sync-insights`, `meta_insights_daily`, `meta_ad_accounts.access_token`) — esta story só **lê** `meta_ad_accounts` (para obter `meta_account_id`), nunca escreve nela.
- Provisionamento do secret `META_SYSTEM_USER_TOKEN` em si — Story 78-2 (contrato de nome já fixado: `META_SYSTEM_USER_TOKEN`, escopos `whatsapp_business_management` + `ads_read`). Esta story **consome** o secret; se ausente, degrada graciosamente (AC8), não falha.
- Contrato de coletor (`BillingCollector`/`run-collector.ts`) — já fixado pela Story 78-3; esta story só o consome/adapta.
- Conversão de moeda BRL↔USD — NFR-7 proíbe inventar taxa.

---

## Acceptance Criteria

- [ ] **AC1 — Coletor Meta Ads implementa `BillingCollector` sem alterar o contrato:** `packages/web/src/lib/billing-collectors/meta-ads.ts` exporta um objeto/factory que implementa a interface `BillingCollector` definida em `packages/web/src/lib/billing-collectors/types.ts` (Story 78-3): `serviceSlug: 'meta_ads'` e `collect(window: { from: string; to: string }): Promise<CostSnapshotRow[]>`. Nenhuma alteração é feita em `types.ts` nem em `run-collector.ts` — o coletor consome esses módulos como estão.

- [ ] **AC2 — Busca de gasto via Graph API com `metaFetch` reusado:** `collect(window)` chama, para cada conta ativa em `meta_ad_accounts` (`status = 'active'`), `metaFetch<InsightsSpendResponse>(`${meta_account_id}/insights`, META_SYSTEM_USER_TOKEN, { params: { fields: 'spend', time_range: JSON.stringify({ since: window.from, until: window.to }), time_increment: '1' } })` (reuso de `packages/shared/src/meta/client.ts`, não `fetch()` bruto), mapeando cada linha diária da resposta (`spend`, `date_start`) para uma `CostSnapshotRow` com `metric = 'ad_spend'`.

- [ ] **AC3 — `meta_account_id` obtido da tabela já existente, sem novo identificador:** O(s) `meta_account_id` usado(s) na chamada vêm de `SELECT meta_account_id, currency FROM meta_ad_accounts WHERE status = 'active'` (mesma tabela/coluna já usada por `meta-sync-insights`, Epic 19) — nenhum novo campo de configuração, env var ou tabela é criado para armazenar o ID da conta de anúncios. Se não houver nenhuma linha `active` em `meta_ad_accounts`, o coletor retorna `[]` (lista vazia) e o runner grava (via upsert normal, não caminho de erro) uma linha com `collection_status = 'no_data'` para o dia da janela — distinto de falha de coleta (AC8 trata separadamente a ausência do secret).

- [ ] **AC4 — Múltiplas contas ativas somadas por moeda, nunca misturadas entre moedas (AC7-equivalente da 78-9):** Se houver mais de uma linha `active` em `meta_ad_accounts` (hoje, apenas 1 é esperada na prática — ver Dev Notes), o coletor soma o `spend` diário de todas as contas **agrupado por `currency`** e produz uma `CostSnapshotRow` por `(snapshot_date, currency)` — nunca um único valor somando contas de moedas diferentes sem distinção. Este comportamento é o mesmo princípio já testado e documentado pela Story 78-9 (AC7: "moeda coerente, sem conversão... valores de moedas diferentes exibidos separadamente").

- [ ] **AC5 — Categorização como budget de mídia, não fatura de infraestrutura (CON-8):** As linhas gravadas em `service_cost_snapshots` para `meta_ads` usam exclusivamente `metric = 'ad_spend'` (nome de métrica próprio, não reaproveitado de nenhum outro coletor) e `currency` sempre preenchida (nunca `null`, já que é sempre monetária). O comportamento de exclusão do total consolidado de infraestrutura **já está implementado na Story 78-9** (que filtra por `slug != 'meta_ads'` — ver Dev Notes/AC5 da 78-9) e **não é modificado por esta story**; esta AC valida apenas que o dado gravado é consistente com o que a 78-9 espera (nenhuma mudança de contrato de `metric`/`currency` que quebraria a UI já implementada).

- [ ] **AC6 — Ativação do módulo no catálogo (idempotente):** Migration `165_enable_meta_ads_billing_module.sql` executa `UPDATE platform_services SET enabled = true, updated_at = now() WHERE slug = 'meta_ads' AND enabled = false` — reexecutar a migration não gera erro nem efeito colateral adicional (já `true` → `WHERE enabled = false` simplesmente não afeta linhas). Nenhuma outra coluna do seed da 78-1 é alterada (nome, categoria, `billing_url`, `automation_tier` permanecem como seedados na 78-1).

- [ ] **AC7 — Cron autenticado por `CRON_SECRET`:** `GET /api/cron/billing-collect-meta-ads` segue exatamente o padrão de `daily-report`/`billing-collect-anthropic` (78-3): sem `CRON_SECRET` configurado → 503 `{ error: "Cron not configured" }`; header `Authorization` incorreto → 401 `{ error: "Unauthorized" }`; auth correta → prossegue.

- [ ] **AC8 — Ausência de `META_SYSTEM_USER_TOKEN` degrada graciosamente, não quebra (mesmo padrão do AC8 da 78-3):** Se `META_SYSTEM_USER_TOKEN` não estiver definida no ambiente, a rota retorna 503 `{ error: "META_SYSTEM_USER_TOKEN not set" }` **sem** tentar chamar a Graph API e **sem** gravar snapshot nenhum (nem `collection_status='error'`) — cobre o caso de a Story 78-2 ainda não ter concluído o pré-requisito humano #3 (Meta System User token, hoje `PENDENTE`).

- [ ] **AC9 — Falha da API isolada não derruba o cron (NFR-3, reuso do `runCollector`):** Qualquer exceção lançada por `collect()` (timeout, erro HTTP, `MetaOAuthException`, `MetaPermissionError`) é capturada pelo **mesmo runner genérico da Story 78-3** (`runCollector()`, sem modificação) — grava linha `collection_status='error'`, chama `logEvent(...)`, e a rota retorna HTTP 200 com `{ ok: false, error: ... }` (nunca 500 por falha isolada do coletor).

- [ ] **AC10 — Sem duplicidade ao reprocessar (NFR-4):** Rodar o coletor duas vezes para a mesma janela resulta em exatamente uma linha por `(service_id, snapshot_date, 'ad_spend')` (upsert via `UNIQUE(service_id, snapshot_date, metric)`, mesmo mecanismo da 78-3) — validado manualmente em DEV.

- [ ] **AC11 — `vercel.json` sem colisão de horário:** Novo entry `{ "path": "/api/cron/billing-collect-meta-ads", "schedule": "35 10 * * *" }` (10:35 UTC = 07:35 America/Sao_Paulo) — horário livre, depois dos horários já reservados pelas Stories 78-3 (`"0 10"`), 78-4 (`"15 10"`), 78-5 (`"20 10"`) e 78-6 (`"30 10"`, que já existe como story real no repositório e usa exatamente esse minuto para `billing-collect-whatsapp`) e antes do `daily-report` (`"59 10"`); roda depois do `meta-sync-insights` (`0 9 * * *`) para não competir por rate-limit da Graph API no mesmo minuto.

---

## Tasks / Subtasks

- [ ] **T1 — Preparação e confirmação de pré-requisitos** (AC1, AC3, AC6)
  - [ ] T1.1 — Confirmar que a Story 78-1 (migration `164`) já foi aplicada em DEV (schema + seed `meta_ads` com `enabled=false`); se não estiver, escalar para @po/@sm antes de prosseguir
  - [ ] T1.2 — Ler Story 78-3 (`docs/stories/78-3-coletor-anthropic-padrao.story.md`) — contrato `BillingCollector`/`CostSnapshotRow`/`CollectorResult` e o runner `runCollector()` — confirmar que nenhuma mudança é necessária neles
  - [ ] T1.3 — Ler `packages/shared/src/meta/client.ts` (`metaFetch`) e `packages/web/src/app/api/cron/meta-sync-insights/route.ts` (exemplo real de uso de `insights` + `meta_ad_accounts`) — confirmar formato de chamada e de resposta da Graph API já usado no projeto
  - [ ] T1.4 — Confirmar com @devops/usuário o status do pré-requisito humano #3 da Story 78-2 (Meta System User token, escopos `whatsapp_business_management` + `ads_read`) — se ainda `PENDENTE`, prosseguir mesmo assim (AC8 cobre a ausência)
  - [ ] T1.5 — `ls supabase/migrations/*.sql | sort` confirma `163` como última migration real e que `164` (78-1) ainda não foi criada; se `164` já existir quando esta story for implementada, usar `165`; se `164` ainda não existir, esta story **não pode** criar sua migration sem que a 78-1 tenha sido aplicada antes (dependência sequencial — ver Dependencies)

- [ ] **T2 — Coletor Meta Ads** (AC1, AC2, AC3, AC4, AC5)
  - [ ] T2.1 — Criar `packages/web/src/lib/billing-collectors/meta-ads.ts` implementando `BillingCollector` (`serviceSlug: 'meta_ads'`)
  - [ ] T2.2 — `collect(window)`: `SELECT meta_account_id, currency FROM meta_ad_accounts WHERE status = 'active'` via `createAdminClient()`
  - [ ] T2.3 — Para cada conta, chamar `metaFetch(`${meta_account_id}/insights`, META_SYSTEM_USER_TOKEN, { params: { fields: 'spend', time_range: JSON.stringify({ since: window.from, until: window.to }), time_increment: '1' } })`
  - [ ] T2.4 — Mapear resposta (`spend`, `date_start`) → `CostSnapshotRow[]` com `metric: 'ad_spend'`, `currency: account.currency ?? 'BRL'` (fallback documentado — ver Dev Notes), `collection_status: 'ok'`
  - [ ] T2.5 — Agrupar/somar por `(snapshot_date, currency)` quando houver múltiplas contas ativas (AC4)
  - [ ] T2.6 — Se nenhuma conta `active`, retornar `[]` com uma linha `collection_status='no_data'` para o dia da janela (AC3) — **não** lançar exceção nesse caso (é estado válido, não falha)
  - [ ] T2.7 — Se `META_SYSTEM_USER_TOKEN` ausente, lançar erro tipado específico tratado pela rota como 503 (AC8), distinto do erro genérico tratado pelo runner (AC9)

- [ ] **T3 — Rota de cron** (AC7, AC8, AC11)
  - [ ] T3.1 — Criar `packages/web/src/app/api/cron/billing-collect-meta-ads/route.ts` com auth `CRON_SECRET` (padrão idêntico a `daily-report`/78-3)
  - [ ] T3.2 — Ler query params opcionais `from`/`to`; default = ontem em `America/Sao_Paulo` (mesmo padrão da 78-3)
  - [ ] T3.3 — Checar `META_SYSTEM_USER_TOKEN` antes de chamar o coletor (AC8)
  - [ ] T3.4 — Chamar `runCollector(admin, metaAdsCollector, window)` (reuso direto do runner da 78-3, sem adaptação) e retornar `CollectorResult` como JSON
  - [ ] T3.5 — `export const maxDuration = 60`
  - [ ] T3.6 — Adicionar entry em `packages/web/vercel.json` (AC11)

- [ ] **T4 — Migration de ativação** (AC6)
  - [ ] T4.1 — Confirmar número de migration livre (T1.5)
  - [ ] T4.2 — Criar `supabase/migrations/{N}_enable_meta_ads_billing_module.sql` com `UPDATE platform_services SET enabled = true, updated_at = now() WHERE slug = 'meta_ads' AND enabled = false`
  - [ ] T4.3 — Aplicar em Supabase DEV, reexecutar (idempotência — segunda execução não faz nada, sem erro)

- [ ] **T5 — Validação manual em DEV** (AC7, AC8, AC9, AC10)
  - [ ] T5.1 — Chamar a rota sem auth → 401; sem `CRON_SECRET` → 503
  - [ ] T5.2 — Chamar a rota sem `META_SYSTEM_USER_TOKEN` → 503 sem gravar snapshot
  - [ ] T5.3 — Com secret válida e ao menos 1 conta `active` em `meta_ad_accounts`, confirmar linha(s) `metric='ad_spend', collection_status='ok'` em `service_cost_snapshots`
  - [ ] T5.4 — Rodar a rota 2× para a mesma janela → confirmar 1 linha por dia/moeda (sem duplicata)
  - [ ] T5.5 — Forçar falha (ex. token temporariamente inválido) → confirmar linha `collection_status='error'` + resposta 200
  - [ ] T5.6 — Com `meta_ad_accounts` sem nenhuma linha `active` → confirmar `collection_status='no_data'`, não erro
  - [ ] T5.7 — Confirmar via `SELECT enabled FROM platform_services WHERE slug='meta_ads'` que o módulo está `true` após a migration (AC6), e que a seção Meta Ads passa a aparecer na UI da Story 78-9 (se já implementada) sem quebrar o total consolidado de infraestrutura

- [ ] **T6 — Documentar no Change Log**
  - [ ] T6.1 — Registrar decisões (fallback de moeda, agrupamento multi-conta, número de migration usado) no Change Log

---

## Dev Notes

### Arquivos a criar
- `packages/web/src/lib/billing-collectors/meta-ads.ts` — implementação concreta do `BillingCollector` para `meta_ads`
- `packages/web/src/app/api/cron/billing-collect-meta-ads/route.ts` — rota de cron autenticada
- `supabase/migrations/{N}_enable_meta_ads_billing_module.sql` — migration de 1 linha (ativação do módulo)

### Arquivo a modificar
- `packages/web/vercel.json` — adicionar entry de cron (AC11)

### Arquivos de referência obrigatórios (ler antes de implementar)
- `docs/stories/78-3-coletor-anthropic-padrao.story.md` — contrato `BillingCollector`/`CostSnapshotRow`/`CollectorResult`, runner `runCollector()` (upsert idempotente + isolamento de falha), padrão de rota de cron autenticada. **Esta story adapta esse contrato, não o recria.**
- `docs/stories/78-1-modelo-dados-billing.story.md` — contrato de dados de `service_cost_snapshots` (`UNIQUE(service_id, snapshot_date, metric)`, enum de `collection_status`) e o seed atual do slug `meta_ads` (`enabled=false`, `automation_tier='media'`, `category='ads'`, `billing_url` já apontando para o billing hub do Meta Business).
- `docs/stories/78-9-ui-painel-saude-billing.story.md` — a seção Meta Ads na UI **já está implementada como condicional a `enabled=true`** (AC6 da 78-9) e o total consolidado **já exclui `meta_ads` do somatório** (AC5 da 78-9, "excluindo Meta Ads"). Esta story 78-10 não precisa (e não deve) tocar em nenhum arquivo da 78-9 — só precisa gravar o dado corretamente e ativar o flag para que a seção passe a existir.
- `docs/stories/78-2-provisionamento-secrets-billing.story.md` — contrato de nome `META_SYSTEM_USER_TOKEN` (já fixado, escopos `whatsapp_business_management` + `ads_read`); pré-requisito humano #3 (status na data desta story: **PENDENTE**).
- `packages/shared/src/meta/client.ts` — `metaFetch<T>(path, token, options)`: monta `https://graph.facebook.com/v21.0/{path}`, injeta `access_token` como query param, retry com backoff exponencial (5 tentativas), tratamento de erro via `parseMetaError`/`MetaOAuthException`/`MetaPermissionError`, atualiza rate-limiter a partir dos headers de resposta. **Reusar diretamente** — não implementar `fetch()` bruto como a 78-3 fez para a Anthropic (lá não havia cliente genérico prévio; aqui há).
- `packages/web/src/app/api/cron/meta-sync-insights/route.ts` — exemplo real e já em produção de chamada a `${accountPath}/insights` com `fields`, `date_preset`/`time_range` e paginação (`fetchAllPages`); confirma o formato de resposta (`InsightBase.spend` como string, ex. `"123.45"`) e a leitura de `meta_ad_accounts` (`status = 'active'`, colunas `meta_account_id`, `access_token`, `currency`).
- `supabase/migrations/015_meta_marketing_api.sql` — schema de `meta_ad_accounts` (`meta_account_id TEXT`, `currency TEXT` nullable, `status TEXT CHECK (status IN ('active','disconnected','error'))`, `UNIQUE(org_id, meta_account_id)`).

### Por que esta story usa `META_SYSTEM_USER_TOKEN` (78-2) em vez do `access_token` já existente em `meta_ad_accounts`
O projeto **já tem** um token por-organização em `meta_ad_accounts.access_token`, usado pelo Epic 19 (`meta-sync-insights`) para ler métricas de campanha (CPL, funil). Este épico (78) deliberadamente usa um secret **separado** (`META_SYSTEM_USER_TOKEN`, contrato fixado na Story 78-2 com escopo `ads_read` reservado especificamente para esta story) em vez de reaproveitar o token do Epic 19. Isso segue o mesmo princípio do NFR-1 do épico: credenciais de billing/admin são de alto privilégio e devem ser providas/rotacionadas independentemente das credenciais de produto/integração — mesmo quando, na prática, os dois tokens acabam autenticando contra a mesma conta de anúncios. O **identificador da conta** (`meta_account_id`), por outro lado, não tem essa mesma razão para ser duplicado — é só um dado de configuração (não um segredo), e por isso é lido diretamente de `meta_ad_accounts` (Epic 19), não reinventado como um novo secret/env var nesta story.

### Fallback de moeda quando `meta_ad_accounts.currency` é `null`
A coluna `currency` de `meta_ad_accounts` é nullable (migration `015`). Se, na prática, a conta ativa não tiver `currency` preenchida, o coletor usa `'BRL'` como fallback **documentado** (não uma invenção de taxa — apenas assume a moeda operacional padrão da Trifold, real estate em Maringá-PR, para não deixar a linha sem moeda, o que quebraria a regra "todo valor monetário tem moeda" usada pela 78-9). Se isso se mostrar incorreto na prática (conta em USD sem `currency` preenchida), é um ajuste de dado no cadastro do Epic 19, não um bug desta story.

### Agrupamento multi-conta (AC4) — por que importa mesmo com 1 conta esperada
Na prática, a Trifold opera com uma única conta de anúncios ativa hoje. Ainda assim, o coletor **não assume isso hardcoded** — ele soma por `(snapshot_date, currency)` para qualquer número de contas `active`, seguindo o mesmo princípio já validado pela Story 78-9 (AC7: nunca somar moedas diferentes). Isso evita retrabalho futuro caso uma segunda conta de anúncios seja conectada via Epic 19 sem que ninguém lembre de revisitar este coletor.

### Formato de resposta da Graph API (`insights`, `time_increment=1`)
Com `time_increment: '1'`, a resposta de `/insights` retorna **uma linha por dia** dentro do `time_range`, cada uma com `spend` (string, ex. `"123.45"`) e `date_start`/`date_stop` (mesmo formato já tratado em `meta-sync-insights/route.ts`, campo `InsightBase.spend`/`date_start`). Cada linha vira uma `CostSnapshotRow` com `snapshot_date: i.date_start`, `value: parseFloat(i.spend)`.

```ts
// packages/web/src/lib/billing-collectors/meta-ads.ts (esqueleto de referência)
import { metaFetch } from "@trifold/shared"
import type { BillingCollector, CostSnapshotRow } from "./types"

interface MetaAdsInsightRow {
  spend: string
  date_start: string
}

export function createMetaAdsCollector(admin: SupabaseClient): BillingCollector {
  return {
    serviceSlug: "meta_ads",
    async collect(window) {
      const token = process.env.META_SYSTEM_USER_TOKEN
      if (!token) throw new MetaAdsTokenMissingError() // tratado como 503 pela rota (AC8)

      const { data: accounts } = await admin
        .from("meta_ad_accounts")
        .select("meta_account_id, currency")
        .eq("status", "active")

      if (!accounts || accounts.length === 0) {
        // estado válido, não é falha (AC3)
        return [{
          snapshot_date: window.to,
          metric: "ad_spend",
          value: 0,
          currency: null,
          collection_status: "no_data",
        }]
      }

      // acumula por (date, currency) — AC4
      const totals = new Map<string, number>() // key: `${date}|${currency}`
      for (const account of accounts) {
        const currency = account.currency ?? "BRL"
        const rows = await metaFetch<{ data: MetaAdsInsightRow[] }>(
          `${account.meta_account_id}/insights`,
          token,
          {
            params: {
              fields: "spend",
              time_range: JSON.stringify({ since: window.from, until: window.to }),
              time_increment: "1",
            },
          },
        )
        for (const row of rows.data) {
          const key = `${row.date_start}|${currency}`
          totals.set(key, (totals.get(key) ?? 0) + parseFloat(row.spend))
        }
      }

      return Array.from(totals.entries()).map(([key, value]) => {
        const [snapshot_date, currency] = key.split("|")
        return { snapshot_date, metric: "ad_spend", value, currency, collection_status: "ok" }
      })
    },
  }
}
```
Este esqueleto reusa `runCollector()` (78-3) inalterado — o runner já sabe resolver `service_id` pelo slug `meta_ads` (já seedado na 78-1), fazer o upsert com `onConflict: 'service_id,snapshot_date,metric'` e isolar falhas.

### Categorização — como a UI (78-9) já evita somar ao total de infraestrutura
A Story 78-9 já implementa a regra de exclusão (Dev Notes/AC5 daquela story: "total consolidado do mês exclui Meta Ads"), filtrando por `slug != 'meta_ads'` (ou, equivalentemente, por `category != 'ads'`, já que `meta_ads` é o único serviço do catálogo com `category='ads'`, seedado assim na 78-1) antes de somar. Esta story **não precisa alterar nada na 78-9** — só precisa não quebrar essa suposição: (a) manter `metric='ad_spend'` sempre com `currency` preenchida (nunca `null`), e (b) não alterar `platform_services.slug`/`category` do registro `meta_ads` além do flag `enabled`. Se no futuro a 78-9 for revisada e essa exclusão for removida/alterada, isso seria uma mudança na própria 78-9, não nesta story.

### `vercel.json` — horário de cron escolhido
Horários já ocupados (reais, confirmados em `packages/web/vercel.json`): `*/30` (enrich-leads, webhook-health, calendly-sync, appointment-whatsapp-reminders), `0 */2` (followup), `*/3` (campaign-poll, roleta-retry), `0 8` (keep-alive), `0 */4` (meta-sync-entities, meta-sync-health), `0 9` (meta-sync-insights), `0 11` (email-automations, meta-ads-intelligence), `0 12` (appointment-email-reminders), `0 2 * * 1` (analytics-report), `0 6 * * 1` (meta-sync-placement), `0 */6` (obras-approval-reminder), `0 4` (purge-rejected-uploads), `59 10` (daily-report), `*/10` (sla-alerts), `*/5` (bolsao-rebalance), `0 12,15,18,21` (boleto-scan). Além disso, as demais stories-irmãs de coletores de billing deste mesmo épico já reservaram (algumas como Draft ainda não aplicado ao `vercel.json` real, outras já existentes como story formal no repositório) os seguintes minutos dentro da mesma janela `10:xx UTC`: 78-3 `"0 10"` (Anthropic), 78-4 `"15 10"` (OpenAI), 78-5 `"20 10"` (Vercel), 78-6 `"30 10"` (WhatsApp — **já existe como story real no repositório**, confirmado por leitura direta do arquivo, não apenas planejado). Esta story usa `"35 10 * * *"` (10:35 UTC = 07:35 BRT) — livre, depois de todos os anteriores e antes do `daily-report` (`59 10`), e depois do `meta-sync-insights` (`0 9`) para não competir por rate-limit da Graph API do Meta no mesmo minuto (mesma conta de anúncios é lida por ambos os fluxos, embora com tokens diferentes).

### Numeração de migration (confirmar no momento do `*develop`)
Na data de criação desta story, `163_pastas_imobiliaria_fk.sql` é a última migration real aplicada no repositório; a migration `164` (Story 78-1) **ainda não foi criada** (78-1 está em Status `Ready`, aguardando implementação pelo @data-engineer). Portanto:
- Se, no momento de implementar esta story, `164_platform_services_billing.sql` já existir → esta story usa `165_enable_meta_ads_billing_module.sql`.
- Se `164` ainda não existir → esta story está **bloqueada** de criar sua migration (T1.5) até a 78-1 ser implementada e aplicada, pois a tabela `platform_services` e a linha seed `meta_ads` são pré-requisito direto do `UPDATE` desta story. O código do coletor (T2/T3) pode ser escrito e revisado antes disso, mas a migration de ativação (T4) não.

### Testing Standards
- Não há suíte de testes automatizados para os coletores de billing neste momento (mesmo padrão observado nas Stories 78-1/78-3) — validação é manual em DEV chamando a rota diretamente e inspecionando `service_cost_snapshots` e `platform_services.enabled`.
- Se o @dev optar por mockar `metaFetch` com Vitest, é um adicional bem-vindo, não bloqueante (mesma nota da 78-3).

---

## Testing

### Abordagem
- Validação manual em ambiente DEV (Supabase `xnxvygyfyyyzwhiuoehz`), chamando `/api/cron/billing-collect-meta-ads` diretamente com headers corretos/incorretos, e aplicando a migration de ativação separadamente.

### Cenários de teste

1. **Auth ausente:** Chamar a rota sem header `Authorization` → 401.
2. **Secret de cron não configurado:** Ambiente sem `CRON_SECRET` → 503.
3. **Secret Meta ausente:** Com `CRON_SECRET` correto mas sem `META_SYSTEM_USER_TOKEN` → 503, nenhuma linha nova em `service_cost_snapshots`.
4. **Coleta bem-sucedida (1 conta ativa):** Com ambos os secrets e ao menos 1 linha `active` em `meta_ad_accounts` → linha(s) `metric='ad_spend', collection_status='ok'` gravadas para o `service_id` do slug `meta_ads`.
5. **Sem conta ativa:** Com `meta_ad_accounts` sem nenhuma linha `active` → linha `collection_status='no_data'`, não `'error'`.
6. **Idempotência (AC10):** Rodar a rota duas vezes para a mesma janela → `count(*)` de `(service_id, snapshot_date, 'ad_spend')` é `1`.
7. **Falha isolada (AC9):** Simular falha (ex. `META_SYSTEM_USER_TOKEN` temporariamente inválido, gerando `MetaOAuthException`) → resposta 200 com `status: 'error'` no corpo, linha `collection_status='error'` gravada.
8. **Múltiplas contas/moedas (AC4):** Inserir 2 linhas de teste em `meta_ad_accounts` com `currency` diferentes → confirmar 2 `CostSnapshotRow` distintas por dia (uma por moeda), nunca somadas entre si.
9. **Ativação do módulo (AC6):** Após aplicar a migration de ativação, `SELECT enabled FROM platform_services WHERE slug='meta_ads'` retorna `true`; reexecutar a migration não altera nada nem falha.
10. **Integração visual com 78-9 (se já implementada):** Com o módulo ativado e ao menos um snapshot `ad_spend` gravado, a seção "Budget de Mídia — Meta Ads" passa a aparecer na página `/dashboard/sistema/billing`, e o total consolidado de infraestrutura **não** inclui esse valor.

---

## Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| R1 | `META_SYSTEM_USER_TOKEN` ainda não provisionada (pré-requisito humano #3 da 78-2 `PENDENTE`) impede validação end-to-end completa | Alta (conhecida) | AC8 garante degradação graciosa (503); T5.3/T5.4 ficam pendentes até a 78-2 concluir o provisionamento |
| R2 | Migration `164` (78-1) ainda não aplicada quando esta story for implementada, bloqueando a migration de ativação (T4) | Média (conhecida) | Dev Notes documenta explicitamente a dependência sequencial; T1.5/T1.1 exigem confirmação antes de prosseguir |
| R3 | Confundir o token de billing (`META_SYSTEM_USER_TOKEN`) com o token de produto já existente (`meta_ad_accounts.access_token`, Epic 19) | Média | Dev Notes explicita a diferença e a razão (separação de credenciais de alto privilégio, NFR-1); nomes de variável/origem distintos no código |
| R4 | Múltiplas contas de anúncios ativas com moedas diferentes serem somadas incorretamente num único valor | Baixa | AC4 exige agrupamento por `(date, currency)`; teste 8 cobre isso |
| R5 | Gasto de mídia acabar sendo somado ao total "a pagar" de infraestrutura na UI, violando CON-8 | Baixa (mitigada por design da 78-9, já implementada) | Dev Notes reafirma que a exclusão já existe na 78-9 e que esta story não a modifica; teste 10 valida a integração |
| R6 | Cron novo em `vercel.json` colidir de horário com outro cron (incluindo os horários reservados por 78-3/78-4/78-5 e o já aplicado pela 78-6) | Baixa | Dev Notes lista todos os horários ocupados; `"35 10 * * *"` escolhido como livre depois de todos eles |

---

## Dependencies

- **Depende de:** Story 78-1 (Status: Ready — schema `platform_services`/`service_cost_snapshots`, seed `meta_ads` com `enabled=false`; **bloqueante direta** para a migration de ativação, T4), Story 78-3 (Status: Draft — contrato `BillingCollector`/`run-collector.ts`, **bloqueante direta** para o código do coletor, T2/T3), Story 78-2 (Status: Draft — secret `META_SYSTEM_USER_TOKEN` com escopo `ads_read`; pré-requisito humano #3 ainda `PENDENTE` — ver "Dependências explícitas" da Story 78-3 para o mesmo padrão de dependência funcional não-bloqueante de implementação, AC8 cobre a ausência).
- **Consome (sem modificar):** Story 78-9 (Status: Draft — a seção condicional Meta Ads e a exclusão do total consolidado já estão especificadas lá; esta story só ativa o flag que a 78-9 já verifica).
- **Bloqueia:** nada diretamente — é a última story planejada do épico (§7). Fecha o Definition of Done do épico no item "Meta Ads exibido em seção própria (budget de mídia), sem somar ao total 'a pagar'".
- **Dependências técnicas:**
  - `packages/web/src/lib/billing-collectors/types.ts` e `run-collector.ts` (Story 78-3)
  - `packages/shared/src/meta/client.ts` (`metaFetch`)
  - `packages/web/src/lib/supabase/admin.ts` (`createAdminClient()`)
  - `packages/web/src/lib/logger.ts` (`logEvent()`)
  - `packages/web/vercel.json` (registro de cron)
  - Tabela `meta_ad_accounts` (Epic 19, migration `015_meta_marketing_api.sql`) — leitura apenas

---

## Definition of Done

- [ ] `packages/web/src/lib/billing-collectors/meta-ads.ts` criado, implementando `BillingCollector` sem alterar `types.ts`/`run-collector.ts`
- [ ] `packages/web/src/app/api/cron/billing-collect-meta-ads/route.ts` criado com auth `CRON_SECRET` idêntico ao padrão existente
- [ ] Migration `{N}_enable_meta_ads_billing_module.sql` criada e aplicada, ativando `platform_services.enabled=true WHERE slug='meta_ads'` de forma idempotente
- [ ] `packages/web/vercel.json` atualizado com o novo cron (`"35 10 * * *"`), sem colisão
- [ ] Validação manual em DEV: auth ausente (401), secret de cron ausente (503), secret Meta ausente (503 sem gravar), coleta com sucesso (linha `ad_spend`), sem conta ativa (`no_data`), idempotência (sem duplicata), falha isolada (200 + `collection_status='error'`), múltiplas moedas não somadas
- [ ] Nenhuma alteração feita em `packages/web/src/app/api/cron/meta-sync-insights/route.ts`, `meta_insights_daily`, ou `meta_ad_accounts.access_token` (Epic 19 intocado)
- [ ] Nenhuma alteração feita nos arquivos da Story 78-9 (UI já trata a ativação do flag corretamente)
- [ ] @architect executou quality gate com verdict PASS ou CONCERNS documentados e aceitos (foco: aderência ao contrato de coletor da 78-3, categorização correta para não somar ao total de infraestrutura)
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
| 2026-07-08 | 0.1 | Story criada a partir do Epic 78 (§7, story 78-10) após decisão do usuário (2026-07-08) de resolver a OQ-2: Meta Ads **incluído** como módulo separado (não mais opcional). Coletor Meta Ads adapta o contrato `BillingCollector` da Story 78-3 (`packages/web/src/lib/billing-collectors/meta-ads.ts`), reusando `metaFetch` de `packages/shared/src/meta/client.ts` (em vez de `fetch()` bruto, diferente da 78-3 que não tinha cliente genérico prévio). Ativa o módulo via migration idempotente (`UPDATE platform_services SET enabled=true WHERE slug='meta_ads'`). Categorização (`metric='ad_spend'`, `currency` sempre preenchida) mantém compatibilidade com a exclusão do total consolidado já implementada na Story 78-9 (não modificada por esta story). [AUTO-DECISION] `meta_account_id` obtido de `meta_ad_accounts` (Epic 19, já existente) em vez de criar um novo campo de configuração → reason: IDS REUSE > CREATE; o identificador da conta de anúncios não é um segredo, já está corretamente modelado e mantido por outra feature do projeto. [AUTO-DECISION] Autenticação via `META_SYSTEM_USER_TOKEN` (78-2) em vez do `access_token` por-organização já existente em `meta_ad_accounts` → reason: NFR-1 do épico (credenciais de billing/admin são de alto privilégio e devem ser providas/rotacionadas separadamente das credenciais de produto), mesmo que ambas eventualmente autentiquem contra a mesma conta de anúncios na prática. [AUTO-DECISION] Fallback de moeda `'BRL'` quando `meta_ad_accounts.currency` é `null` → reason: contrato exige `currency` sempre preenchida para métricas monetárias (78-1/78-9); `BRL` é a moeda operacional padrão do negócio (Maringá-PR), não uma taxa de conversão inventada (NFR-7 não é violado, pois nenhuma conversão é aplicada — é só a moeda assumida quando ausente). [AUTO-DECISION] Horário de cron `"35 10 * * *"` escolhido por não colidir com nenhum horário real já ocupado em `vercel.json`, nem com os horários reservados/já existentes das stories-irmãs de coletor (78-3 `"0 10"`, 78-4 `"15 10"`, 78-5 `"20 10"`, 78-6 `"30 10"` — esta última já confirmada como story real no repositório, não apenas planejada) → reason: evitar picos de execução simultânea e competição por rate-limit da Graph API do Meta no mesmo horário do `meta-sync-insights`. [AUTO-DECISION] Migration desta story nomeada condicionalmente (`165` se `164` da 78-1 já existir; bloqueada até lá caso contrário) → reason: `164` ainda não foi criada no repositório na data desta story (78-1 está em Status Ready, não implementada); Artigo IV — não inventar um número de migration que pode colidir com o que o @data-engineer efetivamente criar para a 78-1. | @sm (River) |
| 2026-07-08 | 0.2 | **Validação cruzada do backlog do Epic 78 (@po Pax) — GO, Status Draft → Ready.** Adaptação do contrato da 78-3 com reuso de `metaFetch` (`packages/shared/src/meta/client.ts`) validada como diferença de implementação legítima (contrato `BillingCollector` preservado). Separação correta do Epic 19 (lê `meta_ad_accounts` só para `meta_account_id`; não escreve em `meta_insights_daily`; usa `META_SYSTEM_USER_TOKEN` de billing, não `access_token` por-org — NFR-1). Categorização `metric='ad_spend'`/`currency` sempre preenchida + exclusão por slug na 78-9 garante CON-8 (não soma ao "a pagar"). Migration de ativação idempotente; numeração `165` condicional a `164` (78-1) confirmada coerente (última real no repo = `163`). Horário de cron `"35 10"` confirmado livre. | @po (Pax) |

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
