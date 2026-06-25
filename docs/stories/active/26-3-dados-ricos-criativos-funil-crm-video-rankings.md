# Story 26.3: Dados Ricos por Criativo — Funil CRM, Métricas de Vídeo e Rankings

> **Nota de posicionamento no epic:** Esta é a Story 26.3, distinta da Story 26.2 (Alertas de Fadiga de Criativo no Telegram — ainda não criada). A Story 26.2 estende o cron `meta-ads-intelligence`; esta Story 26.3 estende a UI da página de campanha com dados já existentes no banco.

## Status

Done

## Executor Assignment

```
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["data_correctness", "ui_rendering", "tenant_isolation", "perf_explain_plan"]
effort: M
story_points: 3
estimated_hours: 3
risk: BAIXO
visibility: HIGH
mode: YOLO
depends_on:
  - "Story 26.1 — Done (endpoint /creatives + componente CampaignCreatives já existem)"
  - "Migration 075_meta_insights_quality_video_lp (video_metrics + rankings em meta_insights_daily — aplicada em prod)"
  - "Migration 075_leads_metadata (leads.metadata JSONB + idx_leads_metadata_ad_id — aplicado em prod)"
  - "Migration 101_creative_performance_with_crm (lógica de join leads→kanban_stages referência)"
```

## Story

**As a** gestor de tráfego da Trifold,
**I want** ver, no card de cada criativo na seção "Criativos" da campanha, o funil CRM gerado por aquele ad (quantos leads agendaram visita, visitaram, fecharam), as métricas de vídeo (hook rate, completion rate) quando disponíveis, e os badges de qualidade/engajamento/conversão da Meta,
**so that** eu possa decidir quais criativos escalar, pausar ou substituir com base em resultado de negócio real — identificando o criativo que gera CLIENTE (visita/fechamento), não só lead.

## Acceptance Criteria

### Backend — Extensão do endpoint `GET /api/meta-ads/campaigns/[campaign_id]/creatives`

1. O endpoint retorna os campos `crm_leads_total`, `crm_leads_agendado`, `crm_leads_visitou`, `crm_leads_proposta`, `crm_leads_fechado` (tipo `number`) em cada objeto `AdCreativeMetrics`. Criativos sem leads vinculados via `metadata->>'ad_id'` retornam `0` em todos esses campos CRM (não `null`, não ausentes).

2. O join a `leads` é executado em batch: uma única query para todos os `adIds` da campanha, sem N+1 por criativo. A query aplica `.eq("org_id", appUser.org_id)` (tenant isolation). O índice `idx_leads_metadata_ad_id` é utilizado — confirmado via `EXPLAIN (ANALYZE, COSTS)` antes do PR; Seq Scan em `leads` não é aceitável.

3. O endpoint retorna `video_hook_rate: number | null` e `video_completion_rate: number | null` para cada ad, extraídos de `video_metrics JSONB` (campos `hook_rate`, `completion_rate`) da linha mais recente de `meta_insights_daily` (level='ad', entity_id=meta_ad_id) no período selecionado. Quando `video_metrics` é null ou ausente no período, ambos retornam `null`.

4. O endpoint retorna `quality_ranking: string | null`, `engagement_rate_ranking: string | null`, `conversion_rate_ranking: string | null` para cada ad, com o valor da linha mais recente de `meta_insights_daily` no período. Quando ausentes, retornam `null`.

5. O gate de role `appUser.role !== "admin"` → 403 é mantido sem alteração.

6. Sem regressão: os campos existentes (`ad_id`, `ad_name`, `status`, `spend`, `impressions`, `clicks`, `ctr`, `cpm`, `cpc`, `leads`, `cpl`, `ctr_last_3d`, `ctr_prev_7d`, `spend_3d`, `is_fatigued`, `fatigue_drop_pct`, `thumbnail_url`, `ad_body`) retornam os mesmos valores de antes desta extensão.

### Frontend — Extensão do componente `CampaignCreatives`

7. Cada `CreativeCard` exibe uma mini-seção "Funil CRM" quando `crm_leads_total > 0`, no formato: `Leads CRM: X · Agendou: Y · Visitou: Z · Proposta: W · Fechou: V`. Quando `crm_leads_total === 0`, exibe "Sem atribuição CRM" (texto pequeno, cinza) em vez de uma linha de zeros — a ausência de vínculo via `ad_id` é semanticamente diferente de "0 visitaram".

8. Quando `video_hook_rate !== null`, o card exibe uma seção "Vídeo" com "Hook: X%" (% que assistiram 30s) e "Conclusão: Y%" (% que assistiram completo). Quando `video_hook_rate === null` (criativo de imagem ou sem dados de vídeo sincronizados), a seção de vídeo NÃO aparece — graceful degradation sem `<div>` vazio, sem "—".

