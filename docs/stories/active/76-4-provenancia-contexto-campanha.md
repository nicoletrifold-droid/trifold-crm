# Story 76-4 — Proveniência dos Dados Meta no Contexto de Campanha Específica

## Metadata
- **Epic:** 76 — Proveniência e Performance dos Dados Meta Ads no Agente de Tráfego
- **Story:** 76-4
- **Status:** InReview — QA Gate: PASS (Quinn)
- **Priority:** P1 — SHOULD (lacuna identificada durante a implementação de 76-1; o usuário mais precisa de proveniência exatamente quando está focado numa campanha específica)
- **Complexity:** S (2-4h)
- **Story Points:** 3
- **MoSCoW:** SHOULD
- **Created:** 2026-06-22
- **Author:** @sm (River)

> **CodeRabbit Integration:** Disabled — validação manual pelo @architect.

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @architect (Aria)
- **Quality Gate Tools:** `[provenance_campaign_context_check, staleness_alert_test, tenant_isolation_check, no_duplication_check]`
- **Depende de:** Story 76-1 Done (helpers `computeProvenance`, `formatProvenanceBlock`, `safeProvenanceData` exportados de `context-builder.ts`)
- **Paralelizável com:** — (depende de 76-1)
- **Bloqueia:** —

---

## User Story

**Como** gestor de tráfego usando o agente de chat focado em uma campanha específica,
**Quero** que o agente informe quando os dados daquela campanha foram coletados e me avise quando estiverem defasados,
**Para que** eu possa validar a origem dos números antes de tomar decisões sobre aquela campanha específica — exatamente o momento em que mais preciso confiar na recência do dado.

---

## Context

### O Débito Técnico de 76-1

A Story 76-1 adicionou o bloco de proveniência `[PROVENIÊNCIA DOS DADOS META ADS]` **apenas** a `buildGlobalContext` (header `CONTEXTO META ADS`, `context-builder.ts` ~l.316). Por decisão explícita de escopo (Article IV), `buildCampaignContext` (header `CONTEXTO CAMPANHA`, ~l.484) ficou sem o bloco — as AC de 76-1 referenciavam apenas o cabeçalho Meta Ads global.

O @dev registrou o débito nas Completion Notes de 76-1:

> "**[DECISÃO DE ESCOPO]** A proveniência foi adicionada apenas a `buildGlobalContext` [...]. `buildCampaignContext` [...] NÃO recebeu o bloco — as AC referenciam explicitamente o cabeçalho Meta Ads global. Adicionar ao contexto de campanha seria fora do escopo desta story (Article IV). **Débito técnico sugerido:** estender proveniência ao contexto de campanha em story futura, se desejado."

### Por que isso importa

Quando o usuário abre o chat focado em **uma campanha específica** (`contextId = metaCampaignId`), o agente usa `buildCampaignContext` e reporta métricas detalhadas (spend 30d, funil CRM, adsets, placement). É exatamente **neste cenário** que o usuário está avaliando números de uma campanha para tomar uma decisão — e é onde mais precisa saber **de quando é o dado**.

Sem o bloco de proveniência em `buildCampaignContext`, o agente não sabe informar ao usuário se os dados da campanha específica estão defasados ou se o último sync daquelas métricas falhou.

### Reutilização Total — Sem Duplicação

A Story 76-1 criou e **exportou** os seguintes helpers de `context-builder.ts`:

| Helper | Localização (pós-76-1) | Uso aqui |
|---|---|---|
| `STALENESS_THRESHOLD_HOURS` | l.66 (constante exportada) | Mesmo threshold |
| `ProvenanceBlock` (tipo) | l.84 (interface exportada) | Mesmo tipo |
| `computeProvenance(...)` | l.105 (função exportada) | Calcular staleness/isError |
| `formatProvenanceBlock(block, today)` | l.154 (função exportada) | Formatar bloco textual |
| `safeProvenanceData<T>(promise)` | l.179 (função — confirmar export) | Envolver queries fail-safe |

