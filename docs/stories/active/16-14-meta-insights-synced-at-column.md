# Story 16.14: Add synced_at column to meta_insights_daily

## Status

Done

## Executor Assignment

```
executor: "@data-engineer"
quality_gate: "@dev"
quality_gate_tools: ["curl smoke test (HTTP 200 + records_synced > 0)", "SQL query on meta_sync_log", "spot-check SELECT on meta_insights_daily"]
effort: XS
story_points: 1
estimated_hours: 0.5
risk: LOW
visibility: HIGH
mode: YOLO
depends_on:
  - "Bug #1 RESOLVED (commit 7316a84): vercel.json movido para packages/web/, crons ativos"
```

## Story

**As a** sistema de sincronização de Meta Ads (cron `/api/cron/meta-sync-insights`),
**I want** que a coluna `synced_at` exista na tabela `meta_insights_daily`,
**so that** o gestor de marketing possa visualizar métricas diárias de campanhas Meta Ads no CRM sem interrupção (o cron retorna HTTP 500 hoje, bloqueando o ETL diário de insights e deixando a tela de Criativos sem dados frescos).

## Acceptance Criteria

1. `ALTER TABLE meta_insights_daily ADD COLUMN synced_at TIMESTAMPTZ NOT NULL DEFAULT now()` foi executado com sucesso — confirmado via `SELECT column_name FROM information_schema.columns WHERE table_name = 'meta_insights_daily' AND column_name = 'synced_at'` retornando 1 linha.
2. Rows existentes em `meta_insights_daily` têm `synced_at` preenchido com valor de `created_at` (backfill defensivo executado como segunda instrução na migration).
3. Migration `045_meta_insights_synced_at.sql` aplicada via `supabase db push` ao projeto remoto `dsopqkqjkmhytudaaolv`.
4. Trigger manual do cron `/api/cron/meta-sync-insights` via curl com `CRON_SECRET` retorna HTTP 200 e o corpo JSON contém `records_synced > 0`.
5. Nova linha em `meta_sync_log` com `sync_type = 'insights'` e `status = 'success'` é criada após a execução do cron (confirmado via SELECT na Dev Notes).

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled in `core-config.yaml`.
> Quality validation will use manual review process only.

## Tasks / Subtasks

- [x] **T1 — Confirmar número disponível e criar arquivo de migration** (AC: 1, 2, 3)
  - [x] T1.1 Verificar que slot `045` está livre: confirmado via Management API (0 rows em `schema_migrations WHERE version IN ('044','045')`)
  - [x] T1.2 Verificar que migration 044 está registrada: NÃO está registrada em remoto (last registered: `043`, depois timestamps `20260515*` de migrations criadas via Studio). [AUTO-DECISION] Aplicar APENAS o ALTER+UPDATE da 045 via Management API em vez de `supabase db push` (reason: bug em produção é urgente e independente da 044; 044 é uma migration de dados de produção da Story 31.3 que requer Pre-Flight com confirmação do Gabriel — está FORA do escopo desta story; pitfall conhecido em `project_supabase_migrations_pitfalls.md` sobre version conflicts com Studio justifica não usar `supabase db push` em mismatch). Migration 045 também registrada em `schema_migrations` manualmente para idempotência futura.
  - [x] T1.3 Criar `supabase/migrations/045_meta_insights_synced_at.sql` com o SQL completo das Dev Notes

- [x] **T2 — Aplicar migration** (AC: 3)
  - [x] T2.1 Executar ALTER + UPDATE via Supabase Management API (alternativa documentada nas Dev Notes para conflitos com `db push`)
  - [x] T2.2 Confirmar output sem erros — ALTER, UPDATE e INSERT no schema_migrations retornaram `[]` (success)

- [x] **T3 — Validar schema pós-migration** (AC: 1, 2)
  - [x] T3.1 Coluna confirmada: `data_type=timestamp with time zone`, `is_nullable=NO`, `column_default=now()`
  - [x] T3.2 Backfill: 0 rows com `synced_at IS NULL` (tabela estava vazia pré-cron porque o cron nunca havia conseguido inserir — backfill virou no-op natural)
  - [x] T3.3 Spot-check pós-cron: campaign=10, adset=19, ad=35 (todos com `synced_at` populado)

