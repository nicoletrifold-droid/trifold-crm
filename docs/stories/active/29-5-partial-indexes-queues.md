# Story 29.5 — Migration 034: Partial indexes para queues

## Status
Done

## Subtitle
Índices parciais para queues de email, followup e webhook — menor footprint, maior velocidade

## Executor Assignment
executor: "@data-engineer"
quality_gate: "@architect"
quality_gate_tools: ["concurrent_index_validation", "partial_predicate_review", "rollback_review"]

## Story
**As a** @data-engineer,
**I want** 4 partial indexes criados via CONCURRENTLY nas tabelas de queue (`email_sends_queue`, `follow_up_log`, `webhook_logs`),
**so that** os crons consumidores (`/api/cron/email-queue`, `/api/cron/followup`, webhook Meta) encontrem apenas os rows relevantes sem varrer toda a tabela — índices partial são 10-50x menores e mais rápidos que full indexes quando a maioria dos rows já saiu do filtro.

## Contexto

**Epic 29 — Database Performance Blitz** | Urgência: P1 | Fonte: `docs/stories/epics/epic-29-database-performance-blitz.md`

**Desbloqueada por:** Story 29.1 Done (2026-05-12) — migration tree reconciliada, slot `034` confirmado livre.

**Slot 032 disponível:** 29.3 (em andamento paralelo) usa `032_*`. Esta story usa `034_*`.

### Por que partial indexes em queues

Queues têm comportamento assimétrico: rows ficam `pending` por segundos/minutos e depois passam para `sent`/`processed`/`failed` onde ficam **indefinidamente** como histórico. Com o tempo, a fração `pending` é pequena em relação ao total. Um índice full cobre todos os rows; um índice partial `WHERE status='pending'` cobre apenas os rows que o cron realmente precisa — footprint 10-100× menor, sem degradação de writes.

**Crons consumidores:**
- `/api/cron/email-queue` — query: `SELECT * FROM email_sends_queue WHERE status = 'pending' AND scheduled_for <= now()`
- `/api/cron/followup` — query: `SELECT * FROM follow_up_log WHERE status = 'pending' AND scheduled_at <= now()`
- Webhook handler Meta — query: `SELECT id FROM webhook_logs WHERE leadgen_id = $1` (deduplicação) + `WHERE processed = false` (processamento pendente)

**AC Global B3 do epic (obrigatório em toda story 29.2-29.5):**
- `CREATE INDEX CONCURRENTLY IF NOT EXISTS` em todos os índices
- Rollback SQL comentado no fim do arquivo de migration
- Aplicação via Supabase Studio SQL Editor (NÃO `supabase db push` — CLI envolve em transação que proíbe CONCURRENTLY)
- Ghost migration `034_partial_indexes_queues_remote_only.sql` criada e commitada localmente **antes** de aplicar

---

## Spike — Resultados Completos (executado por @sm em 2026-05-13)

### 1. Tabelas e colunas confirmadas

Consulta `information_schema.columns` contra project `dsopqkqjkmhytudaaolv` em 2026-05-13.

| Tabela | Coluna | Tipo | Status |
|--------|--------|------|--------|
| `email_sends_queue` | `status` | `text` | CONFIRMADA |
| `email_sends_queue` | `scheduled_for` | `timestamp with time zone` | CONFIRMADA |
| `follow_up_log` | `status` | `character varying` | CONFIRMADA |
| `follow_up_log` | `scheduled_at` | `timestamp with time zone` | CONFIRMADA |
| `webhook_logs` | `processed` | `boolean` | CONFIRMADA |
| `webhook_logs` | `created_at` | `timestamp with time zone` | CONFIRMADA |
| `webhook_logs` | `leadgen_id` | `text` | CONFIRMADA |

Todas as 7 colunas alvo existem no remote. Zero ajustes necessários.

### 2. Índices existentes nas 3 tabelas

