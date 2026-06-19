# Story 52-8 — Seleção de Intervalo de Datas Específico no Agente

## Metadata
- **Epic:** 52 — Agente de Tráfego com Acesso Read-Only ao Pipeline do CRM
- **Story:** 52-8
- **Status:** Draft
- **Priority:** P2 — melhoria de usabilidade; complementa Story 52-7
- **Complexity:** M (1 migration SQL + TypeScript — ~4-6h)
- **Created:** 2026-06-19
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[typecheck, lint, regression_test]`

---

## User Story

**Como** administrador, supervisor ou gerente-comercial usando o agente de análise de tráfego no Trifold CRM,
**Quero** poder especificar um intervalo de datas exato na minha pergunta — como "de 1 a 15 de junho" ou "entre 01/06 e 15/06" —
**Para que** o agente me retorne análises com boundaries precisas de início e fim, não apenas uma janela relativa contada a partir de hoje.

---

## Context

A Story 52-7 adicionou `extractPeriodDays(msg): number` que suporta períodos **relativos** (últimos N dias a partir de hoje). Esta story adiciona suporte a intervalos de datas **absolutos**.

### Limitação atual

`extractPeriodDays("de 1 a 15 de junho")` retorna `30` (default) porque não reconhece o padrão. O resultado é uma análise dos últimos 30 dias, ignorando o intervalo pedido.

### Por que exige migration SQL

Os RPCs existentes aceitam apenas `p_days INTEGER`:
- `public.pipeline_funnel_by_campaign(p_days INTEGER DEFAULT 30)` — migration 096
- `public.creative_performance(p_days INTEGER DEFAULT 30)` — migration 101

`CURRENT_DATE - p_days` computa apenas a data de início (relativa a hoje) sem data de fim configurável. Para intervalos fechados (ex.: 01/06 → 15/06), os RPCs precisam de `p_start_date DATE, p_end_date DATE`.

`buildGlobalContext` usa queries diretas do SDK (`meta_insights_daily`, `meta_leads`) — essas serão atualizadas diretamente em TypeScript com `.gte("date", startDate).lte("date", endDate)`.

### Última migration aplicada
`103_messages_wamid_unique.sql` → próxima: `104_...`

---

## Scope

### IN (esta story entrega)

- **`extractDateWindow(msg: string): DateWindow`** exportada de `context-builder.ts` — detecta intervalos absolutos E períodos relativos; retorna sempre `{ startDate: string, endDate: string }` em ISO 8601 (`YYYY-MM-DD`). Substitui `extractPeriodDays` nas chamadas de `chat/route.ts` (sem remover `extractPeriodDays` — mantida para compatibilidade)
- **Tipo `DateWindow`**: `{ startDate: string; endDate: string }` exportado de `context-builder.ts`
- **Migration `104_agent_daterange_rpcs.sql`**: adiciona overload `p_start_date DATE, p_end_date DATE` às funções `pipeline_funnel_by_campaign` e `creative_performance` via `CREATE OR REPLACE`; mantém assinatura `p_days` existente como segunda função ou default calculado internamente
- **`buildGlobalContext(supabase, orgId, window?: DateWindow)`**: substitui `pDays?: number` por `window?: DateWindow`; usa `.gte("date", startDate).lte("date", endDate)` nas queries de `meta_insights_daily` e `meta_leads`
- **`fetchPipelineAggregates(supabase, orgId, window?: DateWindow)`**: passa `p_start_date`/`p_end_date` para o RPC
- **`fetchCreativePerformance(supabase, orgId, window?: DateWindow)`**: passa `p_start_date`/`p_end_date` para o RPC
- **`buildContext(supabase, orgId, contextType, contextId?, window?: DateWindow)`**: substitui `pDays?` por `window?`
- **Cache keys**: `global:{orgId}:{startDate}:{endDate}`, `creative_perf:{orgId}:{startDate}:{endDate}`
- **`chat/route.ts`**: substituir `extractPeriodDays(message)` por `extractDateWindow(message)`; atualizar calls de `buildContext`, `fetchPipelineAggregates`, `fetchCreativePerformance`
- **`AGENT_SYSTEM_PROMPT`**: atualizar seção `## Análise por período` para incluir exemplos de intervalos absolutos
- **Padrões de linguagem natural suportados** (documentados nos Dev Notes):
  - `"de 1 a 15 de junho"` / `"entre 1 e 15 de junho"`
  - `"de 01/06 a 15/06"` / `"01/06 a 15/06"`
  - `"de 01/06/2026 a 15/06/2026"`
  - `"junho"` / `"maio"` (mês completo → primeiro ao último dia do mês)
  - Todos os padrões relativos da 52-7 (últimos N dias, última semana, etc.)

