# Story 51-1 — Google Ads: Schema Postgres + Armazenamento de Credenciais

## Metadata
- **Epic:** 51 — Google Ads Marketing API Integration
- **Story:** 51-1
- **Status:** Ready
- **Priority:** P0 — fundação para todas as outras stories do Epic 51
- **Complexity:** M (~5h)
- **Created:** 2026-06-08
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @data-engineer (Dara)
- **Quality Gate:** @dev (Dex)
- **Quality Gate Tools:** `[schema_validation, rls_test, migration_review, index_analysis]`

---

## User Story

**Como** sistema Trifold CRM,
**Quero** ter o schema Postgres para Google Ads (tabelas de contas, campanhas, insights diários e log de sync) com RLS por `org_id` e armazenamento seguro de credenciais OAuth,
**Para que** as stories subsequentes de sync (51-2) e UI (51-3) tenham uma fundação de banco de dados sólida e isolada por organização.

---

## Context

O projeto já tem integração Meta Ads consolidada (Epic 16), com padrão estabelecido de:
- Tabelas `meta_ad_accounts`, `meta_campaigns`, `meta_insights_daily` — espelhar para Google Ads
- Migration numerada em `supabase/migrations/` — próxima disponível: `076_google_ads_schema.sql`
- RLS via função `public.user_org_id()` — manter exatamente este padrão

**Blocker externo:** A Google Ads API exige **Developer Token aprovado manualmente pelo Google**.
- Registrar via Google Ads Manager Account → API Center → Developer Token
- Basic Access (padrão inicial): até 15.000 operações/dia — suficiente para MVP
- Sem este token, o sync (Story 51-2) não funcionará em produção
- Iniciar solicitação em paralelo com esta story

**Diferença arquitetural Google vs Meta — autenticação:**
- Meta: System User Token (token estático permanente, armazenado em texto)
- Google: OAuth 2.0 com `refresh_token` (acesso de longa duração via renovação automática)
- `access_token` expira em 1h; o servidor usa `refresh_token` para renovar automaticamente
- Credenciais OAuth são por organização, não globais

**Hierarquia de contas Google Ads:**
- Manager Account (MCC): onde o Developer Token é registrado
- Customer Account: onde ficam campanhas e dados de spend (identificado pelo `customer_id`)
- Para MVP: 1 `customer_id` por organização

---

## Acceptance Criteria

- [ ] **AC1:** Migration `supabase/migrations/076_google_ads_schema.sql` criada e aplicável sem erros (`supabase db push` ou equivalente)
- [ ] **AC2:** Tabela `google_ads_accounts` criada com campos: `id`, `org_id`, `customer_id` (TEXT, ex: `"123-456-7890"`), `name`, `currency_code`, `status` (active/disconnected/error), `last_synced_at`, `created_at`, `updated_at` — UNIQUE `(org_id, customer_id)`
- [ ] **AC3:** Tabela `google_ads_campaigns` criada com campos: `id`, `org_id`, `account_id` (FK → `google_ads_accounts`), `google_campaign_id` (TEXT), `name`, `status` (ENABLED/PAUSED/REMOVED), `advertising_channel_type`, `budget_micros` (BIGINT — unidade Google), `start_date`, `end_date`, `synced_at`, `created_at` — UNIQUE `(org_id, google_campaign_id)`
- [ ] **AC4:** Tabela `google_ads_insights_daily` criada com campos: `id`, `org_id`, `level` (campaign/ad_group/ad), `entity_id` (TEXT), `date` (DATE), `spend` (NUMERIC 12,2 — **já convertido de micros para BRL**), `impressions` (BIGINT), `clicks` (BIGINT), `ctr` (NUMERIC 8,4), `cpc` (NUMERIC 12,2), `conversions` (NUMERIC 8,2), `cost_per_conversion` (NUMERIC 12,2), `created_at` — UNIQUE `(org_id, level, entity_id, date)`
- [ ] **AC5:** Tabela `google_ads_sync_log` criada com campos: `id`, `org_id`, `sync_type` (insights/backfill), `status` (running/success/error), `started_at`, `finished_at`, `records_synced` (INT), `api_calls_made` (INT), `error_message` (TEXT), `created_at`
- [ ] **AC6:** RLS habilitada em todas as 4 tabelas com política `org_isolation` usando `org_id = public.user_org_id()` (mesmo padrão de `015_meta_marketing_api.sql`)
- [ ] **AC7:** Índices criados: `(org_id, status)` em `google_ads_campaigns`; `(org_id, level, date DESC)` e `(entity_id, date DESC)` em `google_ads_insights_daily`; `(org_id, created_at DESC)` em `google_ads_sync_log`
- [ ] **AC8:** Coluna `google_ads_config` adicionada à tabela `organizations` como `JSONB DEFAULT NULL` — armazena credenciais OAuth por org: `{customer_id, refresh_token, client_id, client_secret, connected_at, status}`. **Débito técnico documentado:** `refresh_token` é armazenado em plaintext no MVP (mesmo padrão de `meta_ad_accounts.access_token` — decisão consciente aceita para MVP, revisão via story futura de encryption-at-rest)
- [ ] **AC9:** Migration é idempotente — uso de `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DO $$ ... IF NOT EXISTS $$` para ALTER TABLE — safe para re-execução
- [ ] **AC10:** Adicionar `COMMENT ON COLUMN organizations.google_ads_config IS '{"customer_id": "123-456-7890", "refresh_token": "1//...", "client_id": "xxx.apps.googleusercontent.com", "client_secret": "GOCSPX-...", "connected_at": "ISO8601", "status": "connected|disconnected|error"}'` na migration para documentar shape esperado. Regeneração de tipos Supabase (`supabase gen types`) é responsabilidade externa a esta story — documentar como handoff para @dev após migration aplicada

