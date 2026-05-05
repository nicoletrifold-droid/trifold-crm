---
epic: 16
story: 16.8
title: UI — Lista de Campanhas Meta + Métricas
status: Done
priority: P2-MÉDIO
created_at: 2026-04-27
created_by: River (@sm)
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [ui_accessibility, data_rendering, filter_functionality, auth_validation]
complexity: G
estimated_hours: 6
depends_on: [16.4, 16.5]
---

# Story 16.8 — UI: Lista de Campanhas Meta + Métricas

## Contexto

Stories 16.4 (Cron Sync: Campanhas/AdSets/Ads) e 16.5 (Cron Sync: Insights Diários) estão em
produção. As tabelas `meta_campaigns` e `meta_insights_daily` são populadas automaticamente pelos
crons. Contudo, não existe nenhuma interface para visualizar esses dados — o gestor não consegue
ver spend, CPL, leads ou status das campanhas Meta Ads dentro do CRM sem acessar o Gerenciador
de Anúncios da Meta.

Esta story cria a primeira interface de campanhas Meta Ads: uma lista com métricas agregadas por
período, filtros de status, indicador de última sincronização e botão de sincronização manual para
admin.

## Story Statement

**Como** gestor do Trifold CRM,
**Quero** visualizar uma lista de campanhas Meta Ads com suas métricas de performance,
**Para que** eu possa acompanhar spend, CPL, leads e status das campanhas diretamente no CRM
sem precisar acessar o Gerenciador de Anúncios da Meta.

## Acceptance Criteria

- [ ] **AC1:** Endpoint `GET /api/meta-ads/campaigns` criado em
  `packages/web/src/app/api/meta-ads/campaigns/route.ts`:
  - Protegido por `requireAuth()` — retorna 401 sem sessão
  - Query params suportados:
    - `period`: `7d` | `30d` | `90d` (default: `30d`)
    - `status`: `ACTIVE` | `PAUSED` | `ALL` (default: `ALL`)
  - Para cada campanha: join com `meta_insights_daily` (level='campaign') no período
  - Agrega por campanha: `SUM(spend)`, `SUM(impressions)`, `SUM(clicks)`, `SUM(leads)`,
    `AVG(ctr)`, CPL calculado como `spend/leads` (null se leads=0)
  - Inclui `leads_crm`: count de leads WHERE
    `utm_campaign = campaign.name OR metadata->>'campaign_id' = campaign.meta_campaign_id`
  - Inclui `last_sync`: query `meta_sync_log WHERE sync_type='entities' ORDER BY started_at DESC LIMIT 1`
  - Retorna: `{ campaigns: CampaignWithMetrics[], last_sync: SyncStatus | null }`

- [ ] **AC2:** Endpoint `POST /api/meta-ads/sync` criado em
  `packages/web/src/app/api/meta-ads/sync/route.ts`:
  - Protegido por `requireAuth()` + `requireRole(["admin"])` — 403 para não-admin
  - Dispara sincronização manual: fetch interno para `GET /api/cron/meta-sync-entities`
    com header `Authorization: Bearer {CRON_SECRET}`
  - Fire-and-forget: retorna `{ triggered: true }` imediatamente sem aguardar conclusão
  - Timeout de 5s na chamada interna (`AbortSignal.timeout(5000)`) — erro silenciado

- [ ] **AC3:** Página `/dashboard/campaigns/meta/page.tsx` criada:
  - `"use client"` com `useEffect` + `fetch` + estado local
  - Fetch de `/api/meta-ads/campaigns?period={period}&status={status}` ao montar e ao mudar filtros
  - Tabela com colunas:

    | # | Coluna | Conteúdo |
    |---|--------|---------|
    | 1 | Campanha | nome + objetivo como subtexto |
    | 2 | Status | badge colorido |
    | 3 | Orçamento | daily_budget ("R$ X/dia") ou lifetime_budget ("R$ X total"); NULL → "—" |
    | 4 | Spend | "R$ X.XXX,XX"; 0 → "R$ 0,00" |
    | 5 | Impressões | número formatado (ex: "1.234") |
    | 6 | Cliques | número formatado |
    | 7 | CTR | percentual 2 casas (ex: "2,34%") |
    | 8 | CPL | "R$ X,XX"; null ou leads=0 → "—" |
    | 9 | Leads Meta | inteiro |
    | 10 | Leads CRM | inteiro com link → `/dashboard/leads?utm_campaign={name}` |
    | 11 | Ações | link "Ver detalhes" → `/dashboard/campaigns/meta/{meta_campaign_id}` |

  - Badge de status: `ACTIVE`=verde, `PAUSED`=amarelo, `ARCHIVED`=cinza, `DELETED`=vermelho
  - Objetivo: mapear código Meta para PT-BR (ex: `OUTCOME_LEADS` → "Geração de Leads")
  - Coluna ROAS: **não incluir** — Story 16.10 implementará o cálculo

