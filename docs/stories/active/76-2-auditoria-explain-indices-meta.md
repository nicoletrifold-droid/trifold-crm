# Story 76-2 — Auditoria de Uso dos Índices Meta nas Consultas do Agente (EXPLAIN)

## Metadata
- **Epic:** 76 — Proveniência e Performance dos Dados Meta Ads no Agente de Tráfego
- **Story:** 76-2
- **Status:** InProgress
- **Priority:** P1 — SHOULD (auditoria de performance das consultas; não bloqueia o epic, mas resolve incerteza de performance nas queries do agente)
- **Complexity:** S (3-5h)
- **Story Points:** 3
- **MoSCoW:** SHOULD
- **Created:** 2026-06-22
- **Author:** @sm (River)

> **CodeRabbit Integration:** Disabled — validação manual pelo @dev.

### Executor Assignment
- **Executor Principal:** @data-engineer (Dara)
- **Quality Gate:** @dev (Dex)
- **Quality Gate Tools:** `[explain_analysis_check, index_redundancy_check, migration_concurrently_check]`
- **Depende de:** — (independente de 76-1; paralelizável)
- **Paralelizável com:** 76-1
- **Bloqueia:** — (76-3 depende de 76-1, não de 76-2)

---

## User Story

**Como** time técnico responsável pelo agente de tráfego pago,
**Quero** confirmar via `EXPLAIN (ANALYZE, BUFFERS)` que as queries reais do agente e das RPCs Meta utilizam os índices já existentes no banco,
**Para que** possamos ter evidência concreta de que as consultas são performáticas (ou identificar um gap real antes de criar qualquer índice novo).

---

## Context

### Premissa Crítica — Os Índices JÁ Existem

**IMPORTANTE:** Esta story é de **auditoria**, não de criação de índices. Todos os padrões de filtro/agregação das consultas do agente já têm índice dedicado no banco:

| Padrão de query | Índice existente | Migration |
|---|---|---|
| `meta_insights_daily` por `org_id`/`level`/`date` | `(org_id, level, date DESC)` | `015_meta_marketing_api.sql:190` |
| `meta_insights_daily` por `entity_id`/`date` | `(entity_id, date DESC)` | `015:192` |
| `meta_insights_daily` lookup exato | UNIQUE `(org_id, level, entity_id, date)` | `015:126` |
| `meta_insights_placement_daily` por `campaign_id`/`date` | `(campaign_id, date DESC)` | `076_meta_insights_placement_daily.sql:25` |
| `meta_insights_placement_daily` por `org_id`/`date` | `(org_id, date DESC)` | `076:28` |
| `leads.metadata->>'ad_id'` (JSONB) | `idx_leads_metadata_ad_id` (expressão parcial, `WHERE ad_id IS NOT NULL`) | `075_leads_metadata.sql:36` |

**Criar índice novo = violação de CON-6 e Article IV (No Invention)**, a menos que `EXPLAIN` comprove gap concreto.

### O Problema Real

Não há evidência (`EXPLAIN`) de que o planner efetivamente usa esses índices nas queries reais. O planner pode escolher seq-scan por:
- Diferença entre a forma da expressão na query vs. a forma do índice (ex.: cast implícito, IS NOT NULL faltando)
- Estatísticas desatualizadas (`ANALYZE` não rodado)
- Tabela pequena demais para o planner preferir índice

### Alvos da Auditoria

1. **`context-builder.ts`** — queries sobre `meta_insights_daily` (lines ~81, 210, 218) e `meta_insights_placement_daily` (line ~239). Extrair a SQL exata que o PostgREST/Supabase gera para essas chamadas.
2. **RPC `creative_performance`** — migration `100_*`: busca métricas por criativo; confirmar uso de `(entity_id, date DESC)` ou UNIQUE.
3. **RPC `creative_performance_with_crm`** — migration `101_*`, linha ~122: inclui atribuição via `leads.metadata->>'ad_id'`; confirmar uso de `idx_leads_metadata_ad_id`.
4. **RPC `pipeline_funnel_by_campaign`** — Story 52-1: funil por campanha; confirmar uso de `(org_id, level, date DESC)`.

### Entrega Mínima Legítima

Se nenhum gap for comprovado: **relatório de EXPLAIN + zero migrações novas**. Isso satisfaz completamente a DoD. Não criar índice "por precaução".

### Quando Criar Índice Novo