Esta story **não duplica** nenhum desses helpers. Apenas adiciona as 3 queries de proveniência ao `Promise.all` de `buildCampaignContext` e chama os helpers já existentes.

### Diferença em relação ao bloco global

A principal diferença é a query de `MAX(synced_at)`: no contexto de campanha, ela é filtrada por `entity_id = metaCampaignId` e `level = 'campaign'` (além de `org_id` e janela de datas), refletindo a recência dos dados **daquela campanha**, não da org inteira. As outras duas queries (`meta_ad_accounts.last_synced_at` e `meta_sync_log`) são idênticas às de `buildGlobalContext` — o sync é feito a nível de org, não por campanha.

### Janela de Datas de `buildCampaignContext`

```typescript
const today = new Date().toISOString().split("T")[0]!
const date30dAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0]! })()
```

A query de proveniência usa `date30dAgo` e `today` como bounds — alinhado com a janela já consultada pelas queries de insights da campanha.

---

## Acceptance Criteria

- [x] **AC1 (Queries de proveniência da campanha no Promise.all):** O `buildCampaignContext` inclui 3 queries de proveniência adicionadas ao `Promise.all` existente (~l.390), sem round-trips extras:
  - Query-prov-A: `safeProvenanceData` em `meta_insights_daily` com `.select("synced_at")`, `.eq("org_id", orgId)`, `.eq("level", "campaign")`, `.eq("entity_id", metaCampaignId)`, `.gte("date", date30dAgo)`, `.lte("date", today)`, `.order("synced_at", { ascending: false })`, `.limit(1)`, `.maybeSingle()` — equivale a `MAX(synced_at)` para a campanha na janela de 30d.
  - Query-prov-B: `safeProvenanceData` em `meta_ad_accounts` com `.select("last_synced_at")`, `.eq("org_id", orgId)`, `.order("updated_at", { ascending: false })`, `.limit(1)`, `.maybeSingle()` — idêntica ao global.
  - Query-prov-C: `safeProvenanceData` em `meta_sync_log` com `.select("status, finished_at, error_message")`, `.eq("org_id", orgId)`, `.order("started_at", { ascending: false })`, `.limit(1)`, `.maybeSingle()` — idêntica ao global.

- [x] **AC2 (Reutilização dos helpers — sem duplicação):** `computeProvenance` e `formatProvenanceBlock` são chamados com os resultados das 3 queries. Nenhuma cópia ou re-implementação dos helpers é feita. Se `safeProvenanceData` não estiver exportada em 76-1, torná-la exportada (modificação mínima e backward-compatible).

- [x] **AC3 (Bloco de proveniência no header de campanha):**
  - **Given** `buildCampaignContext` é chamado com um `metaCampaignId` válido,
  - **When** o contexto de campanha é montado,
  - **Then** o bloco `[PROVENIÊNCIA DOS DADOS META ADS]` aparece logo após a linha `CONTEXTO CAMPANHA: "${campaign.name}"`, usando o mesmo formato textual de `formatProvenanceBlock`.

- [x] **AC4 (Recência reflete a campanha e janela específicas):**
  - **Given** a campanha tem registros em `meta_insights_daily` com `synced_at` populado na janela de 30 dias,
  - **When** `buildCampaignContext` monta o bloco de proveniência,
  - **Then** o campo `Dados coletados da Meta API em:` reflete o `MAX(synced_at)` filtrado por `entity_id = metaCampaignId` e `level = 'campaign'` — não o MAX global da org.

- [x] **AC5 (Fail-transparente — sem dado na janela):**
  - **Given** a campanha não tem registros de `meta_insights_daily` na janela de 30 dias (campanha nova ou pausada),
  - **When** o bloco de proveniência é calculado,
  - **Then** o campo de recência exibe `"indisponível"` e `isStale = false` (ausência de dado ≠ dado defasado), sem propagar erro nem inventar data (NFR-OBS-1). `safeProvenanceData` garante isso.

- [x] **AC6 (Cache existente inclui proveniência da campanha):** As 3 queries de proveniência são incluídas no `Promise.all` que alimenta o cache `campaign:{orgId}:{metaCampaignId}` de 5min. O bloco de proveniência expira e é renovado junto com o restante do contexto de campanha (NFR-PERF-1).