---

## Tasks / Subtasks

- [ ] **T1** — Criar migration `076_google_ads_schema.sql` (AC1-AC7)
  - [ ] T1.1 — Criar tabela `google_ads_accounts` com constraints e UNIQUE
  - [ ] T1.2 — Criar tabela `google_ads_campaigns` com FK para `google_ads_accounts`
  - [ ] T1.3 — Criar tabela `google_ads_insights_daily` com UNIQUE `(org_id, level, entity_id, date)` — pivô do upsert do cron
  - [ ] T1.4 — Criar tabela `google_ads_sync_log`
  - [ ] T1.5 — Criar todos os índices listados em AC7
  - [ ] T1.6 — Habilitar RLS e criar políticas `org_isolation` nas 4 tabelas (AC6)

- [ ] **T2** — Adicionar `google_ads_config` à tabela `organizations` (AC8)
  - [ ] T2.1 — `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS google_ads_config JSONB DEFAULT NULL`
  - [ ] T2.2 — `COMMENT ON COLUMN organizations.google_ads_config IS '...'` com shape completo (campos: customer_id, refresh_token, client_id, client_secret, connected_at, status) — replicar Dev Notes → Shape esperado de `google_ads_config`
  - [ ] T2.3 — Documentar débito técnico de plaintext em comentário inline: `-- TODO: encrypt refresh_token (debt: story futura encryption-at-rest)`

- [ ] **T3** — Validar migration (AC1, AC9)
  - [ ] T3.1 — Executar `supabase db push` ou `supabase migration up` localmente
  - [ ] T3.2 — Confirmar idempotência: re-executar migration sem erros
  - [ ] T3.3 — Verificar RLS ativa em cada tabela via `\d+ google_ads_insights_daily` ou equivalente

- [ ] **T4** — Confirmar consistência com padrão Meta (revisão cruzada)
  - [ ] T4.1 — Comparar estrutura com `015_meta_marketing_api.sql` — nomes de políticas, constraint names, índice naming convention devem seguir o mesmo padrão

---

## Dev Notes

### Arquivos a criar/modificar
- `supabase/migrations/076_google_ads_schema.sql` — **criar** (migration principal desta story)
- `supabase/migrations/README.md` — nenhuma modificação necessária

### Arquivo de referência obrigatório
- `supabase/migrations/015_meta_marketing_api.sql` — **ler antes de escrever a migration**
  - Política RLS usa `public.user_org_id()` — manter exato
  - Naming convention: `idx_{table}_{fields}` para índices
  - Política: `CREATE POLICY "org_isolation" ON {table} FOR ALL USING (...)`
  - Constraint check para `status`: inline no CREATE TABLE

### Tabela `organizations`
- Já existe no banco — adicionar coluna via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- Padrão para colunas JSONB de config de integrações: ver `organizations.meta_ads_config` (se existir) ou simplesmente `JSONB DEFAULT NULL`
- Verificar se a coluna já existe antes de criar: `ADD COLUMN IF NOT EXISTS` garante idempotência