### OUT (não entra nesta story)

- Intervalos maiores que 90 dias — RPCs não validados para janelas grandes
- Datas futuras — somente datas no passado ou hoje
- `buildCampaignContext` — contexto de campanha individual usa séries históricas completas
- UI de date picker — esta story é exclusivamente no agente conversacional
- Suporte a hora/minuto (granularidade é dia, não hora)
- Intervalos entre anos distintos (ex.: "dezembro de 2025 a janeiro de 2026") — complexidade de parsing fora do escopo

---

## Acceptance Criteria

- [ ] **AC1 — `extractDateWindow` detecta intervalos absolutos:**
  `extractDateWindow("de 1 a 15 de junho")` → `{ startDate: "2026-06-01", endDate: "2026-06-15" }`. `extractDateWindow("entre 01/06 e 30/06")` → `{ startDate: "2026-06-01", endDate: "2026-06-30" }`. `extractDateWindow("junho")` → `{ startDate: "2026-06-01", endDate: "2026-06-30" }`.

- [ ] **AC2 — `extractDateWindow` mantém comportamento relativo da 52-7:**
  `extractDateWindow("nos últimos 7 dias")` → `{ startDate: hoje-7, endDate: hoje }`. `extractDateWindow("sem hint")` → `{ startDate: hoje-30, endDate: hoje }`. A resolução de datas relativas é compatível com o comportamento atual de `extractPeriodDays`.

- [ ] **AC3 — Prioridade: absoluto > relativo:**
  `extractDateWindow("de 1 a 15 de junho, últimos 7 dias")` → o intervalo absoluto vence (`2026-06-01` a `2026-06-15`). Padrão absoluto tem prioridade sobre padrão relativo quando ambos estão presentes.

- [ ] **AC4 — RPCs aceitam `p_start_date` e `p_end_date`:**
  `SELECT * FROM pipeline_funnel_by_campaign('2026-06-01', '2026-06-15')` executa sem erro e retorna dados filtrados pelo intervalo. Idem para `creative_performance('2026-06-01', '2026-06-15')`.

- [ ] **AC5 — `buildGlobalContext` filtra por intervalo absoluto:**
  Dado `window = { startDate: "2026-06-01", endDate: "2026-06-15" }`, as queries de `meta_insights_daily` e `meta_leads` usam `.gte("date", "2026-06-01").lte("date", "2026-06-15")`.

- [ ] **AC6 — `chat/route.ts` usa `extractDateWindow` e propaga `DateWindow`:**
  Dado que usuário envia "como foram as campanhas de 1 a 15 de junho?", `extractDateWindow` retorna o intervalo correto e o `DateWindow` é passado para `buildContext`, `fetchPipelineAggregates` e `fetchCreativePerformance`. Verificável via log de servidor.

- [ ] **AC7 — Cache keys incluem intervalo:**
  Dado `window = { startDate: "2026-06-01", endDate: "2026-06-15" }`, a cache key de `buildGlobalContext` é `global:{orgId}:2026-06-01:2026-06-15`. Chaves de períodos diferentes não colidem.

- [ ] **AC8 — Sem regressão para queries sem hint:**
  Dado que usuário envia "qual campanha tem melhor CTR?" (sem hint), `extractDateWindow` retorna `{ startDate: hoje-30, endDate: hoje }` e o comportamento é idêntico ao da 52-7.

- [ ] **AC9 — Cabeçalho exibe intervalo correto:**
  Para intervalo absoluto, o cabeçalho do portfólio exibe `=== PORTFÓLIO (01/06/2026 a 15/06/2026) ===`. Para relativo de 7 dias, exibe `=== PORTFÓLIO (últimos 7 dias) ===` (compatibilidade com 52-7).

- [ ] **AC10 — `AGENT_SYSTEM_PROMPT` documenta intervalos absolutos:**
  A seção `## Análise por período` inclui exemplos de intervalos fechados: "de 1 a 15 de junho", "entre 01/06 e 30/06", "junho" (mês completo).

- [ ] **AC11 — Typecheck e lint limpos:**
  `tsc --noEmit` e `eslint` nos arquivos modificados retornam zero erros ou warnings novos.

---

## Tasks / Subtasks

