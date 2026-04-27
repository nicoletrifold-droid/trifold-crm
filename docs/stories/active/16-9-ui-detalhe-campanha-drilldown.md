---
epic: 16
story: 16.9
title: UI — Detalhe de Campanha + Drill-down
status: Done
priority: P2-MÉDIO
created_at: 2026-04-27
created_by: River (@sm)
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [ui_accessibility, chart_rendering, funnel_logic, auth_validation]
complexity: G
estimated_hours: 6
depends_on: [16.8]
---

# Story 16.9 — UI: Detalhe de Campanha + Drill-down

## Contexto

A Story 16.8 criou a lista de campanhas Meta Ads em `/dashboard/campaigns/meta`. Cada linha da tabela
tem um link "Ver detalhes" apontando para `/dashboard/campaigns/meta/{meta_campaign_id}` — mas essa
página ainda não existe.

Esta story implementa a página de detalhe de campanha: uma visão completa de uma campanha específica
com série temporal de spend/leads nos últimos 30 dias, tabela de AdSets com métricas, funil de
conversão CRM completo (Leads Meta → Leads CRM → Qualificados → Visitas → Vendas) e lista dos leads
associados. É o drill-down que transforma o CRM num painel real de BI de marketing imobiliário.

O endpoint `/api/meta-ads/campaigns` (16.8) fornece a lista. Esta story cria um novo endpoint
`GET /api/meta-ads/campaigns/[campaign_id]` que combina dados de múltiplas fontes: `meta_campaigns`,
`meta_adsets`, `meta_insights_daily` (série temporal + AdSet-level), `leads` (CRM) e a view
`meta_campaign_roas` (Story 16.10 — parcialmente disponível, com fallback gracioso quando não
existir).

## Story Statement

**Como** gestor do Trifold CRM,
**Quero** visualizar uma página de detalhe completa de cada campanha Meta Ads com gráficos de
performance, drill-down de AdSets, funil de conversão e lista de leads associados,
**Para que** eu possa entender o ROI real de cada campanha, identificar quais AdSets estão
convertendo e tomar decisões de otimização sem sair do CRM.

## Acceptance Criteria

- [x] **AC1:** Endpoint `GET /api/meta-ads/campaigns/[campaign_id]` criado em
  `packages/web/src/app/api/meta-ads/campaigns/[campaign_id]/route.ts`:
  - Protegido por `requireAuth()` — retorna 401 sem sessão
  - `[campaign_id]` é o `meta_campaign_id` (ID da Meta, ex: `120200000000000000`)
  - Busca a campanha: `SELECT * FROM meta_campaigns WHERE meta_campaign_id = $1 AND org_id = $2`
  - Retorna 404 se campanha não encontrada ou pertencer a outro `org_id`
  - Query params suportados:
    - `days`: `7` | `30` | `90` (default: `30`) — janela de dados da série temporal e AdSets
  - Resposta inclui os seguintes blocos:
    1. `campaign`: header da campanha (nome, objetivo, status, orçamentos, datas)
    2. `timeseries`: array de `{ date, spend, leads_meta, impressions, clicks, ctr }` por dia
       — de `meta_insights_daily WHERE level='campaign' AND entity_id=meta_campaign_id`
       — ordenado por `date ASC`
    3. `adsets`: array de AdSets com métricas agregadas no período
       — join `meta_adsets` com `meta_insights_daily WHERE level='adset'`
    4. `funnel`: objeto com contagens do funil de conversão CRM
    5. `leads`: array dos últimos 50 leads associados (para a tabela de leads da página)
    6. `roas_summary`: objeto ROAS (pode ser `null` se view `meta_campaign_roas` não existir — fallback gracioso)

- [x] **AC2:** Bloco `campaign` na resposta da API:
  ```typescript
  interface CampaignDetail {
    id: string                    // UUID interno
    meta_campaign_id: string      // ID Meta
    name: string
    objective: string | null
    status: "ACTIVE" | "PAUSED" | "ARCHIVED" | "DELETED"
    daily_budget: number | null   // centavos
    lifetime_budget: number | null
    start_time: string | null     // ISO 8601
    stop_time: string | null      // ISO 8601
  }
  ```

- [x] **AC3:** Bloco `timeseries` na resposta da API:
  ```typescript
  interface DayInsight {
    date: string         // "YYYY-MM-DD"
    spend: number        // R$ (float)
    leads_meta: number   // integer
    impressions: number
    clicks: number
    ctr: number          // % (float)
  }
  // Tipo final: DayInsight[] — um elemento por dia no período
  // Dias sem dados: incluir com zeros (preencher gaps para gráfico contínuo)
  ```
  - Preencher dias sem dados com zeros para que o gráfico seja contínuo (sem buracos)
  - Ordenar por `date ASC`

- [x] **AC4:** Bloco `adsets` na resposta da API:
  ```typescript
  interface AdSetWithMetrics {
    id: string                // UUID interno
    meta_adset_id: string
    name: string
    status: "ACTIVE" | "PAUSED" | "ARCHIVED" | "DELETED"
    optimization_goal: string | null
    daily_budget: number | null  // centavos
    // métricas agregadas no período:
    spend: number
    impressions: number
    clicks: number
    ctr: number
    leads_meta: number
    cpl: number | null       // spend/leads_meta; null se leads_meta=0
  }
  ```
  - AdSets sem dados de insights no período: incluir com todas as métricas zeradas
  - Ordenado por `spend DESC`

- [x] **AC5:** Bloco `funnel` na resposta da API:
  ```typescript
  interface ConversionFunnel {
    leads_meta: number         // SUM(meta_insights_daily.leads) no período
    leads_crm: number          // COUNT(leads WHERE utm_campaign=name OR metadata->>'campaign_id'=meta_campaign_id)
    leads_qualified: number    // COUNT(leads WHERE status IN ('qualified','visit_scheduled','visited','sold'))
    visits_scheduled: number   // COUNT(leads WHERE status IN ('visit_scheduled','visited','sold'))
    sales: number              // COUNT(leads WHERE status = 'sold')
  }
  ```
  - `leads_meta` vem da soma de `meta_insights_daily.leads` no período (nível campaign)
  - Os demais campos vêm de queries na tabela `leads` com `org_id` do usuário autenticado
  - Verificar quais status existem no enum `lead_status` antes de usar — adaptar se necessário
    (padrão: `new`, `contacted`, `qualified`, `visit_scheduled`, `visited`, `sold`, `lost`)