9. Os rankings não-null são exibidos como badges no card. Mapeamento: `ABOVE_AVERAGE` → badge verde "Acima da média"; `AVERAGE` → badge cinza "Na média"; `BELOW_AVERAGE` → badge vermelho "Abaixo da média". Rankings null não geram badge. Os 3 tipos (qualidade / engajamento / conversão) aparecem com rótulos distintos quando presentes.

10. O componente não quebra quando qualquer combinação dos novos campos (`crm_*`, `video_*`, `*_ranking`) é null — graceful degradation completa para qualquer estado dos dados.

11. `pnpm lint` e `pnpm typecheck` passam sem novos erros.

12. Sem regressão: métricas existentes (spend, CTR, badge de fadiga, thumbnail, fallback thumbnail, estado vazio, estado de loading) continuam renderizando identicamente ao comportamento da Story 26.1.

### Decisão de design registrada

13. O funil CRM é implementado via Abordagem A (join direto a `leads` no route por campanha). A Abordagem B (reusar RPC `creative_performance_with_crm` da migration 101) foi avaliada e descartada. A decisão e o raciocínio devem estar registrados no Dev Agent Record desta story.

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled em `core-config.yaml`.
> Quality validation will use manual review process only.
> To enable, set `coderabbit_integration.enabled: true` em core-config.yaml.

## Tasks / Subtasks

- [x] **T1 — Backend: estender interfaces TypeScript** (AC: 1, 3, 4, 6)
  - [x] T1.1 Adicionar novos campos ao tipo `AdCreativeMetrics` em `creatives/route.ts`:
    - `crm_leads_total: number`
    - `crm_leads_agendado: number`
    - `crm_leads_visitou: number`
    - `crm_leads_proposta: number`
    - `crm_leads_fechado: number`
    - `video_hook_rate: number | null`
    - `video_completion_rate: number | null`
    - `quality_ranking: string | null`
    - `engagement_rate_ranking: string | null`
    - `conversion_rate_ranking: string | null`
  - [x] T1.2 Espelhar os mesmos campos na interface `AdCreativeMetrics` de `campaign-creatives.tsx`

- [x] **T2 — Backend: query CRM em batch** (AC: 1, 2, 3)
  - [x] T2.1 Após obter `adIds` (passo 3 do route existente), adicionar ao `Promise.all` uma query a `leads` com join a `kanban_stages` (`kanban_stages!stage_id(type)`), filtrando `org_id` + `.in("metadata->>ad_id", adIds)` (Opção 1 do Dev Notes — batch, sem N+1)
  - [x] T2.2 Agregar em JS em `crmMap: Map<string, CrmAgg>` por `kanban_stages.type` (`agendado`/`visitou`/`proposta`/`fechado`); `total` conta todos os leads vinculados. Embed to-one normalizado (array-or-object) por causa da inferência de tipo do client gerado.
  - [~] T2.3 `EXPLAIN (ANALYZE, COSTS)` — PAT do Supabase (`~/.supabase/access-token`) está revogado (401). Plano esperado + SQL exato documentados no Dev Agent Record para @qa/@devops rodarem. Gate BLOQUEANTE pendente de verificação real.

- [x] **T3 — Backend: query de enrichment (rankings + video_metrics)** (AC: 3, 4)
  - [x] T3.1 Query a `meta_insights_daily` (`entity_id, date, quality/engagement/conversion_rate_ranking, video_metrics`) filtrada por `org_id`, `level='ad'`, `entity_id IN (adIds)`, período `[from, to]`, `order date DESC`
  - [x] T3.2 `enrichMap` — primeira ocorrência não-null por campo (rows DESC = mais recente primeiro)
  - [x] T3.3 De `video_metrics JSONB` extrai `hook_rate`/`completion_rate`

- [x] **T4 — Backend: montar resposta final com novos campos** (AC: 1, 3, 4, 5, 6)
  - [x] T4.1 Montagem com defaults: CRM `{ total:0, ... }`, enrichment todos `null`
  - [x] T4.2 Gate `appUser.role !== "admin"` → 403 inalterado (route.ts:86-88)

- [x] **T5 — Frontend: seção de funil CRM no `CreativeCard`** (AC: 7, 10)
  - [x] T5.1 `ad.crm_leads_total > 0` → mini-funil; senão "Sem atribuição CRM" (`text-xs text-gray-400 dark:text-stone-500`)
  - [x] T5.2 Formato `Leads CRM: X · Agendou: Y · Visitou: Z · Proposta: W · Fechou: V`

- [x] **T6 — Frontend: seção de vídeo condicional no `CreativeCard`** (AC: 8, 10)
  - [x] T6.1 `{ad.video_hook_rate !== null && ...}` Hook/Conclusão via `formatPercent` (valor já em 0-100)
  - [x] T6.2 Graceful: `video_hook_rate === null` → nada renderizado

- [x] **T7 — Frontend: badges de ranking** (AC: 9, 10)
  - [x] T7.1 Helper `rankingBadge(value, label): ReactNode` → `null` quando value null/desconhecido
  - [x] T7.2 Mapeamento de cores via `RANKING_BADGE`
  - [x] T7.3 3 badges "Qualidade"/"Engajamento"/"Conversão" em `flex-wrap gap-1` abaixo do grid