Apenas se EXPLAIN revelar, para uma query real com dados de produção, um dos seguintes:
- `Seq Scan` (full table scan) em tabela com > alguns milhares de linhas
- `Sort` não coberto pelo índice (ex.: sort por coluna fora do índice)
- Heap-fetch (bitmap heap scan) excessivo sugerindo índice de cobertura (`INCLUDE`)

Nesse caso: migration `106_*` com `CREATE INDEX CONCURRENTLY IF NOT EXISTS ...` — nunca redundante com o UNIQUE `(org_id, level, entity_id, date)` já existente (CON-6).

---

## Acceptance Criteria

- [~] **AC1 (EXPLAIN de `context-builder` sobre `meta_insights_daily`):** Auditoria das 2 formas reais da query (global `buildGlobalContext` + campanha `buildCampaignContext`) documentada com índice esperado, cardinalidade real (campaign=249 linhas) e veredito. **EXPLAIN ANALYZE real NÃO executado** (PAT expirado + `db-plan-enabled` off em prod); veredito INFERIDO de definição-de-índice + forma-de-query + cardinalidade medida. Comando exato para confirmar documentado no relatório. → `USANDO_INDICE` (sem gap).

- [~] **AC2 (EXPLAIN de `creative_performance`):** Auditoria da RPC (migration 101, que substituiu a 100) documentada — join + 3 subqueries de ranking servidas por `idx_meta_insights_entity_date`. Cardinalidade real: 500 linhas `level='ad'`. EXPLAIN real pendente (mesmo bloqueio). → `USANDO_INDICE` (sem gap).

- [~] **AC3 (EXPLAIN de `creative_performance_with_crm` — foco em `metadata->>'ad_id'`):** Comparação literal índice (075) vs join (101:122) — **forma idêntica** (`->>` puro, sem cast); predicado parcial satisfazível pela igualdade. R1 mitigado. Cardinalidade real: 140 de 1063 leads com `ad_id`. EXPLAIN real pendente. → `USANDO_INDICE`, forma alinhada (sem gap, sem ajuste de RPC).

- [~] **AC4 (EXPLAIN de `pipeline_funnel_by_campaign`):** Auditoria da RPC (migration 096) documentada — `campaign_spend` CTE coberto por `idx_meta_insights_org_level_entity`. EXPLAIN real pendente. → `USANDO_INDICE` (sem gap).

- [x] **AC5 (Relatório de auditoria):** Criado `docs/audits/76-2-explain-indices-meta.md` com: (a) query de cada alvo; (b) índice esperado + cardinalidade + plano inferido; (c) veredito por target; (d) conclusão geral; (e) lista de índices novos (vazia). Inclui seção explícita "Executado vs. Inferido" e comandos para o EXPLAIN real.

- [x] **AC6 (Criação condicional de índice — apenas com gap comprovado):** Nenhum gap comprovado nos 4 alvos → **zero DDL**. AC satisfeito sem criar índice (CON-6 / Article IV respeitados).

- [N/A] **AC7 (Sem regressão nos crons — se índice criado):** N/A — nenhum índice criado.

- [N/A] **AC8 (Aplicação via Management API — se migration criada):** N/A — nenhuma migration `106_*` criada.

---

## Tasks / Subtasks

### @data-engineer (Dara)

- [x] **T1 — Extrair as SQLs reais das queries do `context-builder.ts` (AC1)**
  - [x] Lido `context-builder.ts`: `meta_insights_daily` em `buildGlobalContext` (217-223) e `buildCampaignContext` (391-398, 399-405); `meta_insights_placement_daily` (420-426)
  - [x] Traduzidas chamadas PostgREST para SQL puro equivalente (no relatório)
  - [x] `org_id` real de produção identificado: `00000000-0000-0000-0000-000000000001`

- [~] **T2 — Rodar `EXPLAIN (ANALYZE, BUFFERS)` na query de `meta_insights_daily` (AC1)**
  - [~] EXPLAIN real **bloqueado**: PAT `sbp_4681…` expirado (401 Unauthorized, 2026-06-21) + `db-plan-enabled` off (PGRST107). Sem psql/DATABASE_URL no ambiente.
  - [x] Índice esperado identificado: `idx_meta_insights_org_level_date` (global) / UNIQUE(org_id,level,entity_id,date) (campanha)
  - [x] Cardinalidade real medida via PostgREST count: campaign=249, total=1172