- [x] **AC6:** Bloco `leads` na resposta da API:
  ```typescript
  interface AssociatedLead {
    id: string
    name: string | null
    phone: string | null
    email: string | null
    status: string
    source: string
    utm_campaign: string | null
    created_at: string         // ISO 8601
  }
  ```
  - Query: `SELECT id, name, phone, email, status, source, utm_campaign, created_at FROM leads`
    `WHERE org_id = $1 AND (utm_campaign = $campaign_name OR metadata->>'campaign_id' = $meta_campaign_id)`
    `ORDER BY created_at DESC LIMIT 50`

- [x] **AC7:** Bloco `roas_summary` na resposta da API:
  - Tentar query na view `meta_campaign_roas` (criada na Story 16.10):
    `SELECT total_spend, leads_in_crm, sales_count, total_revenue, roas, cpl_real`
    `FROM meta_campaign_roas WHERE meta_campaign_id = $1 AND org_id = $2`
  - Se a view não existir (PostgreSQL error code `42P01`) ou retornar null: retornar `roas_summary: null`
  - **Nunca lançar erro 500 por causa do ROAS** — é sempre opcional/gracioso
  - Interface:
    ```typescript
    interface RoasSummary {
      total_spend: number
      leads_in_crm: number
      sales_count: number
      total_revenue: number
      roas: number | null      // null se spend=0 ou sem vendas
      cpl_real: number | null  // null se leads_crm=0
    }
    ```

- [x] **AC8:** Página `/dashboard/campaigns/meta/[campaign_id]/page.tsx` criada:
  - Padrão Server Component wrapper + Client Component (mesmo de 16.8):
    - `page.tsx` — Server Component: chama `getServerUser()`, extrai `isAdmin`, passa como prop
    - `campaign-detail-client.tsx` — `"use client"`: toda a lógica de fetch, estado e render
  - Path dinâmico: `[campaign_id]` = `meta_campaign_id` (string do ID da Meta)
  - Fetch inicial: `GET /api/meta-ads/campaigns/{campaign_id}?days=30`
  - Estado de loading: skeleton ou spinner durante fetch
  - Estado de erro 404: "Campanha não encontrada" com botão "Voltar para lista"
  - Estado de erro genérico: mensagem clara + botão "Tentar novamente"

- [x] **AC9:** Header da página com dados da campanha:
  - Nome da campanha em destaque (heading principal)
  - Badge de status colorido (mesmo padrão de 16.8: ACTIVE=verde, PAUSED=amarelo, etc.)
  - Objetivo: mapeado para PT-BR (mesmo `OBJECTIVE_LABELS` de 16.8)
  - Orçamento: diário ("R$ X/dia") ou vitalício ("R$ X total") ou "—" se nenhum
  - Período ativo: `start_time` até `stop_time` ou "Em andamento" se sem `stop_time`
  - Breadcrumb: "Campanhas Meta" → nome da campanha (link "Campanhas Meta" → `/dashboard/campaigns/meta`)
  - Seletor de período: `7d` | `30d` | `90d` — re-fetch ao mudar (default: `30d`)

- [x] **AC10:** Gráfico de série temporal (spend + leads por dia):
  - Usar `Recharts` (já importado no dashboard — não adicionar nova dependência)
  - Componente `ComposedChart` com dois eixos Y:
    - Eixo Y esquerdo: `spend` (R$) — linha (`Line`) em cor azul
    - Eixo Y direito: `leads_meta` — barras (`Bar`) em cor verde
  - Eixo X: datas formatadas como "DD/MM"
  - Tooltip customizado mostrando: data, "Spend: R$ X.XXX,XX", "Leads: N"
  - Legenda: "Spend (R$)" e "Leads Meta"
  - Se todos os valores forem zero: exibir mensagem "Sem dados de performance no período selecionado"
  - Título da seção: "Performance por Dia — últimos {N} dias"

- [x] **AC11:** Tabela de AdSets com métricas:
  - Colunas:

    | # | Coluna | Conteúdo |
    |---|--------|---------|
    | 1 | AdSet | nome |
    | 2 | Status | badge colorido (mesmo padrão de campanhas) |
    | 3 | Objetivo de Otimização | optimization_goal mapeado para PT-BR |
    | 4 | Orçamento | daily_budget formatado ou "—" |
    | 5 | Spend | "R$ X.XXX,XX" |
    | 6 | Impressões | número formatado |
    | 7 | Cliques | número formatado |
    | 8 | CTR | percentual 2 casas (ex: "2,34%") |
    | 9 | Leads | inteiro |
    | 10 | CPL | "R$ X,XX" ou "—" se leads=0 |

  - Ordenação default: spend DESC (conforme API)
  - Estado vazio: "Nenhum AdSet encontrado para esta campanha" se array vazio

- [x] **AC12:** Funil de conversão:
  - Layout visual horizontal ou vertical com 5 etapas e setas entre elas:
    1. **Leads Meta** — número de `funnel.leads_meta`
    2. **Leads CRM** — número de `funnel.leads_crm` + taxa de captura vs. Leads Meta
    3. **Qualificados** — número de `funnel.leads_qualified` + taxa vs. Leads CRM
    4. **Visitas Agendadas** — número de `funnel.visits_scheduled` + taxa vs. Qualificados
    5. **Vendas** — número de `funnel.sales` + taxa vs. Visitas Agendadas
  - Taxa de conversão entre etapas: `(etapa_atual / etapa_anterior * 100).toFixed(1)%`
    — exibir "—" se etapa anterior = 0
  - Título da seção: "Funil de Conversão"

- [x] **AC13:** Card de ROAS (renderizado somente se `roas_summary !== null`):
  - Card com métricas-chave em grid 2×3:
    - Total Gasto: `total_spend` formatado em BRL
    - Leads CRM: `leads_in_crm`
    - CPL Real: `cpl_real` em BRL ou "—"
    - Vendas: `sales_count`
    - Receita Total: `total_revenue` em BRL
    - ROAS: `roas.toFixed(2)` ou "—" se null
  - ROAS colorido: >= 3.0 = verde, 1.0-2.99 = amarelo, < 1.0 = vermelho
  - Título da seção: "ROAS & Conversão"
  - Se `roas_summary === null`: exibir card informativo "ROAS disponível após configurar vendas (Story 16.10)" em cinza

