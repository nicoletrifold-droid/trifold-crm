---
epic: 16
title: Meta Ads Marketing API Integration
status: InProgress
created_at: 2026-04-24
updated_at: 2026-04-24
created_by: Morgan (@pm)
analyst_input: Gap Analysis Report 2026-04-24 (@analyst)
priority: High
sub_epics:
  - 16A: Fundação (Foundation)
  - 16B: Sync & Analytics
  - 16C: UX & Stories Pendentes
stories_done: [16.0]
stories_next: [16.1, 16.2, 16.3]
---

# Epic 16 — Meta Ads Marketing API Integration

## Objetivo do Epic

Evoluir a integração Meta Ads de **"apenas receber leads via webhook"** para **"sincronizar hierarquia completa de campanhas, métricas de performance e calcular ROAS por empreendimento/unidade"** — dando ao gestor Trifold visibilidade total de ROI de marketing diretamente no CRM.

## Contexto do Sistema Existente

- **Stack:** Next.js 14 (App Router), Supabase (PostgreSQL + RLS), TypeScript, Vercel (cron + edge)
- **Integração atual:** `POST /api/webhooks/meta-ads/route.ts` recebe eventos `leadgen` via webhook
- **Bug crítico identificado:** Webhook não faz `GET /{leadgen_id}` via Graph API → leads criados em produção **sem nome/telefone/email** (dados chegam vazios no payload de webhook)
- **Stories pendentes do Epic 7:** 7.2 (tracking UTM + badges), 7.4 (CTWA referral) — incorporadas como 16.11 e 16.12
- **Padrão de cron existente:** `/api/cron/followup/`, `/api/cron/campaign-poll/` — replicar para sync Meta

## Descrição da Melhoria

### O que está sendo adicionado

1. **Fix crítico do webhook** — buscar dados reais do lead via Graph API ao receber evento `leadgen`
2. **Schema de banco** — tabelas `meta_ad_accounts`, `meta_campaigns`, `meta_adsets`, `meta_ads`, `meta_insights_daily`, `meta_sync_log`, `webhook_logs`
3. **Client Meta Marketing API** — wrapper tipado com rate limiting, retry, pagination
4. **Autenticação** — System User Token (long-lived, server-to-server)
5. **Crons de sync** — hierarquia campanhas a cada 4h + insights diários às 06h
6. **Dashboard de campanhas Meta** — lista + drill-down com métricas reais
7. **ROAS imobiliário** — join `meta_insights_daily` × `leads` × `unit_sales` por campanha

### Como integra com o sistema existente

- `leads.utm_campaign` ↔ `meta_campaigns.name` (join para ROAS)
- `leads.metadata.campaign_id` ↔ `meta_campaigns.meta_campaign_id` (fallback join)
- `leads.source = 'meta_ads' | 'ctwa'` já existem no enum `lead_source`
- Crons registrados em `vercel.json` (padrão existente)
- RLS por `org_id` seguindo padrão do projeto

### Critérios de sucesso (mensuráveis)

- [ ] Leads de Meta Ads chegam com nome/telefone/email preenchidos (0 leads incompletos)
- [ ] Dashboard mostra spend/CPL/leads por campanha com dados reais da Meta API
- [ ] ROAS calculado automaticamente para campanhas com vendas associadas
- [ ] Sync de campanhas roda sem erros por 7 dias consecutivos
- [ ] `webhook_logs` captura 100% dos eventos recebidos para debugging

## Dependências e Pré-requisitos

| Dependência | Status | Observação |
|---|---|---|
| `META_APP_SECRET` | Existe | Já usada no webhook atual |
| `META_SYSTEM_USER_TOKEN` | **Faltando** | Gerar no Business Manager |
| `META_AD_ACCOUNT_ID` | **Faltando** | `act_xxxxx` da conta de anúncios |
| `META_PAGE_ACCESS_TOKEN` | Documentado em `.env.example` | Para `GET /{leadgen_id}` — configurar no Vercel |
| App Review (Standard Tier) | **A iniciar** | Para rate limit de insights — iniciar imediatamente |
| Epic 7 stories (7.2, 7.4) | Pendente | Incorporadas como 16.11, 16.12 |

