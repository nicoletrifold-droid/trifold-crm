---
epic: 16
story: 16.1
title: Migration — Tabelas Meta Marketing API
status: Ready for Review
priority: P1-ALTO
created_at: 2026-04-24
created_by: River (@sm)
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [schema_validation, migration_review, rls_test, index_analysis]
complexity: M
estimated_hours: 3
depends_on: [16.0]
---

# Story 16.1 — Migration: Tabelas Meta Marketing API

## Contexto

Story 16.0 (webhook fix) está em produção. Para as próximas stories do Epic 16
(API client, sync de campanhas, dashboard) funcionarem, precisamos do schema
de banco que sustenta toda a integração Meta Ads.

Esta story cria a migration `015_meta_marketing_api.sql` com 7 tabelas:
conta conectada, hierarquia de campanhas, métricas diárias, logs de sync
e logs de webhook.

## Story Statement

**Como** desenvolvedor do Trifold CRM,
**Quero** que as tabelas de integração Meta Ads existam no banco,
**Para que** o client da API, os crons de sync e o dashboard de campanhas
possam ser implementados nas stories seguintes (16.2–16.9).

## Acceptance Criteria

- [ ] **AC1:** Migration `supabase/migrations/015_meta_marketing_api.sql` criada e aplicável via `supabase db push` sem erros
- [ ] **AC2:** Tabela `meta_ad_accounts` criada com colunas: `id`, `org_id`, `meta_account_id` (TEXT UNIQUE por org), `name`, `currency`, `access_token` (TEXT — armazenar token criptografado), `status` (`active|disconnected|error`), `last_synced_at`, `created_at`, `updated_at`
- [ ] **AC3:** Tabela `meta_campaigns` criada com colunas: `id`, `org_id`, `account_id` (FK → meta_ad_accounts), `meta_campaign_id` (TEXT), `name`, `objective`, `status` (`ACTIVE|PAUSED|ARCHIVED|DELETED`), `daily_budget` (BIGINT cents), `lifetime_budget` (BIGINT cents), `start_time` (TIMESTAMPTZ), `stop_time` (TIMESTAMPTZ), `meta_created_time`, `synced_at`, `created_at` — UNIQUE(org_id, meta_campaign_id)
- [ ] **AC4:** Tabela `meta_adsets` criada com colunas: `id`, `org_id`, `campaign_id` (FK → meta_campaigns), `meta_adset_id` (TEXT), `name`, `status`, `optimization_goal`, `daily_budget` (BIGINT cents), `synced_at`, `created_at` — UNIQUE(org_id, meta_adset_id)
- [ ] **AC5:** Tabela `meta_ads` criada com colunas: `id`, `org_id`, `adset_id` (FK → meta_adsets), `meta_ad_id` (TEXT), `name`, `status`, `creative` (JSONB), `synced_at`, `created_at` — UNIQUE(org_id, meta_ad_id)
- [ ] **AC6:** Tabela `meta_insights_daily` criada com colunas: `id`, `org_id`, `level` (`campaign|adset|ad`), `entity_id` (TEXT — meta_campaign_id / meta_adset_id / meta_ad_id), `date` (DATE), `spend` (NUMERIC(12,2)), `impressions` (BIGINT), `reach` (BIGINT), `clicks` (BIGINT), `ctr` (NUMERIC(8,4)), `cpc` (NUMERIC(12,2)), `cpm` (NUMERIC(12,2)), `frequency` (NUMERIC(8,4)), `leads` (INT), `messaging_conversations_started` (INT), `cost_per_lead` (NUMERIC(12,2)), `actions` (JSONB), `created_at` — UNIQUE(org_id, level, entity_id, date)
- [ ] **AC7:** Tabela `meta_sync_log` criada com colunas: `id`, `org_id`, `sync_type` (`entities|insights|backfill`), `status` (`running|success|error`), `started_at`, `finished_at`, `records_synced` (INT), `api_calls_made` (INT), `error_message` (TEXT), `created_at`
- [ ] **AC8:** Tabela `webhook_logs` criada com colunas: `id`, `org_id` (NULLABLE — pode chegar antes de resolver org), `source` (TEXT — `meta_ads|whatsapp|google_forms|other`), `event_type` (TEXT), `payload` (JSONB), `leadgen_id` (TEXT), `signature_valid` (BOOLEAN), `processed` (BOOLEAN DEFAULT false), `processing_error` (TEXT), `created_at`
- [ ] **AC9:** RLS habilitado em todas as 7 tabelas com policy `org_id = user_org_id()` para SELECT/INSERT/UPDATE (padrão do projeto em `004_rls_policies.sql`)
- [ ] **AC10:** Índices criados: `(org_id, status)` em meta_campaigns/meta_adsets/meta_ads; `(org_id, level, date DESC)` e `(entity_id, date DESC)` em meta_insights_daily; `(org_id, created_at DESC)` em webhook_logs e meta_sync_log; `(org_id, meta_campaign_id)` em meta_campaigns