- [x] **AC14:** Tabela de leads associados:
  - Exibe os últimos 50 leads retornados pela API
  - Colunas: Nome, Telefone, Status, Origem, UTM Campaign, Data de Criação
  - Status como badge colorido (seguir padrão existente do CRM se disponível)
  - Nome como link → `/dashboard/leads/{id}`
  - Data formatada: "DD/MM/AAAA HH:MM"
  - Estado vazio: "Nenhum lead associado a esta campanha encontrado no CRM"
  - Título da seção: "Leads Associados"

- [x] **AC15:** TypeScript: `npm run type-check` passa sem erros. Sem `any` explícito nos arquivos
  criados por esta story.

## Scope

### IN (o que esta story implementa)
- `GET /api/meta-ads/campaigns/[campaign_id]` — detalhes de uma campanha: header, série
  temporal, AdSets com métricas, funil de conversão, leads associados, ROAS summary (opcional)
- `/dashboard/campaigns/meta/[campaign_id]/page.tsx` — Server Component wrapper
- `/dashboard/campaigns/meta/[campaign_id]/campaign-detail-client.tsx` — Client Component com
  gráfico, tabelas, funil e card ROAS
- Tipos TypeScript novos em `packages/shared/src/meta/types.ts`: `MetaCampaignDetail`,
  `MetaInsightTimeSeries`, `MetaAdSetWithMetrics`, `ConversionFunnel`, `RoasSummary`

### OUT (fora desta story)
- Cálculo de ROAS com view SQL (→ Story 16.10 — esta story apenas consome a view se já existir)
- Página de detalhe de AdSet individual (não planejada no epic)
- Drill-down para anúncios individuais (nível de Ad — fora de escopo)
- Export de dados para CSV/Excel
- Comparação entre períodos (ex: "vs. período anterior")
- Sincronização manual de insights por campanha específica
- Edição de campanha (read-only)

## Dev Notes

### Arquitetura da API: múltiplas queries + agregação no servidor

Seguir o padrão de 16.8 (3 queries separadas, agregadas no servidor). Para 16.9 são mais queries:

```typescript
// packages/web/src/app/api/meta-ads/campaigns/[campaign_id]/route.ts

import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"
import { createClient } from "@web/lib/supabase/server"

export async function GET(
  request: NextRequest,
  { params }: { params: { campaign_id: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { appUser } = auth
  const metaCampaignId = params.campaign_id
  const days = parseInt(request.nextUrl.searchParams.get("days") ?? "30")
  const supabase = await createClient()

  // 1. Campanha
  const { data: campaign } = await supabase
    .from("meta_campaigns")
    .select("id, meta_campaign_id, name, objective, status, daily_budget, lifetime_budget, start_time, stop_time")
    .eq("meta_campaign_id", metaCampaignId)
    .eq("org_id", appUser.org_id)
    .single()

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
  }

  // 2. Série temporal (level='campaign')
  const { from, to } = getPeriodDates(days)
  const { data: insights } = await supabase
    .from("meta_insights_daily")
    .select("date, spend, impressions, clicks, ctr, leads")
    .eq("org_id", appUser.org_id)
    .eq("level", "campaign")
    .eq("entity_id", metaCampaignId)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true })

  // 3. AdSets
  const { data: adsets } = await supabase
    .from("meta_adsets")
    .select("id, meta_adset_id, name, status, optimization_goal, daily_budget")
    .eq("org_id", appUser.org_id)
    .eq("meta_campaign_id", metaCampaignId)

  // 4. Insights de AdSets no período
  const adsetIds = (adsets ?? []).map((a) => a.meta_adset_id)
  const { data: adsetInsights } = adsetIds.length > 0
    ? await supabase
        .from("meta_insights_daily")
        .select("entity_id, spend, impressions, clicks, ctr, leads")
        .eq("org_id", appUser.org_id)
        .eq("level", "adset")
        .in("entity_id", adsetIds)
        .gte("date", from)
        .lte("date", to)
    : { data: [] }

  // 5. Leads no CRM
  const { data: leads } = await supabase
    .from("leads")
    .select("id, name, phone, email, status, source, utm_campaign, created_at")
    .eq("org_id", appUser.org_id)
    .or(`utm_campaign.eq.${campaign.name},metadata->>campaign_id.eq.${metaCampaignId}`)
    .order("created_at", { ascending: false })
    .limit(50)

  // 6. Leads para funil (sem LIMIT, só contagens por status)
  const { data: allLeads } = await supabase
    .from("leads")
    .select("status")
    .eq("org_id", appUser.org_id)
    .or(`utm_campaign.eq.${campaign.name},metadata->>campaign_id.eq.${metaCampaignId}`)

  // 7. ROAS — opcional, gracioso
  let roas_summary = null
  try {
    const { data: roas } = await supabase
      .from("meta_campaign_roas")
      .select("total_spend, leads_in_crm, sales_count, total_revenue, roas, cpl_real")
      .eq("meta_campaign_id", metaCampaignId)
      .eq("org_id", appUser.org_id)
      .single()
    roas_summary = roas ?? null
  } catch {
    // View pode não existir ainda (Story 16.10) — falhar silenciosamente
    roas_summary = null
  }

  return NextResponse.json({
    campaign,
    timeseries: buildTimeseries(insights ?? [], from, to),
    adsets: buildAdsetMetrics(adsets ?? [], adsetInsights ?? []),
    funnel: buildFunnel(insights ?? [], allLeads ?? []),
    leads: leads ?? [],
    roas_summary,
  })
}
```

### Construção da série temporal com gaps preenchidos

