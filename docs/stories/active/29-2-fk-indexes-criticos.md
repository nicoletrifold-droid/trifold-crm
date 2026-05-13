# Story 29.2 — Migration 031: FK indexes críticos

## Status
Done

## Subtitle
Story crítica do Epic 29 — primeiro grande ganho de DB performance

## Executor Assignment
executor: "@data-engineer"
quality_gate: "@architect"
quality_gate_tools: ["concurrent_index_validation", "idempotency_check", "rollback_review", "explain_analyze_proof"]

## Story
**As a** @data-engineer,
**I want** ~26 índices em FKs hot criados via CONCURRENTLY,
**so that** JOINs/DELETEs em parent tables param de fazer FULL SCAN nas filhas — eliminando a principal causa-raiz da latência em queries do CRM.

## Contexto

**Epic 29 — Database Performance Blitz** | Urgência: P0 | Fonte: `docs/stories/epics/epic-29-database-performance-blitz.md`

**Desbloqueada por:** Story 29.1 Done (2026-05-12) — migration tree reconciliada, próximo prefixo disponível: `031`.

### Por que esta story existe

O Supabase NÃO cria índice automático em FK. Auditoria de Dara (`docs/audits/performance-database-audit.md`) identificou ~20+ FKs hot sem índice — toda query com JOIN ou DELETE em tabela parent dispara FULL SCAN na filha. Ganho estimado: 50-80% de redução de latência em queries hot do dashboard, portal cliente e pipeline.

**AC Global B3 do epic (obrigatório em toda story 29.2-29.5):**
- `CREATE INDEX CONCURRENTLY IF NOT EXISTS` em todos os índices
- Rollback SQL comentado no fim do arquivo de migration
- Aplicação via Supabase Studio SQL Editor (NÃO `supabase db push` — CLI envolve em transação que proíbe CONCURRENTLY)
- Ghost migration `_remote_only.sql` criada e commitada localmente antes de aplicar

### Padrão de ghost migration (replicar de `024_phone_normalization_part1_remote_only.sql`)

O arquivo local `031_fk_indexes_critical_remote_only.sql` deve seguir o header:

```sql
-- 031_fk_indexes_critical_remote_only.sql
-- Remote version: 031
-- Applied via Supabase Studio SQL Editor (CONCURRENTLY requires non-transactional context).
-- Tracking registrado manualmente em supabase_migrations.schema_migrations.
-- See: supabase/migrations/README.md — padrão CREATE INDEX CONCURRENTLY
```

---

## Spike — Resultados Completos (executado por @sm em 2026-05-12)

### 1. Validação de tabelas e colunas no remote

Consulta `information_schema.columns` contra project `dsopqkqjkmhytudaaolv` em 2026-05-12.

**Resultado — Colunas CONFIRMADAS (26 de 29 investigadas):**

| Tabela | Coluna | Status |
|--------|--------|--------|
| `appointments` | `property_id` | EXISTE |
| `broker_assignments` | `property_id` | EXISTE |
| `conversation_state` | `current_property_id` | EXISTE |
| `email_automations` | `template_id` | EXISTE |
| `email_blasts` | `template_id` | EXISTE |
| `email_logs` | `org_id` | EXISTE |
| `email_logs` | `template_id` | EXISTE |
| `follow_up_log` | `lead_id` | EXISTE |
| `follow_up_log` | `org_id` | EXISTE |
| `follow_up_log` | `rule_id` | EXISTE |
| `lead_property_interest` | `lead_id` | EXISTE |
| `lead_property_interest` | `property_id` | EXISTE |
| `leads` | `property_interest_id` | EXISTE |
| `leads` | `utm_campaign` | EXISTE |
| `obra_documentos` | `uploaded_by` | EXISTE |
| `obra_fotos` | `fase_id` | EXISTE |
| `obra_fotos` | `uploaded_by` | EXISTE |
| `obra_mensagens` | `cliente_id` | EXISTE |
| `obra_mensagens` | `sender_id` | EXISTE |
| `system_events` | `resolved_by` | EXISTE |
| `unit_sales` | `broker_id` | EXISTE |
| `unit_sales` | `lead_id` | EXISTE |
| `units` | `reserved_by_lead_id` | EXISTE |
| `visit_feedback` | `broker_id` | EXISTE |
| `visit_feedback` | `lead_id` | EXISTE |
| `visit_feedback` | `property_id` | EXISTE |

**Colunas AUSENTES no remote — índices correspondentes REMOVIDOS da lista:**

| Tabela | Coluna | Ação |
|--------|--------|------|
| `conversation_state` | `lead_id` | REMOVIDO — tabela usa `conversation_id` (FK para `conversations`), não `lead_id` direto |
| `visit_feedback` | `appointment_id` | REMOVIDO — coluna não existe na tabela |
| `visit_feedback` | `org_id` | REMOVIDO — coluna não existe na tabela |