- [x] **AC7 (Isolamento multi-tenant):** Todas as 3 queries filtram por `org_id`. Query-prov-A também filtra por `entity_id = metaCampaignId`. Nenhum dado de sync ou insights de outra org vaza para o contexto (NFR-TENANCY-1).

- [x] **AC8 (Alerta de staleness coerente com o global):**
  - **Given** `isStale = true` (sync > 36h) ou `isError = true` (último sync com erro) no contexto da campanha,
  - **When** o agente reporta métricas da campanha,
  - **Then** o agente alerta o usuário — sem alterar `AGENT_SYSTEM_PROMPT` (as instruções de 76-1 já cobrem esse comportamento para qualquer bloco de proveniência presente no contexto).

- [x] **AC9 (TypeScript + ESLint):** `pnpm --filter @trifold/web type-check` → zero erros nos arquivos desta story. ESLint → zero erros.

---

## Tasks / Subtasks

### @dev (Dex)

- [x] **T1 — Confirmar que `safeProvenanceData` está exportada (pré-condição) (AC2)**
  - [x] Verificar em `context-builder.ts` se `safeProvenanceData` tem `export` keyword
  - [x] Se não: adicionar `export` (mudança de 1 palavra, backward-compatible; `buildGlobalContext` continua usando internamente sem alteração de comportamento)

- [x] **T2 — Adicionar 3 queries de proveniência ao `Promise.all` de `buildCampaignContext` (AC1, AC4, AC6, AC7)**
  - [x] Expandir o destructuring em ~l.390 para incluir `provInsightsRes`, `provAccountRes`, `provSyncLogRes`
  - [x] Query-prov-A: `safeProvenanceData` em `meta_insights_daily` filtrado por `orgId`, `level = 'campaign'`, `entity_id = metaCampaignId`, `date >= date30dAgo`, `date <= today`, `.order("synced_at", desc)`, `.limit(1)`, `.maybeSingle()` — reflete MAX(synced_at) da janela da campanha
  - [x] Query-prov-B: `safeProvenanceData` em `meta_ad_accounts` — copiar exatamente a mesma query de `buildGlobalContext` (~l.251)
  - [x] Query-prov-C: `safeProvenanceData` em `meta_sync_log` — copiar exatamente a mesma query de `buildGlobalContext` (~l.261)
  - [x] Garantir que as 3 queries ficam dentro do `Promise.all`, não sequencialmente após ele

- [x] **T3 — Calcular proveniência e injetar bloco no header de campanha (AC2, AC3, AC5, AC8)**
  - [x] Chamar `computeProvenance({ syncedAt: provInsightsRes?.synced_at ?? null, lastAccountSync: provAccountRes?.last_synced_at ?? null, lastSyncStatus: provSyncLogRes?.status ?? null, lastSyncFinishedAt: provSyncLogRes?.finished_at ?? null, lastSyncError: provSyncLogRes?.error_message ?? null })` — mesmos campos que o global
  - [x] Chamar `formatProvenanceBlock(provenance, today)` para obter o texto
  - [x] Injetar `lines.push(formatProvenanceBlock(provenance, today))` logo após `lines.push(`CONTEXTO CAMPANHA: "${campaign.name}"`)` (~l.484)
  - [x] Verificar que o header da campanha mantém a linha `ID Meta: ${metaCampaignId}` após o bloco de proveniência (manter estrutura existente)

- [x] **T4 — Testes Vitest para proveniência no `buildCampaignContext` (AC4, AC5, AC7)**
  - [x] Adicionar casos de teste em `packages/web/src/lib/agent/__tests__/provenance.test.ts` (arquivo já criado em 76-1)
  - [x] Caso: campanha com `synced_at` na janela → bloco com data correta da campanha
  - [x] Caso: campanha sem `synced_at` na janela (`null`) → campo exibe "indisponível", sem erro
  - [x] Caso: `computeProvenance` com dados de campanha (synced_at da campanha vs. global) → verifica que o valor correto é propagado
  - [x] Executar `pnpm --filter @trifold/web test src/lib/agent/__tests__/provenance.test.ts` → todos passam

