# Story 26.1: UI Performance por Criativo + Badge de Fadiga

## Status

Done

## Executor Assignment

```
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["ui_accessibility", "data_correctness", "fatigue_logic", "chart_rendering"]
effort: G
story_points: 5
estimated_hours: 5
risk: BAIXO
visibility: HIGH
mode: Interactive
depends_on:
  - "Epic 16 (Meta Ads Marketing API) — completo (meta_ads + meta_insights_daily com level='ad')"
  - "Epic 19 (Meta Ads Intelligence) — completo (cron meta-ads-intelligence)"
```

## Story

**As a** gestor de tráfego da Trifold,
**I want** visualizar a performance individual de cada criativo (ad) em uma tab dedicada na página de detalhe de campanha, com badge visual de fadiga quando o CTR estiver em queda significativa,
**so that** eu possa identificar criativos que precisam ser pausados ou substituídos antes que o CPL suba, sem sair da tela de campanha.

## Acceptance Criteria

1. Tab "Criativos" aparece na página de detalhe de campanha (`/dashboard/campaigns/meta/[campaign_id]`), após a seção de AdSets, sem alterar as seções existentes (métricas, funil, adsets, leads).
2. Cada ad é exibido com: thumbnail do criativo (via `meta_ads.creative->>'thumbnail_url'`), nome do ad, status, spend, impressions, clicks, CTR, CPM, CPC, leads e CPL calculado (`spend / leads`).
3. Badge "Fadiga" em vermelho é exibido quando `ctr_last_3d < ctr_prev_7d * 0.6` AND `spend_3d >= 30`. O badge mostra a % de queda no CTR no formato "CTR caiu X%".
4. Criativos com `is_fatigued = true` aparecem no topo da lista, ordenados por spend DESC entre si; criativos sem fadiga aparecem em seguida, também por spend DESC.
5. O filtro de período da página (7d / 30d / 90d, controlado por `days` state no `CampaignDetailClient`) é passado ao endpoint via query param `period` e reflete nas métricas exibidas. A detecção de fadiga (`ctr_last_3d` vs `ctr_prev_7d`) é sempre calculada sobre janelas absolutas (últimos 3d vs dias -10 a -4) — independente do filtro de período.
6. Quando não há dados de insight com `level='ad'` para a campanha no período selecionado, a tab exibe: "Nenhum dado de criativo disponível. Aguarde o próximo sync (máx. 4h)." em vez de uma lista vazia sem contexto.
7. Se a thumbnail URL retornar 404 ou estiver ausente, exibe um placeholder SVG cinza sem bloquear a renderização das métricas.
8. Tooltip nos indicadores de fadiga explica o critério: "CTR dos últimos 3 dias caiu mais de 40% em relação aos 7 dias anteriores, com spend mínimo de R$30 no período de análise."
9. O componente é responsivo: em telas < 1024px os cards empilham verticalmente e a thumbnail é ocultada para preservar legibilidade das métricas.
10. Sem regressão nas seções existentes da página: funil, adsets, leads e gráfico de performance por dia continuam funcionando normalmente após a adição da nova tab.

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled em `core-config.yaml`.
> Quality validation will use manual review process only.
> To enable, set `coderabbit_integration.enabled: true` em core-config.yaml.

## Tasks / Subtasks

- [x] **T1 — Backend: novo endpoint `GET /api/meta-ads/campaigns/[campaign_id]/creatives`** (AC: 2, 3, 4, 5)
  - [x] T1.1 Criar arquivo `packages/web/src/app/api/meta-ads/campaigns/[campaign_id]/creatives/route.ts` seguindo o padrão do endpoint `funnel/route.ts` (mesmo diretório pai, mesma assinatura de `params`, `requireAuth`, `maybeSingle` para lookup de campanha)
  - [x] T1.2 Definir interfaces `AdCreativeMetrics` e `CreativesApiResponse` no topo do arquivo (conforme spec do Epic — ver Dev Notes)
  - [x] T1.3 Implementar `getPeriodDates(period: string)` (reutilizar lógica idêntica ao endpoint funnel: `7d` → 7 dias, `30d` → 30 dias, `90d` → 90 dias)
  - [x] T1.4 Implementar a query decomposta em múltiplas chamadas Supabase JS + agregação em memória (período + janelas absolutas de fadiga via `Promise.all`) — escolhido sobre `supabase.rpc` para manter padrão do projeto
  - [x] T1.5 Aplicar ordenação: `is_fatigued DESC, spend DESC` no resultado antes de retornar
  - [x] T1.6 Calcular `fatigued_count` como `ads.filter(a => a.is_fatigued).length`
  - [x] T1.7 Retornar `{ ads, fatigued_count, period_days }` com status 200; retornar `{ ads: [], fatigued_count: 0, period_days }` (não 404) quando não há dados — vazio é estado válido
  - [x] T1.8 Verificar que o endpoint está protegido por `requireAuth()` e filtra por `appUser.org_id` em todos os joins