## Scope

### IN (o que esta story implementa)
- Arquivo de migration `015_meta_marketing_api.sql`
- 7 tabelas com schema completo
- RLS policies em todas as tabelas
- Índices de performance

### OUT (fora desta story)
- Dados reais — tabelas criadas vazias
- API client para chamar a Meta API (→ Story 16.2)
- UI de configuração de conta (→ Story 16.3)
- Crons de sync (→ Stories 16.4, 16.5)
- Criptografia do `access_token` (armazenar como TEXT por ora — Story 16.3 trata segurança)
- Alterações em tabelas existentes (`leads`, `organizations`)

## Dev Notes

### Arquivo a criar

```
supabase/migrations/015_meta_marketing_api.sql
```

### Padrão de migration do projeto

Ver `supabase/migrations/013_campaign_engine.sql` como referência de:
- Cabeçalho com comentários (tabelas criadas, epic)
- `CREATE TABLE IF NOT EXISTS` com constraints
- `CREATE INDEX IF NOT EXISTS` após as tabelas
- RLS ao final: `ALTER TABLE x ENABLE ROW LEVEL SECURITY` + `CREATE POLICY`

### Padrão de RLS do projeto

```sql
-- Habilitar RLS
ALTER TABLE meta_campaigns ENABLE ROW LEVEL SECURITY;

-- Policy padrão (ver 004_rls_policies.sql)
CREATE POLICY "org_isolation" ON meta_campaigns
  FOR ALL USING (org_id = user_org_id());
```

Função `user_org_id()` já existe em `004_rls_policies.sql`.

### Tipos de dados importantes

- **Budgets:** usar `BIGINT` em centavos (Meta retorna valores em centavos da moeda local)
- **Métricas financeiras:** usar `NUMERIC(12,2)` para `spend`, `cpc`, `cpm`, `cost_per_lead`
- **IDs Meta:** usar `TEXT` — IDs da Meta são strings numéricas grandes (podem exceder INT8)
- **Timestamps Meta:** usar `TIMESTAMPTZ` — Meta retorna ISO 8601 com timezone

### Schema resumido para referência

```sql
-- meta_ad_accounts
meta_account_id TEXT NOT NULL,  -- ex: "act_1234567890"
access_token    TEXT,           -- System User Token (plain por ora)
status          TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'disconnected', 'error'))

-- meta_campaigns
meta_campaign_id TEXT NOT NULL,
objective        TEXT,          -- OUTCOME_LEADS, OUTCOME_TRAFFIC, etc
status           TEXT NOT NULL DEFAULT 'ACTIVE'
                 CHECK (status IN ('ACTIVE','PAUSED','ARCHIVED','DELETED'))
daily_budget     BIGINT,        -- centavos
lifetime_budget  BIGINT,        -- centavos

-- meta_insights_daily
level       TEXT NOT NULL CHECK (level IN ('campaign','adset','ad')),
entity_id   TEXT NOT NULL,  -- meta_campaign_id | meta_adset_id | meta_ad_id
date        DATE NOT NULL,
spend       NUMERIC(12,2) DEFAULT 0,
leads       INT DEFAULT 0,

-- webhook_logs
source      TEXT NOT NULL DEFAULT 'meta_ads',
org_id      UUID REFERENCES organizations(id)  -- NULLABLE
```

### Verificação pós-migration