- [x] **T5 — Type-check + lint (AC9)**
  - [x] `pnpm --filter @trifold/web type-check` → zero erros nos arquivos desta story
  - [x] ESLint → zero erros nos arquivos desta story

---

## Dev Notes

### Arquivos-Chave

| Arquivo | Ação | Âncoras |
|---|---|---|
| `packages/web/src/lib/agent/context-builder.ts` | MODIFICAR | ~l.179 (`safeProvenanceData` — verificar export); ~l.367 (`buildCampaignContext` — início); ~l.390 (`Promise.all` — adicionar 3 queries); ~l.484 (`lines.push` header CONTEXTO CAMPANHA — injetar bloco após) |
| `packages/web/src/lib/agent/__tests__/provenance.test.ts` | MODIFICAR | Arquivo criado em 76-1 — adicionar casos de campanha |

### Estrutura de `buildCampaignContext` Após a Mudança

O `Promise.all` em ~l.390 passa de 5 para 8 elementos:

```typescript
// Antes (76-1): [insightsRes, adsetInsightsRes, alertsRes, leadsRes, placementRes]
// Depois (76-4): [insightsRes, adsetInsightsRes, alertsRes, leadsRes, placementRes, provInsightsRes, provAccountRes, provSyncLogRes]
const [insightsRes, adsetInsightsRes, alertsRes, leadsRes, placementRes, provInsightsRes, provAccountRes, provSyncLogRes] = await Promise.all([
  // ... 5 queries existentes (não tocar) ...
  safeProvenanceData<{ synced_at: string | null }>(
    supabase
      .from("meta_insights_daily")
      .select("synced_at")
      .eq("org_id", orgId)
      .eq("level", "campaign")
      .eq("entity_id", metaCampaignId)
      .gte("date", date30dAgo)
      .lte("date", today)
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ),
  safeProvenanceData<{ last_synced_at: string | null }>(
    supabase
      .from("meta_ad_accounts")
      .select("last_synced_at")
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ),
  safeProvenanceData<{ status: string | null; finished_at: string | null; error_message: string | null }>(
    supabase
      .from("meta_sync_log")
      .select("status, finished_at, error_message")
      .eq("org_id", orgId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ),
])
```

### Injeção do Bloco no Header

Após o `Promise.all` (e após o early-return `if (!campaign) return ...`), adicionar:

```typescript
const provenance = computeProvenance({
  syncedAt: provInsightsRes?.synced_at ?? null,
  lastAccountSync: provAccountRes?.last_synced_at ?? null,
  lastSyncStatus: provSyncLogRes?.status ?? null,
  lastSyncFinishedAt: provSyncLogRes?.finished_at ?? null,
  lastSyncError: provSyncLogRes?.error_message ?? null,
})
```

No bloco de montagem de `lines` (~l.481+), logo após o header:

```typescript
lines.push(`CONTEXTO CAMPANHA: "${campaign.name}"`)
lines.push(formatProvenanceBlock(provenance, today))  // ← NOVO (76-4)
lines.push(`Status: ${campaign.status} | ...`)         // linha existente — não mover
```

### Verificação de Export de `safeProvenanceData`

Verificar se `safeProvenanceData` tem `export` keyword (~l.179 atual). Em 76-1 foi definida como `function safeProvenanceData<T>` — confirmar no arquivo atual. Se não exportada, adicionar `export` é a única mudança necessária no escopo de 76-1 (não altera assinatura nem comportamento).

### Parâmetros de `computeProvenance`

Verificar a assinatura exata de `computeProvenance` no arquivo atual (~l.105) antes de chamar — a interface de entrada pode ter nomes de campos ligeiramente diferentes da referência acima. Confirmar com o código gerado em 76-1 (Dev Agent Record mostra: `computeProvenance` recebe objeto `ProvenanceQueryResult`; confirmar a interface exportada).