**Total de índices a criar: 26** (29 originais − 3 removidos pelo spike).

### 2. Índices já existentes nas tabelas alvo

Consulta `pg_indexes` em 2026-05-12. Índices dos nomes propostos (`idx_*`) NÃO existem — todos são novos. Observações relevantes:

| Tabela | Índice existente relevante | Impacto na story |
|--------|--------------------------|------------------|
| `follow_up_log` | `idx_followup_log_lead` (simples em `lead_id`) | `idx_followup_log_lead_type_created` (composto) é diferente — MANTER, vai cobrir o index + sort em `(lead_id, type, created_at DESC)` |
| `lead_property_interest` | `lead_property_interest_lead_id_property_id_key` (UNIQUE constraint cobrindo `lead_id + property_id`) | Constraint UNIQUE implica índice — lookups por `lead_id` isolado JÁ são cobertos por este índice composto. Ainda assim, `IF NOT EXISTS` garante idempotência — manter os dois `idx_lead_property_interest_*` pois um índice UNIQUE composto não equivale a índice simples para lookups por coluna única |
| `obra_mensagens` | `idx_obra_mensagens_obra_cliente` (em `obra_id, cliente_id`) | Não cobre `cliente_id` isolado nem `sender_id` — MANTER ambos |

Nenhum dos 26 índices propostos por nome (`idx_conversation_state_property`, `idx_leads_property_interest`, etc.) existe atualmente.

### 3. Tamanho das tabelas alvo

| Tabela | Tamanho | Row estimate | Observação |
|--------|---------|-------------|-----------|
| `system_events` | 456 kB | 718 | Maior tabela do set — ainda pequena |
| `leads` | 80 kB | 149 | |
| `units` | 24 kB | 108 | |
| `follow_up_log` | 24 kB | ~0 (stats stale) | |
| `appointments` | 8 kB | ~0 (stats stale) | |
| `conversation_state` | 8 kB | 23 | |
| `broker_assignments` | 8 kB | ~0 | |
| `obra_mensagens` | 8 kB | 4 | |
| `obra_documentos` | 0 bytes | ~0 | Tabela vazia |
| `unit_sales` | 0 bytes | ~0 | Tabela vazia |
| `lead_property_interest` | 0 bytes | ~0 | Tabela vazia |
| `visit_feedback` | 0 bytes | ~0 | Tabela vazia |
| `email_automations` | 0 bytes | ~0 | Tabela vazia |
| `email_blasts` | 0 bytes | ~0 | Tabela vazia |
| `email_logs` | 0 bytes | ~0 | Tabela vazia |
| `obra_fotos` | 0 bytes | ~0 | Tabela vazia |

**Conclusão de tempo:** Todas as tabelas são pequenas (< 500 kB). Criação de 26 índices via CONCURRENTLY estimada em **< 30 segundos total**. Sem necessidade de janela de manutenção — pode ser executada a qualquer momento.

---

## Acceptance Criteria

**AC 1 — Spike documentado e resultados validados**
Spike completo documentado inline nesta story (acima). Resultados confirmados via Management API em 2026-05-12: 26 colunas existem (3 removidas por ausência), nenhum dos 26 índices propostos existe atualmente, todas as tabelas < 500 kB.

**AC 2 — Arquivo ghost migration criado ANTES de aplicar**
`supabase/migrations/031_fk_indexes_critical_remote_only.sql` criado localmente com header conforme padrão `_remote_only.sql` do README, contendo os 26 `CREATE INDEX CONCURRENTLY IF NOT EXISTS` e rollback SQL comentado. Arquivo deve ser commitado antes de executar via Studio.

**AC 3 — Rollback SQL presente e completo no arquivo**
Fim do arquivo `031_fk_indexes_critical_remote_only.sql` contém bloco comentado com `DROP INDEX CONCURRENTLY IF EXISTS` para todos os 26 índices, precedido por:
```sql
-- ROLLBACK PLAN (executar manualmente via Studio se necessário):
```

**AC 4 — Header do arquivo segue padrão `_remote_only.sql`**
Header com: número da versão remote (`031`), data de aplicação, motivo (CONCURRENTLY non-transactional), referência ao `README.md`.

**AC 5 — Aplicação via Supabase Studio SQL Editor**
NÃO usar `supabase db push`. Procedimento: abrir Studio → SQL Editor → colar o SQL do arquivo → executar. Documentar timestamp de execução no Change Log desta story.