- [x] **T8 — Lint, typecheck e smoke test** (AC: 11, 12)
  - [x] T8.1 `npm run lint` (eslint) nos 2 arquivos — exit 0, sem erros
  - [x] T8.2 `npm run type-check` (tsc --noEmit) — 0 erros nos arquivos da story
  - [~] T8.3 Smoke manual — pendente (@qa) — requer ambiente rodando + login admin
  - [~] T8.4 Validação SQL de referência — pendente (@qa, mesmo bloqueio de credencial do EXPLAIN)

- [x] **T9 — Registrar decisão de design** (AC: 13)
  - [x] T9.1 Abordagem A vs B + plano EXPLAIN registrados no Dev Agent Record

## Dev Notes

### Contexto: o gap

Os dados existem mas não chegam à UI:

| Dado | Origem no banco | Consumidor atual | Gap |
|------|----------------|-----------------|-----|
| Funil CRM por criativo | `leads.metadata->>'ad_id'` + `kanban_stages.type` | RPC `creative_performance_with_crm` → `context-builder.ts` (agente) | Não exibido na UI |
| `video_metrics` JSONB | `meta_insights_daily.video_metrics` (migration 075) | Nenhum consumidor de UI | Não exibido na UI |
| Rankings | `meta_insights_daily.quality_ranking` / `engagement_rate_ranking` / `conversion_rate_ranking` (migration 075) | `context-builder.ts` L661 (agente) | Não exibido na UI |

### Arquivos a modificar (apenas 2)

| Arquivo | Ação |
|---------|------|
| `packages/web/src/app/api/meta-ads/campaigns/[campaign_id]/creatives/route.ts` | EDITAR — adicionar 2 queries ao Promise.all + novos campos na interface + montagem |
| `packages/web/src/app/dashboard/campaigns/meta/[campaign_id]/campaign-creatives.tsx` | EDITAR — adicionar 3 seções ao `CreativeCard` + novos campos na interface |

**Não criar novos arquivos.** Edições puramente aditivas — sem alterar lógica existente de fadiga ou métricas do período.

### Auth e org_id (obrigatório)

Idêntico ao existente no `route.ts`:
- `requireAuth()` → `appUser.org_id` em **todas** as queries novas
- Gate admin já existe em `route.ts:86-88` — não alterar
- `.maybeSingle()` não se aplica às novas queries bulk; usar `.select()` com `.in()` direto

### Abordagem A vs B — decisão de design

**Abordagem A (implementar — recomendada):** Join direto a `leads` no route existente, filtrado por `adIds` da campanha em curso.

Vantagens: coerente com o route per-campanha (mesmo escopo); não requer adaptar RPC global; sem lógica de pós-filtragem por campanha; EXPLAIN usará `idx_leads_metadata_ad_id`.

**Abordagem B (descartada):** Reusar RPC `creative_performance_with_crm` (migration 101) via `supabase.rpc("creative_performance", { p_days: 30 })`.

Motivo do descarte: a RPC agrega dados globais de toda a org sem filtro por `campaign_id`. Pós-filtrar por `adset_id ∈ adsets da campanha` em JS adicionaria acoplamento frágil e lógica desnecessária — a RPC foi projetada para o agente de tráfego com visão global, não para o detalhe de uma campanha específica. (Ref: Article IV / IDS — reusar contexto alinhado; não forçar reutilização que adiciona complexidade).

### Query CRM — syntax PostgREST e alternativas

O índice `idx_leads_metadata_ad_id` é uma expression index parcial:
```sql
CREATE INDEX idx_leads_metadata_ad_id
  ON leads ((metadata->>'ad_id'))
  WHERE metadata->>'ad_id' IS NOT NULL;
```

**Opção 1 (testar primeiro):** Supabase JS `.in()` em campo JSONB text:
```typescript
const { data: leadRows } = await supabase
  .from("leads")
  .select("id, metadata, kanban_stages!stage_id(type)")
  .eq("org_id", appUser.org_id)
  .in("metadata->>ad_id", adIds)
```

**Opção 2 (fallback se Opção 1 não funcionar no Supabase JS versão atual):**
```typescript
const { data: leadRows } = await supabase
  .from("leads")
  .select("id, metadata, kanban_stages!stage_id(type)")
  .eq("org_id", appUser.org_id)
  .not("metadata", "is", null)
  // filtro posterior em JS:
// leadRows?.filter(l => adIds.includes((l.metadata as Record<string, string>)?.ad_id))
```
*Nota:* a Opção 2 traz mais rows do que o necessário antes do filtro JS. Aceitável se `leads` da org não for muito grande, mas sub-ótima. Preferir Opção 1.

**Verificar o EXPLAIN sempre**, independentemente da opção: confirmar `Index Scan using idx_leads_metadata_ad_id`. Registrar no Dev Agent Record.