### Por que Query-prov-B e Query-prov-C são idênticas ao global

O sync de dados Meta é feito a nível de **org** (crons `meta-sync-entities`, `meta-sync-insights`), não por campanha. Portanto, `meta_ad_accounts.last_synced_at` e `meta_sync_log` são igualmente válidos no contexto de campanha — informam ao agente sobre o ciclo de sync da org, não específico de uma campanha. O diferencial de proveniência por campanha é exclusivamente o `MAX(synced_at)` de `meta_insights_daily` filtrado por `entity_id`.

### Sem DDL

Esta story é **apenas TypeScript** — zero migrations SQL. Lê apenas colunas/tabelas já existentes (mesmas de 76-1).

### Sem alteração no `AGENT_SYSTEM_PROMPT`

As instruções de datação de coleta e alerta de staleness foram adicionadas em `system-prompt.ts` pela Story 76-1. Elas se aplicam a qualquer bloco `[PROVENIÊNCIA DOS DADOS META ADS]` presente no contexto — incluindo o novo bloco de campanha. Nenhuma alteração em `system-prompt.ts`.

### Índices Disponíveis para Query-prov-A

A query de proveniência em `meta_insights_daily` usa os filtros `org_id`, `level`, `entity_id`, `date`. O índice UNIQUE `(org_id, level, entity_id, date)` (migration 015:126) cobre exatamente esse padrão — o planner deve usar index scan, sem overhead de seq-scan.

### Testing

- Framework: **Vitest** (não Jest)
- Localização: `packages/web/src/lib/agent/__tests__/provenance.test.ts` (arquivo criado em 76-1 — adicionar casos, não criar arquivo novo)
- Os novos testes cobrem o comportamento de `computeProvenance` quando alimentado com dados de campanha (vs. global). A função pura `computeProvenance` já é testável em memória sem mock de Supabase.
- Comando: `pnpm --filter @trifold/web test src/lib/agent/__tests__/provenance.test.ts`

---

## Dev Agent Record

### File List

**Modificados:**
- `packages/web/src/lib/agent/context-builder.ts` — `provenanceQueryBuilders` ganhou parâmetro opcional `entityId` (aplicado SÓ na P1); `buildCampaignContext` adicionou `today`, expandiu o `Promise.all` (5→8) com o spread de `provenanceQueryBuilders(..., metaCampaignId)`, computou `computeProvenance` e injetou `formatProvenanceBlock` no header.
- `packages/web/src/lib/agent/__tests__/provenance.test.ts` — 3 casos de `computeProvenance` no contexto de campanha (synced_at da campanha, "indisponível", staleness via P3).
- `packages/web/src/lib/agent/__tests__/provenance-queries.test.ts` — mock estendido (`.or()`, `singleData` por tabela); 6 casos: filtro `entity_id` na P1 (com/sem), injeção do bloco no header, casamento de janela+entity_id, "indisponível" sem dado, isolamento por org_id em `buildCampaignContext`.

### Completion Notes

**Reconciliação de branch (pré-requisito crítico):** O ambiente foi spawnado com `feat/26-3-dados-ricos-criativos` em checkout — branch que descende de `main` recente e que **NÃO contém** os helpers de proveniência das stories 76-1/76-3 (`context-builder.ts` ali é a versão refatorada do main com `DateWindow`, sem proveniência). Os helpers vivem apenas em `feat/epic-76-meta-data-proveniencia-performance` (tip `fcf059c5`). O arquivo de story (untracked, só no disco) foi preservado no switch. **Implementação feita sobre `feat/epic-76-...`** — a branch onde os pré-requisitos e a validação do @po (l.628/650/744) realmente batem. (Contexto: o épico foi desenvolvido ~299 commits atrás de main e a fusão dropou/quebrou a proveniência em alguns pontos — ver memória devops `stale-branch-gates-green-typecheck-red`.)