---

## Sub-Epics e Stories

### 16A — Fundação (Foundation)
> **Objetivo:** Destrava tudo. Sem 16A, nenhuma story de analytics funciona.
> **Estimativa:** ~20h

---

#### Story 16.0 — Fix Meta Ads Webhook: Graph API Fetch ✅ DONE
- **Status:** DONE — pushed para produção em 2026-04-24
- **Executor:** `@dev` | **Quality Gate:** `@architect`
- **Quality Gate Tools:** `[api_integration_review, async_processing_validation, error_handling]`
- **Complexidade:** M (4h)
- **Prioridade:** P0 — **implementar antes de qualquer outra story**

**Descrição:** O webhook atual assume que `field_data[]` chega preenchido no payload — não chega em produção. Leads são criados sem dados de contato. Fix: ao receber `leadgen_id`, fazer `GET /v21.0/{leadgen_id}?access_token={META_PAGE_ACCESS_TOKEN}` para buscar dados completos. Processar de forma assíncrona (usar `waitUntil` do Vercel Edge Runtime para não bloquear o 200).

**ACs principais:**
- Fazer `GET /{leadgen_id}` via Graph API ao receber webhook
- Resolver `campaign_id` → nome da campanha via `GET /{campaign_id}?fields=name`
- Processar async com `waitUntil()` para retornar 200 imediatamente
- Logar todos os webhooks recebidos em `webhook_logs`
- Retry com backoff se Graph API falhar (max 3 tentativas)

**Risco:** MÉDIO — modifica webhook crítico. Testar em staging com payload real da Meta.

---

#### Story 16.1 — Migration: Tabelas Meta Marketing API
- **Executor:** `@data-engineer` | **Quality Gate:** `@dev`
- **Quality Gate Tools:** `[schema_validation, migration_review, rls_test, index_analysis]`
- **Complexidade:** M (3h)

**Descrição:** Criar migration `015_meta_marketing_api.sql` com tabelas:
- `meta_ad_accounts` — contas conectadas (1 por org inicialmente)
- `meta_campaigns` — campanhas sincronizadas
- `meta_adsets` — conjuntos de anúncios
- `meta_ads` — anúncios individuais
- `meta_insights_daily` — métricas diárias por entidade/nível
- `meta_sync_log` — log de execuções de sync
- `webhook_logs` — log de webhooks recebidos (todos os sources)

RLS por `org_id` em todas as tabelas. Índices em `(org_id, status)`, `(org_id, level, date DESC)`, `(entity_id, date DESC)`.

**Schema chave — `meta_insights_daily`:**
```
spend, impressions, reach, clicks, ctr, cpc, cpm, frequency,
leads (actions[lead]), messaging_conversations_started,
cost_per_lead, actions (JSONB completo)
```

---

#### Story 16.2 — Meta Marketing API Client (Shared Lib)
- **Executor:** `@dev` | **Quality Gate:** `@architect`
- **Quality Gate Tools:** `[rate_limit_validation, retry_logic, type_safety, error_handling]`
- **Complexidade:** G (5h)

**Descrição:** Criar `packages/shared/src/meta/` com:
- `client.ts` — wrapper fetch tipado para `https://graph.facebook.com/v21.0/`
- `rate-limiter.ts` — lê header `X-Business-Use-Case-Usage`, circuit breaker em 75%
- `types.ts` — interfaces para Campaign, AdSet, Ad, Insight, LeadData
- `errors.ts` — OAuthException, RateLimitError, APIError com retry logic
- Backoff exponencial em 429/17: `1s → 2s → 4s → 8s → 16s` + jitter
- Batch requests para até 50 ops em 1 chamada

---