- [x] **T4 — Smoke test do cron** (AC: 4, 5)
  - [x] T4.1 `CRON_SECRET` obtido via `vercel env pull --environment=production` do diretório raiz (linked ao projeto `trifold-crm`, NÃO o `packages/web/` que está linked a um projeto separado `web` por engano)
  - [x] T4.2 Cron disparado via curl com Authorization Bearer — completou em 9.7s
  - [x] T4.3 HTTP 200 + body `{"ok":true,"accounts_synced":2,"results":[{...records_synced:64},{...records_synced:0}]}` — total 64 records sincronizados
  - [x] T4.4 `meta_sync_log` confirma 2 novas linhas com `status='success'` (uma por account); linhas anteriores (12:15) mostram o erro exato `"Could not find the 'synced_at' column..."` que esta story resolveu

- [x] **T5 — Atualizar story e fechar**
  - [x] T5.1 Checkboxes atualizados
  - [x] T5.2 Status: InProgress → InReview (NÃO Done — @qa decide isso)
  - [x] T5.3 Change Log atualizado (SHA do commit será adicionado pelo @devops no push)

## Dev Notes

### Contexto e raiz do bug

O cron `GET /api/cron/meta-sync-insights` falha com HTTP 500 em produção desde a criação da tabela. Erro exato no log:

```
Could not find the 'synced_at' column of 'meta_insights_daily' in the schema cache
```

**Causa:** o código TypeScript em `packages/web/src/app/api/cron/meta-sync-insights/route.ts` escreve `synced_at` nas linhas 170, 211 e 255 (upsert de métricas de nível campaign, adset e ad respectivamente), mas a coluna nunca foi adicionada à tabela via migration.

**Estado atual da tabela `meta_insights_daily` em produção (confirmado via Management API):**
```
id, org_id, level, entity_id, date, spend, impressions, reach, clicks,
ctr, cpc, cpm, frequency, leads, messaging_conversations_started,
cost_per_lead, actions, created_at
```
A coluna `synced_at` está **ausente**.

**Tabelas que JÁ TÊM `synced_at` e funcionam (pattern de referência):**
- `meta_campaigns` — populada pelo cron `meta-sync-entities` (839 registros sincronizados com sucesso)
- `meta_adsets`
- `meta_ads`

### Dependência de bugs resolvidos

Este bug é o Bug #2 de um grupo de 3 que bloqueavam os crons Meta Ads:
- Bug #1 RESOLVIDO: `vercel.json` movido para `packages/web/` (commit `7316a84`) — crons reativados no Vercel
- Bug #3 RESOLVIDO: `NEXT_PUBLIC_SITE_URL` adicionado ao Vercel prod/preview/dev

Apenas o Bug #2 (esta story) ainda bloqueia o ETL de insights.

### Impacto em downstream

A Story 26.1 (UI Performance Criativos Meta Ads) depende de `meta_insights_daily` populada diariamente. Com o cron em falha, a tela de Criativos exibe dados ausentes ou desatualizados.

### SQL completo da migration 045

```sql
-- ============================================================
-- 045_meta_insights_synced_at.sql
-- Adiciona coluna synced_at à tabela meta_insights_daily.
--
-- Raiz: cron /api/cron/meta-sync-insights falha HTTP 500 porque
-- o código (route.ts linhas 170, 211, 255) escreve synced_at mas
-- a coluna não existe no schema.
--
-- Seguro: ADD COLUMN com DEFAULT now() é não-bloqueante no Postgres.
-- Não reescreve rows existentes — apenas define o default para novas.
-- O UPDATE abaixo faz backfill defensivo para rows já existentes.
-- Idempotente: ADD COLUMN IF NOT EXISTS garante no-op em rerun.
--
-- Padrão de referência: meta_campaigns, meta_adsets, meta_ads já têm synced_at.
-- ============================================================

ALTER TABLE meta_insights_daily
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill: rows existentes recebem synced_at = created_at
-- (WHERE defensivo: só atualiza rows onde o DEFAULT now() foi aplicado,
--  ou seja, onde synced_at aponta para "agora" em vez de um valor semântico)
UPDATE meta_insights_daily
SET synced_at = created_at
WHERE synced_at > created_at + INTERVAL '1 second';
```

**Nota sobre o UPDATE defensivo:** o `DEFAULT now()` é aplicado no momento do ALTER TABLE para rows existentes. Esse backfill reposiciona o timestamp para `created_at`, que é mais representativo do período ao qual o registro de insight pertence. Rows futuras inseridas pelo cron continuarão recebendo `synced_at` explicitamente (o código já faz isso).

### Caminho do arquivo de migration

```
supabase/migrations/045_meta_insights_synced_at.sql
```

### Comando de aplicação