**Decisão de design — sem duplicação (AC2):** Em vez de escrever a P1 da campanha inline (sugestão da story) ou só dar spread do helper (que a @po alertou ser insuficiente, pois a P1 não filtrava `entity_id`), **parametrizei `provenanceQueryBuilders` com `entityId?` opcional**, aplicado SOMENTE à P1. Isso mantém a FONTE ÚNICA de plumbing (ARCH-001): P2/P3 continuam idênticas e compartilhadas; `buildGlobalContext` chama sem `entityId` (zero mudança de comportamento, backward-compatible); `buildCampaignContext` chama com `metaCampaignId`. Consequência: **não precisei exportar `safeProvenanceData`** (T1/AC2) — passo pelo helper de nível mais alto, que já o usa internamente. Menos superfície pública exposta.

**Assinatura real usada (correção do @po confirmada):** `computeProvenance({ maxSyncedAt, lastAccountSync, syncLog })` — não os campos antigos da story. Mapeei `provMaxSyncedRow?.synced_at`, `provAccountRow?.last_synced_at`, `provSyncLogRow ?? null`.

**NFR-PERF-1:** as 3 queries entram no MESMO `Promise.all` (via spread) → sem round-trip extra; cacheadas junto no `campaign:{orgId}:{metaCampaignId}` (5min).

**Validações reais:** `tsc --noEmit` (web) limpo nos arquivos da story (resta só erro pré-existente de `react-email-editor` em `visual-editor.tsx`, sem relação — confirmado presente no HEAD limpo). ESLint limpo nos 3 arquivos. Vitest: suíte completa **564/564** (era 555 baseline + 9 novos), zero regressão.

**Sem alterações:** `system-prompt.ts` intocado (AC8). Nenhuma migration SQL.

---

## Riscos

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | `safeProvenanceData` não exportada em 76-1 — inviabiliza reutilização sem modificar arquivo de 76-1 | T1: verificar antes de iniciar; se não exportada, adicionar `export` é mudança mínima e backward-compatible |
| R2 | Assinatura de `computeProvenance` ou `ProvenanceQueryResult` difere da referência nesta story | T3: ler o arquivo atual antes de implementar — usar exatamente a assinatura presente no código |
| R3 | Campanha sem dados na janela de 30d → `synced_at` NULL → agente reporta "indisponível" como se não soubesse a recência | AC5: comportamento correto por NFR-OBS-1 — "indisponível" é melhor do que inventar uma data; documentar no bloco |
| R4 | Expandir o destructuring do Promise.all de 5 para 8 elementos aumenta risco de erro de ordem | T2: manter as 5 queries existentes inalteradas; adicionar as 3 novas ao final do array |
| R5 | 76-1 ainda não está Done (status Ready for Review) | Depende de 76-1 Done: @dev deve aguardar o QA gate de 76-1 antes de iniciar implementação |

---

## Out of Scope

- Qualquer modificação em `AGENT_SYSTEM_PROMPT` — as instruções de 76-1 já cobrem
- Aviso visual na UI (badge/banner) — isso é a Story 76-3
- Auditoria de índices — isso é a Story 76-2
- Re-ingestão de dados (crons, date_preset, Graph API)
- Proveniência em outros contextos além de `buildCampaignContext` (adsets, criativos específicos)
- Qualquer nova migration SQL

---

## Definition of Done