#### Story 16.3 — OAuth/Token: Conectar Ad Account (UI + Backend)
- **Executor:** `@dev` | **Quality Gate:** `@architect`
- **Quality Gate Tools:** `[security_review, token_storage_validation, oauth_flow]`
- **Complexidade:** G (5h)

**Descrição:** UI em `/dashboard/configuracoes/integracoes/meta-ads` para admin configurar:
- Input de System User Token (masked após salvo)
- Input de Ad Account ID (`act_xxxxx`)
- Input de Page Access Token
- Botão "Testar conexão" → `GET /act_{id}?fields=name,currency` e exibe resultado
- Salvar em `meta_ad_accounts` + `organizations.meta_ads_config` (encrypted)
- Status badge: Conectado / Não configurado / Erro de autenticação

**Decisão técnica:** System User Token (não OAuth) — server-to-server, token permanente.

---

#### Story 16.6 — Webhook Logs + Monitoring
- **Executor:** `@dev` | **Quality Gate:** `@qa`
- **Quality Gate Tools:** `[logging_completeness, admin_visibility, alerting]`
- **Complexidade:** M (3h)

**Descrição:** Completar infra de observabilidade do webhook:
- Tabela `webhook_logs` criada em 16.1 — persistir TODOS os eventos Meta
- Endpoint `GET /api/admin/webhook-logs` com filtro por source/data
- UI simples em `/dashboard/sistema/webhooks` listando últimos 50 eventos
- Health check: alerta (Telegram/email admin) se nenhum evento Meta em >30min durante horário comercial

---

### 16B — Sync & Analytics
> **Objetivo:** Dados de campanhas sincronizados e ROAS calculado.
> **Pré-requisito:** 16A completo.
> **Estimativa:** ~16h

---

#### Story 16.4 — Cron Sync: Hierarquia Campanhas/AdSets/Ads
- **Executor:** `@dev` | **Quality Gate:** `@architect`
- **Quality Gate Tools:** `[cron_reliability, upsert_logic, rate_limit_compliance]`
- **Complexidade:** M (3h)

**Descrição:** `/api/cron/meta-sync-entities` — roda a cada 4h:
1. `GET /act_{id}/campaigns?fields=id,name,objective,status,daily_budget,lifetime_budget,start_time,stop_time`
2. `GET /act_{id}/adsets?fields=id,name,campaign_id,status,optimization_goal`
3. `GET /act_{id}/ads?fields=id,name,adset_id,status,creative`
4. Upsert em `meta_campaigns`, `meta_adsets`, `meta_ads`
5. Log em `meta_sync_log` (started_at, finished_at, records_synced, api_calls_made)

Registrar em `vercel.json`: `{"path": "/api/cron/meta-sync-entities", "schedule": "0 */4 * * *"}`

---

#### Story 16.5 — Cron Sync: Insights Diários
- **Executor:** `@dev` | **Quality Gate:** `@architect`
- **Quality Gate Tools:** `[async_report_handling, data_completeness, idempotency]`
- **Complexidade:** G (5h)

**Descrição:** `/api/cron/meta-sync-insights` — roda diariamente às 06h BRT:
1. Para cada campanha ativa: `POST /act_{id}/insights` com `level=campaign`, `date_preset=yesterday`
2. Para campanhas com dados: drill-down `level=adset` e `level=ad`
3. Campos: `spend, impressions, reach, clicks, ctr, cpc, cpm, frequency, actions`
4. Extrair de `actions[]`: `leads`, `messaging_conversation_started`, `cost_per_lead`
5. Upsert em `meta_insights_daily` com `UNIQUE(org_id, level, entity_id, date)`
6. Para date_preset > 7 dias: usar async report jobs (`report_run_id` + polling)

Cron: `{"path": "/api/cron/meta-sync-insights", "schedule": "0 9 * * *"}` (06h BRT = 09h UTC)

---