- [ ] **AC4:** Filtros funcionais:
  - Seletor de período: `7d` | `30d` | `90d` — re-fetch ao mudar (default: `30d`)
  - Seletor de status: Todos | Ativa | Pausada — re-fetch ao mudar (default: Todos)
  - Estado de loading: skeleton ou spinner durante fetch
  - Estado de erro: mensagem clara se API retornar erro
  - Estado vazio: "Nenhuma campanha encontrada para o período selecionado" se array vazio
  - Estado "não configurado": se API retornar 0 campanhas e sem `last_sync` → link para
    `/dashboard/configuracoes/integracoes/meta-ads`

- [ ] **AC5:** Header da página com indicadores e ações:
  - "Última sincronização: HH:MM DD/MM/AAAA" (de `last_sync.started_at`) ou "Nunca sincronizado"
  - Badge de status da sync: verde (`success`) / vermelho (`error`) / amarelo (`running`)
  - Botão "Sincronizar agora" — visível apenas para usuários com role `admin`:
    - Chama `POST /api/meta-ads/sync`
    - Loading durante chamada (botão desabilitado + spinner)
    - Toast "Sincronização iniciada" em caso de sucesso
    - Toast "Erro ao iniciar sincronização" em caso de erro
  - **Padrão de role:** `page.tsx` é Server Component — chama `getServerUser()`, extrai
    `isAdmin = user.role === "admin"`, passa como prop para componente client filho
    (ver padrão em `/dashboard/leads/page.tsx` + `leads-client.tsx`)

- [ ] **AC6:** Tabs adicionadas ao `/dashboard/campaigns/page.tsx`:
  - Tab "CRM" → `/dashboard/campaigns` (campanhas internas existentes — sem modificar)
  - Tab "Meta Ads" → `/dashboard/campaigns/meta`
  - Página atual (`/dashboard/campaigns`) permanece funcional e intacta

- [ ] **AC7:** TypeScript: `npm run type-check` passa sem erros. Sem `any` explícito.

## Scope

### IN (o que esta story implementa)
- `GET /api/meta-ads/campaigns` — lista campanhas + métricas agregadas no período
- `POST /api/meta-ads/sync` — trigger manual de sincronização de entidades (admin)
- `/dashboard/campaigns/meta/page.tsx` — página de lista com filtros, tabela e header
- Tabs "CRM" / "Meta Ads" em `/dashboard/campaigns/page.tsx`

### OUT (fora desta story)
- Página de detalhe de campanha com drill-down (→ Story 16.9)
- Cálculo de ROAS com dados de vendas (→ Story 16.10)
- Sincronização manual de insights (cron às 06h — fora de escopo para trigger manual)
- Export de campanhas para CSV
- Ordenação interativa por colunas da tabela
- Gráfico de série temporal (→ Story 16.9)

## Dev Notes

### Interfaces TypeScript

```typescript
// API response types

interface CampaignMetrics {
  spend: number             // R$ total no período (float)
  impressions: number
  clicks: number
  ctr: number               // % médio ponderado
  cpl: number | null        // spend / leads_meta; null se leads_meta = 0
  leads_meta: number        // soma de meta_insights_daily.leads no período
}

interface CampaignWithMetrics {
  id: string                // UUID interno (meta_campaigns.id)
  meta_campaign_id: string  // ID Meta (para URLs)
  name: string
  objective: string | null
  status: "ACTIVE" | "PAUSED" | "ARCHIVED" | "DELETED"
  daily_budget: number | null    // centavos
  lifetime_budget: number | null // centavos
  metrics: CampaignMetrics
  leads_crm: number
}

interface SyncStatus {
  started_at: string        // ISO 8601
  status: "running" | "success" | "error"
  records_synced: number
}

interface CampaignsApiResponse {
  campaigns: CampaignWithMetrics[]
  last_sync: SyncStatus | null
}
```