- [x] AC1–AC9 marcados como completos
- [x] T1–T5 marcados como done
- [x] `safeProvenanceData` reutilizada indiretamente via `provenanceQueryBuilders` (não precisou ser exportada — design alternativo, ver Completion Notes)
- [x] Bloco `[PROVENIÊNCIA DOS DADOS META ADS]` aparece no output de `buildCampaignContext` com `MAX(synced_at)` filtrado por campanha e janela de 30d
- [x] Testes Vitest passando (incluindo casos de campanha sem dados na janela) — suíte completa 564/564 sem regressão
- [ ] Agente, ao ser testado manualmente focado numa campanha, cita a data de coleta dos dados daquela campanha — pendente (teste manual/QA)
- [ ] @architect executou quality gate com verdict PASS
- [ ] @devops fez push

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-22 | v1.0 | Story criada — Epic 76, SHOULD, extensão da proveniência de 76-1 ao `buildCampaignContext`; débito técnico explicitado nas Completion Notes de 76-1; depende de 76-1 Done | @sm (River) |
| 2026-06-25 | v1.1 | **Validação PO — veredito GO (8/10).** Spot-checks no código real (`context-builder.ts` reconciliado pós-refactor 76-3): premissa central CONFIRMADA — `buildCampaignContext` (l.628) NÃO tem bloco de proveniência (Promise.all l.650 com 5 queries originais). Helpers `computeProvenance` (l.282), `formatProvenanceBlock` (l.331), `STALENESS_THRESHOLD_HOURS` (l.243), `ProvenanceBlock` (l.261) confirmados EXPORTADOS. **Drifts confirmados (já antecipados por R1/R2 da story):** (1) `safeProvenanceData` (l.472) NÃO está exportada — T1/R1 cobrem; (2) assinatura real de `computeProvenance` é `{ maxSyncedAt, lastAccountSync, syncLog }` — DIVERGE da referência da story (`{ syncedAt, lastSyncStatus, lastSyncFinishedAt, lastSyncError }`) — R2/Dev Notes já mandam ler a assinatura atual; (3) **NOVO helper `provenanceQueryBuilders` (l.387)** surgiu na 76-3, cujo P1 filtra `level='campaign'` mas NÃO por `entity_id` — @dev NÃO deve só dar spread desse helper em `buildCampaignContext`; precisa de variante com `.eq("entity_id", metaCampaignId)` (AC4/AC7). Âncoras de linha da story (~l.367/390/484) estão DESATUALIZADAS; valores reais: buildCampaignContext=628, Promise.all=650, header CONTEXTO CAMPANHA=744. Story permanece implementável — Dev Notes/R1/R2 já instruem o @dev a ler o arquivo atual antes de codar. Correções recomendadas (não-bloqueantes) listadas no relatório de validação. Status Draft → Ready. | @po (Pax) |
| 2026-06-25 | v1.2 | **Implementação — @dev (Dex).** Parametrizei `provenanceQueryBuilders` com `entityId?` opcional (P1-only) em vez de duplicar a query — mantém FONTE ÚNICA do plumbing (ARCH-001) e backward-compat com `buildGlobalContext`. `buildCampaignContext`: + `today`, Promise.all 5→8 via spread `provenanceQueryBuilders(..., metaCampaignId)`, `computeProvenance({maxSyncedAt, lastAccountSync, syncLog})` (assinatura real, conf. @po), bloco `formatProvenanceBlock` injetado após `CONTEXTO CAMPANHA`. `safeProvenanceData` NÃO precisou ser exportada (reuso via helper de alto nível). +9 testes Vitest (campanha com/sem synced_at, janela+entity_id, isolamento org_id). **Implementado em `feat/epic-76-...`** (a branch com os pré-requisitos 76-1/76-3; o spawn estava em `feat/26-3` sem os helpers). type-check + ESLint limpos nos arquivos da story; **564/564 Vitest** sem regressão. `system-prompt.ts` intocado; sem DDL. Status Ready → Ready for Review. | @dev (Dex) |
| 2026-06-25 | v1.3 | **QA Gate — PASS (Quinn).** 7 quality checks passam. Code review confirmou zero duplicação (helper `provenanceQueryBuilders` parametrizado com `entityId?`, NÃO query inline), 3 queries DENTRO do `Promise.all` via spread (sem round-trip), `buildGlobalContext` intocado (chamada sem entityId — backward-compat verificada em context-builder.ts:465). AC1–AC9 atendidos. SEC-001 da 76-3 não regride (error_message nunca renderizado no bloco). Validações REAIS re-executadas pelo @qa: type-check só com 3 erros pré-existentes de `react-email-editor` (visual-editor.tsx, fora do diff), ZERO nos arquivos da story; ESLint exit 0; **571/571 Vitest** (44 arquivos, 26 de proveniência) sem regressão. Gate: `docs/qa/gates/76.4-provenancia-contexto-campanha.yml`. Status Ready for Review → InReview. | @qa (Quinn) |