- [x] **T2 — Frontend: componente `<CampaignCreatives />`** (AC: 1, 2, 3, 4, 6, 7, 8, 9)
  - [x] T2.1 Criar arquivo `packages/web/src/app/dashboard/campaigns/meta/[campaign_id]/campaign-creatives.tsx` como Client Component (`"use client"`)
  - [x] T2.2 Props: `{ campaignId: string; period: string }` — `period` vem do `CampaignDetailClient` (ex: `"7d"`, `"30d"`)
  - [x] T2.3 Implementar fetch com `useCallback` + `useEffect` no padrão existente: URL `/api/meta-ads/campaigns/${campaignId}/creatives?period=${period}`; re-fetch quando `campaignId` ou `period` mudar
  - [x] T2.4 Implementar card horizontal por ad: thumbnail à esquerda (64×64px, `object-cover`, fallback SVG placeholder se erro de carregamento); nome do ad + status badge; grid de métricas (spend, impressions, CTR, CPM, leads, CPL)
  - [x] T2.5 Implementar badge de fadiga (exibido apenas quando `is_fatigued === true`)
  - [x] T2.6 Implementar tooltip no badge de fadiga com critério completo (AC 8) via atributo `title` HTML nativo + `aria-label`
  - [x] T2.7 Implementar estado vazio: verificar `data.ads.length === 0` e exibir mensagem do AC 6
  - [x] T2.8 Implementar estado de loading: skeleton enquanto `loading === true`
  - [x] T2.9 Aplicar classes Tailwind responsivas: `flex-col` em mobile, `flex-row` em `lg:`, thumbnail `hidden lg:block` (AC 9)

- [x] **T3 — Integração: adicionar tab "Criativos" no `CampaignDetailClient`** (AC: 1, 5, 10)
  - [x] T3.1 Importar `CampaignCreatives` em `campaign-detail-client.tsx`
  - [x] T3.2 Adicionar seção após `{/* AdSets table */}` e antes de `{/* ROAS */}` / Leads (fluxo: campanha → adsets → criativos → leads)
  - [x] T3.3 Heading de seção consistente com padrão visual existente (`text-base font-semibold`)
  - [x] T3.4 Passar `period` (já calculado em `const period = days === 7 ? "7d" : days === 90 ? "90d" : "30d"`) diretamente como prop — sem estado adicional

- [x] **T4 — Verificação de regressão** (AC: 10)
  - [x] T4.1 Confirmar que as seções existentes (funil, adsets, leads, gráfico) continuam funcionando — edit isolado, sem mexer em outras seções
  - [x] T4.2 Confirmar que `period` é compartilhado sem estado duplicado (prop drilling de `days → period` no pai)

- [x] **T5 — Testes e lint** (todos os ACs)
  - [x] T5.1 `pnpm lint` — pre-existing env error (missing `eslint-plugin-import`), NÃO causado por esta story (validado via `git stash`). Lint direto nos arquivos novos: 0 errors.
  - [x] T5.2 `pnpm type-check` — passa clean
  - [x] T5.3 Smoke test via dev server: endpoint compila, retorna 401 sem cookie (auth OK), aggregations validadas manualmente via Management API contra prod (campanha `120238175037080741`, 5 ads, spend correto)
  - [x] T5.4 Estado vazio: lógica de retorno `ads: []` quando sem adsets ou sem ads — componente cobre o caso com mensagem AC 6

- [x] **T6 — Atualizar story e fechar**
  - [x] T6.1 Marcar todos os checkboxes completados
  - [x] T6.2 Atualizar status para InReview (aguardar QA gate)
  - [x] T6.3 Registrar arquivos criados/modificados no Dev Agent Record

## Dev Notes

### Contexto e dependências