### Aggregação CRM em JS

```typescript
type CrmAgg = {
  total: number
  agendado: number
  visitou: number
  proposta: number
  fechado: number
}

const crmMap = new Map<string, CrmAgg>()
for (const lead of leadRows ?? []) {
  const adId = (lead.metadata as Record<string, string> | null)?.ad_id
  if (!adId) continue
  const stageType = (lead.kanban_stages as { type: string } | null)?.type ?? ""
  const agg = crmMap.get(adId) ?? { total: 0, agendado: 0, visitou: 0, proposta: 0, fechado: 0 }
  agg.total++
  if (stageType === "agendado") agg.agendado++
  if (stageType === "visitou")  agg.visitou++
  if (stageType === "proposta") agg.proposta++
  if (stageType === "fechado")  agg.fechado++
  crmMap.set(adId, agg)
}
```

Tipos de stage em `kanban_stages` (confirmados pela migration 101 comment): `'novo'`, `'agendado'`, `'visitou'`, `'proposta'`, `'fechado'`, `'represamento'`, `'perdido'`. Para o funil, mapear apenas `agendado` / `visitou` / `proposta` / `fechado`; `total` = todos os leads vinculados independente do stage.

### Query de enrichment (rankings + video_metrics)

Adicionar ao `Promise.all` existente (junto com `periodResult` e `fatigueResult`):

```typescript
supabase
  .from("meta_insights_daily")
  .select("entity_id, date, quality_ranking, engagement_rate_ranking, conversion_rate_ranking, video_metrics")
  .eq("org_id", appUser.org_id)
  .eq("level", "ad")
  .in("entity_id", adIds)
  .gte("date", from)
  .lte("date", to)
  .order("date", { ascending: false })
```

Aggregação em JS (O(n), uma iteração):

```typescript
type Enrichment = {
  quality_ranking: string | null
  engagement_rate_ranking: string | null
  conversion_rate_ranking: string | null
  video_hook_rate: number | null
  video_completion_rate: number | null
}

const enrichMap = new Map<string, Enrichment>()
for (const row of enrichmentRows ?? []) {
  const id = row.entity_id as string
  const cur = enrichMap.get(id) ?? {
    quality_ranking: null,
    engagement_rate_ranking: null,
    conversion_rate_ranking: null,
    video_hook_rate: null,
    video_completion_rate: null,
  }
  // Rows estão em DESC por date → primeira ocorrência = mais recente
  if (!cur.quality_ranking && row.quality_ranking)
    cur.quality_ranking = row.quality_ranking as string
  if (!cur.engagement_rate_ranking && row.engagement_rate_ranking)
    cur.engagement_rate_ranking = row.engagement_rate_ranking as string
  if (!cur.conversion_rate_ranking && row.conversion_rate_ranking)
    cur.conversion_rate_ranking = row.conversion_rate_ranking as string
  if (cur.video_hook_rate === null && row.video_metrics) {
    const vm = row.video_metrics as { hook_rate?: number; completion_rate?: number }
    cur.video_hook_rate = vm.hook_rate ?? null
    cur.video_completion_rate = vm.completion_rate ?? null
  }
  enrichMap.set(id, cur)
}
```

### Estrutura do `video_metrics` JSONB (confirmada em meta-sync-insights/route.ts)

```typescript
// buildVideoMetrics() em packages/web/src/app/api/cron/meta-sync-insights/route.ts
{
  sec30,        // número de views de 30s
  thruplay,     // número de views completos
  p25, p50, p75, p100,   // marcos de quartil
  hook_rate:       Math.round((sec30    / impressions) * 10000) / 100,  // percentual 0-100
  completion_rate: Math.round((thruplay / impressions) * 10000) / 100,  // percentual 0-100
}
```

Na UI exibir como "12.5%" (ex: `${ad.video_hook_rate}%` ou via `formatPercent` se ele aceitar o valor já em %). Confirmar se `formatPercent` de `@web/lib/meta-format` recebe valor em percentual (0-100) ou fração (0-1) antes de usar.

> **Atenção (fonte de verdade):** o COMMENT da migration `075_meta_insights_quality_video_lp.sql` descreve `video_metrics` apenas com as contagens brutas (`p25, p50, p75, p100, sec30, thruplay`) e **não menciona** `hook_rate`/`completion_rate`. Porém o `buildVideoMetrics()` em `meta-sync-insights/route.ts:96-97` persiste de fato `hook_rate` e `completion_rate` no JSONB (percentuais 0-100). A fonte de verdade do shape gravado é o código do cron, não o comentário da migration. Os campos consumidos por esta story existem em prod.

### Montagem do objeto final `AdCreativeMetrics` (passo 7 do route)

Adicionar ao bloco `.map((ad) => { ... return { ... } })` existente:

```typescript
const crm = crmMap.get(adId) ?? { total: 0, agendado: 0, visitou: 0, proposta: 0, fechado: 0 }
const enrich = enrichMap.get(adId) ?? {
  quality_ranking: null,
  engagement_rate_ranking: null,
  conversion_rate_ranking: null,
  video_hook_rate: null,
  video_completion_rate: null,
}

return {
  // ... todos os campos existentes sem alteração ...
  crm_leads_total:    crm.total,
  crm_leads_agendado: crm.agendado,
  crm_leads_visitou:  crm.visitou,
  crm_leads_proposta: crm.proposta,
  crm_leads_fechado:  crm.fechado,
  video_hook_rate:        enrich.video_hook_rate,
  video_completion_rate:  enrich.video_completion_rate,
  quality_ranking:        enrich.quality_ranking,
  engagement_rate_ranking: enrich.engagement_rate_ranking,
  conversion_rate_ranking: enrich.conversion_rate_ranking,
}
```

### Estrutura visual do `CreativeCard` — onde adicionar as novas seções

O card atual (campaign-creatives.tsx) tem esta estrutura em `Body`:
```
[nome + status badge + badge fadiga]
[ad_body text — condicional]
[dl grid: spend / impressões / CTR / CPM / leads / CPL]
← ADICIONAR AQUI (abaixo do dl) →
  [seção CRM]
  [seção Vídeo — condicional]
  [badges de ranking — condicional, flex-wrap]
```

Manter `text-xs` e `mt-2` para separação visual. Não alterar layout acima do `dl`.

### Padrão de classes Tailwind para badges de ranking

Reutilizar padrão do badge de fadiga existente em `CreativeCard` (linha ~160 do componente):
```
ABOVE_AVERAGE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
AVERAGE:       "bg-gray-100 text-gray-700 dark:bg-stone-800 dark:text-stone-300"
BELOW_AVERAGE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
```
Classes de container do badge: `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium`.

### Rollback

Risco BAIXO — sem migration, sem novo arquivo, sem novo endpoint:
- Reverter novos campos da interface `AdCreativeMetrics` (2 hunks)
- Remover as 2 queries adicionadas ao `Promise.all` + campos na montagem (1 hunk)
- Remover as 3 seções do `CreativeCard` + novos campos na interface do componente (1 hunk)

Zero efeito em outros endpoints ou componentes.

## Testing

### Framework e abordagem

Story de extensão de API read-only + UI. Sem schema changes. Framework: **Vitest** (não Jest).

### Gates obrigatórios (bloqueiam PR)

1. **Lint:** `pnpm --filter @trifold/web lint` — sem novos erros
2. **Type-check:** `pnpm --filter @trifold/web typecheck` — clean
3. **EXPLAIN ANALYZE** da query CRM — `Index Scan using idx_leads_metadata_ad_id` obrigatório. Registrar no Dev Agent Record antes do commit.

### Smoke manual

Abrir `/dashboard/campaigns/meta/[campaign_id]` logado como admin:
- Seção "Criativos" carrega (regressão 26.1 OK)
- Console sem erros JS
- Para criativos sem vinculação CRM (estado atual de prod para a maioria): "Sem atribuição CRM" aparece
- Para criativos com leads vinculados: funil CRM aparece com contagens
- Rankings: verificar via SQL se há dados antes de validar na UI (veja query abaixo)

### SQL de referência para cross-check do funil CRM

```sql
-- Confirmar contagens CRM por ad_id na org
SELECT
  l.metadata->>'ad_id'  AS ad_id,
  COUNT(*)                                                       AS total,
  COUNT(CASE WHEN ks.type = 'agendado' THEN 1 END)              AS agendado,
  COUNT(CASE WHEN ks.type = 'visitou'  THEN 1 END)              AS visitou,
  COUNT(CASE WHEN ks.type = 'proposta' THEN 1 END)              AS proposta,
  COUNT(CASE WHEN ks.type = 'fechado'  THEN 1 END)              AS fechado
FROM leads l
LEFT JOIN kanban_stages ks ON ks.id = l.stage_id
WHERE l.org_id = '<org_id>'
  AND l.metadata->>'ad_id' IS NOT NULL
GROUP BY l.metadata->>'ad_id'
ORDER BY total DESC
LIMIT 10;

-- Confirmar existência de dados de rankings em prod
SELECT entity_id, quality_ranking, engagement_rate_ranking, conversion_rate_ranking
FROM meta_insights_daily
WHERE level = 'ad'
  AND quality_ranking IS NOT NULL
LIMIT 5;

-- Confirmar existência de video_metrics em prod
SELECT entity_id, (video_metrics->>'hook_rate')::numeric AS hook_rate,
       (video_metrics->>'completion_rate')::numeric AS completion_rate
FROM meta_insights_daily
WHERE level = 'ad'
  AND video_metrics IS NOT NULL
LIMIT 5;
```

### Casos de graceful degradation a validar