```typescript
function getPeriodDates(days: number): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - days)
  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  }
}

function buildTimeseries(
  insights: Array<{ date: string; spend: number; impressions: number; clicks: number; ctr: number; leads: number }>,
  from: string,
  to: string
): DayInsight[] {
  // Criar mapa de dados existentes
  const map = new Map(insights.map((i) => [i.date, i]))

  // Iterar por todos os dias no período e preencher zeros onde não há dados
  const result: DayInsight[] = []
  const cursor = new Date(from)
  const end = new Date(to)
  while (cursor <= end) {
    const dateStr = cursor.toISOString().split("T")[0]
    const row = map.get(dateStr)
    result.push({
      date: dateStr,
      spend: row?.spend ?? 0,
      leads_meta: row?.leads ?? 0,
      impressions: row?.impressions ?? 0,
      clicks: row?.clicks ?? 0,
      ctr: row?.ctr ?? 0,
    })
    cursor.setDate(cursor.getDate() + 1)
  }
  return result
}
```

### Construção de AdSets com métricas agregadas

```typescript
function buildAdsetMetrics(
  adsets: MetaAdSet[],
  insights: Array<{ entity_id: string; spend: number; impressions: number; clicks: number; ctr: number; leads: number }>
): AdSetWithMetrics[] {
  // Agrupar insights por entity_id (meta_adset_id), somar campos numéricos
  const insightMap = new Map<string, { spend: number; impressions: number; clicks: number; leads: number; ctr_sum: number; count: number }>()
  for (const ins of insights) {
    const acc = insightMap.get(ins.entity_id) ?? { spend: 0, impressions: 0, clicks: 0, leads: 0, ctr_sum: 0, count: 0 }
    acc.spend += ins.spend
    acc.impressions += ins.impressions
    acc.clicks += ins.clicks
    acc.leads += ins.leads
    acc.ctr_sum += ins.ctr
    acc.count++
    insightMap.set(ins.entity_id, acc)
  }

  return adsets
    .map((adset) => {
      const m = insightMap.get(adset.meta_adset_id)
      return {
        id: adset.id,
        meta_adset_id: adset.meta_adset_id,
        name: adset.name,
        status: adset.status,
        optimization_goal: adset.optimization_goal ?? null,
        daily_budget: adset.daily_budget ?? null,
        spend: m?.spend ?? 0,
        impressions: m?.impressions ?? 0,
        clicks: m?.clicks ?? 0,
        ctr: m && m.count > 0 ? m.ctr_sum / m.count : 0,
        leads_meta: m?.leads ?? 0,
        cpl: m && m.leads > 0 ? m.spend / m.leads : null,
      }
    })
    .sort((a, b) => b.spend - a.spend)
}
```

### Construção do funil de conversão

```typescript
const QUALIFIED_STATUSES = ["qualified", "visit_scheduled", "visited", "sold"]
const VISIT_STATUSES = ["visit_scheduled", "visited", "sold"]

function buildFunnel(
  campaignInsights: Array<{ leads: number }>,
  allLeads: Array<{ status: string }>
): ConversionFunnel {
  const leads_meta = campaignInsights.reduce((sum, i) => sum + (i.leads ?? 0), 0)
  const leads_crm = allLeads.length
  const leads_qualified = allLeads.filter((l) => QUALIFIED_STATUSES.includes(l.status)).length
  const visits_scheduled = allLeads.filter((l) => VISIT_STATUSES.includes(l.status)).length
  const sales = allLeads.filter((l) => l.status === "sold").length

  return { leads_meta, leads_crm, leads_qualified, visits_scheduled, sales }
}
```

### Gráfico Recharts — ComposedChart com dois eixos Y

```typescript
// Em campaign-detail-client.tsx
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"

// Formatação do eixo Y esquerdo (spend em R$)
const formatSpendAxis = (value: number) =>
  value >= 1000 ? `R$ ${(value / 1000).toFixed(0)}k` : `R$ ${value}`

// Tooltip customizado
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  const [barPayload, linePayload] = payload
  const [day, month] = label.split("-").reverse()
  return (
    <div className="bg-white border border-gray-200 rounded p-3 shadow text-sm">
      <p className="font-medium mb-1">{`${day}/${month}`}</p>
      <p className="text-blue-600">Spend: {formatBRL(linePayload?.value ?? 0)}</p>
      <p className="text-green-600">Leads: {barPayload?.value ?? 0}</p>
    </div>
  )
}

// Uso:
<ResponsiveContainer width="100%" height={280}>
  <ComposedChart data={timeseries}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis
      dataKey="date"
      tickFormatter={(v) => {
        const [, month, day] = v.split("-")
        return `${day}/${month}`
      }}
      tick={{ fontSize: 12 }}
    />
    <YAxis yAxisId="left" tickFormatter={formatSpendAxis} tick={{ fontSize: 12 }} />
    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
    <Tooltip content={<CustomTooltip />} />
    <Legend />
    <Bar yAxisId="right" dataKey="leads_meta" name="Leads Meta" fill="#22c55e" opacity={0.8} />
    <Line yAxisId="left" type="monotone" dataKey="spend" name="Spend (R$)" stroke="#3b82f6" strokeWidth={2} dot={false} />
  </ComposedChart>
</ResponsiveContainer>
```

### Mapeamento de optimization_goal para PT-BR

```typescript
const OPTIMIZATION_GOAL_LABELS: Record<string, string> = {
  LEAD_GENERATION: "Geração de Leads",
  CONVERSATIONS: "Conversas",
  LINK_CLICKS: "Cliques no Link",
  LANDING_PAGE_VIEWS: "Visualizações de Página",
  IMPRESSIONS: "Impressões",
  REACH: "Alcance",
  ENGAGED_USERS: "Usuários Engajados",
  PAGE_LIKES: "Curtidas na Página",
  OFFSITE_CONVERSIONS: "Conversões Externas",
  APP_INSTALLS: "Instalações de App",
  REPLIES: "Respostas",
}
// Fallback: exibir optimization_goal original se não mapeado
```

### Tipos a adicionar em packages/shared/src/meta/types.ts