| Tabela | Índice existente | Definição | Tipo |
|--------|-----------------|-----------|------|
| `email_sends_queue` | `email_sends_queue_pkey` | PK | full |
| `email_sends_queue` | `idx_email_sends_queue_status_scheduled` | `btree(status, scheduled_for)` | **full** — NÃO partial |
| `follow_up_log` | `follow_up_log_pkey` | PK | full |
| `follow_up_log` | `idx_followup_log_lead` | `btree(lead_id)` | full |
| `follow_up_log` | `idx_followup_log_lead_type_created` | `btree(lead_id, type, created_at DESC)` | full |
| `follow_up_log` | `idx_followup_log_org` | `btree(org_id)` | full |
| `follow_up_log` | `idx_followup_log_rule` | `btree(rule_id)` | full |
| `follow_up_log` | `idx_followup_log_status` | `btree(status)` | **full** — NÃO partial |
| `webhook_logs` | `webhook_logs_pkey` | PK | full |
| `webhook_logs` | `idx_webhook_logs_org_created` | `btree(org_id, created_at DESC)` | full |

**Análise:** Nenhum partial index existe nas 3 tabelas. Os full indexes em `status` (email_sends_queue, follow_up_log) cobrem toda a tabela — os partials desta story são **complementares e mais eficientes** para a query exata do cron.

**Os 4 partial indexes desta story são todos novos.**

### 3. Volume das tabelas

| Tabela | Pending | Total | % Pending |
|--------|---------|-------|-----------|
| `email_sends_queue` | 0 | 0 | — (tabela vazia em staging) |
| `follow_up_log` | 16 | 36 | 44% |
| `webhook_logs` | 0 | 0 | — (tabela vazia em staging) |

**Nota sobre volume baixo:** Tabelas estão com volume baixo em staging/produção atual. Os partial indexes já são válidos agora e se tornam progressivamente mais vantajosos conforme o histórico cresce (rows `sent`/`processed` acumulam). O índice full `idx_followup_log_status` em 36 rows faz seq scan de qualquer forma — o partial acionará quando o planner considerar benéfico (tipicamente > 100-1000 rows, dependendo da seletividade).

### 4. Slot 034 no tracking

```
version='031' → name='fk_indexes_critical_remote_only' (Story 29.2)
version='033' → name='vector_index_knowledge_base' (Story 29.4)
version='034' → NÃO existe (slot LIVRE)
```

Slot `034` confirmado disponível. Slot `032` pendente (Story 29.3 em andamento paralelo).

---

## Acceptance Criteria

**AC 1 — Spike documentado:**
Resultados do spike registrados no story file confirmando: (a) 7 colunas alvo existem no remote; (b) zero partial indexes existem nas 3 tabelas; (c) índices full existentes listados com definição completa; (d) volume pending vs total medido; (e) slot 034 livre.

**AC 2 — Arquivo ghost migration criado:**
`supabase/migrations/034_partial_indexes_queues_remote_only.sql` existe localmente com header padronizado:
```sql
-- 034_partial_indexes_queues_remote_only.sql
-- Remote version: 034
-- Applied via Supabase Studio SQL Editor (CONCURRENTLY requires non-transactional context).
-- Tracking registrado manualmente em supabase_migrations.schema_migrations.
-- See: supabase/migrations/README.md — padrão CREATE INDEX CONCURRENTLY
```

**AC 3 — 4 CREATE INDEX CONCURRENTLY IF NOT EXISTS no arquivo:**
Os 4 statements exatos abaixo presentes no arquivo de migration:
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_sends_queue_pending_scheduled
  ON email_sends_queue(scheduled_for) WHERE status = 'pending';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_log_pending
  ON follow_up_log(scheduled_at) WHERE status = 'pending';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_logs_unprocessed
  ON webhook_logs(created_at DESC) WHERE processed = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_logs_leadgen
  ON webhook_logs(leadgen_id) WHERE leadgen_id IS NOT NULL;