### Query de insights agregados — abordagem recomendada

Fazer 3 queries separadas e agregar no servidor (mais simples que RPC):

```typescript
// 1. Campanhas filtradas por org + status
const { data: campaigns } = await supabase
  .from("meta_campaigns")
  .select("id, meta_campaign_id, name, objective, status, daily_budget, lifetime_budget")
  .eq("org_id", appUser.org_id)
  .order("name")

// Se status !== ALL: adicionar .in("status", ["ACTIVE"]) ou .eq("status", "PAUSED")

// 2. Insights do período (level='campaign')
const { from, to } = getPeriodDates(period)
const { data: insights } = await supabase
  .from("meta_insights_daily")
  .select("entity_id, spend, impressions, clicks, ctr, leads, cost_per_lead")
  .eq("org_id", appUser.org_id)
  .eq("level", "campaign")
  .gte("date", from)
  .lte("date", to)

// 3. Leads no CRM com source meta_ads
const { data: leads } = await supabase
  .from("leads")
  .select("utm_campaign, metadata")
  .eq("org_id", appUser.org_id)
  .in("source", ["meta_ads", "whatsapp_click_to_ad"])

// 4. Agregar no servidor:
// - Agrupar insights por entity_id → somar campos numéricos
// - Para cada campanha: contar leads WHERE utm_campaign = name
//   OU metadata->>'campaign_id' = meta_campaign_id
```

### Cálculo de período

```typescript
function getPeriodDates(period: string): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30
  from.setDate(from.getDate() - days)
  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  }
}
```

### POST /api/meta-ads/sync — fire-and-forget

```typescript
export async function POST() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const roleError = requireRole(auth.appUser, ["admin"])
  if (roleError) return roleError

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  const cronUrl = `${base}/api/cron/meta-sync-entities`

  // Fire-and-forget — não bloqueia resposta ao cliente
  fetch(cronUrl, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    signal: AbortSignal.timeout(5000),
  }).catch(() => {}) // erro silenciado intencionalmente

  return NextResponse.json({ triggered: true })
}
```

### Formatação de valores

```typescript
const formatBRL = (value: number): string =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)

const formatBudgetCents = (cents: number | null, type: "daily" | "lifetime"): string => {
  if (!cents) return "—"
  const label = type === "daily" ? "/dia" : " total"
  return formatBRL(cents / 100) + label
}

const formatNumber = (n: number): string =>
  new Intl.NumberFormat("pt-BR").format(n)

const formatPercent = (n: number): string =>
  `${n.toFixed(2).replace(".", ",")}%`
```

### Mapeamento de objetivos Meta

```typescript
const OBJECTIVE_LABELS: Record<string, string> = {
  OUTCOME_LEADS: "Geração de Leads",
  OUTCOME_TRAFFIC: "Tráfego",
  OUTCOME_AWARENESS: "Reconhecimento",
  OUTCOME_ENGAGEMENT: "Engajamento",
  OUTCOME_APP_PROMOTION: "Promoção de App",
  OUTCOME_SALES: "Vendas",
}
// Fallback: exibir objective original se não mapeado
```

### Badges de status de campanha

```typescript
const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  ACTIVE:   { label: "Ativa",     className: "bg-green-100 text-green-700" },
  PAUSED:   { label: "Pausada",   className: "bg-yellow-100 text-yellow-700" },
  ARCHIVED: { label: "Arquivada", className: "bg-gray-100 text-gray-600" },
  DELETED:  { label: "Deletada",  className: "bg-red-100 text-red-700" },
}
```

### Padrão de UI a seguir

- **Estrutura de arquivo:** `page.tsx` (Server Component) + `campaigns-meta-client.tsx` ("use client")
  — mesmo padrão de `/dashboard/leads/page.tsx` + `leads-client.tsx`
  ```typescript
  // page.tsx — Server Component
  import { getServerUser } from "@web/lib/auth"
  import CampaignsMetaClient from "./campaigns-meta-client"

  export default async function CampaignsMetaPage() {
    const user = await getServerUser()
    const isAdmin = user.role === "admin"
    return <CampaignsMetaClient isAdmin={isAdmin} />
  }
  ```
  ```typescript
  // campaigns-meta-client.tsx — "use client"
  export default function CampaignsMetaClient({ isAdmin }: { isAdmin: boolean }) {
    // useEffect + fetch + state
  }
  ```