### Shape esperado de `google_ads_config` (JSONB)
```json
{
  "customer_id": "123-456-7890",
  "refresh_token": "1//...",
  "client_id": "xxx.apps.googleusercontent.com",
  "client_secret": "GOCSPX-...",
  "connected_at": "2026-06-08T12:00:00Z",
  "status": "connected"
}
```
- `refresh_token` é sensível — em produção deve ser encriptado (escopo de story futura)
- Para MVP: armazenar em plaintext como Meta Ads faz com `access_token` em `meta_ad_accounts`

### Convenção monetária Google Ads (CRÍTICO)
- Google Ads API retorna valores monetários em **micros** (1 BRL = 1.000.000 micros)
- A tabela `google_ads_insights_daily.spend` armazena **BRL** (já convertido)
- Conversão: `spend_brl = cost_micros / 1_000_000`
- NÃO armazenar micros — normalizar ao inserir no cron (Story 51-2)

### Numeração da migration
- Última migration aplicada: `075_leads_metadata.sql`
- Esta story: `076_google_ads_schema.sql`
- Verificar via `ls supabase/migrations/` antes de criar para confirmar numeração

### Padrão de nomes de entidades Google Ads vs Meta
- Google usa `google_campaign_id` (não `meta_campaign_id`)
- Google usa `customer_id` (não `account_id` como Meta usa `meta_account_id`)
- Google usa `status IN ('ENABLED', 'PAUSED', 'REMOVED')` (UPPERCASE, diferente do Meta)
- Google usa `advertising_channel_type` (SEARCH, DISPLAY, VIDEO, etc.) em vez de `objective`

### Sem FK para `google_ads_campaigns` a partir de `google_ads_insights_daily`
- O mesmo padrão de Meta: `meta_insights_daily.entity_id` é TEXT sem FK
- Motivo: `entity_id` pode referenciar campaign, ad_group ou ad (nível dinâmico via `level`)
- Manter assim — FK não seria possível sem tabela de dispatch

---

## Testing

### Abordagem
- Teste de migração: aplicar em banco local Supabase e validar estrutura
- Validação de RLS: verificar políticas via `psql` ou Supabase Studio

### Cenários de teste
1. **Idempotência:** Executar migration 2x — deve passar sem erros na segunda execução
2. **RLS:** Tentar `SELECT * FROM google_ads_insights_daily` sem contexto de org — deve retornar 0 rows (não erro)
3. **UNIQUE constraint:** Tentar inserir 2 rows com mesmo `(org_id, level, entity_id, date)` — deve falhar com constraint violation
4. **Coluna `organizations.google_ads_config`:** Verificar `\d organizations` após migration

### Não é escopo desta story
- Testes de integração com a Google Ads API (escopo de Story 51-2)
- Testes de UI (escopo de Story 51-3)

---

## Riscos

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | Developer Token não aprovado quando Story 51-2 iniciar | Iniciar solicitação durante ou antes desta story; Basic Access geralmente automático |
| R2 | Coluna `google_ads_config` em `organizations` já existir | `ADD COLUMN IF NOT EXISTS` garante segurança |
| R3 | Numeração de migration conflitar | Confirmar via `ls supabase/migrations/` antes de criar o arquivo |

---

## Dependencies

- **Depende de:** nada (story fundacional do Epic 51)
- **Bloqueia:** Story 51-2 (cron sync) e Story 51-3 (UI)

---

## Definition of Done

- [ ] Todos os ACs marcados como completos
- [ ] Migration aplicada localmente sem erros
- [ ] Idempotência confirmada (re-execução sem falha)
- [ ] RLS verificada em todas as 4 tabelas
- [ ] @qa executou quality gate com verdict >= PASS ou CONCERNS documentados
- [ ] @devops fez push do commit final

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-08 | 0.1 | Story drafted a partir do Epic 51 | @sm (River) |
| 2026-06-08 | 0.2 | PM review (AI-10/AI-11/AI-12): AC8 documenta débito técnico de plaintext explicitamente; AC10 reescrito como COMMENT ON COLUMN + handoff de tipos; T2.2-T2.3 adicionados | @sm (River) |
| 2026-06-08 | 0.3 | Validated (10-point checklist, score 10/10), Draft → Ready | @po (Pax) |

---

## Dev Agent Record

### Agent Model Used
_(a ser preenchido pelo @dev/@data-engineer durante implementação)_

### Debug Log References
_(a ser preenchido durante implementação)_

### Completion Notes List
_(a ser preenchido durante implementação)_

### File List

#### Created
- `supabase/migrations/076_google_ads_schema.sql`

#### Modified
- _(a confirmar durante implementação — possivelmente `supabase/schema.sql` se existir)_

---

## QA Results
_(a ser preenchido pelo @qa)_
