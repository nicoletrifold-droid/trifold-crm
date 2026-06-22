---
epic: 51
title: Google Ads Marketing API Integration
status: Draft
created_at: 2026-06-08
updated_at: 2026-06-08
created_by: River (@sm)
priority: High
sub_epics:
  - 51A: Fundação (Schema + Auth)
  - 51B: Sync & Dados
  - 51C: UI & Spend Tracking
stories_planned: [51.0, 51.1, 51.2, 51.3, 51.4]
---

# Epic 51 — Google Ads Marketing API Integration

## Objetivo do Epic

Implementar integração com Google Ads no Trifold CRM, espelhando o padrão já consolidado da integração Meta Ads (Epic 16), para permitir **spend tracking diário** e responder "quanto gastamos no Google Ads na semana X?" diretamente no CRM.

**Driving question (origem da demanda):** "Quanto gastamos no Google Ads na semana 01-07/06/2026?" — pergunta concreta que não conseguíamos responder porque a integração não existia. Este epic resolve isso.

MVP scope: autenticação via OAuth, schema Postgres, sync diário de insights, UI de spend, e fluxo de conexão de conta — equivalente funcional do Meta Ads hoje.

## Referência de Padrão

Esta integração espelha deliberadamente a integração Meta Ads:

| Componente Meta | Equivalente Google |
|---|---|
| `supabase/migrations/015_meta_marketing_api.sql` | `supabase/migrations/076_google_ads_schema.sql` |
| `meta_ad_accounts` | `google_ads_accounts` |
| `meta_campaigns` | `google_ads_campaigns` |
| `meta_insights_daily` | `google_ads_insights_daily` |
| `/api/cron/meta-sync-insights/route.ts` | `/api/cron/google-ads-sync-insights/route.ts` |
| `/api/meta-ads/campaigns/route.ts` | `/api/google-ads/campaigns/route.ts` |

## Contexto do Sistema Existente

- **Stack:** Next.js 15 (App Router), Supabase (PostgreSQL + RLS), TypeScript, Vercel (cron + edge)
- **Padrão de cron existente:** `vercel.json` com `schedule` — replicar para Google Ads sync
- **Placeholder UI:** `packages/web/src/app/dashboard/configuracoes/integracoes/page.tsx` linhas 200-216 — exibe "Em breve" para Google Ads
- **Integração Meta Ads ativa** como referência de código e padrão de banco

## Blocker Externo Crítico — Developer Token Google Ads

> **ATENÇÃO:** A Google Ads API exige aprovação manual de um **Developer Token** pelo Google.
>
> - **Basic Access** (padrão inicial): até 15.000 operações/dia — suficiente para MVP
> - **Standard Access**: limite mais alto, requer formulário de solicitação + revisão pelo Google
> - **Tempo de aprovação Basic Access**: geralmente automático ou 1-3 dias úteis
> - **Tempo de aprovação Standard Access**: 5-10 dias úteis
>
> Este blocker deve ser iniciado ANTES ou em paralelo com a Story 51.1.
> Sem developer token aprovado, nenhuma chamada à API funcionará em produção.

## Arquitetura Google Ads API

### Hierarquia de Contas (diferença do Meta)

Google Ads usa uma hierarquia de **Manager Accounts** (MCC — My Client Center):

```
Manager Account (MCC)
  └── Customer Account 1 (onde ficam as campanhas)
  └── Customer Account 2
```

- O Developer Token é associado ao **Manager Account**
- As chamadas de relatório são feitas contra o **Customer Account** (customer_id)
- Para o MVP, assumimos 1 customer_id por organização

### Autenticação (OAuth 2.0 — diferença importante do Meta)

Meta Ads usa System User Token (token estático permanente).
Google Ads usa **OAuth 2.0 com refresh_token** (fluxo de 3 pernas):

```
1. Admin autoriza via Google OAuth → recebe authorization_code
2. Trocar code por access_token + refresh_token (expiração: access_token = 1h)
3. Servidor usa refresh_token para obter novos access_tokens automaticamente
```

Credenciais necessárias (por organização):
- `developer_token` — do Manager Account Google Ads (aprovação manual Google)
- `customer_id` — ID da conta de anúncios (ex: `123-456-7890`)
- `client_id` + `client_secret` — do OAuth app no Google Cloud Console
- `refresh_token` — obtido no fluxo OAuth

### Google Ads API — Versão e Client