**AC 6 — Tracking manual registrado no remote**
Após aplicação via Studio, executar no Studio SQL Editor:
```sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES (
  '031',
  'fk_indexes_critical_remote_only',
  ARRAY[
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversation_state_property ON conversation_state(current_property_id)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_property_interest ON leads(property_interest_id) WHERE property_interest_id IS NOT NULL',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_utm_campaign ON leads(org_id, utm_campaign) WHERE utm_campaign IS NOT NULL',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_property ON appointments(property_id)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_unit_sales_lead ON unit_sales(lead_id)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_unit_sales_broker ON unit_sales(broker_id)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_units_reserved_lead ON units(reserved_by_lead_id) WHERE reserved_by_lead_id IS NOT NULL',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_property_interest_lead ON lead_property_interest(lead_id)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_property_interest_property ON lead_property_interest(property_id)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visit_feedback_lead ON visit_feedback(lead_id)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visit_feedback_property ON visit_feedback(property_id)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visit_feedback_broker ON visit_feedback(broker_id)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_broker_assignments_property ON broker_assignments(property_id)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_obra_mensagens_sender ON obra_mensagens(sender_id)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_obra_mensagens_cliente ON obra_mensagens(cliente_id)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_obra_fotos_fase ON obra_fotos(fase_id)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_obra_fotos_uploaded_by ON obra_fotos(uploaded_by)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_obra_documentos_uploaded_by ON obra_documentos(uploaded_by)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_log_org ON follow_up_log(org_id)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_log_rule ON follow_up_log(rule_id)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_log_lead_type_created ON follow_up_log(lead_id, type, created_at DESC)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_logs_template ON email_logs(template_id)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_logs_org_status_sent ON email_logs(org_id, status, sent_at DESC)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_blasts_template ON email_blasts(template_id)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_automations_template ON email_automations(template_id)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_events_resolved_by ON system_events(resolved_by) WHERE resolved_by IS NOT NULL'
  ]
)
ON CONFLICT (version) DO NOTHING;
```

**AC 7 — Validação pós-aplicação: 26 índices visíveis no pg_indexes**
Executar no Studio após aplicação:
```sql
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_conversation_state_property',
    'idx_leads_property_interest',
    'idx_leads_utm_campaign',
    'idx_appointments_property',
    'idx_unit_sales_lead',
    'idx_unit_sales_broker',
    'idx_units_reserved_lead',
    'idx_lead_property_interest_lead',
    'idx_lead_property_interest_property',
    'idx_visit_feedback_lead',
    'idx_visit_feedback_property',
    'idx_visit_feedback_broker',
    'idx_broker_assignments_property',
    'idx_obra_mensagens_sender',
    'idx_obra_mensagens_cliente',
    'idx_obra_fotos_fase',
    'idx_obra_fotos_uploaded_by',
    'idx_obra_documentos_uploaded_by',
    'idx_followup_log_org',
    'idx_followup_log_rule',
    'idx_followup_log_lead_type_created',
    'idx_email_logs_template',
    'idx_email_logs_org_status_sent',
    'idx_email_blasts_template',
    'idx_email_automations_template',
    'idx_system_events_resolved_by'
  )
ORDER BY tablename, indexname;
```
Deve retornar exatamente 26 linhas.

**AC 8 — EXPLAIN ANALYZE ANTES capturado (baseline)**
Antes de aplicar os índices, capturar e anexar no story o plano de pelo menos 2 queries hot:

Query A (conversation_state lookup):
```sql
EXPLAIN ANALYZE
SELECT cs.* FROM conversation_state cs
WHERE cs.current_property_id IS NOT NULL
LIMIT 10;
```

Query B (obra_mensagens por cliente):
```sql
EXPLAIN ANALYZE
SELECT om.* FROM obra_mensagens om
WHERE om.cliente_id IS NOT NULL
ORDER BY om.created_at DESC
LIMIT 20;
```

**AC 9 — EXPLAIN ANALYZE DEPOIS capturado (comparativo)**
Após aplicação, repetir as mesmas queries do AC 8. Plano resultante deve mostrar `Index Scan` (ou `Index Only Scan`) onde antes havia `Seq Scan`. Anexar ambos os planos (before/after) no story file na seção "EXPLAIN ANALYZE Results".

**AC 10 — Zero downtime validado**
CONCURRENTLY garante zero lock exclusivo durante criação. Documentar timestamp de início e fim da execução no Studio. Nenhum erro de lock reportado no Vercel logs durante a janela. Confirmar que requests à aplicação continuaram sendo servidas normalmente.

**AC 11 — `supabase migration list` mostra version 031 no tracking**
Após o INSERT do AC 6, executar via Management API ou Studio:
```sql
SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '031';
```
Deve retornar: `version='031'`, `name='fk_indexes_critical_remote_only'`.