```

**AC 4 — Rollback SQL comentado:**
Fim do arquivo contém bloco de rollback:
```sql
-- ROLLBACK PLAN (executar manualmente via Studio SQL Editor se necessário):
-- DROP INDEX CONCURRENTLY IF EXISTS idx_email_sends_queue_pending_scheduled;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_followup_log_pending;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_webhook_logs_unprocessed;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_webhook_logs_leadgen;
```

**AC 5 — Aplicação via Management API:**
Os 4 índices aplicados no remote via Supabase Management API (`POST /v1/projects/dsopqkqjkmhytudaaolv/database/query`) — um statement por chamada (CONCURRENTLY fora de transação). Validar com `indisvalid=true` e `indisready=true` para cada índice após criação.

**AC 6 — Tracking version 034 registrado:**
```sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES (
  '034',
  'partial_indexes_queues_remote_only',
  ARRAY[
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_sends_queue_pending_scheduled ON email_sends_queue(scheduled_for) WHERE status = ''pending''',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_log_pending ON follow_up_log(scheduled_at) WHERE status = ''pending''',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_logs_unprocessed ON webhook_logs(created_at DESC) WHERE processed = false',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_logs_leadgen ON webhook_logs(leadgen_id) WHERE leadgen_id IS NOT NULL'
  ]
) ON CONFLICT (version) DO NOTHING;
```
Verificar: `SELECT version, name FROM supabase_migrations.schema_migrations WHERE version='034';` retorna 1 row.

**AC 7 — Validação via pg_indexes:**
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('email_sends_queue', 'follow_up_log', 'webhook_logs')
  AND indexname IN (
    'idx_email_sends_queue_pending_scheduled',
    'idx_followup_log_pending',
    'idx_webhook_logs_unprocessed',
    'idx_webhook_logs_leadgen'
  );
```
Resultado: 4 rows, `indexdef` contém `WHERE` clause em cada um (confirma que são partial indexes).

**AC 8 — EXPLAIN ANALYZE antes/depois da query do cron:**
Executar no Studio SQL Editor antes de criar os índices (se ainda não criados) e depois:
```sql
EXPLAIN ANALYZE
SELECT * FROM email_sends_queue
WHERE status = 'pending' AND scheduled_for <= now()
LIMIT 50;
```
Após criação: planner deve preferir `idx_email_sends_queue_pending_scheduled` quando `email_sends_queue` tiver volume suficiente. Com tabela vazia, documentar o resultado atual e anotar que o índice acionará automaticamente com volume. Verificar também:
```sql
EXPLAIN ANALYZE
SELECT * FROM follow_up_log
WHERE status = 'pending' AND scheduled_at <= now()
ORDER BY scheduled_at ASC LIMIT 50;
```

**AC 9 — Build PASS:**
`pnpm --filter @trifold/web build` retorna exit code 0. Esta story não toca código TypeScript — build deve passar sem alterações.

**AC 10 — Epic atualizado:**
`docs/stories/epics/epic-29-database-performance-blitz.md` atualizado com status da Story 29.5 (Done + resultados do spike + índices criados + timing).

---

## Tasks / Subtasks

- [x] Task 1 — Criar arquivo ghost migration (AC: 2, 3, 4)
  - [x] Criar `supabase/migrations/034_partial_indexes_queues_remote_only.sql` com header padronizado
  - [x] Incluir os 4 CREATE INDEX CONCURRENTLY IF NOT EXISTS com predicados exatos
  - [x] Incluir bloco ROLLBACK PLAN comentado no fim

- [x] Task 2 — Aplicar índices via Management API (AC: 5)
  - [x] Executar os 4 statements via `POST /v1/projects/dsopqkqjkmhytudaaolv/database/query` (um por chamada)
  - [x] Validar `indisvalid=true` e `indisready=true` para cada índice via `pg_index` join `pg_class`

- [x] Task 3 — Registrar tracking version 034 (AC: 6)
  - [x] Executar INSERT em `supabase_migrations.schema_migrations` com version='034'
  - [x] Verificar via SELECT que row existe

- [x] Task 4 — Validar pg_indexes (AC: 7)
  - [x] Query `pg_indexes` filtrando pelos 4 nomes — confirmar 4 rows com WHERE clause na indexdef

- [x] Task 5 — EXPLAIN ANALYZE antes/depois (AC: 8)
  - [x] Executar EXPLAIN ANALYZE da query do email cron
  - [x] Executar EXPLAIN ANALYZE da query do followup cron
  - [x] Documentar resultados no Dev Agent Record

- [x] Task 6 — Verificar build (AC: 9)
  - [x] `pnpm --filter @trifold/web build` — confirmar exit 0