- [ ] **T1** — Pré-trabalho: ler contratos atuais
  - [ ] T1.1 — Ler `context-builder.ts` — assinaturas de `buildGlobalContext`, `buildContext`, `fetchPipelineAggregates`, `fetchCreativePerformance` e bloco de `extractPeriodDays`/`PERIOD_MAP`
  - [ ] T1.2 — Ler `chat/route.ts` — ponto de chamada de `extractPeriodDays` e propagação
  - [ ] T1.3 — Ler `supabase/migrations/096_crm_pipeline_readonly_layer.sql` — corpo completo de `pipeline_funnel_by_campaign` para adaptar a migration 104
  - [ ] T1.4 — Ler `supabase/migrations/101_creative_performance_with_crm.sql` — corpo completo de `creative_performance` para adaptar a migration 104
  - [ ] T1.5 — Ler `system-prompt.ts` — seção `## Análise por período` atual

- [ ] **T2** — Criar `DateWindow` e `extractDateWindow` em `context-builder.ts`
  - [ ] T2.1 — Exportar `type DateWindow = { startDate: string; endDate: string }`
  - [ ] T2.2 — Criar `DATE_RANGE_PATTERNS` — array de `{ pattern: RegExp, resolve: (match) => DateWindow }` para intervalos absolutos (ver Dev Notes)
  - [ ] T2.3 — Implementar `export function extractDateWindow(msg: string): DateWindow` — tenta cada padrão absoluto primeiro; se nenhum match, converte via `extractPeriodDays` para DateWindow relativo (`endDate = hoje`, `startDate = hoje - days`)

- [ ] **T3** — Migration `104_agent_daterange_rpcs.sql`
  - [ ] T3.1 — Adicionar overload `pipeline_funnel_by_campaign(p_start_date DATE, p_end_date DATE)` — corpo idêntico à 096 substituindo `CURRENT_DATE - p_days` por `p_start_date` e adicionando `.lte("date", p_end_date)` nas condições relevantes. Manter GRANT/REVOKE idênticos à 096.
  - [ ] T3.2 — Adicionar overload `creative_performance(p_start_date DATE, p_end_date DATE)` — corpo idêntico à 101 com mesma substituição. Manter GRANT/REVOKE.
  - [ ] T3.3 — Verificar que ambos os overloads com `p_days INTEGER` continuam funcionando (sem quebra de compatibilidade)

- [ ] **T4** — Atualizar builders em `context-builder.ts`
  - [ ] T4.1 — `buildGlobalContext(supabase, orgId, window?: DateWindow)` — substituir parâmetro `pDays?: number` por `window?: DateWindow`; calcular `startDate = window?.startDate ?? hoje-30` e `endDate = window?.endDate ?? hoje`; usar `.gte("date", startDate).lte("date", endDate)` nas queries de `meta_insights_daily` e `meta_leads`
  - [ ] T4.2 — Atualizar cache key: `global:${orgId}:${startDate}:${endDate}`
  - [ ] T4.3 — Atualizar header do portfólio: se `window` é relativo, exibir `últimos N dias`; se absoluto, exibir `DD/MM/YYYY a DD/MM/YYYY`
  - [ ] T4.4 — `buildContext(supabase, orgId, contextType, contextId?, window?: DateWindow)` — substituir `pDays?` por `window?`; repassar para `buildGlobalContext`
  - [ ] T4.5 — `fetchPipelineAggregates(supabase, orgId, window?: DateWindow)` — chamar RPC com `p_start_date`/`p_end_date`; atualizar cache key
  - [ ] T4.6 — `fetchCreativePerformance(supabase, orgId, window?: DateWindow)` — chamar RPC com `p_start_date`/`p_end_date`; atualizar cache key e header `=== CRIATIVOS (...) ===`

- [ ] **T5** — Atualizar `chat/route.ts`
  - [ ] T5.1 — Adicionar `extractDateWindow`, `DateWindow` ao bloco de imports
  - [ ] T5.2 — Substituir `extractPeriodDays(message)` por `extractDateWindow(message)`
  - [ ] T5.3 — Atualizar calls de `buildContext`, `fetchPipelineAggregates`, `fetchCreativePerformance` para passar `DateWindow`
  - [ ] T5.4 — Log de diagnóstico: `console.log("[52-8] date window:", dateWindow)`

- [ ] **T6** — Atualizar `AGENT_SYSTEM_PROMPT`
  - [ ] T6.1 — Atualizar seção `## Análise por período` com exemplos de intervalos absolutos

- [ ] **T7** — Typecheck e lint
  - [ ] T7.1 — `tsc --noEmit` — zero erros novos
  - [ ] T7.2 — `eslint` — zero warnings novos nos arquivos modificados