**AC 12 — `pnpm --filter @trifold/web build` PASS**
Esta story não toca código de aplicação. Rodar `pnpm --filter @trifold/web build` e confirmar exit code 0. Valida que nenhum arquivo acidentalmente alterado causou regressão.

**AC 13 — Atualizar epic-29 file marcando Story 29.2 como concluída**
`docs/stories/epics/epic-29-database-performance-blitz.md` atualizado com o resultado da story (inline na seção da Story 29.2): data de conclusão, número final de índices criados (26), nota sobre 3 colunas ausentes removidas do escopo.

**AC 14 — Tempo total de criação documentado**
Registrar no Change Log: timestamp de início do SQL no Studio, timestamp de conclusão, tempo total. Esperado: < 30 segundos (todas as tabelas < 500 kB conforme spike).

**AC 15 — Smoke runtime humano (pendente pós-deploy)**
Features que tocam as tabelas indexadas continuam funcionando após os índices:
- Portal cliente: mensagens de obra (`obra_mensagens`) carregam normalmente
- Dashboard leads: listagem e filtros de leads respondem
- Pipeline: `conversation_state` lido corretamente por org
- Meta Ads: `email_logs`, `follow_up_log` sem erros

Validação pendente de humano (Gabriel) após execução.

---

## SQL Final — 26 Índices a Criar

> Este é o SQL exato a ser colado no Supabase Studio SQL Editor.
> Também é o conteúdo do arquivo `031_fk_indexes_critical_remote_only.sql`.

```sql
-- 031_fk_indexes_critical_remote_only.sql
-- Remote version: 031
-- Applied via Supabase Studio SQL Editor (CONCURRENTLY requires non-transactional context).
-- Tracking registrado manualmente em supabase_migrations.schema_migrations.
-- See: supabase/migrations/README.md — padrão CREATE INDEX CONCURRENTLY (Epic 29)
-- Date applied: [PREENCHER durante execução]
-- Executed by: @data-engineer
--
-- SPIKE NOTES (2026-05-12): 3 índices originais REMOVIDOS por colunas ausentes no remote:
--   - idx_conversation_state_lead   → conversation_state.lead_id NÃO EXISTE
--   - idx_visit_feedback_appointment → visit_feedback.appointment_id NÃO EXISTE
--   - idx_visit_feedback_org         → visit_feedback.org_id NÃO EXISTE
-- Total: 26 índices (originalmente 29 no relatório de auditoria).

-- conversation_state (1 — lead_id ausente, apenas current_property_id)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversation_state_property
  ON conversation_state(current_property_id);

-- leads (2)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_property_interest
  ON leads(property_interest_id) WHERE property_interest_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_utm_campaign
  ON leads(org_id, utm_campaign) WHERE utm_campaign IS NOT NULL;

-- appointments (1)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_property
  ON appointments(property_id);

-- unit_sales, units (3)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_unit_sales_lead ON unit_sales(lead_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_unit_sales_broker ON unit_sales(broker_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_units_reserved_lead
  ON units(reserved_by_lead_id) WHERE reserved_by_lead_id IS NOT NULL;

-- lead_property_interest (2)
-- Nota: UNIQUE constraint (lead_id, property_id) já existe, mas índice simples por coluna é distinto
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_property_interest_lead
  ON lead_property_interest(lead_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_property_interest_property
  ON lead_property_interest(property_id);

-- visit_feedback (3 FKs — appointment_id e org_id AUSENTES no remote; apenas 3 confirmadas)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visit_feedback_lead ON visit_feedback(lead_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visit_feedback_property ON visit_feedback(property_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visit_feedback_broker ON visit_feedback(broker_id);

-- broker_assignments (1)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_broker_assignments_property
  ON broker_assignments(property_id);

-- obra_mensagens (2)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_obra_mensagens_sender ON obra_mensagens(sender_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_obra_mensagens_cliente ON obra_mensagens(cliente_id);

-- obra_fotos (2)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_obra_fotos_fase ON obra_fotos(fase_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_obra_fotos_uploaded_by ON obra_fotos(uploaded_by);

-- obra_documentos (1)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_obra_documentos_uploaded_by ON obra_documentos(uploaded_by);

-- follow_up_log (3)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_log_org ON follow_up_log(org_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_log_rule ON follow_up_log(rule_id);
-- Composto para o cron de followup: lookup por lead + type + ordenação temporal
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_log_lead_type_created
  ON follow_up_log(lead_id, type, created_at DESC);

-- email_logs (2)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_logs_template ON email_logs(template_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_logs_org_status_sent
  ON email_logs(org_id, status, sent_at DESC);

-- email_blasts (1)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_blasts_template ON email_blasts(template_id);

-- email_automations (1)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_automations_template ON email_automations(template_id);

-- system_events (1)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_events_resolved_by
  ON system_events(resolved_by) WHERE resolved_by IS NOT NULL;

-- ROLLBACK PLAN (executar manualmente via Studio SQL Editor se necessário):
-- DROP INDEX CONCURRENTLY IF EXISTS idx_conversation_state_property;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_leads_property_interest;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_leads_utm_campaign;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_appointments_property;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_unit_sales_lead;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_unit_sales_broker;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_units_reserved_lead;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_lead_property_interest_lead;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_lead_property_interest_property;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_visit_feedback_lead;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_visit_feedback_property;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_visit_feedback_broker;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_broker_assignments_property;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_obra_mensagens_sender;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_obra_mensagens_cliente;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_obra_fotos_fase;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_obra_fotos_uploaded_by;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_obra_documentos_uploaded_by;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_followup_log_org;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_followup_log_rule;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_followup_log_lead_type_created;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_email_logs_template;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_email_logs_org_status_sent;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_email_blasts_template;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_email_automations_template;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_system_events_resolved_by;
```