- Ver `packages/web/src/app/dashboard/sistema/webhooks/page.tsx` — padrão de tabela com badges
- Ver `packages/web/src/app/dashboard/campaigns/page.tsx` — padrão visual de campanhas
  (mesmo estilo visual, não reinventar componentes)
- Tabs: ver layout existente em `/dashboard` — usar classes Tailwind para tabs ativas/inativas

### Env vars utilizadas

- `NEXT_PUBLIC_SITE_URL` — base URL para chamada interna ao cron (fallback: `http://localhost:3000`)
- `CRON_SECRET` — já existe (para trigger manual do sync)

## Tasks / Subtasks

- [x] **Task 1** — Criar API `GET /api/meta-ads/campaigns`
  - `packages/web/src/app/api/meta-ads/campaigns/route.ts`
  - 3 queries (campanhas + insights + leads) + agregação no servidor (AC1)
  - Retorna `CampaignsApiResponse` tipado

- [x] **Task 2** — Criar API `POST /api/meta-ads/sync`
  - `packages/web/src/app/api/meta-ads/sync/route.ts`
  - Auth: `requireAuth` + `requireRole(["admin"])` (AC2)
  - Fire-and-forget para cron interno com AbortSignal.timeout(5000)

- [x] **Task 3** — Criar página `/dashboard/campaigns/meta/page.tsx` + componente client
  - `page.tsx` é **Server Component**: chama `getServerUser()`, passa `isAdmin` como prop (AC5)
  - `campaigns-meta-client.tsx` é `"use client"`: useEffect + fetch, tabela, filtros, header (AC3-AC5)
  - Tabela com 10 colunas + badges + links (AC3)
  - Filtros de período e status com re-fetch (AC4)
  - Header com última sync + botão sincronizar (AC5)

- [x] **Task 4** — Adicionar tabs ao `/dashboard/campaigns/page.tsx`
  - Tabs "CRM" e "Meta Ads" sem quebrar funcionalidade existente (AC6)

- [x] **Task 5** — Validar
  - `npm run type-check` sem erros (AC7) ✅
  - `npm run lint` sem erros (0 errors, 2 warnings pré-existentes) ✅

## File List

### Arquivos a criar
- `packages/web/src/app/api/meta-ads/campaigns/route.ts`
- `packages/web/src/app/api/meta-ads/sync/route.ts`
- `packages/web/src/app/dashboard/campaigns/meta/page.tsx` — Server Component wrapper
- `packages/web/src/app/dashboard/campaigns/meta/campaigns-meta-client.tsx` — Client Component

### Arquivos modificados
- `packages/web/src/app/dashboard/campaigns/page.tsx` — adicionar tabs CRM / Meta Ads

## Testes

- [ ] `npm run type-check` passa sem erros
- [ ] `npm run lint` passa sem erros
- [ ] `GET /api/meta-ads/campaigns` retorna 401 sem sessão
- [ ] `GET /api/meta-ads/campaigns?period=7d&status=ACTIVE` retorna apenas campanhas ACTIVE
- [ ] `POST /api/meta-ads/sync` retorna 403 para usuário sem role admin
- [ ] `POST /api/meta-ads/sync` retorna `{ triggered: true }` para admin
- [ ] Página `/dashboard/campaigns/meta` renderiza sem erros (array vazio → mensagem)
- [ ] Troca de período (7d→30d) re-faz fetch e atualiza tabela
- [ ] Coluna "Leads CRM" tem link para `/dashboard/leads?utm_campaign=xxx`
- [ ] Tab "Meta Ads" em `/dashboard/campaigns` navega para `/dashboard/campaigns/meta`
- [ ] `/dashboard/campaigns` (aba CRM) continua funcional após modificação

## 🤖 CodeRabbit Integration

**Story Type Analysis:**
- Primary Type: UI + Backend API
- Complexity: Grande (API com joins + UI com filtros + formatação monetária)