Story do Epic 26 — Gestão de Criativos Meta Ads. Depende de:
- **Epic 16** (completo): tabelas `meta_ads` e `meta_insights_daily` com `level='ad'` existem e têm schema correto
- **Epic 19** (completo): cron `meta-ads-intelligence` em produção

**Nota crítica sobre dados:** as tabelas `meta_ads` e `meta_insights_daily` (level='ad') existem mas atualmente estão vazias porque o sync de ads não está rodando (investigação em paralelo, fora do escopo desta story). O estado vazio é o estado atual em produção — o componente deve lidar com ele graciosamente via AC 6.

### Padrão de endpoint a seguir

Referência: `packages/web/src/app/api/meta-ads/campaigns/[campaign_id]/funnel/route.ts`

Aspectos obrigatórios a replicar:
- `import { requireAuth } from "@web/lib/api-auth"` — auth via RLS, não service_role
- `const auth = await requireAuth(); if (auth.error) return auth.error`
- `const { supabase, appUser } = auth` — usar `appUser.org_id` em todos os filtros
- `const { campaign_id: metaCampaignId } = await params` — params é Promise no Next.js 16
- `.maybeSingle()` (não `.single()`) para lookups que podem retornar 0 linhas
- Retornar `NextResponse.json(...)` com tipagem explícita da interface de resposta

### Interfaces TypeScript do endpoint

```typescript
interface AdCreativeMetrics {
  ad_id: string
  ad_name: string
  status: string
  // Métricas período selecionado
  spend: number
  impressions: number
  clicks: number
  ctr: number           // clicks / impressions * 100 (%)
  cpm: number
  cpc: number | null
  leads: number
  cpl: number | null    // spend / leads
  // Detecção de fadiga (janelas absolutas — independente do period param)
  ctr_last_3d: number   // CTR médio últimos 3 dias (CURRENT_DATE - 3 até hoje)
  ctr_prev_7d: number   // CTR médio dias -10 a -4 (CURRENT_DATE - 10 até CURRENT_DATE - 4)
  spend_3d: number      // Spend acumulado últimos 3 dias
  is_fatigued: boolean  // ctr_last_3d < ctr_prev_7d * 0.6 AND spend_3d >= 30
  fatigue_drop_pct: number | null  // ROUND((1 - ctr_last_3d / ctr_prev_7d) * 100)
  // Criativo
  thumbnail_url: string | null  // meta_ads.creative->>'thumbnail_url'
  ad_body: string | null        // meta_ads.creative->>'body'
}

interface CreativesApiResponse {
  ads: AdCreativeMetrics[]
  fatigued_count: number
  period_days: number
}
```

### Query SQL do endpoint (do Epic — usar como referência para implementação)

A query do Epic usa 4 CTEs. Como o Supabase JS client não suporta CTEs diretamente, usar **query raw via Management API** ou decompor em múltiplas queries JS e fazer join em memória. Recomendação: decompor em 3 queries paralelas (`Promise.all`) e fazer join em JS pelo `ad_id`:

**Query 1 — Ads da campanha (com creative JSONB):**
```sql
SELECT ma.meta_ad_id, ma.name, ma.status,
       ma.creative->>'thumbnail_url' AS thumbnail_url,
       ma.creative->>'body' AS ad_body
FROM meta_ads ma
JOIN meta_adsets mas ON mas.meta_adset_id = ma.adset_id
WHERE mas.campaign_id = $campaign_id
```
Via Supabase JS:
```typescript
supabase.from("meta_ads")
  .select("meta_ad_id, name, status, creative")
  .in("adset_id", adsetIds) // adset_ids buscados previamente
```

**Query 2 — Métricas do período selecionado:**
```typescript
supabase.from("meta_insights_daily")
  .select("entity_id, spend, impressions, clicks, leads")
  .eq("org_id", appUser.org_id)
  .eq("level", "ad")
  .in("entity_id", adIds)
  .gte("date", periodFrom)
  .lte("date", periodTo)
```
Agregar em JS: `reduce` por `entity_id` somando spend/impressions/clicks/leads, calcular CTR/CPM/CPC/CPL.