---

## EXPLAIN ANALYZE Results

Capturado pelo @data-engineer (Dara) em 2026-05-13 via Supabase Management API.

### Baseline (ANTES dos índices) — 2026-05-13T21:55Z

**Query A — `conversation_state` lookup:**
```
EXPLAIN ANALYZE
SELECT cs.* FROM conversation_state cs
WHERE cs.current_property_id IS NOT NULL
LIMIT 10;

Limit  (cost=0.00..1.23 rows=7 width=134) (actual time=0.630..0.633 rows=8 loops=1)
  ->  Seq Scan on conversation_state cs  (cost=0.00..1.23 rows=7 width=134)
        Filter: (current_property_id IS NOT NULL)
        Rows Removed by Filter: 18
Planning Time: 3.752 ms
Execution Time: 0.751 ms
```

**Query B — `obra_mensagens` por cliente:**
```
EXPLAIN ANALYZE
SELECT om.* FROM obra_mensagens om
WHERE om.cliente_id IS NOT NULL
ORDER BY om.created_at DESC
LIMIT 20;

Limit  (cost=1.08..1.09 rows=4 width=792) (actual time=0.733..0.735 rows=6 loops=1)
  ->  Sort  (cost=1.08..1.09 rows=4 width=792)
        Sort Key: created_at DESC
        Sort Method: quicksort  Memory: 26kB
        ->  Seq Scan on obra_mensagens om  (cost=0.00..1.04 rows=4 width=792)
              Filter: (cliente_id IS NOT NULL)
              Rows Removed by Filter: 1
Planning Time: 6.841 ms
Execution Time: 0.802 ms
```

### Pós-aplicação (DEPOIS dos índices) — 2026-05-13T21:58Z

**Query A — `conversation_state` lookup:**
```
Limit  (cost=0.00..1.26 rows=8 width=134) (actual time=0.369..0.373 rows=8 loops=1)
  ->  Seq Scan on conversation_state cs  (cost=0.00..1.26 rows=8 width=134)
        Filter: (current_property_id IS NOT NULL)
        Rows Removed by Filter: 18
Planning Time: 4.178 ms
Execution Time: 0.668 ms
```

**Query B — `obra_mensagens` por cliente:**
```
Limit  (cost=1.17..1.19 rows=7 width=792) (actual time=0.071..0.073 rows=6 loops=1)
  ->  Sort  (cost=1.17..1.19 rows=7 width=792)
        Sort Key: created_at DESC
        Sort Method: quicksort  Memory: 26kB
        ->  Seq Scan on obra_mensagens om  (cost=0.00..1.07 rows=7 width=792)
              Filter: (cliente_id IS NOT NULL)
              Rows Removed by Filter: 1
Planning Time: 4.833 ms
Execution Time: 0.140 ms
```

### Análise dos planos

**Observação importante:** ambas as queries continuam usando `Seq Scan` mesmo após a criação dos índices. **Isto é comportamento correto e esperado:**

| Tabela | Total rows | Matching rows | Por que Seq Scan persiste |
|--------|-----------|---------------|--------------------------|
| `conversation_state` | 26 | 8 | Para tabelas <100 rows, o custo de seq scan é menor que o de carregar o índice na memória. Postgres planner correto. |
| `obra_mensagens` | 7 | 6 | Idem — tabela minúscula |

**Validação de uso real do índice em padrão FK lookup** (executado em `system_events` que tem ~720 rows e padrão de filtro mais discriminativo):

```
EXPLAIN ANALYZE SELECT id, created_at FROM system_events
WHERE resolved_by IS NOT NULL
ORDER BY created_at DESC LIMIT 50;

Limit  (cost=2.35..2.35 rows=1 width=24)
  ->  Sort  (cost=2.35..2.35 rows=1 width=24)
        Sort Key: created_at DESC
        ->  Index Scan using idx_system_events_resolved_by on system_events
              (cost=0.12..2.34 rows=1 width=24)
Planning Time: 5.039 ms
Execution Time: 0.095 ms
```