#### Story 16.7 — Backfill: Leads Históricos via Lead Forms API
- **Executor:** `@dev` | **Quality Gate:** `@qa`
- **Quality Gate Tools:** `[idempotency, dedup_logic, rate_limit_compliance]`
- **Complexidade:** M (3h)

**Descrição:** Script `scripts/meta-backfill-leads.ts` para recuperar leads históricos:
- `GET /{form_id}/leads?fields=id,field_data,created_time,ad_id,campaign_id`
- Paginar com cursor até recuperar todos
- Criar leads faltantes no CRM (skip se já existe por `leadgen_id`)
- Chunks de 7 dias com 5s de pausa entre chunks (rate limit)
- Input: `--form-id=xxx --from=2026-01-01 --to=2026-04-24 --dry-run`

---

#### Story 16.10 — ROAS Calculator Imobiliário
- **Executor:** `@data-engineer` | **Quality Gate:** `@dev`
- **Quality Gate Tools:** `[sql_correctness, join_logic, view_performance]`
- **Complexidade:** G (5h)

**Descrição:** View SQL + API para cálculo de ROAS por campanha:

```sql
CREATE VIEW meta_campaign_roas AS
SELECT
  mc.meta_campaign_id, mc.name AS campaign_name,
  SUM(mid.spend) AS total_spend,
  SUM(mid.leads) AS total_leads_meta,
  COUNT(DISTINCT l.id) FILTER (WHERE l.source IN ('meta_ads','ctwa')) AS leads_in_crm,
  COUNT(DISTINCT us.id) AS sales_count,
  SUM(us.sale_value) AS total_revenue,
  CASE WHEN SUM(mid.spend) > 0
    THEN SUM(us.sale_value) / SUM(mid.spend) ELSE NULL END AS roas,
  CASE WHEN COUNT(DISTINCT l.id) > 0
    THEN SUM(mid.spend) / COUNT(DISTINCT l.id) ELSE NULL END AS cpl_real
FROM meta_campaigns mc
LEFT JOIN meta_insights_daily mid ON mid.entity_id = mc.meta_campaign_id AND mid.level='campaign'
LEFT JOIN leads l ON l.utm_campaign = mc.name OR l.metadata->>'campaign_id' = mc.meta_campaign_id
LEFT JOIN unit_sales us ON us.lead_id = l.id
GROUP BY mc.id, mc.meta_campaign_id, mc.name;
```

API: `GET /api/analytics/meta-roas?period=30d` com filtros por empreendimento e campanha.

---

### 16C — UX & Stories Pendentes
> **Objetivo:** Interface completa + fechar débito técnico das stories 7.2 e 7.4.
> **Pré-requisito:** 16B completo (ou ao menos 16.4 para nomes de campanhas).
> **Estimativa:** ~19h

---

#### Story 16.8 — UI: Lista de Campanhas Meta + Métricas
- **Executor:** `@dev` | **Quality Gate:** `@qa`
- **Quality Gate Tools:** `[ui_accessibility, data_rendering, filter_functionality]`
- **Complexidade:** G (6h)

**Descrição:** `/dashboard/campaigns/meta` com tabela de campanhas:
- Colunas: Nome, Status, Orçamento, Spend, Impressões, Cliques, CPL, Leads (Meta), Leads (CRM), ROAS
- Filtros: período (7d/30d/90d/custom), status (Ativa/Pausada/Todas), objetivo
- Badge de status colorido (Ativa=verde, Pausada=amarelo, Arquivada=cinza)
- Última sincronização exibida (de `meta_sync_log`)
- Botão "Sincronizar agora" (trigger manual do cron)

---

#### Story 16.9 — UI: Detalhe de Campanha + Drill-down
- **Executor:** `@dev` | **Quality Gate:** `@qa`
- **Quality Gate Tools:** `[ui_accessibility, chart_rendering, funnel_logic]`
- **Complexidade:** G (6h)