A Google Ads API (REST v17+) não tem um SDK oficial para Node.js mantido.
Alternativas:
1. **REST direto** via `fetch` (padrão do projeto — preferido para consistência com Meta)
2. **`google-ads-api`** (npm, community, wraps gRPC) — alternativa se REST for muito verboso

Para MVP, usar **REST direto** com Google Ads Query Language (GAQL):

```
POST https://googleads.googleapis.com/v17/customers/{customer_id}/googleAds:searchStream
```

### Schema Google Ads Insights (espelhar Meta)

```sql
google_ads_insights_daily (
  org_id, level (campaign/ad_group/ad), entity_id, date,
  spend (micros → dividir por 1_000_000),
  impressions, clicks, ctr, cpc, cpm,
  conversions, cost_per_conversion,
  UNIQUE (org_id, level, entity_id, date)
)
```

Nota: Google Ads reporta **valores monetários em micros** (1 BRL = 1.000.000 micros).
Normalizar para BRL ao persistir (dividir por 1.000.000).

## Sub-Epics e Stories Planejadas

### Pre-requisito Externo
> **Objetivo:** Desbloquear time com Developer Token e OAuth App configurados antes do dev iniciar.
> **Executor:** lucas@ (humano)

#### Story 51-0 — Setup Externo: Developer Token + OAuth App
- **Arquivo:** `docs/stories/51-0-google-ads-setup-externo.story.md`
- **Executor:** lucas@trifold.eng.br | Não é code work
- **Escopo:**
  - Solicitar Developer Token via Google Ads Manager Account → API Center (Basic Access)
  - Criar OAuth App no Google Cloud Console (gerar `client_id` + `client_secret`)
  - Configurar OAuth consent screen (escopo `https://www.googleapis.com/auth/adwords`)
  - Documentar em `docs/integrations/google-ads-setup.md`
  - Adicionar env vars no Vercel: `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`
- **Timeout:** 5 dias úteis → acionar Plan B (seed SQL, story 51-2 em standby)
- **Depende de:** nenhum

---

### 51A — Fundação (Schema + Auth)
> **Objetivo:** Schema no banco, credenciais armazenadas, admin pode conectar uma conta Google Ads via OAuth.
> **Estimativa:** ~9h (51-1 + 51-4)

#### Story 51-1 — Schema Postgres + Armazenamento de Credenciais
- **Arquivo:** `docs/stories/51-1-google-ads-schema-and-auth.story.md`
- **Executor:** @data-engineer | **Quality Gate:** @dev
- **Escopo:**
  - Migration `076_google_ads_schema.sql`
  - Tabelas: `google_ads_accounts`, `google_ads_campaigns`, `google_ads_insights_daily`, `google_ads_sync_log`
  - RLS por `org_id` (padrão projeto)
  - Coluna `google_ads_config` em `organizations` (JSONB, credenciais OAuth)
- **Depende de:** nada (story fundacional)

#### Story 51-4 — Fluxo OAuth UI: Conectar Conta Google Ads
- **Arquivo:** `docs/stories/51-4-google-ads-oauth-ui.story.md`
- **Executor:** @dev | **Quality Gate:** @qa
- **Escopo:**
  - Página `/dashboard/configuracoes/integracoes/google-ads/page.tsx`
  - Input `customer_id` (validação: 10 dígitos, hífens aceitos no input mas removidos antes de salvar)
  - Botão "Autorizar via Google" → OAuth flow → callback → salvar `refresh_token`
  - Callback `/api/auth/google-ads/callback` troca `authorization_code` por `refresh_token` (server-side)
  - Credenciais salvas em `organizations.google_ads_config`
  - Botão "Testar conexão" valida conta live
  - Botão "Desconectar" seta `google_ads_config = NULL`
  - Estados: Não conectado / Conectando / Conectado / Erro
- **Depende de:** Story 51-1 (coluna `google_ads_config`) + Story 51-0 (env vars — produção)
- **Bloqueia:** validação end-to-end de 51-2 e 51-3

---

### 51B — Sync & Dados
> **Objetivo:** Cron diário de insights funcionando, upsert idempotente.
> **Pré-requisito:** 51.1 completo.
> **Estimativa:** ~6h

#### Story 51.2 — Cron Sync Diário de Insights
- **Arquivo:** `docs/stories/51-2-google-ads-sync-insights.story.md`
- **Executor:** @dev | **Quality Gate:** @qa
- **Escopo:**
  - `/api/cron/google-ads-sync-insights/route.ts`
  - Cliente REST Google Ads API (GAQL searchStream)
  - Upsert em `google_ads_insights_daily`
  - Entrada em `vercel.json` — schedule `0 10 * * *` (07h BRT = 10h UTC)
  - `google_ads_sync_log` — log de execuções