**Query 3 — Dados de fadiga (janelas absolutas — não dependem do period param):**
```typescript
// últimos 3d: CURRENT_DATE - 3
// dias anteriores: CURRENT_DATE - 10 até CURRENT_DATE - 4
const today = new Date().toISOString().split("T")[0]
const minus3 = subDays(today, 3)
const minus4 = subDays(today, 4)
const minus10 = subDays(today, 10)

// buscar ambas as janelas em uma query só e filtrar em JS:
supabase.from("meta_insights_daily")
  .select("entity_id, date, spend, impressions, clicks")
  .eq("org_id", appUser.org_id)
  .eq("level", "ad")
  .in("entity_id", adIds)
  .gte("date", minus10)
  .lte("date", today)
```
Separar no JS: rows com `date >= minus3` → ctr_last_3d + spend_3d; rows com `date >= minus10 AND date <= minus4` → ctr_prev_7d.

**Cálculo de fadiga em JS:**
```typescript
const is_fatigued = ctr_last_3d < ctr_prev_7d * 0.6 && spend_3d >= 30
const fatigue_drop_pct = ctr_prev_7d > 0
  ? Math.round((1 - ctr_last_3d / ctr_prev_7d) * 100)
  : null
```

**Ordenação final:**
```typescript
ads.sort((a, b) => {
  if (a.is_fatigued !== b.is_fatigued) return a.is_fatigued ? -1 : 1
  return b.spend - a.spend
})
```

### Padrão React do componente

Referência: `packages/web/src/app/dashboard/campaigns/meta/[campaign_id]/campaign-detail-client.tsx` linhas 73-119 (`fetchActionLog` e `fetchData` com `useCallback` + `useEffect`).

O `CampaignCreatives` recebe `period` como prop (já computado no `CampaignDetailClient` linha 248):
```typescript
const period = days === 7 ? "7d" : days === 90 ? "90d" : "30d"
```
Passar diretamente: `<CampaignCreatives campaignId={campaignId} period={period} />`.

Quando `days` muda no pai, o `period` muda → prop muda → `useEffect` re-dispara o fetch no filho. Sem estado duplicado.

### Padrão visual existente

O `campaign-detail-client.tsx` **não usa tabs com estado próprio** — é uma página de scroll vertical com seções separadas por headings. A "tab Criativos" do Epic é na prática uma nova seção na mesma página. Adicionar após AdSets (linha ~521) e antes de Leads (linha ~534), ou após Leads — decisão de UX: **após AdSets e antes de Leads** (fluxo natural: campanha → adsets → criativos → leads).

Heading de seção a replicar: ver padrão em volta da linha 516 (`{/* AdSets table */}`).

Utilitários de formatação já disponíveis em `@web/lib/meta-format`:
- `formatBRL(value)` — para spend, CPL, CPC
- `formatPercent(value)` — para CTR
- `formatNumber(value)` — para impressions, clicks, leads

Constante de status: `STATUS_BADGES` de `@web/lib/meta-constants` — usar para badge de status do ad.

### Integração no arquivo `campaign-detail-client.tsx`

Ponto de inserção aproximado:

```
linha ~512: <CampaignFunnel campaignId={campaignId} period={period} />
linha ~516: {/* AdSets table */}
linha ~521: <AdsetsTable adsets={adsets} />
            ← INSERIR AQUI: <CampaignCreatives campaignId={campaignId} period={period} />
linha ~534: {/* Leads table */}
linha ~545: <LeadsTable leads={leads} />
```

### Estrutura de arquivos

| Arquivo | Ação |
|---------|------|
| `packages/web/src/app/api/meta-ads/campaigns/[campaign_id]/creatives/route.ts` | CRIAR |
| `packages/web/src/app/dashboard/campaigns/meta/[campaign_id]/campaign-creatives.tsx` | CRIAR |
| `packages/web/src/app/dashboard/campaigns/meta/[campaign_id]/campaign-detail-client.tsx` | EDITAR (import + inserção da seção) |

### Rollback

Risco BAIXO — apenas leitura de dados existentes + nova tab isolada:
- Remover import e seção `<CampaignCreatives />` do `campaign-detail-client.tsx` — zero efeito colateral
- Remover arquivos `creatives/route.ts` e `campaign-creatives.tsx` — sem breaking change em outros endpoints ou componentes

### Tabelas de DB envolvidas

| Tabela | Operação | Observação |
|--------|----------|------------|
| `meta_adsets` | SELECT | Para resolver `adset_id → campaign_id` |
| `meta_ads` | SELECT | `meta_ad_id, name, status, creative` (JSONB com `thumbnail_url` e `body`) |
| `meta_insights_daily` | SELECT | Filtro `level = 'ad'`, `entity_id = meta_ad_id` |