---

## QA Results

### Review Date: 2026-06-25

### Reviewed By: Quinn (Test Architect & Quality Advisor)

### Veredito: **PASS** ✅

Extensão limpa da proveniência da 76-1 ao contexto de campanha específica, com decisão de design superior à sugestão original da story: em vez de duplicar a P1 inline ou exportar `safeProvenanceData`, o @dev parametrizou o helper único `provenanceQueryBuilders` com um 4º parâmetro opcional `entityId`, aplicado SOMENTE à P1. Isso preserva a FONTE ÚNICA do plumbing (ARCH-001 da 76-3), garante backward-compat total de `buildGlobalContext` e reduz a superfície pública exposta. Nenhum issue bloqueante.

### Resultados das validações (re-executadas pelo @qa, não confiadas no relatório do @dev)

| Validação | Comando | Resultado real |
|---|---|---|
| Type-check | `pnpm --filter @trifold/web type-check` | Só 3 erros **pré-existentes** de `react-email-editor` em `visual-editor.tsx` (fora do diff desta story, confirmado por `git diff HEAD --stat`). **ZERO** erros em `context-builder.ts` e nos 2 arquivos de teste. |
| ESLint | `npx eslint` nos 3 arquivos | exit code **0**, sem output. |
| Vitest (suíte completa) | `npx vitest run` | **571/571** passed, 44 test files (era 564 no report do @dev — delta dos commits-irmãos de fix 76-1/2/3, não regressão). |
| Vitest (proveniência) | `npx vitest run .../provenance*.test.ts` | **26/26** passed. |

### 7 Quality Checks (story-lifecycle.md)

1. **Code review — PASS.** Diff de `context-builder.ts` lido: zero duplicação de helpers; P1 da campanha filtra `org_id` + `level='campaign'` + `entity_id=metaCampaignId` + `date∈[date30dAgo, today]` (`order synced_at desc, limit 1, maybeSingle` = MAX). As 3 queries de proveniência estão DENTRO do `Promise.all` (spread em :717), sem round-trip extra. `buildGlobalContext` (:465) e `fetchProvenance` (:465) chamam o helper sem `entityId` — comportamento inalterado.
2. **Unit tests — PASS.** 9 casos novos cobrem: campanha com `synced_at` na janela (data da campanha via `entity_id`), campanha sem dado na janela (→ "indisponível", `isStale=false`), isolamento `org_id`+`entity_id`, injeção do bloco antes da linha Status, casamento janela+entity_id, backward-compat (global sem entity_id). 26/26 verdes.
3. **Acceptance criteria — PASS.** AC1–AC9 atendidos (ver `ac_traceability` no gate). AC8 herda o comportamento da 76-1 sem alterar `AGENT_SYSTEM_PROMPT`.
4. **No regressions — PASS.** 571/571; `buildGlobalContext` e os blocos da 76-1/76-3 inalterados (mudança aditiva via param opcional).
5. **Performance — PASS (NFR-PERF-1).** 3 queries no MESMO `Promise.all`, cacheadas em `campaign:{orgId}:{metaCampaignId}` (5min). Índice UNIQUE `(org_id, level, entity_id, date)` cobre a P1.
6. **Security / Multi-tenant — PASS (NFR-TENANCY-1 + SEC-001).** Todas as queries filtram `org_id`; P1 também `entity_id`. `error_message` do sync NUNCA é renderizado no bloco — `formatProvenanceBlock` emite só o aviso genérico de ERRO (context-builder.ts:345). SEC-001 da 76-3 não regride.
7. **Documentation — PASS.** Dev Agent Record, File List e Change Log atualizados; decisão de design documentada nas Completion Notes.

### Top Issues

Nenhum. (Teste manual do agente focado numa campanha real permanece como polimento downstream não-bloqueante, conforme DoD da story — coberto logicamente pelos testes unitários.)

### Gate Status

Gate: PASS → docs/qa/gates/76.4-provenancia-contexto-campanha.yml

— Quinn, guardião da qualidade 🛡️