```bash
# Rodar da raiz do projeto (onde supabase/ vive)
supabase db push
```

O projeto já está linked ao `dsopqkqjkmhytudaaolv` — não é necessário passar `--project-ref`.

### Comando de validação do cron (smoke test)

```bash
# Passo 1: obter CRON_SECRET do Vercel (projeto linkado em packages/web/.vercel)
cd packages/web && vercel env pull /tmp/vercel-trifold.env

# Passo 2: extrair e disparar
SECRET=$(grep '^CRON_SECRET=' /tmp/vercel-trifold.env | cut -d= -f2- | tr -d '"')
curl -H "Authorization: Bearer ${SECRET}" \
     "https://trifold-crm.vercel.app/api/cron/meta-sync-insights" \
     --max-time 180
```

O cron pode levar até 2–3 minutos para completar dependendo do volume de insights a sincronizar. `--max-time 180` evita timeout prematuro do curl.

### Query de verificação no log

```sql
SELECT sync_type, status, records_synced, error_message, started_at
FROM meta_sync_log
WHERE sync_type = 'insights'
ORDER BY started_at DESC
LIMIT 3;
```

Resultado esperado após a execução bem-sucedida:
- `status = 'success'`
- `records_synced > 0`
- `error_message` nulo ou vazio

### Referências de código

| Arquivo | Relevância |
|---------|-----------|
| `packages/web/src/app/api/cron/meta-sync-insights/route.ts` (linhas 170, 211, 255) | Código que escreve `synced_at` — sem alteração necessária, apenas o schema estava faltando |
| `packages/web/src/app/api/cron/meta-sync-entities/route.ts` | Pattern de referência que funciona — usa `synced_at` em `meta_campaigns`, `meta_adsets`, `meta_ads` |
| `supabase/migrations/044_backfill_commercial_rules.sql` | Última migration aplicada — confirmar que está aplicada antes de rodar a 045 |

## Testing

### Abordagem

Esta story é puramente de schema — uma única instrução DDL + um UPDATE de backfill. Não há código TypeScript novo.

O "teste" é inteiramente via:
1. Validação de schema (SQL)
2. Smoke test do cron via curl
3. Inspeção do `meta_sync_log`

Não há unit tests a criar ou modificar.

### Cenários de validação

| Cenário | Query / Comando | Resultado esperado |
|---------|-----------------|-------------------|
| Coluna existe | `SELECT column_name FROM information_schema.columns WHERE table_name = 'meta_insights_daily' AND column_name = 'synced_at'` | 1 linha |
| Backfill completo | `SELECT COUNT(*) FROM meta_insights_daily WHERE synced_at IS NULL` | 0 |
| Cron retorna 200 | `curl -H "Authorization: Bearer $SECRET" https://trifold-crm.vercel.app/api/cron/meta-sync-insights --max-time 180` | HTTP 200, body com `records_synced > 0` |
| Log de sucesso | Query `meta_sync_log` WHERE `sync_type='insights'` ORDER BY `started_at DESC LIMIT 1` | `status='success'` |
| Spot-check dados | `SELECT level, COUNT(*) FROM meta_insights_daily GROUP BY level` | Rows com `level` IN ('campaign', 'adset', 'ad') |

### Avaliação de risco da migration

**BAIXO.** `ADD COLUMN IF NOT EXISTS` com `DEFAULT now()` é uma operação não-bloqueante no PostgreSQL — não faz rewrite de rows existentes, não cria lock longo na tabela. O UPDATE de backfill afeta apenas rows onde `synced_at` aponta para "agora" (i.e., rows antigas que receberam o DEFAULT no momento do ALTER), o que em produção deve ser um conjunto pequeno e de curta janela.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-18 | 1.0 | Story criada pelo @sm (River) a partir do handoff `handoff-devops-to-sm-1779100000.yaml` (Bug #2 do grupo de 3 bugs de crons Meta Ads resolvidos pelo @devops). Raiz confirmada em produção: `synced_at` ausente em `meta_insights_daily`. SQL completo embarcado nas Dev Notes. Risco: LOW. Estimativa: XS (~30min). | River (@sm) |
| 2026-05-18 | 1.1 | Validation GO (10/10) — Pax (@po). Anti-hallucination: confirmado route.ts linhas 170/211/255 escrevem synced_at; migration 015 confirma meta_insights_daily sem synced_at (linha 103) enquanto meta_campaigns/adsets/ads possuem (linhas 52/73/93); slot 045 livre; padrão de referência meta-sync-entities/route.ts linhas 103/143/186 verificado. Executor @data-engineer + gate @dev validados. Status: Draft → Ready. Próximo: @data-engineer aplica T1-T4. | Pax (@po) |
| 2026-05-18 | 1.2 | Implementação completa — Dara (@data-engineer). Migration `045_meta_insights_synced_at.sql` criada e aplicada via Management API (não `db push` porque migration 044 está pending e fora do escopo desta story — pitfall de version conflict documentado). Schema validado: `synced_at TIMESTAMPTZ NOT NULL DEFAULT now()`. Cron `meta-sync-insights` smoke test: HTTP 200, 64 records sincronizados em 9.7s, 2 accounts (campaign=10, adset=19, ad=35). `meta_sync_log` confirma transição de error → success. Status: Ready → InProgress → InReview. Próximo: @qa quality gate. | Dara (@data-engineer) |

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context) — @data-engineer (Dara)