- [~] **T3 — Rodar `EXPLAIN (ANALYZE, BUFFERS)` nas RPCs de criativo (AC2, AC3)**
  - [~] EXPLAIN real bloqueado (mesmo motivo) — comandos exatos (corpo inline) documentados no relatório
  - [x] Verificada forma do join `(l.metadata->>'ad_id') = a.meta_ad_id` vs índice parcial `idx_leads_metadata_ad_id` → **forma idêntica, sem divergência** (R1 mitigado)
  - [x] Cardinalidade: 140/1063 leads com `ad_id`; 500 linhas `level='ad'`; 581 ads

- [~] **T4 — Rodar `EXPLAIN (ANALYZE, BUFFERS)` na RPC `pipeline_funnel_by_campaign` (AC4)**
  - [~] EXPLAIN real bloqueado — comando inline do `campaign_spend` CTE documentado
  - [x] Índice de suporte confirmado: `idx_meta_insights_org_level_entity` (096)

- [x] **T5 — Analisar resultados e classificar cada target (AC5)**
  - [x] 4 targets classificados `USANDO_INDICE` (inferido) — nenhum `GAP_COMPROVADO`

- [x] **T6 — Criar relatório de auditoria em `docs/audits/76-2-explain-indices-meta.md` (AC5)**
  - [x] Inclui queries, índice esperado + cardinalidade, veredito por target, conclusão, índices criados ("nenhum"), seção Executado vs. Inferido e comandos para EXPLAIN real

- [N/A] **T7 — Criar migration `106_*` (APENAS se gap comprovado em T5) (AC6, AC7, AC8)**
  - N/A — nenhum gap comprovado. Próxima migration livre confirmada por `ls`: `106` (atual máx = 105). Zero DDL criada (CON-6 / Article IV).

---

## Dev Notes

### Como Extrair a SQL Real das Chamadas PostgREST

O `context-builder.ts` usa o cliente Supabase JS. Para obter a SQL equivalente, a forma mais segura é:
1. Habilitar logging de queries no Supabase Dashboard (Settings → Database → Logs)
2. Disparar o agente uma vez para popular os logs
3. Capturar a query gerada pelo PostgREST no log

Alternativa: traduzir manualmente a chamada JS para SQL (mais rápido para queries simples).

### Forma das Expressões — Ponto Crítico

O índice `idx_leads_metadata_ad_id` foi criado como índice de expressão:
```sql
CREATE INDEX idx_leads_metadata_ad_id ON leads ((metadata->>'ad_id'))
WHERE (metadata->>'ad_id') IS NOT NULL;
```
Para que o planner use este índice, a query na RPC `creative_performance_with_crm` (migration 101:~122) deve usar exatamente `metadata->>'ad_id'` (operador `->>`, não `->` nem cast). Qualquer divergência (ex.: `CAST(metadata->>'ad_id' AS text)`) impede o uso do índice. Verificar a definição exata na migration 101.

### Alvos de Auditoria — Migrations de Referência

```
creative_performance       → supabase/migrations/100_*.sql
creative_performance_with_crm → supabase/migrations/101_*.sql (linha ~122 para ad_id)
pipeline_funnel_by_campaign → ver story 52-1 / migration 096_* (era funil RPC convertido de view)
```

### Índices Existentes — Referência Completa

```sql
-- migration 015 (meta_insights_daily)
UNIQUE (org_id, level, entity_id, date)         → lookup exato
INDEX  (org_id, level, date DESC)               → filtro por org+level+período
INDEX  (entity_id, date DESC)                   → filtro por entidade+período

-- migration 076 (meta_insights_placement_daily)
INDEX  (campaign_id, date DESC)                 → filtro por campanha+período
INDEX  (org_id, date DESC)                      → filtro por org+período

-- migration 075 (leads — JSONB parcial)
INDEX  ((metadata->>'ad_id')) WHERE (metadata->>'ad_id') IS NOT NULL
```

NÃO criar nenhum desses índices novamente — são redundantes (CON-6).

### Regra da Migration 106

**Só criar se gap comprovado.** Se criar:
1. Confirmar `106` está livre: `SELECT name FROM supabase_migrations.schema_migrations ORDER BY name DESC LIMIT 5`
2. Usar `CREATE INDEX CONCURRENTLY IF NOT EXISTS` (CON-5)
3. Aplicar via Management API (não `supabase db push`)
4. Verificar com `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = '...'`

### Localização do Relatório