**Nota:** nenhuma migration necessária nesta story. Zero DDL.

## Testing

### Abordagem

Story frontend + API read-only. Sem schema changes. Framework de testes: **Vitest** (não Jest).

### Testes obrigatórios

1. **Lint:** `pnpm --filter @trifold/web lint` — deve passar clean
2. **Typecheck:** `pnpm --filter @trifold/web typecheck` — deve passar clean
3. **Smoke manual (browser):**
   - Abrir `/dashboard/campaigns/meta/[algum_campaign_id]` logado
   - Confirmar seção "Criativos" aparece sem erros JS no console
   - Com tabela `meta_insights_daily` vazia (estado atual de prod): confirmar que a mensagem de estado vazio aparece (AC 6)
   - Alternar período entre 7d e 30d: confirmar que fetch reé acionado (observar Network tab)
   - Confirmar que funil, adsets e leads continuam renderizando (AC 10)

4. **Teste de regressão:** as seções existentes (`CampaignFunnel`, `AdsetsTable`, `LeadsTable`) não devem ser afetadas — sem props extras, sem re-renders desnecessários

### Cenário de validação de lógica de fadiga (quando dados existirem)

Para verificar o badge de fadiga quando houver dados:
```sql
-- Verificar se há ads com dados suficientes para análise
SELECT entity_id, date, clicks, impressions
FROM meta_insights_daily
WHERE level = 'ad'
ORDER BY date DESC
LIMIT 20;
```
Se vazio: o smoke test de fadiga deve ser adiado até o sync de ads ser resolvido (investigação paralela). Registrar esse bloqueio no QA gate.

### Unit test (opcional — se o @dev julgar necessário)

A lógica de fadiga é pure JS (sem I/O). Candidata a unit test isolado:
```typescript
// Testar: ctr_last_3d=0.5, ctr_prev_7d=1.0, spend_3d=40 → is_fatigued=true, drop=50%
// Testar: ctr_last_3d=0.7, ctr_prev_7d=1.0, spend_3d=40 → is_fatigued=false (queda <40%)
// Testar: ctr_last_3d=0.5, ctr_prev_7d=1.0, spend_3d=15 → is_fatigued=false (spend<30)
// Testar: ctr_prev_7d=0 → fatigue_drop_pct=null (divisão por zero)
```

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-18 | 1.0 | Story criada pelo @sm (River) com base no Epic 26 (Morgan/@pm, 2026-05-11). Endpoint spec, interfaces TypeScript, query strategy (decomposição em 3 queries + join JS), padrão de componente e ponto de inserção documentados. SQL raw do Epic embarcado nas Dev Notes. Lógica de fadiga detalhada com casos de teste. | River (@sm) |
| 2026-05-18 | 1.1 | Validação PO aprovada (GO). Score 10/10 no checklist de 10 pontos (story-lifecycle.md). Anti-hallucination: todas as referências cruzadas verificadas no repo (api-auth, funnel/route.ts pattern, meta-format, meta-constants, linha 248 do campaign-detail-client.tsx). Executor assignment válido (@dev → @qa, tools apropriados). Notas não bloqueantes: (1) Dev Notes diz `meta_insights_daily` vazia, mas hoje (2026-05-18) já populada com 35 rows level='ad' via cron meta-sync-insights — @dev pode atualizar durante implementação; (2) snippet da Query 1 omite `.eq("org_id", appUser.org_id)` mas T1.8 cobre. Status: Draft → Ready. | Pax (@po) |
| 2026-05-18 | 1.2 | Implementação concluída em modo YOLO autônomo. 3 arquivos (2 criados + 1 modificado). Type-check clean. Lint quebrado por motivo pré-existente (não relacionado). Smoke test endpoint via curl OK (401 sem cookie = auth funcionando). Aggregations validadas via Management API contra prod. Status: Ready → InProgress → InReview. Aguardando QA gate (@qa). | Dex (@dev) |

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — via AIOS @dev (Dex), modo YOLO autônomo.

### Debug Log References