- [ ] **T8** — Testes manuais
  - [ ] T8.1 — "como foram as campanhas de 1 a 15 de junho?" → log `[52-8]` mostra `startDate: 2026-06-01, endDate: 2026-06-15`
  - [ ] T8.2 — "análise de junho" → intervalo `2026-06-01` a `2026-06-30`
  - [ ] T8.3 — "últimos 7 dias" → comportamento idêntico à 52-7 (sem regressão)
  - [ ] T8.4 — "qual campanha tem melhor CTR?" → `startDate: hoje-30, endDate: hoje`

---

## Dev Notes

### Tipo `DateWindow`

```typescript
// context-builder.ts
export type DateWindow = {
  startDate: string  // ISO: "YYYY-MM-DD"
  endDate: string    // ISO: "YYYY-MM-DD"
  label?: string     // ex: "01/06 a 15/06" | "últimos 7 dias" (para cabeçalhos)
}
```

### Padrões `DATE_RANGE_PATTERNS` (absolutos — prioridade sobre relativos)

| Padrão | Exemplo | Resolve |
|--------|---------|---------|
| `de D a D de Mês` | "de 1 a 15 de junho" | startDate=primeiro, endDate=último |
| `entre D e D de Mês` | "entre 1 e 15 de junho" | idem |
| `de DD/MM a DD/MM` | "de 01/06 a 15/06" | assumir ano corrente |
| `DD/MM a DD/MM` | "01/06 a 15/06" | idem |
| `de DD/MM/YYYY a DD/MM/YYYY` | "de 01/06/2026 a 15/06/2026" | ano explícito |
| Nome do mês isolado | "junho" / "maio" | primeiro e último dia do mês |

**Meses em PT-BR reconhecidos:** janeiro(1), fevereiro(2), março(3), abril(4), maio(5), junho(6), julho(7), agosto(8), setembro(9), outubro(10), novembro(11), dezembro(12). Abreviações de 3 letras também (jan, fev, mar, abr, mai, jun, jul, ago, set, out, nov, dez).

**Ano**: quando não especificado, assumir ano corrente. Se a data resultante for futura, usar ano anterior.

### Overloads SQL (migration 104)

Estratégia: `CREATE OR REPLACE` com assinatura nova. PostgreSQL suporta sobrecarga de funções por assinatura — criar duas funções distintas:

```sql
-- Assinatura relativa (existente — sem alteração)
CREATE OR REPLACE FUNCTION public.pipeline_funnel_by_campaign(p_days INTEGER DEFAULT 30)
...

-- Nova assinatura com intervalo absoluto
CREATE OR REPLACE FUNCTION public.pipeline_funnel_by_campaign(
  p_start_date DATE,
  p_end_date DATE
)
...
-- Corpo idêntico substituindo:
--   leads.created_at >= NOW() - INTERVAL '1 day' * p_days
-- por:
--   leads.created_at::date >= p_start_date
--   AND leads.created_at::date <= p_end_date
```

Idem para `creative_performance`.

### Cache key strategy

| Função | Chave |
|--------|-------|
| `buildGlobalContext` | `global:{orgId}:{startDate}:{endDate}` |
| `fetchCreativePerformance` | `creative_perf:{orgId}:{startDate}:{endDate}` |
| `fetchPipelineAggregates` | `pipeline:{orgId}:{startDate}:{endDate}` |

`cacheable` = `endDate === hoje && startDate === hoje-30` (mesma regra de antes para o default de 30 dias).

### Compatibilidade com `extractPeriodDays`

`extractPeriodDays` permanece exportada e inalterada — é referenciada no `AGENT_SYSTEM_PROMPT` e pode ser usada por outras features. `extractDateWindow` é a nova função principal para `chat/route.ts`.

---

## File List

- [ ] `packages/web/src/lib/agent/context-builder.ts` — novo tipo `DateWindow`, nova função `extractDateWindow`, builders atualizados
- [ ] `packages/web/src/app/api/agent/chat/route.ts` — substituição de `extractPeriodDays` por `extractDateWindow`
- [ ] `packages/web/src/lib/agent/system-prompt.ts` — atualização da seção `## Análise por período`
- [ ] `supabase/migrations/104_agent_daterange_rpcs.sql` — overloads com `p_start_date`/`p_end_date`

---

## QA Results

_(a preencher por @qa)_

---

## Change Log

| Date | Agent | Change |
|------|-------|--------|
| 2026-06-19 | @sm (River) | Story criada — Epic 52, Story 52-8 |