- [x] Task 7 — Atualizar epic (AC: 10)
  - [x] Marcar Story 29.5 como Done no epic com resumo dos resultados

---

## Dev Notes

### Padrão de aplicação via Management API (replicar da Story 29.2)

```python
import json, subprocess

TOKEN = json.load(open('/Users/ogabrielhr/.supabase/access-token'))['access_token']
PROJECT = 'dsopqkqjkmhytudaaolv'

statements = [
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_sends_queue_pending_scheduled ON email_sends_queue(scheduled_for) WHERE status = 'pending'",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_log_pending ON follow_up_log(scheduled_at) WHERE status = 'pending'",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_logs_unprocessed ON webhook_logs(created_at DESC) WHERE processed = false",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_logs_leadgen ON webhook_logs(leadgen_id) WHERE leadgen_id IS NOT NULL",
]

for sql in statements:
    result = subprocess.run([
        'curl', '-s', '-X', 'POST',
        f'https://api.supabase.com/v1/projects/{PROJECT}/database/query',
        '-H', f'Authorization: Bearer {TOKEN}',
        '-H', 'Content-Type: application/json',
        '-d', json.dumps({'query': sql})
    ], capture_output=True, text=True)
    print(f"SQL: {sql[:80]}...")
    print(f"Result: {result.stdout}")
```

### Validação de indisvalid pós-criação

```sql
SELECT c.relname AS index_name, i.indisvalid, i.indisready
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE c.relname IN (
  'idx_email_sends_queue_pending_scheduled',
  'idx_followup_log_pending',
  'idx_webhook_logs_unprocessed',
  'idx_webhook_logs_leadgen'
);
```
Todos devem retornar `indisvalid=true`, `indisready=true`.

### Comportamento esperado de EXPLAIN ANALYZE com volume baixo

Com tabelas vazias ou com poucos rows (email_sends_queue=0, webhook_logs=0), o Postgres fará Seq Scan mesmo com o índice criado — isso é correto. O planner escolhe Seq Scan quando o custo estimado é menor que um Index Scan. Com volume crescendo, o índice partial será escolhido automaticamente. Documentar esse comportamento no Dev Agent Record sem considerar como falha.

### Índices existentes que NÃO colidem

- `idx_email_sends_queue_status_scheduled` (`btree(status, scheduled_for)` — full): complementar; o planner pode preferir o partial quando status='pending' domina.
- `idx_followup_log_status` (`btree(status)` — full): complementar; o partial `WHERE status='pending'` em `(scheduled_at)` suporta queries com ORDER BY scheduled_at.
- Os partials desta story NÃO substituem os existentes — convivem.

### Arquivo de migration a criar

Caminho: `supabase/migrations/034_partial_indexes_queues_remote_only.sql`

### Arquivos relacionados (não modificar)
- `supabase/migrations/README.md` — convenção estabelecida; não modificar
- `packages/web/src/app/api/cron/` — rotas de cron; não modificar (escopo futuro Epic 33)

### Testing

Framework: Vitest (unit) — não aplicável a esta story (pure DB). Validação via SQL direto no Studio ou Management API.

Evidência de qualidade aceita: screenshot ou output JSON das queries de validação (AC 7 + AC 8) documentado no Dev Agent Record.

---

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled in `core-config.yaml`.
> Quality validation will use manual review process only.

---

## Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| CONCURRENTLY falha por lock conflitante | Baixa | Baixa | Aplicar em horário de baixo tráfego; `IF NOT EXISTS` garante idempotência |
| Planner não usar partial com volume baixo | Alta (curto prazo) | Baixa | Comportamento correto — índice ativa automaticamente com volume |
| Conflito de slot 034 com Story 29.3 (032) | Nula | — | 034 não está adjacente a 032; slots distintos |

**Nível geral: BAIXO**

---

## Esforço

Complexidade: XS (30 min) | Story points: 2 | Prioridade: P1

---

## Out of Scope