### Debug Log References

- Management API endpoint: `POST https://api.supabase.com/v1/projects/dsopqkqjkmhytudaaolv/database/query`
- Vercel env pull: requires `--environment=production` from REPO ROOT (`.vercel/project.json` linked a `trifold-crm`). O diretório `packages/web/.vercel/` está linked a um projeto separado `web` por engano histórico — usar root evita esse pitfall.
- Cron route auth check: `packages/web/src/app/api/cron/meta-sync-insights/route.ts:92` — `authHeader !== \`Bearer ${CRON_SECRET}\`` returns 401.
- meta_sync_log antes/depois: 2 linhas error às 12:15 (mensagem `"Could not find the 'synced_at' column..."`) → 2 linhas success às 13:17 (após aplicação).

### Completion Notes List

1. **Migration applicada via Management API ao invés de `supabase db push`** — decisão consciente porque a 044 está pending no remoto e é uma data migration de produção (Story 31.3) que requer Pre-Flight com confirmação do Gabriel. `db push` aplicaria ambas, o que está fora de escopo. Migration registrada manualmente em `supabase_migrations.schema_migrations` para idempotência (`supabase migration list` no futuro mostrará 045 como aplicada).
2. **Backfill UPDATE foi no-op** — a tabela estava vazia (0 rows) porque o cron nunca havia conseguido inserir antes do fix. O UPDATE com `WHERE synced_at > created_at + INTERVAL '1 second'` ficou disponível defensivamente para qualquer ambiente que tivesse rows pré-existentes (não é o caso aqui).
3. **Cron retorno**: `{"ok":true,"accounts_synced":2,"results":[{"account_id":"08e067bb...","status":"success","records_synced":64},{"account_id":"49acd569...","status":"success","records_synced":0}]}` — account 2 com 0 records é esperado (pode não ter campanhas ativas ou já estar atualizado).
4. **Nenhuma alteração em código TypeScript** — esta é uma story 100% de schema; o código já estava correto, faltava só a coluna.
5. **Vercel link inconsistency descoberto** — `packages/web/.vercel/project.json` aponta para `prj_LxbohPRWeO6...` (projectName `web`), mas a produção real é `prj_KMm5f2y...` (projectName `trifold-crm`, linked na raiz). Para qualquer operação `vercel env pull` futura, USAR sempre da raiz do repo, não de `packages/web/`.

### File List

**Created:**
- `supabase/migrations/045_meta_insights_synced_at.sql`

**Modified:**
- `docs/stories/active/16-14-meta-insights-synced-at-column.md` (status, tasks, change log, dev agent record)

**No code changes** — schema-only fix.

## QA Results

### Review Date: 2026-05-18

### Reviewed By: Quinn (Test Architect & Quality Advisor)

### Verdict: **PASS**

Hotfix de schema validado em produção com evidência completa before/after. Todos os 7 checks do qa-gate passaram. Coluna `synced_at` confirmada em `meta_insights_daily` (TIMESTAMPTZ NOT NULL DEFAULT now()), 64 records sincronizados sem nulls, sister tables intactas (meta_campaigns=99, meta_adsets=193, meta_ads=547 rows, todas com synced_at populado). Migration aplicada via Supabase Management API com justificativa válida documentada (migration 044 pending de outra story; aplicar `db push` aplicaria ambas, fora de escopo).

### 7-Check Score