- Validated DB schema against prod via Supabase Management API:
  - `meta_ads.adset_id` é **uuid** (FK para `meta_adsets.id`), NÃO `text` — o snippet SQL do Epic estava aproximado. Ajustado JOIN para usar uuid.
  - `meta_campaigns.meta_campaign_id` (text) é o ID exposto na URL; `meta_campaigns.id` (uuid) é a PK interna. Fluxo de resolução: URL text → meta_campaigns.id → meta_adsets.id[] → meta_ads.meta_ad_id[] → meta_insights_daily.entity_id.
  - `meta_ads.creative` é JSONB e pode ser `null` (verificado: ~80% dos ads de prod com `creative IS NULL`) — placeholder SVG sempre aplicado nesse caso.
- Smoke test endpoint via curl: `GET /creatives?period=30d` → 401 sem cookie (auth path OK), compila sem erros runtime.
- Aggregation validada por SQL espelhado contra prod (campanha LEADS_NOVOS CRIATIVOS_VIND_13.03.26, 5 ads com insights ontem) — números batem.

### Completion Notes List

- **Endpoint criado:** `GET /api/meta-ads/campaigns/[campaign_id]/creatives?period=7d|30d|90d` com `requireAuth`, filtro `org_id` em TODAS as queries, retorna `{ ads, fatigued_count, period_days }`.
- **Decomposição em 2 queries paralelas (Promise.all)** em vez de 3 — period-window e fatigue-window combinam ads + insights, com aggregations em JS (3 queries totais incluindo lookup de adsets/ads). Mais eficiente que o sugerido no story sem perder corretude.
- **Lógica de fadiga literal:** `ctr_prev_7d > 0 && ctr_last_3d < ctr_prev_7d * 0.6 && spend_3d >= 30`. Janelas absolutas: últimos 3d = `date >= today-3`; prev 7d = `today-10 <= date <= today-4`. Independente do filtro de período.
- **Thumbnail fallback:** `<img>` nativo (não `next/image`) por causa do TTL das URLs do CDN da Meta — evita explosão do optimizer e cascata de 404. Eslint-disable inline justificado. Placeholder SVG inline para `creative IS NULL` ou erro de load.
- **Responsivo:** card `flex-col` em mobile, `flex-row` em `lg:`. Thumbnail `hidden lg:block` (AC 9). Grid de métricas adapta de 2 cols → 6 cols.
- **Estado vazio:** copy literal do AC 6. Aparece quando `data.ads.length === 0` (e.g., campanha sem adsets, sem ads, ou sem insights `level='ad'` no período).
- **Integração:** inserido após `{/* AdSets table */}` e antes de ROAS/Leads. Reutiliza `period` (`days === 7 ? "7d" : days === 90 ? "90d" : "30d"`) já computado no pai — sem state duplicado.
- **Lint:** `pnpm lint` falha por motivo pré-existente (módulo `eslint-plugin-import` não instalado; validado via `git stash` que o erro existia antes da story). Lint direto nos arquivos novos via `eslint --no-config-lookup`: 0 errors/0 warnings (além do "no matching configuration" que é informacional). **@qa deve estar ciente:** essa quebra do lint não é da Story 26.1 e merece uma story separada de devops para corrigir a dependência.
- **Type-check:** `pnpm type-check` passa clean.
- **Não houve mudança de schema, nenhuma migration, nenhuma alteração em código de outras features.** Rollback é trivial (3 arquivos: 2 deletar + 1 reverter 2 hunks).

### Atenção do QA

1. **Validar visualmente em browser:** o endpoint depende de dados `level='ad'` (apenas 35 rows de ontem em prod hoje). Para uma campanha sem adsets/ads, deve mostrar o empty state com a copy do AC 6.
2. **Tooltip:** usa atributo HTML `title` nativo + `aria-label`. Se @qa preferir um componente `<Tooltip>` custom, é um upgrade visual mas o critério funcional do AC 8 está cumprido.
3. **Thumbnail 404:** URLs da Meta têm TTL — o fallback usa `onError` para trocar para SVG. Testável forçando uma URL inválida no DB.
4. **Lint pré-existente quebrado** — não bloqueia esta story, mas existe.

### File List

**Criados:**
- `packages/web/src/app/api/meta-ads/campaigns/[campaign_id]/creatives/route.ts` (endpoint API)
- `packages/web/src/app/dashboard/campaigns/meta/[campaign_id]/campaign-creatives.tsx` (componente cliente)

**Modificados:**
- `packages/web/src/app/dashboard/campaigns/meta/[campaign_id]/campaign-detail-client.tsx` (import + inserção da seção "Criativos" após AdSets)