**Conclusão:** Os 26 índices estão `indisvalid=true` e `indisready=true`. O planner já os utiliza onde faz sentido (visto em `idx_system_events_resolved_by`). Para tabelas atualmente vazias ou minúsculas (`obra_mensagens`, `conversation_state`), o seq scan continua sendo o plano ótimo — mas conforme as tabelas crescem em produção, o planner automaticamente migrará para `Index Scan`, eliminando o gargalo FULL SCAN antes que apareça. **Esse é exatamente o objetivo preventivo da story.**

Sample de validação `indisvalid + indisready`:

| Index | indisvalid | indisready | Size |
|-------|-----------|-----------|------|
| `idx_conversation_state_property` | true | true | 16 kB |
| `idx_followup_log_lead_type_created` | true | true | 16 kB |
| `idx_obra_mensagens_cliente` | true | true | 16 kB |
| `idx_system_events_resolved_by` | true | true | 8192 bytes |


---

## Estimativa
**Complexidade:** M (Medium)
**Story Points:** 5
**Prioridade:** P0
**Esforço estimado:** 1-2h (30 min spike + migration file, 30 min aplicação + validações, 30 min EXPLAIN ANALYZE + documentação)

**Nota:** Esforço menor que as 2h originais porque spike confirmou tabelas muito pequenas — criação rápida e sem risco de sobrecarga de I/O.

---

## Fora do Escopo (OUT)

- Índices compostos hot (`messages`, `conversations`, `leads` filtros) — Story 29.3
- Vector index em `knowledge_base.embedding` — Story 29.4
- Partial indexes para queues (`email_sends_queue`, `webhook_logs`) — Story 29.5
- Materialização de `meta_campaign_roas` — Story 29.6
- pg_cron cleanup jobs — Story 29.7
- Investigar por que `conversation_state.lead_id` não existe (ausência inesperada) — fora de escopo desta story; anotar como observação para @architect
- Indexar `conversation_state` via `conversation_id → conversations.lead_id` (JOIN path alternativo) — fora de escopo
- Particionamento de tabelas — Epic 34

---

## Riscos

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| Lock momentâneo de metadata durante CONCURRENTLY | BAIXO | Inerente ao CONCURRENTLY; apenas 2 momentos breves de lock de metadata (início e fim). Tabelas pequenas = janela de microsegundos |
| Sobrecarga de I/O durante criação | MUITO BAIXO | Todas as tabelas < 500 kB — negligenciável |
| Índice criado mas tracking não registrado | MÉDIO | AC 6 e AC 11 forçam validação explícita do INSERT no tracking. Se INSERT falhar, o índice existe mas não está rastreado — executar novamente |
| `conversation_state.lead_id` ausente indica schema divergente | BAIXO | Spike confirmado — a tabela usa `conversation_id` como FK para `conversations`, que por sua vez tem `lead_id`. O índice do join path real existe? Verificar em Story 29.3 ao criar índices compostos em `conversations` |

---

## Tasks

### Task 1 — Spike completo (CONCLUÍDA — executada pelo @sm)
- [x] 1.1 Verificar tabelas e colunas existem no remote (26 confirmadas, 3 ausentes)
- [x] 1.2 Verificar índices já existentes nas tabelas alvo (nenhum dos 26 propostos existe)
- [x] 1.3 Estimar tamanho das tabelas (todas < 500 kB — criação < 30s estimada)
- [x] 1.4 Resultados documentados inline nesta story

### Task 2 — Criar arquivo ghost migration (15 min)
- [x] 2.1 Criar `supabase/migrations/031_fk_indexes_critical_remote_only.sql` com o SQL da seção acima
- [x] 2.2 Verificar que header segue padrão `_remote_only.sql` (ver `024_phone_normalization_part1_remote_only.sql`)
- [x] 2.3 Confirmar que rollback SQL está presente e completo (26 DROPs comentados)

### Task 3 — Capturar EXPLAIN ANALYZE baseline ANTES (10 min)
- [x] 3.1 Executar Query A (conversation_state lookup) no Studio → copiar plano
- [x] 3.2 Executar Query B (obra_mensagens por cliente) no Studio → copiar plano
- [x] 3.3 Colar ambos os planos na seção "EXPLAIN ANALYZE Results → Baseline"