**Descrição:** `/dashboard/campaigns/meta/[campaign_id]`:
- Header: nome, objetivo, status, orçamento, período ativo
- Gráfico de série temporal: spend + leads por dia (últimos 30d)
- Tabela de AdSets com métricas (drill-down de campanha)
- Funil de conversão: Leads Meta → Leads CRM → Qualificados → Visitas → Vendas
- Lista de leads associados (filtrado por `utm_campaign` = nome da campanha)
- Cálculo de ROAS com breakdown por empreendimento

---

#### Story 16.11 — Story 7.2 Pendente: Badge de Origem + Filtro Pipeline
- **Executor:** `@dev` | **Quality Gate:** `@qa`
- **Quality Gate Tools:** `[ui_accessibility, badge_consistency, filter_correctness]`
- **Complexidade:** M (2h)

**Descrição:** Implementar ACs da Story 7.2 que nunca foram executados:
- `SourceBadge` component: ícone + texto por origem (meta_ads, ctwa, whatsapp, manual)
- Badge visível no card do lead no pipeline kanban
- Badge visível no detalhe do lead
- Filtro por origem no pipeline (dropdown multi-select)
- Coluna "Origem" na listagem de leads
- API `GET /api/analytics/sources` com contagem por origem

---

#### Story 16.12 — Story 7.4 Pendente: CTWA Referral + Resolução de Nome
- **Executor:** `@dev` | **Quality Gate:** `@qa`
- **Quality Gate Tools:** `[referral_data_extraction, local_lookup, badge_accuracy]`
- **Complexidade:** M (2h)

**Descrição:** Implementar ACs da Story 7.4 usando lookup local (sem chamada extra à API):
- Extrair `referral` do payload WhatsApp: `source_url, source_id, ctwa_clid, headline`
- Salvar em `leads.metadata.referral`
- Resolver nome de campanha via `meta_campaigns` (já sincronizado em 16.4)
- Badge "CTWA Ad" com nome da campanha no card do lead
- Janela de 72h: `leads.metadata.ctwa_window_expires_at = created_at + 72h`

---

#### Story 16.13 — Alertas e Saúde da Integração
- **Executor:** `@dev` | **Quality Gate:** `@qa`
- **Quality Gate Tools:** `[alerting_correctness, token_expiry_detection]`
- **Complexidade:** P (2h)

**Descrição:**
- Alerta diário se sync falhou (via Telegram admin, padrão existente)
- Detecção de `OAuthException` → notificar admin para renovar token
- Rate limit proximity warning se `call_count > 75%` do limite
- Health check endpoint `GET /api/health/meta-sync` para monitoramento externo

---

## Sumário de Stories

| ID | Título | Sub-epic | Executor | Complexidade | Estimativa |
|---|---|---|---|---|---|
| **16.0** | Fix webhook — Graph API fetch | 16A | @dev | M | 4h |
| **16.1** | Migration: Tabelas Meta API | 16A | @data-engineer | M | 3h |
| **16.2** | Meta API Client (shared lib) | 16A | @dev | G | 5h |
| **16.3** | Auth: Conectar Ad Account | 16A | @dev | G | 5h |
| **16.6** | Webhook Logs + Monitoring | 16A | @dev | M | 3h |
| **16.4** | Cron Sync: Campanhas/AdSets/Ads | 16B | @dev | M | 3h |
| **16.5** | Cron Sync: Insights Diários | 16B | @dev | G | 5h |
| **16.7** | Backfill: Leads Históricos | 16B | @dev | M | 3h |
| **16.10** | ROAS Calculator Imobiliário | 16B | @data-engineer | G | 5h |
| **16.8** | UI: Lista Campanhas Meta | 16C | @dev | G | 6h |
| **16.9** | UI: Detalhe Campanha Drill-down | 16C | @dev | G | 6h |
| **16.11** | Story 7.2 pendente: Badges Origem | 16C | @dev | M | 2h |
| **16.12** | Story 7.4 pendente: CTWA Referral | 16C | @dev | M | 2h |
| **16.13** | Alertas e Saúde da Integração | 16C | @dev | P | 2h |