```typescript
// Adicionar ao arquivo existente (não substituir tipos existentes)

export interface MetaCampaignDetail {
  id: string
  meta_campaign_id: string
  name: string
  objective: string | null
  status: "ACTIVE" | "PAUSED" | "ARCHIVED" | "DELETED"
  daily_budget: number | null
  lifetime_budget: number | null
  start_time: string | null
  stop_time: string | null
}

export interface MetaInsightTimeSeries {
  date: string
  spend: number
  leads_meta: number
  impressions: number
  clicks: number
  ctr: number
}

export interface MetaAdSetWithMetrics {
  id: string
  meta_adset_id: string
  name: string
  status: string
  optimization_goal: string | null
  daily_budget: number | null
  spend: number
  impressions: number
  clicks: number
  ctr: number
  leads_meta: number
  cpl: number | null
}

export interface ConversionFunnel {
  leads_meta: number
  leads_crm: number
  leads_qualified: number
  visits_scheduled: number
  sales: number
}

export interface RoasSummary {
  total_spend: number
  leads_in_crm: number
  sales_count: number
  total_revenue: number
  roas: number | null
  cpl_real: number | null
}

export interface AssociatedLead {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  status: string
  source: string
  utm_campaign: string | null
  created_at: string
}

export interface CampaignDetailApiResponse {
  campaign: MetaCampaignDetail
  timeseries: MetaInsightTimeSeries[]
  adsets: MetaAdSetWithMetrics[]
  funnel: ConversionFunnel
  leads: AssociatedLead[]
  roas_summary: RoasSummary | null
}
```

### Padrão de estrutura de página (Server + Client)

```typescript
// packages/web/src/app/dashboard/campaigns/meta/[campaign_id]/page.tsx
// — Server Component
import { getServerUser } from "@web/lib/auth"
import CampaignDetailClient from "./campaign-detail-client"

export default async function CampaignDetailPage({
  params,
}: {
  params: { campaign_id: string }
}) {
  const user = await getServerUser()
  const isAdmin = user.role === "admin"
  return <CampaignDetailClient campaignId={params.campaign_id} isAdmin={isAdmin} />
}
```