- Outros índices não listados nas 3 tabelas alvo
- Refatoração das queries dos crons (Epic 33.1)
- Cleanup automático de rows históricos das queues (Epic 29.7 — pg_cron jobs)
- Monitoramento de crescimento de tabela

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-13 | 1.0 | Story criada com spike completo | River @sm |
| 2026-05-14 | 1.1 | Migration 034 aplicada — 4 partial indexes criados via Management API, tracking registrado, build PASS, status InReview | Dara @data-engineer |
| 2026-05-14 | 1.2 | Quality Gate PASS — 4 partials validados (indisvalid+indisready=true, WHERE clause confirmada), tracking v034 stmt_count=4, ganho 9x em follow_up_log, build reproduzido. Status Done. | Aria @architect |

---

## Dev Agent Record

*(Preenchido pelo @data-engineer durante implementação)*

### Agent Model Used
Dara (@data-engineer) — claude-opus-4-7[1m] — YOLO mode

### Debug Log References

**Spike de confirmação executado pelo @sm em 2026-05-13:** 7 colunas alvo confirmadas existentes, slot 034 livre, volume baixo (email_sends_queue 0/0, follow_up_log 16/36, webhook_logs 0/0). Nenhum partial index existia previamente.

**Application via Management API (2026-05-14):** 4 statements aplicados um por POST `https://api.supabase.com/v1/projects/dsopqkqjkmhytudaaolv/database/query`, todos retornaram `[]` (DDL OK). Pattern já validado nas Stories 29.2 e 29.4.

**Validação pg_indexes (AC 7):**
```json
[
  {"indexname":"idx_email_sends_queue_pending_scheduled","indexdef":"CREATE INDEX ... USING btree (scheduled_for) WHERE (status = 'pending'::text)"},
  {"indexname":"idx_followup_log_pending","indexdef":"CREATE INDEX ... USING btree (scheduled_at) WHERE ((status)::text = 'pending'::text)"},
  {"indexname":"idx_webhook_logs_leadgen","indexdef":"CREATE INDEX ... USING btree (leadgen_id) WHERE (leadgen_id IS NOT NULL)"},
  {"indexname":"idx_webhook_logs_unprocessed","indexdef":"CREATE INDEX ... USING btree (created_at DESC) WHERE (processed = false)"}
]
```
4 rows, todas com WHERE clause confirmando partials.

**Validação indisvalid/indisready (Dev Notes):**
```json
[
  {"index_name":"idx_email_sends_queue_pending_scheduled","indisvalid":true,"indisready":true},
  {"index_name":"idx_followup_log_pending","indisvalid":true,"indisready":true},
  {"index_name":"idx_webhook_logs_leadgen","indisvalid":true,"indisready":true},
  {"index_name":"idx_webhook_logs_unprocessed","indisvalid":true,"indisready":true}
]
```
Todos os 4 índices `indisvalid=true` + `indisready=true`.

**Tracking version 034 (AC 6):**
```json
[{"version":"034","name":"partial_indexes_queues_remote_only","stmt_count":4}]
```

**EXPLAIN ANALYZE ANTES/DEPOIS (AC 8):**

| Query | Plano ANTES | Plano DEPOIS | Resultado |
|-------|-------------|--------------|-----------|
| `email_sends_queue` pending+scheduled | Index Scan `idx_email_sends_queue_status_scheduled` (full) — 0.088ms | Index Scan **`idx_email_sends_queue_pending_scheduled` (partial)** — 0.082ms | Planner trocou para o partial (footprint menor) |
| `follow_up_log` pending+scheduled | Index Scan `idx_followup_log_status` + Sort — exec **6.889ms** | Index Scan **`idx_followup_log_pending` (partial)** — exec **0.770ms** | **9x mais rápido** (Sort eliminado — partial já está em ordem de scheduled_at) |
| `webhook_logs` unprocessed (created_at DESC) | Seq Scan + Sort — 0.099ms | Index Scan **`idx_webhook_logs_unprocessed` (partial)** — 0.061ms | Seq Scan substituído por Index Scan (escalável com volume) |
| `webhook_logs` leadgen_id dedup | n/a (sem índice antes) | Bitmap Index Scan **`idx_webhook_logs_leadgen` (partial)** — 0.140ms | Novo índice — suporta dedup webhook Meta |