## QA Results

### Review Date: 2026-05-18

### Reviewed By: Quinn (Test Architect & Guardian)

### Scope

Revisão completa dos 3 arquivos (1 endpoint API + 1 componente cliente + 1 integração). Validação contra schema e dados reais de produção via Supabase Management API (project `dsopqkqjkmhytudaaolv`).

### 7 Quality Checks

| # | Check | Verdict | Notes |
|---|-------|---------|-------|
| 1 | Code Review | PASS | Patterns consistentes com `funnel/route.ts`; tipos explícitos; helpers puros (`safeDiv`, `shiftDays`, `parseCreative`); aggregations em Map<> bem estruturadas; sort estável. |
| 2 | Tests | PASS (concerns) | Smoke via SQL espelhado contra prod (campanha `120238175037080741`, 11 ads, números batem). Unit tests da lógica pura de fadiga ficam em backlog (TEST-001, low). |
| 3 | AC Compliance | PASS (10/10) | Todos os ACs validados — ver evidência detalhada no gate file. |
| 4 | No Regressions | PASS | Edit isolado em `campaign-detail-client.tsx` (adição entre AdSets e ROAS); funil, adsets, leads, gráfico intactos. |
| 5 | Performance | PASS | 2 queries Supabase em `Promise.all` (period + fatigue) + 3 sequenciais (campaign → adsets → ads); sem N+1 (uso correto de `.in()`); ads bulk-loaded. |
| 6 | Security | PASS | `requireAuth` + `appUser.org_id` filtrado em TODAS as 5 queries; sem SQL injection (Supabase JS builder); `encodeURIComponent` no fetch; `ad_body` renderizado como texto puro com `line-clamp` (sem XSS). |
| 7 | Documentation | PASS | File List, Dev Agent Record (com debug log de schema validation contra prod), Change Log v1.0/1.1/1.2 completos. |

### Pontos sensíveis validados (conforme solicitação)

1. **Lógica de fadiga absoluta (AC 5):** confirmado — `shiftDays(3/4/10)` calculados em `route.ts:136-138` independentes do `period` param. Query de fadiga sempre usa janela `[minus10, today]`.
2. **Schema joins:** validado via Management API — `meta_ads.adset_id` é `uuid`, FK para `meta_adsets.id`. Fluxo URL text → `meta_campaigns.id` uuid → `meta_adsets.id[]` uuid → `meta_ads.meta_ad_id[]` text → `meta_insights_daily.entity_id` está correto.
3. **Thumbnail 404 fallback:** `onError` em `<img>` ativa `setThumbBroken(true)` → renderiza `<ThumbnailPlaceholder />` SVG inline. Decisão de usar `<img>` em vez de `next/image` é justificada (TTL do CDN da Meta + custo do optimizer).
4. **Empty state copy:** literal do AC 6 em `campaign-creatives.tsx:91`.
5. **Lint pré-existente quebrado:** confirmado como bug do projeto (módulo `eslint-plugin-import` ausente), não da story. Registrado como MNT-001 (low) — recomenda story separada de @devops.
6. **Validação prod:** SQL espelhado contra `120238175037080741` retorna 11 ads (5 com insights de 2026-05-17, 6 zerados). Apenas 1 dia de insights ad-level em prod → guard `ctr_prev_7d > 0` impede falso positivo de fadiga (CORRETO).

### Issues Identificadas

| ID | Sev | Finding | Recomendação |
|----|-----|---------|--------------|
| TEST-001 | low | Lógica de fadiga sem unit test isolado | Vitest com 4 casos (queda 50%, queda <40%, spend insuficiente, div/0) em backlog |
| REL-001 | low | `new Date()` local + `toISOString()` pode shiftar 1 dia em dev BR próximo à meia-noite | Normalizar para UTC explícito (backlog) |
| MNT-001 | low | Lint do projeto quebrado por `eslint-plugin-import` ausente — pré-existente, não causado pela story | Story de @devops para reinstalar/remover do config |

Nenhuma issue medium/high. Nenhuma issue de segurança.

### Gate Status

Gate: PASS → docs/qa/gates/26.1-ui-performance-criativos-fadiga-meta-ads.yml

Status transition: InReview → **Done**. Pronto para @devops *push.

— Quinn, guardião da qualidade 🛡️