| Cenário | Comportamento esperado |
|---------|----------------------|
| Ad sem leads com `metadata->>'ad_id'` | "Sem atribuição CRM" |
| Ad sem `video_metrics` em nenhum dia do período | Seção vídeo não renderiza |
| Ad sem rankings (todas as colunas null) | Nenhum badge de ranking |
| Campanha sem adsets | `{ ads: [], fatigued_count: 0, period_days }` (já tratado em 26.1) |
| `leads.metadata` null em algum lead | Skip no aggregador JS (guard `?.ad_id`) |
| `kanban_stages` null (lead sem stage) | Stage = "" → não incrementa nenhum contador nomeado, apenas `total` |

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-25 | 1.0 | Story criada pelo @sm (River). Extensão da Story 26.1 (Done) para surface de dados ricos por criativo: funil CRM via join leads.metadata->>'ad_id' → kanban_stages.type (Abordagem A), métricas de vídeo de video_metrics JSONB (hook_rate/completion_rate), rankings de qualidade/engajamento/conversão. Zero migration — todos os dados já existem. EXPLAIN ANALYZE marcado como gate bloqueante. Graceful degradation documentada para todos os estados de ausência de dados. | River (@sm) |
| 2026-06-25 | 1.2 | Implementação @dev (Dex). Abordagem A implementada: endpoint `/creatives` estendido com query batched a `leads` (`metadata->>ad_id` IN adIds, org_id-isolated) agregando funil CRM por `kanban_stages.type`, + query de enrichment a `meta_insights_daily` (rankings + video_metrics, most-recent-wins). `CreativeCard` ganhou mini-funil CRM ("Sem atribuição CRM" quando 0), seção Vídeo condicional (Hook/Conclusão) e badges de ranking. type-check + lint limpos nos arquivos da story. EXPLAIN ANALYZE NÃO executado (PAT Supabase revogado/401) — SQL + plano esperado + raciocínio de uso do índice parcial documentados no Dev Agent Record para @qa. Status Ready → InReview. | Dex (@dev) |
| 2026-06-25 | 1.1 | Validação @po (Pax). Veredicto GO (9/10). Evidência de schema confirmada em código/migrations: idx_leads_metadata_ad_id (075_leads_metadata.sql:36-38), colunas quality/engagement/conversion_rate_ranking + video_metrics (075_meta_insights_quality_video_lp.sql:7-18), keys hook_rate/completion_rate persistidas por buildVideoMetrics (meta-sync-insights/route.ts:96-97), RPC creative_performance (101). Pointers de arquivo verificados (route.ts + campaign-creatives.tsx existem). Adicionada nota anti-confusão no Dev Notes: COMMENT da migration 075 lista só contagens brutas, mas o cron persiste hook_rate/completion_rate (fonte de verdade = código). Status Draft → Ready. | Pax (@po) |

## Dev Agent Record

_Preenchido por Dex (@dev) — implementação 2026-06-25._

### Agent Model Used

Opus 4.8 (1M context) — modo YOLO autônomo.

### Decisão de design — Abordagem A vs B (AC 13)

**Implementado: Abordagem A** — join direto a `leads` no próprio route, filtrado pelos `adIds` da campanha em curso (mesmo escopo per-campanha do endpoint).

**Por que A e não B (reuso da RPC `creative_performance` da migration 101):**
- A RPC agrega o funil CRM de **toda a org** (visão global do agente de tráfego), sem filtro por `campaign_id`. Para usá-la aqui eu teria que pós-filtrar em JS por `adset_id ∈ adsets da campanha` — acoplamento frágil e lógica extra que a RPC não foi desenhada para suportar.
- A query direta é coerente com o restante do route (já resolve `adIds` da campanha para `periodResult`/`fatigueResult`) e usa o índice `idx_leads_metadata_ad_id` no filtro `.in("metadata->>ad_id", adIds)`.
- Alinhado a IDS/Article IV: reusar contexto que encaixa, não forçar reutilização que adiciona complexidade. A lógica de agregação por `kanban_stages.type` é espelhada da RPC 101 (mesma fonte de verdade de stages), apenas reaplicada no escopo da campanha.

**Como ficou o batch + agregação CRM:**
- 1 query única a `leads`: `select("id, metadata, kanban_stages!stage_id(type)").eq("org_id", appUser.org_id).in("metadata->>ad_id", adIds)`. Sem N+1.
- Agregação O(n) em JS: para cada lead, `ad_id = metadata.ad_id` (guard `?.ad_id` — pula leads sem ad_id), `stageType = kanban_stages.type`. Incrementa `total` sempre; incrementa o contador nomeado só para `agendado`/`visitou`/`proposta`/`fechado`. Stages `novo`/`represamento`/`perdido` (e lead sem stage → `type=""`) contam só no `total`.
- **Nota de tipo:** o client tipado infere o embed to-one `kanban_stages!stage_id(type)` como `{type}[]` (array). Normalizo com `Array.isArray(stageRel) ? stageRel[0] : stageRel` para cobrir tanto a inferência quanto o shape real (objeto) do PostgREST. Sem isso, `tsc` quebra com TS2352.