### Task 4 — Aplicar via Studio SQL Editor (10 min)
- [x] 4.1 Abrir Supabase Studio → SQL Editor do projeto `dsopqkqjkmhytudaaolv` (executado via Management API)
- [x] 4.2 Colar o SQL completo da seção "SQL Final — 26 Índices a Criar" (sem o bloco ROLLBACK)
- [x] 4.3 Executar → confirmar 26 CREATE INDEX retornam sem erro
- [x] 4.4 Registrar timestamp de início e fim no Change Log (21:57:35Z → 21:58:23Z ≈ 48s, + idx 01 prévio ≈ 49s total)

### Task 5 — Capturar EXPLAIN ANALYZE DEPOIS (10 min)
- [x] 5.1 Repetir Query A e Query B do AC 8
- [x] 5.2 Confirmar que plano mudou de `Seq Scan` para `Index Scan` — **Q1/Q2 continuam Seq Scan (correto p/ tabelas <100 rows); validação de Index Scan feita em `system_events` (vide seção EXPLAIN ANALYZE Results)**
- [x] 5.3 Colar planos na seção "EXPLAIN ANALYZE Results → Pós-aplicação"

### Task 6 — INSERT no tracking remote (5 min)
- [x] 6.1 Executar INSERT do AC 6 no Studio SQL Editor (via Management API)
- [x] 6.2 Validar: `SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '031'` retorna row correta — `version='031'`, `name='fk_indexes_critical_remote_only'`, `array_length(statements,1)=26`

### Task 7 — Validações finais (10 min)
- [x] 7.1 Executar query de verificação do AC 7 — confirmar 26 índices em `pg_indexes` (count=26)
- [x] 7.2 Rodar `pnpm --filter @trifold/web build` → exit code 0
- [x] 7.3 Verificar `supabase migration list` (ou query Management API) mostra version 031

### Task 8 — Atualizar epic e documentar (5 min)
- [x] 8.1 Atualizar `docs/stories/epics/epic-29-database-performance-blitz.md` — Story 29.2 marcada Done
- [x] 8.2 Documentar tempo total de criação dos índices no Change Log

### Task 9 — Smoke runtime humano (pendente)
- [ ] 9.1 Humano (Gabriel) valida que portal cliente, dashboard leads e pipeline continuam funcionando

---

## Dev Notes

### Como acessar o remote via Management API

```bash
TOKEN=$(python3 -c "import json,os; d=json.load(open(os.path.expanduser('~/.supabase/access-token'))); print(d.get('access_token',''))")
PROJECT_REF="dsopqkqjkmhytudaaolv"
cat > /tmp/q.json <<'EOF'
{"query": "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;"}
EOF
curl -s -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data @/tmp/q.json
```

### Por que CONCURRENTLY não roda via `supabase db push`

O CLI Supabase envolve cada arquivo de migration em `BEGIN; ... COMMIT;`. `CREATE INDEX CONCURRENTLY` lança `ERROR: 25001: CREATE INDEX CONCURRENTLY cannot run inside a transaction block`. Por isso toda a série 29.2-29.5 usa Studio SQL Editor + ghost migration `_remote_only.sql`.

### Observação sobre `conversation_state.lead_id`

O spike revelou que `conversation_state` não tem coluna `lead_id` — o relatório de auditoria estava incorreto neste ponto. A tabela tem `conversation_id` como FK para `conversations`, que por sua vez tem `lead_id`. Se o path `conversation_state → conversations → leads` é hot, o índice relevante é em `conversations.lead_id` — coberto pela Story 29.3 (compostos hot). Anotar para @architect revisar se há query pattern direto via `conversation_state.lead_id` que não foi capturado pelo schema atual.

### Verificar índices criados (pós-aplicação)

```sql
SELECT indexname, tablename, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
  AND tablename IN ('conversation_state', 'leads', 'appointments', 'unit_sales', 'units',
                    'lead_property_interest', 'visit_feedback', 'broker_assignments',
                    'obra_mensagens', 'obra_fotos', 'obra_documentos', 'follow_up_log',
                    'email_logs', 'email_blasts', 'email_automations', 'system_events')
ORDER BY tablename, indexname;
```

---

## Testing Strategy

1. **Primary validation:** `pg_indexes` query do AC 7 — 26 índices visíveis no remote
2. **Tracking:** `supabase_migrations.schema_migrations` com version `031` (AC 11)
3. **Performance proof:** EXPLAIN ANALYZE antes/depois — `Seq Scan` → `Index Scan` (ACs 8-9)
4. **Build:** `pnpm --filter @trifold/web build` exit 0 (AC 12)
5. **Runtime:** smoke test humano das features afetadas (AC 15)

---

## QA Results

### Gate: **PASS** — @architect (Aria) — 2026-05-13

**Gate file:** `docs/qa/gates/29-2-architect-gate.md`

**Reproducible validations (via Supabase Management API):**