Criar em `docs/audits/76-2-explain-indices-meta.md`. O diretório `docs/audits/` já existe (ver `docs/audits/PERFORMANCE-PLAN-FOLLOW-UPS.md`).

### Testing

Esta story não tem código de aplicação — a entrega é o relatório de auditoria (e, condicionalmente, uma migration SQL). O "teste" é o próprio `EXPLAIN (ANALYZE, BUFFERS)` rodado em produção/staging com dados reais.

---

## Dev Agent Record

### File List

**Criados:**
- `docs/audits/76-2-explain-indices-meta.md` — relatório de auditoria (estática fundamentada + cardinalidade real). **DOC-001 (2026-06-23):** adicionada nota no alvo AC2 e na tabela-resumo registrando o `UNIQUE(org_id,level,entity_id,date)` como índice candidato co-igual/superior (inclui `org_id`+`level` no prefixo) — sem alterar o veredito (ambos cobrem; zero gap, zero DDL).

**Modificados:**
- `docs/stories/active/76-2-auditoria-explain-indices-meta.md` — status, ACs, tasks, notes (este arquivo)

**NÃO criados (corretamente):**
- `supabase/migrations/106_*.sql` — condicional a gap; **nenhum gap comprovado** → não criado (CON-6 / Article IV)

### Notas de Implementação (@data-engineer / Dara — 2026-06-22)

**Veredito:** Auditoria concluída. **Nenhum gap comprovado → zero migrações novas.** Os índices das migrations
015/075/076/096 cobrem corretamente os padrões de filtro/ordenação/join das 4 consultas auditadas.

**Executado de fato vs. inferido (honestidade metodológica):**
- **Executado:** cardinalidade real de todas as tabelas-alvo via PostgREST `count=exact` (service-role key) —
  `meta_insights_daily`=1172 (campaign 249 / adset 423 / ad 500), `meta_insights_placement_daily`=**0 (vazia)**,
  `meta_ads`=581, `meta_campaigns`=102, `leads`=1063 (**140** com `metadata->>'ad_id'`), `kanban_stages`=14.
- **NÃO executado:** `EXPLAIN (ANALYZE, BUFFERS)` real. Bloqueio duplo: (1) PAT `~/.supabase/access-token`
  expirado (401, 2026-06-21); (2) PostgREST `db-plan-enabled` off em produção (PGRST107). Sem psql/DATABASE_URL.
  Vereditos por target são **inferidos** (definição-de-índice + forma-de-query + cardinalidade), com comandos
  exatos no relatório para confirmação quando houver PAT válido.

**Achados-chave:**
1. Tabelas pequenas (≤1,2k linhas) → Seq Scan provável e **ótimo** (R2), não gap. Índices são investimento p/ escala.
2. R1 (forma do índice parcial `idx_leads_metadata_ad_id` vs join da RPC 101) **mitigado**: forma idêntica
   (`->>` puro, sem cast); predicado parcial satisfazível pela igualdade. **Nenhum ajuste de RPC necessário.**
3. `meta_insights_placement_daily` está vazia — planos triviais; índices prontos para quando o sync popular dados.

**Handoff:** para promover vereditos de "inferido" → "confirmado", @devops/operador renova o PAT (`supabase login`)
e roda os comandos da seção "Como Executar o EXPLAIN Real" do relatório.

---

## Riscos

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | Planner não usa `idx_leads_metadata_ad_id` — expressão JSONB diferente na RPC | T3: comparar definição do índice com SQL exata da migration 101:122; ajustar RPC se necessário (sem criar índice redundante) |
| R2 | Tabela pequena em staging → planner prefere seq-scan (correto para tabelas pequenas) | Rodar EXPLAIN com dados de produção se possível; documentar cardinalidade |
| R3 | Criar índice `106` trava tabela durante cron | CON-5: `CONCURRENTLY` obrigatório; janela de baixa atividade |
| R4 | Migration `106` conflita com numeração | T7: confirmar slot livre antes de criar |
| R5 | Índice criado sem gap comprovado — violação de Article IV | T5 explícito: só criar com evidência de EXPLAIN; este risco é o principal a evitar |

---

## Out of Scope

- Criar índices "preventivos" sem gap comprovado (Article IV — No Invention)
- Otimizar os crons de ingestão ou alterar a frequência de sync
- Endpoints `meta-ads/*` — auditoria focada nas queries do agente (context-builder + RPCs); endpoints podem ser auditados separadamente se necessário
- Materialized views — avaliação opcional apenas se gap de custo for muito alto e índice simples não resolver