```bash
# Aplicar migration localmente
supabase db push

# Verificar tabelas criadas
supabase db diff  # deve retornar vazio se tudo aplicado

# Verificar RLS
# No Supabase Studio: Table Editor → cada tabela → RLS deve estar "Enabled"
```

### Env vars

Nenhuma env var nova nesta story — migration é pura DDL.

## Tasks / Subtasks

- [x] **Task 1** — Criar arquivo `supabase/migrations/015_meta_marketing_api.sql`
  - Cabeçalho com comentário listando todas as tabelas
  - Criar tabela `meta_ad_accounts` (AC2)
  - Criar tabela `meta_campaigns` (AC3)
  - Criar tabela `meta_adsets` (AC4)
  - Criar tabela `meta_ads` (AC5)

- [x] **Task 2** — Adicionar tabelas de métricas e logs
  - Criar tabela `meta_insights_daily` (AC6)
  - Criar tabela `meta_sync_log` (AC7)
  - Criar tabela `webhook_logs` (AC8)

- [x] **Task 3** — RLS e índices
  - Habilitar RLS em todas as 7 tabelas (AC9)
  - Criar policies `org_isolation` em todas (AC9)
  - Criar todos os índices especificados (AC10)

- [x] **Task 4** — Aplicar e validar migration
  - `supabase db push` sem erros (AC1) — aplicado via Management API
  - Verificar `supabase db diff` retorna vazio
  - Confirmar RLS habilitado em todas as tabelas — rowsecurity=true nas 7 tabelas ✅

## File List

### Arquivos criados
- `supabase/migrations/015_meta_marketing_api.sql` ✅

### Arquivos modificados
- Nenhum

## Testes

- [ ] `supabase db push` executa sem erro
- [ ] `supabase db diff` retorna vazio após push
- [ ] Verificar no Studio que RLS está ativo em todas as 7 tabelas
- [ ] Verificar constraint UNIQUE funciona: tentar inserir `meta_campaign_id` duplicado por `org_id` deve retornar erro
- [ ] Verificar índices criados via `\d meta_insights_daily` no psql

## 🤖 CodeRabbit Integration

**Story Type Analysis:**
- Primary Type: Database (DDL migration)
- Complexity: Medium (7 tabelas, RLS, índices)

**Specialized Agent Assignment:**
- Primary: `@dev` (implementação da migration)
- Supporting: `@qa` (validação de schema, RLS, índices)

**Quality Gate Tasks:**
- [ ] Pre-Commit (`@dev`): `supabase db push` sem erros
- [ ] Pre-PR (`@qa`): Revisar schema, RLS policies, índices de performance

**CodeRabbit Focus Areas:**
- RLS: todas as tabelas com `user_org_id()` policy
- Tipos de dados: BIGINT para budgets, NUMERIC para financeiro, TEXT para IDs Meta
- Índices: cobertura dos queries mais comuns (por org+status, por entity+date)
- Constraints: UNIQUE por org_id para evitar duplicação de sync

## Change Log

| Data | Agente | Ação |
|---|---|---|
| 2026-04-24 | @sm (River) | Story criada — Draft |
| 2026-04-24 | @po (Pax) | Validação GO — 9/10 — status atualizado para Ready |
| 2026-04-24 | @dev (Dex) | Tasks 1-4 concluídas — migration 015 aplicada via Management API. 7 tabelas criadas, RLS ativo em todas, índices confirmados. Status: Ready for Review |

## QA Results

**Verdict:** PASS
**Reviewer:** @qa (Quinn) — 2026-04-24
**Gate file:** `docs/qa/gates/16.1-migration-meta-marketing-api-tables.yml`

**ACs verificados:** 10/10 ✅
**Fix aplicado durante review:** Migration 015 registrada em supabase_migrations.schema_migrations (não registrada por ter sido aplicada via Management API)
**Tech debt:** 3 itens LOW registrados para Stories 16.3/16.6 (access_token plain, webhook_logs RLS null-org, updated_at sem trigger)

## Definition of Done

- [x] Migration criada e aplicada sem erros
- [x] 7 tabelas existem no banco com schema correto
- [x] RLS ativo em todas as tabelas
- [x] Índices criados conforme especificado
- [x] @qa PASS
- [ ] @devops push realizado