- **Depende de:** Story 51.1

---

### 51C — UI & Spend Tracking
> **Objetivo:** Substituir placeholder "Em breve" por integração real; spend visível no dashboard.
> **Pré-requisito:** 51.2 funcionando.
> **Estimativa:** ~5h

#### Story 51.3 — UI de Spend + Substituição do Placeholder
- **Arquivo:** `docs/stories/51-3-google-ads-spend-ui.story.md`
- **Executor:** @dev | **Quality Gate:** @qa
- **Escopo:**
  - Substituir bloco "Em breve" em `configuracoes/integracoes/page.tsx`
  - Componente `GoogleAdsConnectionCard` (status + test connection)
  - Endpoint `GET /api/google-ads/campaigns?period=7d|30d|90d`
  - Página de spend `/dashboard/campaigns/google`
- **Depende de:** Story 51.2

---

## Sumário de Stories

| ID | Título | Sub-epic | Executor | Estimativa | Depende de |
|---|---|---|---|---|---|
| **51-0** | Setup Externo (Developer Token + OAuth App) | Pre-requisito | lucas@ (humano) | ~1h + 1-3d latência | — |
| **51-1** | Schema Postgres + Auth Storage | 51A | @data-engineer | ~3h | — |
| **51-4** | Fluxo OAuth UI (Conectar Conta) | 51A | @dev | ~6h | 51-1, 51-0 |
| **51-2** | Cron Sync Diário | 51B | @dev | ~5h | 51-1, 51-4 |
| **51-3** | UI Spend + Placeholder | 51C | @dev | ~3h | 51-1 (seed OK) |

**Total estimado: ~17h dev** + 1-3 dias latência externa (Developer Token)

## Env Vars Necessárias (novas)

```bash
GOOGLE_ADS_DEVELOPER_TOKEN=      # Do Manager Account (aprovação manual Google)
GOOGLE_ADS_CLIENT_ID=            # OAuth app no Google Cloud Console
GOOGLE_ADS_CLIENT_SECRET=        # OAuth app no Google Cloud Console
# Por organização (salvo no banco, não em env):
# refresh_token, customer_id
```

## Riscos

| Risco | Severidade | Mitigação |
|---|---|---|
| Developer Token não aprovado | Alta | Iniciar solicitação antes de 51.1; Basic Access geralmente rápido |
| OAuth refresh_token expirado | Média | Token Google não expira se conta não revogar acesso; monitorar em 51.3 |
| Valores monetários em micros | Baixa | Normalizar ao persistir (÷ 1.000.000); não armazenar micros |
| Manager Account vs Customer Account | Média | Documentado na Story 51.1; dev precisa ter acesso ao MCC |
| Rate limits Google Ads API | Baixa | Basic Access (15K ops/dia) suficiente para MVP com 1 conta |

## External Blocker Plan B (Developer Token)

Se o Developer Token não for aprovado em **5 dias úteis** após a solicitação (Story 51-0):

- **Plan B (padrão):** @dev implementa Story 51-3 usando seed SQL (`google_ads_insights_daily` com dados fictícios). Story 51-2 fica em standby — implementada mas não testável sem o token. Story 51-4 (OAuth UI) pode ser implementada sem o token (usa mock de callback ou conta de teste Google).
- **Timeout de escalação:** 10 dias úteis sem aprovação → @pm reavalia prioridade do epic com lucas@.
- **Sem Plan B para deploy em produção:** sem Developer Token, o sync real não funciona. O DoD final requer token aprovado.

## Definition of Done

- [ ] Stories 51-0, 51-1, 51-2, 51-3, 51-4 com status Done
- [ ] Admin de org consegue conectar conta Google Ads via fluxo OAuth (Story 51-4)
- [ ] Cron diário rodando há ≥7 dias com 0 falhas críticas (Story 51-2)
- [ ] `google_ads_insights_daily` populado após primeiro sync bem-sucedido com dados reais
- [ ] Placeholder "Em breve" substituído por UI funcional de status/spend (Story 51-3)
- [ ] Query SQL `SELECT SUM(spend) FROM google_ads_insights_daily WHERE date BETWEEN ... GROUP BY entity_id` retorna dados reais
- [ ] Pergunta original respondida: "Quanto gastamos no Google Ads na semana 01-07/06/2026?"
- [ ] QA gate PASS em todas as stories técnicas (51-1 a 51-4)
- [ ] @devops fez push após cada QA gate