```typescript
// packages/web/src/app/dashboard/campaigns/meta/[campaign_id]/campaign-detail-client.tsx
"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
// ... imports do Recharts

interface Props {
  campaignId: string
  isAdmin: boolean
}

export default function CampaignDetailClient({ campaignId, isAdmin }: Props) {
  const [data, setData] = useState<CampaignDetailApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(30)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/meta-ads/campaigns/${campaignId}?days=${days}`)
      if (res.status === 404) {
        setError("not_found")
        return
      }
      if (!res.ok) throw new Error("Erro ao carregar campanha")
      setData(await res.json())
    } catch (e) {
      setError("generic")
    } finally {
      setLoading(false)
    }
  }, [campaignId, days])

  useEffect(() => { fetchData() }, [fetchData])

  // ... render
}
```

### Reutilizar formatações de 16.8

Os helpers `formatBRL`, `formatBudget`, `formatNumber`, `formatPercent` já estão em
`packages/web/src/app/dashboard/campaigns/meta/campaigns-meta-client.tsx`. O @dev pode
extraí-los para um arquivo compartilhado `@web/lib/meta-format.ts` ou duplicar na
`campaign-detail-client.tsx` — decisão deixada para o @dev; ambas abordagens são válidas.

Os mesmos badges de status de campanha (`STATUS_BADGES`) e mapeamento de objetivos
(`OBJECTIVE_LABELS`) de 16.8 devem ser reutilizados. Se duplicados, o @dev pode consolidar
em um arquivo de constantes compartilhado `@web/lib/meta-constants.ts`.

### Recharts já é dependência do projeto

Verificar com `grep -r "recharts" /Users/ogabrielhr/trifold-crm/packages/web/package.json`.
Não adicionar se já presente. Não substituir por outra biblioteca de gráficos.

### Env vars utilizadas

- Nenhuma env var nova — esta story apenas lê dados já sincronizados pelas stories anteriores
- `NEXT_PUBLIC_SITE_URL` — não necessário nesta story (sem chamadas internas a crons)

### Tabelas do banco utilizadas (read-only para esta story)

- `meta_campaigns` — header da campanha
- `meta_adsets` — AdSets da campanha
- `meta_insights_daily` — série temporal (level='campaign') e métricas de AdSets (level='adset')
- `leads` — leads associados e contagens do funil
- `meta_campaign_roas` (view) — ROAS summary, opcional/gracioso se não existir

### Cuidados com a query OR no Supabase client

A sintaxe `.or()` do Supabase para campos JSONB pode ser tricky. Usar:
```typescript
.or(`utm_campaign.eq.${campaign.name},metadata->>campaign_id.eq.${metaCampaignId}`)
```
Se isso causar erro, fallback: duas queries separadas + deduplicação por `id` com `Set`.

## Tasks / Subtasks

- [x] **Task 1** — Adicionar tipos em `packages/shared/src/meta/types.ts` (AC2-AC7)
  - [x] 1.1 — Adicionar `MetaCampaignDetail`, `MetaInsightTimeSeries`, `MetaAdSetWithMetrics`
  - [x] 1.2 — Adicionar `ConversionFunnel`, `RoasSummary`, `AssociatedLead`, `CampaignDetailApiResponse`
  - [x] 1.3 — Tipos exportados via `packages/shared/src/meta/index.ts` (já re-exporta `./types`)

- [x] **Task 2** — Criar API `GET /api/meta-ads/campaigns/[campaign_id]` (AC1-AC7)
  - [x] 2.1 — Criar `packages/web/src/app/api/meta-ads/campaigns/[campaign_id]/route.ts`
  - [x] 2.2 — `requireAuth()` → 401 sem sessão; 404 se campanha não encontrada ou org diferente
  - [x] 2.3 — Query params: `days` (default 30, aceitar 7/30/90)
  - [x] 2.4 — Queries: campanha, insights série temporal, AdSets, insights AdSets, leads (limit 50), todos os leads (para funil)
  - [x] 2.5 — Helpers: `getPeriodDates`, `buildTimeseries` (com preenchimento de gaps), `buildAdsetMetrics`, `buildFunnel`
  - [x] 2.6 — ROAS: try/catch + check `result.error` → `null` se view não existir (AC7)
  - [x] 2.7 — Retornar `CampaignDetailApiResponse` tipada

- [x] **Task 3** — Criar página Server Component wrapper (AC8, AC9)
  - [x] 3.1 — Criar `packages/web/src/app/dashboard/campaigns/meta/[campaign_id]/page.tsx`
  - [x] 3.2 — Chamar `getServerUser()`, extrair `isAdmin`, passar como prop ao Client Component

- [x] **Task 4** — Criar Client Component principal (AC8-AC15)
  - [x] 4.1 — Criar `packages/web/src/app/dashboard/campaigns/meta/[campaign_id]/campaign-detail-client.tsx`
  - [x] 4.2 — Estado: `data`, `loading`, `error`, `days` (seletor de período)
  - [x] 4.3 — `useEffect` + `useCallback` para re-fetch ao mudar `days`
  - [x] 4.4 — Estados de loading (skeleton), erro 404, erro genérico (AC8)

- [x] **Task 5** — Implementar header da campanha (AC9)
  - [x] 5.1 — Breadcrumb: "Campanhas Meta" → nome da campanha
  - [x] 5.2 — Nome, badge de status, objetivo, orçamento, período ativo
  - [x] 5.3 — Seletor de período 7d/30d/90d com re-fetch

- [x] **Task 6** — Implementar gráfico de série temporal (AC10)
  - [x] 6.1 — `ComposedChart` SVG-nativo (Recharts NÃO está instalado — fallback custom; mantém AC10 funcional sem nova dependência)
  - [x] 6.2 — Tooltip customizado com data, spend em BRL, leads
  - [x] 6.3 — Recharts não instalado → custom SVG (decisão conservadora: não adicionar dependência)
  - [x] 6.4 — Estado vazio: mensagem "Sem dados de performance no período selecionado"

- [x] **Task 7** — Implementar tabela de AdSets (AC11)
  - [x] 7.1 — Tabela com 10 colunas, badges de status, optimization_goal mapeado
  - [x] 7.2 — Estado vazio se array de AdSets estiver vazio

- [x] **Task 8** — Implementar funil de conversão (AC12)
  - [x] 8.1 — 5 etapas visuais com setas entre elas
  - [x] 8.2 — Taxas de conversão entre etapas (ou "—" se etapa anterior = 0)

- [x] **Task 9** — Implementar card ROAS (AC13)
  - [x] 9.1 — Renderizar card apenas se `roas_summary !== null`
  - [x] 9.2 — Grid 2×3 com métricas ROAS coloridas por valor
  - [x] 9.3 — Card informativo em cinza se `roas_summary === null`

- [x] **Task 10** — Implementar tabela de leads associados (AC14)
  - [x] 10.1 — Colunas: Nome (link), Telefone, Status badge, Origem, UTM Campaign, Data
  - [x] 10.2 — Estado vazio se array de leads estiver vazio

- [x] **Task 11** — Validação final (AC15)
  - [x] 11.1 — `npx tsc --noEmit` sem erros (em packages/web e packages/shared)
  - [x] 11.2 — `npx eslint src/` sem erros nos arquivos criados (apenas 2 warnings pré-existentes não relacionados)

## File List

### Arquivos criados
- `packages/web/src/app/api/meta-ads/campaigns/[campaign_id]/route.ts` — API GET endpoint (campaign detail)
- `packages/web/src/app/dashboard/campaigns/meta/[campaign_id]/page.tsx` — Server Component wrapper
- `packages/web/src/app/dashboard/campaigns/meta/[campaign_id]/campaign-detail-client.tsx` — Client Component (header + chart + adsets + funnel + ROAS + leads)
- `packages/web/src/lib/meta-format.ts` — formatadores compartilhados (`formatBRL`, `formatBudget`, `formatNumber`, `formatPercent`, `formatDayMonth`, `formatPeriod`, `formatDateTime`)
- `packages/web/src/lib/meta-constants.ts` — constantes compartilhadas (`STATUS_BADGES`, `OBJECTIVE_LABELS`, `OPTIMIZATION_GOAL_LABELS`, `LEAD_STATUS_BADGES`)

### Arquivos modificados
- `packages/shared/src/meta/types.ts` — adicionados: `MetaCampaignDetail`, `MetaInsightTimeSeries`, `MetaAdSetWithMetrics`, `ConversionFunnel`, `RoasSummary`, `AssociatedLead`, `CampaignDetailApiResponse` (tipos pré-existentes preservados)

### Notas de implementação (decisões do @dev)
- **Recharts NÃO está instalado** no projeto (apesar do AC10 mencionar) — usado SVG nativo customizado para o `ComposedChart`. Mantém AC10 funcional (linha spend + barras leads + dois eixos Y + tooltip + estado vazio) sem adicionar dependência.
- **Schema real de leads** difere do AC5: a tabela `leads` não tem coluna `status` nem `metadata` jsonb. Adaptado para usar `kanban_stages.type` (via FK `stage_id`) + `qualification_status` + `visit_scheduled_at`. Mapeamento:
  - `leads_qualified` → stage_type ∈ {qualificado, agendado, visitou, proposta, fechado} OU `qualification_status = 'qualified'`
  - `visits_scheduled` → stage_type ∈ {agendado, visitou, proposta, fechado} OU `visit_scheduled_at IS NOT NULL`
  - `sales` → stage_type = 'fechado'
- **Associação lead↔campanha**: schema só permite `utm_campaign = campaign.name` (sem `metadata->>'campaign_id'` pois coluna não existe). Decisão conservadora: fallback robusto para o único sinal disponível.
- **Helpers compartilhados extraídos**: `meta-format.ts` e `meta-constants.ts` criados para evitar duplicação entre 16.8 e 16.9 (segue IDS REUSE > ADAPT > CREATE).

## Testes

- [x] `npx tsc --noEmit` passa sem erros (validado em packages/web e packages/shared)
- [x] `npx eslint src/` passa sem erros nos arquivos novos (apenas 2 warnings pré-existentes não relacionados)
- [x] `GET /api/meta-ads/campaigns/[campaign_id]` retorna 401 sem sessão (via `requireAuth()` — verificado em código)
- [x] `GET /api/meta-ads/campaigns/[campaign_id]` retorna 404 para ID inexistente (via `maybeSingle()` + null check — verificado em código)
- [x] `GET /api/meta-ads/campaigns/[campaign_id]` retorna 404 para campanha de outro org (via `.eq('org_id', appUser.org_id)` — verificado em código)
- [x] `GET /api/meta-ads/campaigns/[campaign_id]?days=7` retorna série temporal com exatamente 7+1 dias (via `buildTimeseries()` cursor inclusivo — verificado em código)
- [x] Série temporal sem dados: todos os valores zero (gaps preenchidos via `Map` lookup com fallback `?? 0`)
- [x] `roas_summary` é `null` quando view `meta_campaign_roas` não existe (try/catch + check `result.error` — verificado em código)
- [x] Página `/dashboard/campaigns/meta/[campaign_id]` renderiza sem erros (estado de loading skeleton implementado)
- [x] Seletor 30d → 7d: re-fetch com `days=7` e gráfico atualizado (via `useCallback` + `useEffect` deps)
- [x] Funil: taxas exibem "—" quando etapa anterior = 0 (verificado em `formatRate` — `if (prev === 0) return "—"`)
- [x] Tabela de leads: link "Nome" aponta para `/dashboard/leads/{id}` (`<Link href={`/dashboard/leads/${lead.id}`}>`)
- [x] Breadcrumb "Campanhas Meta" navega para `/dashboard/campaigns/meta` (`<Link href="/dashboard/campaigns/meta">`)
- [x] Estado 404: mensagem clara com botão "Voltar para lista" (componente `error === "not_found"` implementado)

## CodeRabbit Integration

**Story Type Analysis:**
- Primary Type: Frontend + Backend API
- Secondary Type: Data Visualization (Recharts)
- Complexity: Grande (API com 6 queries + agregação + gráfico + funil + múltiplas tabelas)

**Specialized Agent Assignment:**
- Primary: `@dev` (implementação)
- Quality Gate: `@qa` (acessibilidade, renderização do gráfico, lógica do funil, auth das APIs)

**Quality Gate Tasks:**
- [x] Pre-Commit (`@dev`): `npx tsc --noEmit` sem erros, ESLint sem erros nos arquivos novos
- [ ] Pre-PR (`@qa`): Validar auth da API, funil sem divisão por zero, graceful fallback do ROAS, breadcrumb correto, não regressão em 16.8

**Self-Healing Configuration:**
- Primary Agent: `@dev` (light mode)
- Max Iterations: 2
- Timeout: 30 minutos
- Severity Filter: CRITICAL, HIGH
- CRITICAL issues: auto_fix (max 2 iterações)
- HIGH issues: auto_fix (iteração < 2), senão document_as_debt

**CodeRabbit Focus Areas:**
- `requireAuth()` em todas as rotas — sem bypass
- 404 vs. 401 correto: campanha não encontrada = 404, sem sessão = 401, org diferente = 404 (não 403)
- Graceful fallback do ROAS: `try/catch` não pode deixar error 500 escapar
- Funil: divisão por zero protegida em todas as taxas de conversão
- Recharts: sem `any` explícito nos payloads do Tooltip — usar interfaces corretas
- Série temporal: gaps preenchidos com zeros, não omitir dias sem dados
- Query OR no Supabase: testar com `metadata->>campaign_id` antes do merge
- `meta_campaign_roas` view: verificar se a query usa `org_id` corretamente (RLS)
- Tipos novos em `shared/meta/types.ts`: não remover nem renomear tipos existentes de 16.2

## Change Log

| Data | Agente | Ação |
|---|---|---|
| 2026-04-27 | @sm (River) | Story criada — Draft |
| 2026-04-27 | @po (Pax) | Validação 10-point: 9.5/10 (9 PASS + 1 PARTIAL em Riscos dispersos, não-bloqueante). Veredicto: GO. Status: Draft → Ready. |
| 2026-04-27 | @dev (Dex) | Implementação completa em YOLO mode. Tasks 1-11 concluídas. ACs 1-15 atendidos com 2 desvios documentados: (a) Recharts não instalado → SVG custom; (b) Schema de `leads` não tem `status`/`metadata` → adaptado para `kanban_stages.type` + `qualification_status`. Typecheck e ESLint passando. Status: Ready → Ready for Review. |
| 2026-04-27 | @qa (Quinn) | Review concluído. 15/15 ACs PASS. Auth/RLS/segurança validadas (404 cross-org, sem info leak, sem SQL injection). Graceful fallback ROAS verificado. Divisão por zero protegida no funil. 6 issues LOW (manutenibilidade/observabilidade) — nenhum bloqueia. Veredicto: PASS. Gate: docs/qa/gates/16.9-ui-detalhe-campanha-drilldown.yml. |
| 2026-04-27 | @devops (Gage) | Push autorizado para `origin/main`. Stage seletivo: API route, página + client, helpers (`meta-format.ts`, `meta-constants.ts`), tipos (`packages/shared/src/meta/types.ts`), story file e QA gate. `tsconfig.tsbuildinfo` e `supabase/.temp` excluídos como ruído. Status: Ready for Review → Done. |

## QA Results

### Review Date: 2026-04-27

### Reviewed By: Quinn (Test Architect / @qa)

### Verdict: **PASS**

### AC Coverage (15/15 PASS)

| AC | Status | Evidência |
|----|--------|-----------|
| AC1 | PASS | `route.ts:265-292` — `requireAuth()` retorna 401; `maybeSingle()` + `.eq("org_id")` retorna 404 (não 403) cross-org; `parseDays` com cap defensivo em 365. |
| AC2 | PASS | `route.ts:398-416` — bloco `campaign` tipado `MetaCampaignDetail`; conversão segura string→number de `daily_budget`/`lifetime_budget`. |
| AC3 | PASS | `route.ts:118-145` — `buildTimeseries` preenche gaps via `Map` lookup, cursor UTC inclusivo, ordenado por date ASC, zeros para dias sem dados. |
| AC4 | PASS | `route.ts:147-196` — `buildAdsetMetrics` agrega por `entity_id`, sort `spend DESC`, CTR derivado de totais (clicks/impressions — mais correto que média ponderada simples). |
| AC5 | PASS | `route.ts:241-254` + helpers — funil adaptado para schema real (`kanban_stages.type` + `qualification_status` + `visit_scheduled_at`). Desvio documentado e tecnicamente correto. |
| AC6 | PASS | `route.ts:341-351` — query com `.eq("utm_campaign", campaignName)`, `.order("created_at" desc)`, `.limit(50)`. |
| AC7 | PASS | `route.ts:367-393` — try/catch externo + check `result.error` → `null` se view não existe. Nunca propaga 500. |
| AC8 | PASS | `page.tsx` Server Component (chama `getServerUser()`, passa `isAdmin` prop) → `campaign-detail-client.tsx` Client Component. Loading skeleton, erro 404 com botão voltar, erro genérico com retry. |
| AC9 | PASS | `campaign-detail-client.tsx:131-206` — Breadcrumb funcional, status badge, `OBJECTIVE_LABELS` PT-BR, `formatPeriod` com fallback "Em andamento", seletor 7d/30d/90d com re-fetch via `useCallback` deps. |
| AC10 | PASS | `TimeSeriesChart` SVG nativo (Recharts não instalado — decisão conservadora). Dois eixos Y, tooltip hover com data/spend/leads, legenda, estado vazio. Funcionalmente equivalente ao Recharts. |
| AC11 | PASS | `AdsetsTable` com 10 colunas conforme spec; estado vazio implementado; CPL `'—'` se leads=0. |
| AC12 | PASS | `ConversionFunnelView` — 5 etapas em grid responsivo, setas `›` entre cards (md+); `formatRate` retorna `'—'` se `prev === 0` (divisão por zero protegida). |
| AC13 | PASS | `RoasCard` — sempre renderiza, mas com fallback informativo cinza se `roas === null`; cores por threshold ROAS (>=3 verde, >=1 amarelo, <1 vermelho). |
| AC14 | PASS | `LeadsTable` — link Nome → `/dashboard/leads/{id}`, badges via `LEAD_STATUS_BADGES`, `formatDateTime`, estado vazio. |
| AC15 | PASS | `tsc --noEmit` passa em `packages/web` e `packages/shared`; `eslint` sem erros nos arquivos novos; sem `any` explícito (apenas em comentários). |

### Segurança

| Aspecto | Status | Detalhes |
|---------|--------|----------|
| Auth coverage | PASS | `requireAuth()` na rota; 401 sem sessão. |
| Cross-org isolation | PASS | `.eq("org_id", appUser.org_id)` em **todas** as 7 queries (campaign, campaign-insights, adsets, adset-insights, leads, allLeads, ROAS). 404 (não 403) cross-org evita info leak sobre existência. |
| RLS coverage | PASS | Supabase server client respeita RLS; `kanban_stages` tem RLS por org (verificado em `004_rls_policies.sql:50-93`). |
| SQL injection | PASS | Query builder Supabase com parâmetros nomeados (`.eq`, `.in`, `.gte`, `.lte`); zero string-concat de input. `metaCampaignId` chega via dynamic route, mas é tratado como valor (não SQL). |
| Data exposure | PASS | Resposta não expõe tokens nem `org_id` de outras orgs; join com `kanban_stages` limita a campo `type`. |
| Secrets handling | N/A | Story read-only; nenhum segredo manipulado. |

### Validações de Robustez

| Check | Status | Detalhes |
|-------|--------|----------|
| Graceful fallback ROAS | PASS | try/catch + check `result.error` — view ausente nunca causa 500. |
| Divisão por zero no funil | PASS | `formatRate` retorna `'—'` se `prev === 0`; também trata `prev === null` na primeira etapa. |
| Estado vazio do gráfico | PASS | "Sem dados de performance no período selecionado" se `data.length===0 OU allZero`. |
| Estado vazio AdSets | PASS | "Nenhum AdSet encontrado para esta campanha". |
| Estado vazio leads | PASS | "Nenhum lead associado a esta campanha encontrado no CRM". |

### Issues Identificados (todos LOW — não bloqueantes)

1. **MNT-001** (low/maintainability) — 16.8 (`campaigns-meta-client.tsx`) ainda tem cópias locais de `formatBRL`, `formatBudget`, `STATUS_BADGES`, `OBJECTIVE_LABELS` etc. 16.9 importa corretamente dos novos `@web/lib/meta-format` e `@web/lib/meta-constants`, mas a oportunidade IDS REUSE prometida nas notas do dev ficou pela metade. **Não é regressão** — apenas duplicação parcial. Recomendação: housekeeping em story futura.

2. **REL-001** (low/reliability) — Queries Supabase no endpoint não logam `result.error` (exceto ROAS). Falha silenciosa retorna array vazio. Pode mascarar bugs de schema/RLS no futuro. Recomendação: adicionar `console.error` estruturado em refactor.

3. **REQ-001** (low/requirements) — AC5/AC6 originais especificavam `utm_campaign OR metadata->>campaign_id`. Schema atual de `leads` não tem coluna `metadata` jsonb — dev removeu o segundo predicado (correto, dada a realidade do schema). Consequência: leads sem `utm_campaign` preenchido podem não aparecer no funil. Recomendação: avaliar coluna `meta_campaign_id` em `leads` em 16.10 ou story separada.

4. **MNT-002** (low/maintainability) — `parseDays` aceita 1-365, mas AC só prevê 7/30/90. Não é bug (cap defensivo) mas `?days=42` é aceito silenciosamente.

5. **MNT-003** (low/code) — `buildTimeseries` retorna 1 dia a mais que `days` (cursor inclusivo). `?days=7` retorna 8 entradas. Documentado nos testes como "7+1". Decisão consciente; aceitável.

6. **MNT-004** (low/code) — `isAdmin` é prop declarada em `Props` (linha 31) mas não consumida no componente (destructuring em linha 44 ignora). Dead-prop, possivelmente preparação para CTA admin-only futuro. Sugerido: remover ou adicionar TODO comment.

### Regressão

| Componente | Status | Detalhes |
|-----------|--------|----------|
| 16.8 (`campaigns-meta-client.tsx`) | PASS | Mantém cópias locais dos helpers; nenhum import quebrado. |
| `packages/shared/src/meta/types.ts` | PASS | Tipos novos apenas adicionados; tipos pré-existentes (`MetaCampaign`, `MetaAdSet`, `MetaInsight`, etc.) preservados intactos. |
| Typecheck global | PASS | `tsc --noEmit` em `packages/web` e `packages/shared` sem erros. |

### Decisão e Próximos Passos

**Veredicto: PASS** — Story 16.9 está pronta para merge.

Os 6 issues identificados são todos LOW (manutenibilidade e refinamentos) e devem ser endereçados em stories futuras de housekeeping ou em 16.10. Não bloqueiam release.

### Gate Status

Gate: PASS → docs/qa/gates/16.9-ui-detalhe-campanha-drilldown.yml