---

## Definition of Done

- [ ] AC1–AC4 completos: `EXPLAIN (ANALYZE, BUFFERS)` executado nos 4 alvos (context-builder + 3 RPCs)
- [ ] AC5: relatório `docs/audits/76-2-explain-indices-meta.md` criado e preenchido
- [ ] AC6: veredito claro por target — `USANDO_INDICE` ou `GAP_COMPROVADO`
- [ ] AC6: se gap → migration `106_*` criada e aplicada via Management API; se sem gap → zero DDL
- [ ] AC7: se índice criado → tempo de cron medido antes/depois, sem regressão relevante
- [ ] @dev executou quality gate com verdict PASS
- [ ] @devops fez push (relatório + migration condicional)

---

## QA Results (@dev — Quality Gate)

**Verdict: CONCERNS** (não-bloqueante) — gate file: `docs/qa/gates/76.2-auditoria-explain-indices-meta.yml`

| Check | Verdito | Resumo |
|-------|---------|--------|
| `explain_analysis_check` | PASS (com concern) | Raciocínio estático correto para os 4 alvos, validado contra o código real (context-builder.ts + RPCs 101/096). Concern: vereditos INFERIDOS, EXPLAIN real não executado (PAT expirado + db-plan-enabled off). Imprecisão menor em AC2 (UNIQUE é candidato co-igual a entity_date). |
| `index_redundancy_check` | PASS | Decisão de zero DDL correta — nenhum índice proposto/redundante; nenhum gap óbvio ignorado (cardinalidade ≤1.172 → Seq Scan ótimo). R1 verificado em código: índice parcial 075 ≡ join 101:122 (`->>` puro, igualdade implica IS NOT NULL). |
| `migration_concurrently_check` | N/A | Nenhuma migration 106_* criada. |

**Parecer sobre a ausência do EXPLAIN real:** ACEITÁVEL com follow-up registrado (não bloqueio). O objetivo da story — decidir se há gap exigindo índice novo — depende da cardinalidade, que foi medida de fato em produção. Em ≤1.172 linhas o planner prefere Seq Scan legitimamente; o EXPLAIN real NÃO mudaria o desfecho "zero DDL". Como nenhuma DDL é entregue, não há mudança a regredir e o risco é nulo; criar índice "por precaução" seria a ação errada (Article IV). O EXPLAIN inferido é suficiente para a DECISÃO; a confirmação empírica é upgrade de evidência desejável, não load-bearing.

- **Fechado:** decisão de zero DDL (final); R1 mitigado; CON-6/Article IV respeitados; cardinalidade real medida.
- **Follow-up (não-bloqueante, EVID-001):** @devops/operador renova PAT (`supabase login`) e roda os comandos da seção "Como Executar o EXPLAIN Real" do relatório, promovendo vereditos de "inferido" → "confirmado".

Reviewer: Dex (@dev) · 2026-06-22

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-22 | v1.0 | Story criada — Epic 76, SHOULD, auditoria EXPLAIN dos índices Meta nas queries do agente; story de auditoria (não criação) após correção obrigatória do @po em FR-5/v0.3 do epic | @sm (River) |
| 2026-06-22 | v1.1 | Auditoria executada. Relatório `docs/audits/76-2-explain-indices-meta.md` criado. Cardinalidade real medida; EXPLAIN ANALYZE real bloqueado (PAT expirado + db-plan-enabled off) → vereditos fundamentados/inferidos. 4 targets `USANDO_INDICE`, **nenhum gap**, **zero migrações** (CON-6/Article IV). Status → InProgress. | @data-engineer (Dara) |
| 2026-06-22 | v1.2 | Quality gate @dev executado: **CONCERNS** (não-bloqueante). `index_redundancy_check` PASS (zero DDL correto, R1 verificado em código), `explain_analysis_check` PASS com concern (vereditos inferidos; EXPLAIN real é follow-up não-bloqueante EVID-001). Gate: `docs/qa/gates/76.2-auditoria-explain-indices-meta.yml`. | @dev (Dex) |
| 2026-06-23 | v1.3 | DOC-001 (concern low) resolvido: nota no relatório registrando o `UNIQUE(org_id,level,entity_id,date)` como índice candidato co-igual em AC2. Veredito inalterado (zero gap, zero DDL). EVID-001 (EXPLAIN real) permanece follow-up bloqueado por PAT expirado. | @dev (Dex) |