**Total estimado: ~54h** (~7-8 dias dev dedicado)

---

## Decisões Técnicas (fixadas)

| Decisão | Escolha | Justificativa |
|---|---|---|
| Autenticação | System User Token | CRM interno server-to-server; token permanente |
| Rate limiting | Circuit breaker em 75% | Header `X-Business-Use-Case-Usage` |
| Insights > 7d | Async report jobs | Evita timeout; usa `report_run_id` + polling |
| Refresh campanhas | Cron a cada 4h | Mudanças estruturais não são real-time |
| Insights diários | Cron às 06h BRT | D-1 estável após 24h de consolidação Meta |
| ROAS join key | `utm_campaign` + `metadata.campaign_id` | Duplo fallback para máxima cobertura |
| App Review | Solicitar Standard Tier imediatamente | Rate limit Dev Tier insuficiente para insights |

## Env Vars necessárias (novas)

```bash
META_SYSTEM_USER_TOKEN=      # Long-lived token (Business Manager)
META_AD_ACCOUNT_ID=          # act_xxxxx
META_BUSINESS_ID=            # Para calls de business management
META_APP_ID=                 # ID do app Meta
META_PAGE_ACCESS_TOKEN=      # Para GET /{leadgen_id} (pode ser system user token)
META_API_VERSION=v21.0       # Já default no código atual
```

## Gestão de Riscos

| Risco | Severidade | Mitigação |
|---|---|---|
| App Review demora 5-10 dias | Média | Iniciar imediatamente; Dev Tier cobre 16A+parte 16B |
| Token revogado | Média | Health check diário; alerta automático |
| UTM mismatch (nome vs ID) | Alta | Join duplo em `meta_campaign_roas` view |
| Rate limit durante backfill | Média | Chunks 7d + 5s pausa entre chunks |
| Webhook sem dados em produção | Alta | **Story 16.0 — implementar antes de tudo** |

## Compatibilidade

- [x] Webhook existente `/api/webhooks/meta-ads` — corrigido e compatível (Story 16.0 DONE)
- [ ] Schema `leads` sem modificações estruturais (apenas leitura para ROAS)
- [ ] Enum `lead_source` já inclui `meta_ads` e `whatsapp_click_to_ad`
- [ ] Novas tabelas isoladas (não afetam tabelas existentes)
- [ ] Rollback: migration reversível com `DROP TABLE` (sem FK de volta para leads)

## Definition of Done

- [ ] Todas as 14 stories com ACs cumpridos
- [ ] Leads Meta Ads chegando com dados completos (zero incompletos)
- [ ] Dashboard de campanhas mostrando dados reais
- [ ] ROAS calculado para campanhas com vendas associadas
- [ ] Sync rodando sem erros por 7 dias
- [ ] `webhook_logs` capturando 100% dos eventos
- [ ] QA gate PASS em todas as stories
- [ ] @devops fez push após cada QA gate

---

## Handoff para @sm

> "Criar stories detalhadas para o **Epic 16 — Meta Ads Marketing API Integration**.
>
> **Ordem de prioridade:**
> 1. Story **16.0** primeiro (fix crítico — leads chegando incompletos em produção)
> 2. Stories **16.1 → 16.2 → 16.3** em sequência (fundação necessária para tudo)
> 3. Story **16.4** após 16.2+16.3 (precisa do client e auth)
>
> **Stack:** Next.js 14 App Router, Supabase, TypeScript, Vercel cron
> **Padrões de cron:** ver `/api/cron/followup/route.ts` e `vercel.json`
> **Padrão de migration:** ver `supabase/migrations/013_campaign_engine.sql`
> **RLS:** seguir padrão `org_id` existente em todas as tabelas
> **Env vars novas:** `META_SYSTEM_USER_TOKEN`, `META_AD_ACCOUNT_ID`, `META_PAGE_ACCESS_TOKEN`"

— Morgan, planejando o futuro 📊