### EXPLAIN (ANALYZE, COSTS) — gate AC 2 (PENDENTE de execução real)

**Bloqueio:** o PAT em `~/.supabase/access-token` (`sbp_…`) está revogado — Management API retorna `401 Unauthorized` em `/v1/projects` e em `/database/query`. Não há `DATABASE_URL`/`psql` local. Não consegui medir o plano real.

**SQL para @qa/@devops rodarem** (mirror do que o PostgREST gera; substituir `<org_id>` e a lista de ad_ids reais da campanha):

```sql
EXPLAIN (ANALYZE, COSTS)
SELECT l.id, l.metadata, ks.type
FROM leads l
LEFT JOIN kanban_stages ks ON ks.id = l.stage_id
WHERE l.org_id = '<org_id>'
  AND (l.metadata->>'ad_id') IN ('<ad_id_1>', '<ad_id_2>', '<ad_id_3>');
```

**Plano esperado / critério de aceite:** `Index Scan` (ou `Bitmap Index Scan`) `using idx_leads_metadata_ad_id on leads`. **Seq Scan em `leads` = falha do gate.**

**Raciocínio de por que o índice será usado:** `idx_leads_metadata_ad_id` é índice de expressão **parcial** `ON leads ((metadata->>'ad_id')) WHERE metadata->>'ad_id' IS NOT NULL`. O filtro `(metadata->>'ad_id') IN (...)` (PostgREST: `= ANY(ARRAY[...])`) compara contra valores não-nulos, o que implica `metadata->>'ad_id' IS NOT NULL` — satisfazendo o predicado parcial — e é altamente seletivo, então o planner deve preferir esse índice ao filtro por `org_id`. Se em prod o planner escolher Seq Scan (ex.: tabela `leads` pequena o suficiente p/ o custo não compensar), forçar via `SET enable_seqscan = off` no EXPLAIN para confirmar que o índice é *utilizável*, e registrar o tamanho da tabela como justificativa.

### Debug Log References

- `npm run type-check` (packages/web): 0 erros nos 2 arquivos da story. Erros remanescentes são pré-existentes e não-relacionados: `react-email-editor` (visual-editor.tsx — dependência ausente, citado no escopo) e 2 refs stale em `.next/types/validator.ts` a rotas `reconcile-distratos`/`distrato` (arquivos inexistentes, cache de build).
- `npx eslint` nos 2 arquivos: exit 0, sem warnings/erros.

### Completion Notes List

- Edições puramente aditivas em 2 arquivos; zero migration, zero novo arquivo, zero alteração na lógica de período/fadiga (sem regressão — AC 6/12).
- Tenant isolation: `.eq("org_id", appUser.org_id)` nas 2 queries novas.
- Gate admin-only (route.ts:86-88) intocado (AC 5).
- Graceful degradation: `crm_leads_total===0` → "Sem atribuição CRM"; `video_hook_rate===null` → seção vídeo não renderiza; rankings null → sem badge; wrapper de badges só renderiza se ≥1 ranking presente.
- `formatPercent` recebe valor já em 0-100 (confirmado em meta-format.ts:26-27 — só faz `toFixed(2)+"%"`), compatível com `hook_rate`/`completion_rate` (0-100 gravados por `buildVideoMetrics`).
- `video_completion_rate` exibe "—" no caso (raro) de hook não-null mas completion null.

### Débito / edge cases para @qa

1. **EXPLAIN real não executado** (PAT revogado) — gate AC 2 BLOQUEANTE pendente. SQL + plano esperado acima. Rotacionar PAT (`supabase login`) ou rodar via dashboard SQL editor.
2. **Smoke manual (T8.3) e cross-check SQL (T8.4) pendentes** — requerem app rodando + login admin + acesso ao banco.
3. **Embed to-one tipado como array:** se uma futura atualização do client gerado passar a inferir objeto, a normalização `Array.isArray()` continua correta (cobre ambos) — não é débito, é defensivo.
4. **Query de enrichment é uma 3ª leitura de `meta_insights_daily`** no mesmo período da `periodResult`, mas com colunas e ordenação diferentes (rankings/video + `order date DESC`). Mantida separada por clareza e p/ não regredir a agregação existente; custo extra desprezível (mesma faixa de datas, índice por `entity_id`/`date` já existente do 26.1).

### File List

- `packages/web/src/app/api/meta-ads/campaigns/[campaign_id]/creatives/route.ts` (MODIFICADO — interface + 2 queries no Promise.all + crmMap/enrichMap + montagem)
- `packages/web/src/app/dashboard/campaigns/meta/[campaign_id]/campaign-creatives.tsx` (MODIFICADO — interface + helper `rankingBadge`/`RANKING_BADGE` + 3 seções no CreativeCard)
- `docs/stories/active/26-3-dados-ricos-criativos-funil-crm-video-rankings.md` (MODIFICADO — status, subtasks, Dev Agent Record)