**Nota sobre volume:** Diferente do esperado para volume baixo, o planner JÁ escolheu todos os 4 partials. Ganho mais notável em `follow_up_log` (16 rows pending de 36 totais — partial elimina o Sort externo porque `scheduled_at` está ordenado dentro do índice).

**Build (AC 9):** `pnpm --filter @trifold/web build` exit 0. Primeiro run falhou por conflito com outro `next build` em paralelo (PID 12937); após aguardar conclusão e limpar `.next`, build PASS em 232 linhas de output, todas as rotas compiladas.

### Completion Notes List

1. **4 partial indexes criados** com sucesso via Management API single-statement (padrão estabelecido nas Stories 29.2/29.4). Tempo total ~8s wall-clock.
2. **Tracking version 034 registrado** com `name='partial_indexes_queues_remote_only'` e array de 4 statements via dollar-quoted strings ($MIG1$..$MIG4$).
3. **Planner JÁ usa todos os 4 partials** mesmo com volume baixo — ganho mais expressivo no `follow_up_log` (16 rows pending), onde o partial em `(scheduled_at) WHERE status='pending'` permite Index Scan ordenado, eliminando o Sort que o full em `(status)` exigia (9x mais rápido).
4. **Convivência com índices existentes** confirmada: `idx_email_sends_queue_status_scheduled` (full), `idx_followup_log_status` (full), `idx_webhook_logs_org_created` (full) permanecem disponíveis para outras queries — partials são complementares, não substitutivos.
5. **AC 8** documentado nas tabelas acima — sem regressão, gains presentes desde volume atual e crescerão com histórico.
6. **Build PASS** — exit 0, zero código TS modificado (apenas SQL).
7. **Próximo passo:** `@architect *qa-gate 29.5` para validação.

### File List

**Criados:**
- `supabase/migrations/034_partial_indexes_queues_remote_only.sql` — Ghost migration com 4 CREATE INDEX CONCURRENTLY + rollback plan

**Modificados:**
- `docs/stories/active/29-5-partial-indexes-queues.md` — Status InReview, tasks marcadas, Dev Agent Record preenchido, Change Log V1.1
- `docs/stories/epics/epic-29-database-performance-blitz.md` — Story 29.5 marcada Done com resumo

**Remote DB (Supabase project dsopqkqjkmhytudaaolv):**
- 4 índices criados em `email_sends_queue`, `follow_up_log`, `webhook_logs`
- 1 row inserida em `supabase_migrations.schema_migrations` (version='034')

---

## QA Results

**Reviewer:** Aria (@architect) — claude-opus-4-7[1m]
**Date:** 2026-05-14
**Gate:** `docs/qa/gates/29-5-architect-gate.md`
**Verdict:** **PASS**

### Validation Reproduced (Management API)

- `pg_indexes`: 4 índices retornados, todos com `WHERE` clause na `indexdef` (partials confirmados).
- `pg_index`: `indisvalid=true` + `indisready=true` para os 4.
- `schema_migrations`: `version='034'`, `name='partial_indexes_queues_remote_only'`, `stmt_count=4`.
- Build: `pnpm --filter @trifold/web build` exit 0 reproduzido.

### Findings

- AC 1-10 satisfeitos.
- Convenção Epic 29 respeitada (ghost `_remote_only.sql` + Management API + tracking manual).
- Ganho mensurado: `follow_up_log` 6.889ms → 0.770ms (**9x**) — partial em `(scheduled_at) WHERE status='pending'` eliminou `Sort` externo que o full em `(status)` exigia.
- Planner já escolheu os 4 partials mesmo com volume baixo — valor preventivo confirmado, footprint crescerá só com `pending` (não com histórico `sent`/`processed`/`failed`).
- Zero regressões: full indexes preservados, partials são complementares.

### Issues

Nenhum HIGH/CRITICAL. Zero CONCERNS.

### Next Step

`@devops *push` para commit de:
- `supabase/migrations/034_partial_indexes_queues_remote_only.sql`
- `docs/stories/active/29-5-partial-indexes-queues.md`
- `docs/stories/epics/epic-29-database-performance-blitz.md`
- `docs/qa/gates/29-5-architect-gate.md`