| Check | Result |
|-------|--------|
| `count(*) FROM pg_indexes` para os 26 names | `cnt=26` |
| `indisvalid + indisready` em 6 sample índices | 6/6 `true/true` |
| `version='031'` row em `schema_migrations` | Presente, `statements[26]` |
| `pnpm --filter @trifold/web build` | Exit code 0 |

**Análise crítica:** AUTO-DECISION da Dara sobre Q1/Q2 manterem `Seq Scan` no plano DEPOIS é **tecnicamente correta**. Postgres planner avalia custo de I/O — para tabelas <100 rows, Seq Scan é mais barato que Index Scan. A prova de operacionalidade dos índices está documentada em `idx_system_events_resolved_by` (~720 rows) que já é escolhido pelo planner. Conforme as tabelas crescerem em produção, o planner migrará automaticamente para Index Scan — exatamente o objetivo preventivo da story.

**14/15 ACs PASS.** AC 15 (smoke runtime humano) DEFERRED — aceito como precedente da Story 29.1.

**Observação forward:** `conversation_state.lead_id` ausente — Story 29.3 (composite indexes) deve revisar índice em `conversations.lead_id` para cobrir path `conversation_state → conversations → leads`.

**Próximo passo:** `@devops *push`.

---

## File List

- [x] `supabase/migrations/031_fk_indexes_critical_remote_only.sql` (novo — ghost migration com 26 CREATE INDEX CONCURRENTLY + rollback SQL completo)
- [x] `docs/stories/epics/epic-29-database-performance-blitz.md` (Story 29.2 marcada como Done in-line)
- [x] `docs/stories/active/29-2-fk-indexes-criticos.md` (atualizado: EXPLAIN ANALYZE results, tasks checked, Change Log V1.1)
- [x] Remote DB: 26 índices criados via Management API; 1 row inserida em `supabase_migrations.schema_migrations` (version 031)

---

## Change Log

| Versão | Data | Autor | Descrição |
|--------|------|-------|-----------|
| 1.0 | 2026-05-12 | @sm (River) | Story criada com spike completo inline. Spike via Management API confirmou: 26 colunas existem (3 removidas por ausência — `conversation_state.lead_id`, `visit_feedback.appointment_id`, `visit_feedback.org_id`); nenhum dos 26 índices propostos existe atualmente; todas as tabelas < 500 kB (criação < 30s estimada). Status: Ready. |
| 1.1 | 2026-05-13 | @data-engineer (Dara) | **Implementação completa (YOLO).** Aplicação via Supabase Management API (single-statement por POST — CONCURRENTLY incompatível com transação CLI). Sequência: (a) ghost file `031_fk_indexes_critical_remote_only.sql` criado com 26 CREATE INDEX CONCURRENTLY + rollback comentado; (b) baseline EXPLAIN ANALYZE Q1/Q2 capturado; (c) 26 indexes executados sequencialmente entre 21:55Z e 21:58:23Z (~49s wall-clock total); (d) pg_indexes confirma 26 indexes presentes (count=26, todos `indisvalid=true`, `indisready=true`); (e) INSERT em `supabase_migrations.schema_migrations` com version='031' e statements[26]; (f) EXPLAIN ANALYZE pós aplicado — Q1/Q2 continuam Seq Scan (correto: tabelas com <30 rows; planner escolhe seq scan), mas `idx_system_events_resolved_by` já é escolhido pelo planner em query padrão FK lookup; (g) `pnpm --filter @trifold/web build` exit code 0; (h) Tasks 1-8 marcadas como done, Task 9 (smoke humano) pendente. Zero downtime observado. Status mantido em **Ready** — aguarda quality gate `@architect *qa-gate 29.2`. |
| 1.2 | 2026-05-13 | @architect (Aria) | **Quality Gate Express PASS.** Reproduzidas via Management API: (1) `count(*) FROM pg_indexes` para os 26 nomes retorna `cnt=26`; (2) sample de 6 índices (`idx_conversation_state_property`, `idx_email_logs_org_status_sent`, `idx_followup_log_lead_type_created`, `idx_leads_utm_campaign`, `idx_obra_mensagens_cliente`, `idx_system_events_resolved_by`) — todos `indisvalid=true` e `indisready=true`; (3) tracking row `version='031'`, `name='fk_indexes_critical_remote_only'`, `array_length(statements)=26`; (4) `pnpm --filter @trifold/web build` exit code 0. AUTO-DECISION da Dara sobre Q1/Q2 Seq Scan = **VÁLIDA** (Postgres planner correctly favorece seq scan em tabelas <100 rows; prova de Index Scan documentada em `system_events`). 14/15 ACs PASS — AC 15 (smoke humano) DEFERRED conforme precedente Story 29.1. Status: Ready → **Done**. Gate file: `docs/qa/gates/29-2-architect-gate.md`. Next: `@devops *push`. |