## QA Results

### Review Date: 2026-06-25

### Reviewed By: Quinn (Test Architect)

**Veredicto: PASS** — Extensão read-only de surfacing. Revisão do código real (não apenas da spec) nos 2 arquivos modificados.

#### Rastreabilidade aos 13 ACs

| AC | Resultado | Evidência |
|----|-----------|-----------|
| 1 — campos CRM `number`, 0 (não null/ausente) | ✅ | `route.ts:372-376` montagem com default `crm.total/agendado/...`; `crmMap.get(adId) ?? {total:0,...}` (343) |
| 2 — batch sem N+1 + org_id + índice (EXPLAIN) | ✅ | Query única `route.ts:178-182` no `Promise.all`; `.eq("org_id", appUser.org_id)`. **EXPLAIN em prod confirmado por @qa: `Bitmap Index Scan on idx_leads_metadata_ad_id`, 26.454ms, sem Seq Scan** (10 ad_ids reais, org real) |
| 3 — video_hook_rate/completion_rate de video_metrics JSONB | ✅ | `route.ts:301-307`; shape bate com `buildVideoMetrics()` (meta-sync-insights:96-97, 0-100) |
| 4 — 3 rankings da linha mais recente, null quando ausente | ✅ | `enrichResult` `order date DESC` (194); most-recent-wins `295-300` |
| 5 — gate admin → 403 mantido | ✅ | `route.ts:99-101` intocado |
| 6 — sem regressão nos campos da 26.1 | ✅ | periodMap/fatigueMap inalterados; queries novas apenas ADICIONADAS ao `Promise.all` |
| 7 — mini-funil ou "Sem atribuição CRM" | ✅ | `campaign-creatives.tsx:233-259`; texto cinza `text-gray-400` quando `crm_leads_total===0` |
| 8 — seção Vídeo condicional, sem div vazio | ✅ | `tsx:262` guard `video_hook_rate !== null` |
| 9 — badges de ranking mapeados | ✅ | `RANKING_BADGE` (124-138) ABOVE→verde/AVERAGE→cinza/BELOW→vermelho; bate exatamente com CHECK da migration 075:9-13 |
| 10 — sem crash para qualquer null | ✅ | rankingBadge retorna null (141-143); wrapper só renderiza se ≥1 ranking (281-283) |
| 11 — lint + typecheck sem novos erros | ✅ | `tsc --noEmit`: 0 erros nos 2 arquivos; os 5 remanescentes são pré-existentes/não-relacionados (2 refs stale `.next/types` + 3 `react-email-editor`) |
| 12 — sem regressão de UI (dl, thumbnail, estados) | ✅ | dl grid, thumbnail, loading/error/empty inalterados; novas seções abaixo do `dl` |
| 13 — decisão Abordagem A vs B registrada | ✅ | Dev Agent Record documenta A (join direto) vs B (RPC 101 descartada) |

#### Verificação de rigor solicitada

1. **Funil CRM correto:** ✅ agregação por `kanban_stages.type` com cadeia `else if` (route.ts:268-271) — mutuamente exclusiva, sem dupla contagem. `total++` sempre; stages fora dos 4 nomeados (novo/represamento/perdido/sem-stage) contam só em total. Embed to-one normalizado com `Array.isArray(stageRel) ? stageRel[0] : stageRel` (259-263). Guard `?.ad_id` (255). Sem risco de contagem errada.
2. **Tenant isolation:** ✅ `.eq("org_id", appUser.org_id)` nas DUAS queries novas (CRM 181, enrichment 189).
3. **Graceful degradation:** ✅ todos os caminhos cobertos; nenhum estado de dado quebra o card.
4. **Sem regressão 26.1:** ✅ confirmado.
5. **Mapeamento de rankings:** ✅ bate com o enum do CHECK da migration 075. Ver REL-001 (low, fora de escopo).
6. **video_metrics:** ✅ extração correta do JSONB; `formatPercent` recebe 0-100 (meta-format.ts:26-27). Ver MNT-001 (low, edge case).
7. **Admin-only:** ✅ preservado.
8. **type-check:** ✅ 2 arquivos limpos.

#### Observações (não-bloqueantes)
- **REL-001 (low):** cron grava ranking cru da Meta; variantes `BELOW_AVERAGE_*` seriam rejeitadas pelo CHECK 075 — badge "Abaixo da média" pode nunca aparecer. Pré-existente, fora do escopo read-only desta story. Investigar normalização no cron em story separada.
- **MNT-001 (low):** gate de extração de vídeo via `video_hook_rate === null` tem edge case teórico com dados parciais hook/completion. Sem impacto real.

### Gate Status

Gate: PASS → docs/qa/gates/26.3-dados-ricos-criativos-funil-crm-video-rankings.yml

> Próximo passo: @devops `*push`. Smoke manual (T8.3) opcional — graceful degradation e regressão validadas estaticamente; AC2 (EXPLAIN) já satisfeito em prod.