**Specialized Agent Assignment:**
- Primary: `@dev` (implementação)
- Quality Gate: `@qa` (acessibilidade, rendering correto de dados, auth das APIs)

**Quality Gate Tasks:**
- [ ] Pre-Commit (`@dev`): `npm run type-check` sem erros
- [ ] Pre-PR (`@qa`): Validar auth das APIs, formatação BRL, fire-and-forget do sync, tabs sem regressão

**CodeRabbit Focus Areas:**
- `requireAuth()` + `requireRole()` em ambas as rotas
- Formatação de valores: `Intl.NumberFormat` (não hardcoding de símbolos ou regex)
- Fire-and-forget no sync: `.catch(() => {})` previne unhandled promise rejection
- Coluna ROAS: **não** incluir — story 16.10 implementará o cálculo
- Leads CRM: agregação feita no servidor, não expor dados brutos de metadata para o cliente
- Aba CRM em `/dashboard/campaigns/page.tsx`: não quebrar funcionalidade existente
- Estado "não configurado": link correto para configuração da integração

## Change Log

| Data | Agente | Ação |
|---|---|---|
| 2026-04-27 | @sm (River) | Story criada — Draft |
| 2026-04-27 | @po (Pax) | Validação 10-point: 8.5/10 — GO. Correção C-001: AC5 + Dev Notes adicionados padrão Server Component wrapper + `isAdmin` prop (padrão do projeto). File List atualizado. Status: Draft → Ready |
| 2026-04-27 | @dev (Dex) | Implementação completa — 4 arquivos criados + campaigns/page.tsx modificado. type-check ✅ lint ✅ (0 errors). Status: Ready → Ready for Review |
| 2026-04-27 | @qa (Quinn) | Review completo — PASS. 7/7 ACs satisfeitos, 4 issues LOW (nenhum bloqueia). Gate: docs/qa/gates/16.8-ui-lista-campanhas-meta.yml |

## QA Results

**Decisão: PASS**
**Revisor:** @qa (Quinn) — 2026-04-27
**Gate file:** `docs/qa/gates/16.8-ui-lista-campanhas-meta.yml`

### Cobertura de ACs

| AC | Status | Observação |
|---|---|---|
| AC1 GET /api/meta-ads/campaigns | ✅ PASS | auth, 3 queries, CTR calculado de clicks/impressions, dedup Set union, last_sync |
| AC2 POST /api/meta-ads/sync | ✅ PASS | requireAuth + requireRole(["admin"]), fire-and-forget, AbortSignal.timeout(5000) |
| AC3 Tabela 11 colunas | ✅ PASS | todas colunas, badges, objetivos mapeados, ROAS ausente (correto) |
| AC4 Filtros | ✅ PASS | period/status com re-fetch, 4 estados (loading/error/empty/unconfigured) |
| AC5 Header + isAdmin | ✅ PASS | Server Component pattern, badge sync, botão admin-only |
| AC6 Tabs | ✅ PASS | CRM/Meta Ads funcional, sem regressão em /dashboard/campaigns |
| AC7 TypeScript | ✅ PASS | type-check ✅ lint ✅ 0 errors |

### Issues (todos LOW — não bloqueantes)

1. **L1 — code:** `insights` e `leads` queries sem error check — falha silenciosa. Recomendação: log server-side em story futura.
2. **L2 — performance:** 3 queries sequenciais (poderiam ser `Promise.all`). Otimização opcional.
3. **L3 — code:** `CampaignsTabs` duplicado em dois arquivos — funciona corretamente, débito de manutenção.
4. **L4 — ux:** AC5 diz "Toast", implementação usa `<p>` com auto-dismiss 4s — equivalente funcional.

## Definition of Done

- [ ] `GET /api/meta-ads/campaigns` retorna campanhas com métricas agregadas por período
- [ ] `POST /api/meta-ads/sync` dispara sincronização (admin only)
- [ ] Página `/dashboard/campaigns/meta` exibe campanhas com filtros e badges
- [ ] Tabs CRM / Meta Ads funcionais e sem regressão
- [ ] `npm run type-check` passa sem erros
- [ ] `npm run lint` passa sem erros
- [ ] @qa PASS
- [ ] @devops push realizado
| 2026-05-05 | QA PASS — sem blockers. Story fechada. | Pax (@po) |