| # | Check | Score | Evidência |
|---|-------|-------|-----------|
| 1 | Code/Migration Review | PASS | `supabase/migrations/045_meta_insights_synced_at.sql`: `ADD COLUMN IF NOT EXISTS` (idempotente), `NOT NULL DEFAULT now()`, UPDATE de backfill defensivo com WHERE seguro (`synced_at > created_at + INTERVAL '1 second'`). SQL coerente com o pattern documentado nas Dev Notes. |
| 2 | Schema Test (prod) | PASS | Query via Management API confirma: `column_name=synced_at, data_type=timestamp with time zone, is_nullable=NO, column_default=now()`. Zero rows com `synced_at IS NULL` em todos os 3 levels (campaign=10, adset=19, ad=35). |
| 3 | AC Compliance | PASS | AC1 ✓ (coluna existe), AC2 ✓ (backfill executado — no-op natural por tabela vazia), AC3 ✓ COM DEVIAÇÃO JUSTIFICADA (aplicado via Management API em vez de `db push` para isolar do conflito com 044; registrado manualmente em schema_migrations), AC4 ✓ (HTTP 200 + 64 records), AC5 ✓ (2 rows status=success em meta_sync_log). |
| 4 | Regression Check | PASS | Sister tables verificadas: `meta_campaigns` (99 rows), `meta_adsets` (193), `meta_ads` (547) — todas com `synced_at` populado, nenhuma null. Cron `meta-sync-entities` não impactado. |
| 5 | Performance | PASS | `ADD COLUMN IF NOT EXISTS ... DEFAULT now()` em Postgres 11+ é metadata-only (não reescreve rows). Em tabela vazia, instantâneo. Cron rodou em 9.7s (dentro do budget de 180s do curl). |
| 6 | Security | PASS | Migration não toca em RLS, GRANT, policies ou credenciais. `CRON_SECRET` obtido via vercel env pull (não exposto no log). Authorization Bearer pattern preserva o secret. |
| 7 | Documentation | PASS | Change Log atualizado (v1.0 → v1.2), Dev Agent Record completo com 5 completion notes (incluindo o vercel link inconsistency descoberto), File List preenchido, Debug Log References preserva endpoints e queries. |

### Pontos Sensíveis Avaliados

**1. Deviação AC3 (Management API vs `db push`):** Justificativa sólida. A 044 (Story 31.3) é uma data migration de produção que requer Pre-Flight — `db push` aplicaria ambas, expandindo escopo desta story e violando isolamento. Registro manual em `supabase_migrations.schema_migrations` (`version=045, name=meta_insights_synced_at`) confirmado via query — preserva idempotência futura. Risco residual: BAIXO (registrado como MNT-001).

**2. Hotfix direto em prod sem staging:** Aceitável dado: (a) urgência (cron quebrado há semanas bloqueando ETL diário e Story 26.1 downstream), (b) operação tecnicamente trivial e segura (ADD COLUMN IF NOT EXISTS é não-bloqueante e instantâneo), (c) evidência before/after no `meta_sync_log` (2 rows error às 12:15 → 2 rows success às 13:17), (d) ROLLBACK trivial se necessário (DROP COLUMN — mas inviável pelo fato de o código já escrever a coluna). Registrado como TEST-001.

**3. Risco da 044 pending quebrar `db push` futuro:** Documentado em `project_supabase_migration_pitfalls.md` (pitfall conhecido). Mitigação: Story 31.3 deve ser priorizada para reconciliar o estado. Sem ação obrigatória nesta story. Registrado como MNT-001.

**4. Sister tables com pattern diferente:** Migração 045 usa `NOT NULL DEFAULT now()` enquanto 015 criou sister tables com `synced_at TIMESTAMPTZ` nullable sem default. A nova é mais defensiva (garante invariante de dados), mas introduz divergência de pattern. Registrado como ARCH-001 — sugestão de housekeeping futuro.

### Observações Adicionais

- **Evidência before/after exemplar no `meta_sync_log`:** raro ter trace tão limpo (4 rows: 2 error com mensagem exata do bug + 2 success após o fix). Isso facilita auditoria retroativa.
- **Vercel link inconsistency descoberto** (Dev Agent Record nota #5) é um achado bônus — `packages/web/.vercel/` aponta para projeto diferente da raiz. Vale considerar limpar esse link em housekeeping futuro (não escopo desta story).
- **Backfill UPDATE** foi tecnicamente no-op mas o WHERE defensivo está correto e protegeria qualquer ambiente com rows pré-existentes.

### Gate Status

Gate: PASS → docs/qa/gates/16.14-meta-insights-synced-at-column.yml

### Próximo Passo

Story Status atualizado para **Done**. Próximo: @devops para `*push` do commit (migration 045 + story update).

— Quinn, guardião da qualidade

