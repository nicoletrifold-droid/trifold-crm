---
epic: 29
title: Database Performance Blitz — Índices, materialização ROAS, cleanup automático
status: Ready
created_at: 2026-05-12
updated_at: 2026-05-12
created_by: Morgan (@pm) — criado diretamente pelo orchestrador após timeout do agente PM
priority: P0
source_plan: docs/audits/PERFORMANCE-PLAN.md (seção 5)
po_review: docs/audits/PERFORMANCE-PLAN-PO-REVIEW.md (B2 e B3 já aplicados no plano fonte)
source_audit: docs/audits/performance-database-audit.md (Dara @data-engineer — SQLs prontos)
depends_on: []
blocks: [Epic 30 (Over-fetch killers), Epic 33 (Backend heavy)]
stories_planned: [29.1, 29.2, 29.3, 29.4, 29.5, 29.6, 29.7, 29.8]
estimated_points: 28
estimated_duration: ~5 dias úteis (1 sprint focado, com QA gate cuidadoso porque mudanças tocam DB de produção)
---

# Epic 29 — Database Performance Blitz

## Objetivo do Epic

Atacar a **causa-raiz tripla** da lentidão do CRM diagnosticada pela auditoria de Dara (`performance-database-audit.md`):

1. **~20 FKs sem índice** em colunas hot (`conversation_state.lead_id`, `leads.property_interest_id`, `unit_sales.lead_id`, `visit_feedback.*`, `obra_mensagens.sender_id`, `system_events.org_id`, etc.) — Supabase NÃO cria índice automático em FK; toda query com JOIN/DELETE/UPDATE em parent table dispara FULL SCAN em filhas grandes.
2. **`meta_campaign_roas` é VIEW (não materializada)** com 3 CTEs agregando — dashboard ROAS demora 2-5s em cada hit; vai virar Materialized View com refresh a cada 30 min via pg_cron.
3. **`knowledge_base.embedding` sem vector index** — toda chamada RAG faz sequential scan + distance calc na tabela inteira.

Mais 4 frentes complementares: índices compostos para queries hot, partial indexes para queues, pg_cron cleanup jobs para tabelas insert-heavy, connection pooler explícito.

**Ganho esperado:** -50% a -80% de latência em queries hot. Dashboard ROAS de 2-5s → 50-200ms. RAG search de 1-3s → 50-100ms.

## Por que agora (urgência operacional)

**Sinal de campo (2026-05-12):** Usuário relata "plataforma extremamente lerda". Epic 28 (Config Quick Wins) entregou ganho de **client + cold start** (`.next/server -53.8%`, loading skeletons, Cache-Control private, server-only, sideEffects, target ES2022). Mas o **gargalo profundo do servidor é o DB**: queries hot rodando seq scan, view ROAS recomputando a cada hit, cron `/api/cron/followup` fazendo ~800 queries sequenciais por execução.

**Decisão tática:**
- Epic 27 (Observability) continua diferido — Epic 29 dá ganho imediato e mensurável "no joelho" (sem Speed Insights instalado, ainda dá pra verificar via `EXPLAIN ANALYZE` e tempo de boot empírico).
- Epic 29 vem antes de Epic 30 (Over-fetch Killers) porque queries refatoradas em Epic 30 vão se beneficiar dos índices criados aqui.

**Por que este epic agora entre as otimizações:**
- Dara mediu que **apenas a adição dos ~35 índices recomendados reduz latência média em routes com JOINs em 50-80%**.
- ROI altíssimo: ~5 dias úteis para impacto generalizado em TODAS as rotas que tocam `messages`, `obra_mensagens`, `conversations`, `system_events`, `leads`, `meta_campaigns`.
- Risco controlável: CONCURRENTLY + idempotência + rollback inline mitigam produção (ver AC global B3 abaixo).

## Contexto do Sistema Existente

- **DB:** Supabase Postgres 15 (managed). RLS ativo em todas as tabelas.
- **Migrations:** 30+ arquivos em `supabase/migrations/`, COM CONFLITOS DE NUMERAÇÃO (021×3, 024×2, 028×2, 029×2) + stubs `024_remote_only.sql` / `025_remote_only.sql` indicando drift entre local e Supabase Studio.
- **Última migration sequencial atual:** `030_role_obras.sql` (Lucas, paralelo) → **Epic 29 começa em `031_*`**.
- **Tabelas grandes / hot:**
  - `messages` (insert-heavy via webhook WhatsApp/Telegram, milhões de rows previstos)
  - `obra_mensagens` (chat portal cliente, append-only)
  - `system_events` (todos os webhooks + cron logs, sem cleanup automático)
  - `conversations` (lookup por `lead_id` ou `org_id`)
  - `leads` (5k+ em produção, filtros frequentes por org_id + is_active + stage_id)
  - `webhook_logs` (insert-heavy de Meta + WhatsApp + Resend)
  - `follow_up_log` (cron de followup)
  - `email_logs` (envios Resend)
  - `knowledge_base` (RAG embeddings, vector(1536))
- **Views existentes:** `v_mensagens_admin` (mig 024 — JOIN obras+mensagens), `meta_campaign_roas` (mig 016 — VIEW com 3 CTEs).
- **Aviso `packages/web/AGENTS.md`:** "This is NOT the Next.js you know" — relevante porque rotas usam SSR e queries do Supabase precisam considerar caching e org filtering correto.

### Estado das migrations duplicadas (B2 do PO):
```
021_obras_storage_policies.sql          (mesma sequência que phone_normalization!)
021_phone_normalization_part1.sql
021_phone_normalization_part2.sql
024_mensagens_sender_display_name.sql
024_remote_only.sql                     (stub — "Applied via Supabase Studio")
025_remote_only.sql                     (stub — sem conteúdo real)
028_fix_v_mensagens_admin_grant.sql
028_meta_campaign_actions.sql           (mesma sequência!)
029_cliente_id_obra_mensagens.sql
029_privacy_acceptance.sql              (mesma sequência!)
030_role_obras.sql                      (Lucas, paralelo)
```
**Risco:** ordem alfabética do CLI processa esses de forma frágil. Story 29.1 reconcilia.

## Decisão Arquitetural — CONCURRENTLY vs Transação Supabase CLI

**Problema técnico:** `CREATE INDEX CONCURRENTLY` **NÃO pode rodar dentro de transação**. Supabase CLI (`supabase db push`) envolve cada arquivo de migration em transação automática.

**Soluções avaliadas:**

| Opção | Como | Prós | Contras |
|-------|------|------|---------|
| **(a)** Aplicar via **Supabase Studio SQL Editor** (não via CLI migration) | Executar `CREATE INDEX CONCURRENTLY` direto no Studio com ordem documentada. Criar arquivo migration "ghost" stub estilo `024_remote_only.sql` apenas para registro local. | Funciona. Padrão já estabelecido pelo time. Sem risco de quebrar migration tree. | Drift potencial entre local e remote (mitigado pela Story 29.1 que reconcilia). |
| **(b)** Splitar em N arquivos | Um `CREATE INDEX CONCURRENTLY` por arquivo de migration. Supabase CLI ainda envolve em transação — falha em runtime. | — | Não resolve o problema. |
| **(c)** `BEGIN; ... COMMIT;` manual com hack | Tentar burlar a transação automática via `\set ON_ERROR_STOP off` e markup específico. | — | Frágil, não documentado, pode quebrar com upgrade do CLI. |

**DECISÃO OFICIAL DESTE EPIC:** **Opção (a) — aplicar via Supabase Studio SQL Editor.** Cada Story de criação de índice (29.2-29.5) terá:
1. Arquivo migration "ghost" em `supabase/migrations/03X_descricao_remote_only.sql` documentando o SQL aplicado (similar a `024_remote_only.sql` existente).
2. Instruções claras no story file para o @data-engineer/@dev abrir o Studio SQL Editor e executar.
3. Validação pós-aplicação via `EXPLAIN ANALYZE` em query de exemplo.

**Story 29.1 vai padronizar essa convenção** dos stubs `_remote_only.sql` para que futuras migrations sigam o mesmo padrão.

## Enhancement Details

### O que está sendo adicionado

1. **~35 índices novos** distribuídos em 4 migrations agrupadas por categoria (FKs críticas, compostos hot, vector knowledge_base, partials para queues).
2. **Materialização da view `meta_campaign_roas`** (DROP VIEW → CREATE MATERIALIZED VIEW + UNIQUE INDEX) com refresh automático a cada 30 min via pg_cron.
3. **pg_cron extension + 5 jobs** de cleanup automático:
   - `system_events` retention 30 dias
   - `webhook_logs` retention 90 dias para `processed=true`
   - `follow_up_log` retention 180 dias
   - `email_logs` retention 365 dias
   - REFRESH MATERIALIZED VIEW `meta_campaign_roas` a cada 30 min
4. **Connection pooler explícito** no Vercel (`SUPABASE_URL` → porta 6543 transaction mode).
5. **Reconciliação de migrations duplicadas** (021×3, 024×2, 028×2, 029×2) + stubs `024_remote_only.sql` / `025_remote_only.sql`.

### Como integra com o sistema existente

- **Aditivo apenas.** Nenhum schema existente é modificado destrutivamente. Materialização da ROAS view requer DROP + CREATE da view (janela curta de downtime documentada).
- **`CREATE INDEX CONCURRENTLY` em todas as Stories 29.2-29.5** → ZERO downtime de produção durante criação dos índices.
- **`IF NOT EXISTS` em todos os índices** → migration é idempotente, pode rodar várias vezes sem erro.
- **Rollback SQL comentado em todos os arquivos** → reverter sem `supabase db reset`.
- **pg_cron extension** já é suportada pelo Supabase (basta `CREATE EXTENSION IF NOT EXISTS pg_cron`).

### Pré-requisitos verificáveis

```bash
# Estado atual confirmado em 2026-05-12:
ls supabase/migrations/ | tail -5             # → 028, 029, 030 atuais
supabase migration list                       # → verificar drift local↔remote
grep "CREATE INDEX" supabase/migrations/      # → listar índices existentes
echo $SUPABASE_URL                            # → confirmar se já está na 6543 ou na 5432
```

### Sucesso mensurável

- **`EXPLAIN ANALYZE` em queries hot mostra index scan** em vez de seq scan. Exemplos a validar:
  - `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 50`
  - `SELECT * FROM leads WHERE org_id = $1 AND stage_id = $2 AND is_active = true`
  - `SELECT * FROM obra_mensagens WHERE org_id = $1 AND cliente_id = $2`
  - `SELECT * FROM system_events WHERE org_id = $1 AND level = 'error' ORDER BY created_at DESC LIMIT 100`
- **Dashboard ROAS abre em <500ms** (vs 2-5s baseline) — medível por tempo de TTFB em `/dashboard/campaigns/meta/[campaign_id]`.
- **`system_events` para de crescer indefinidamente** — validar tamanho da tabela 7 dias após Story 29.7.
- **`supabase migration list` mostra paridade local↔remote** após Story 29.1.
- **RAG search em <100ms** (vs 1-3s) — medível em `/api/chat` ou via timing do `match_knowledge` RPC.
- **Zero downtime observado** durante criação dos índices — validar via logs Vercel + p99 de requests durante deploy.

---

## AC Global Obrigatório (Bloqueante B3 do PO Review)

> **Toda Story 29.2-29.5 que cria índice DEVE cumprir TODOS os itens abaixo. Quality gate FALHA sem isso.**

1. **`CREATE INDEX CONCURRENTLY`** obrigatório em TODAS as Stories 29.2-29.5. Exemplo:
   ```sql
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conv_created
     ON messages (conversation_id, created_at DESC);
   ```

2. **Idempotência:** usar `IF NOT EXISTS` em índices/colunas/extensões; `IF EXISTS` em DROPs; `ON CONFLICT DO NOTHING` em seeds.

3. **Rollback SQL comentado no fim de cada arquivo de migration:**
   ```sql
   -- ROLLBACK PLAN (executar manualmente se necessário):
   -- DROP INDEX IF EXISTS idx_messages_conv_created;
   -- DROP INDEX IF EXISTS idx_messages_org_conv_created;
   -- ...
   ```

4. **Janela de baixo tráfego para Story 29.6** (DROP VIEW + CREATE MATERIALIZED VIEW) — coordenar com PO antes do `@devops *push`. Downtime esperado: <30s (DROP + CREATE são rápidos; refresh inicial pode demorar 1-2 min mas a view nova só serve dados após `REFRESH ... WITH DATA`).

5. **Aplicação via Supabase Studio SQL Editor** (não via `supabase db push`) — conforme decisão arquitetural acima. Cada story documenta o SQL exato + procedimento de aplicação.

---

## Stories Propostas (a serem criadas por @sm)

> **Ordem reflete bloqueante B2 do PO review:** Story 29.1 (reconciliar migrations duplicadas) DEVE rodar antes de qualquer nova migration neste epic.

### Story 29.1 [BLOQUEANTE] — Reconciliar migrations conflitantes + stubs remote_only

**Status: DONE — Quality Gate PASS (Aria @architect, 2026-05-12)**
**Gate file:** `docs/qa/gates/29-1-architect-gate.md` (14/14 ACs PASS, zero issues)
**Implementação:** Dara @data-engineer em 2026-05-12 (modo YOLO)

> **EPIC 29 — Stories 29.2-29.8 DESBLOQUEADAS para `@sm *draft` em paralelo.**
> Próximo prefixo de migration disponível: `031` (3 dígitos, conforme `supabase/migrations/README.md`).
> Padrão `_remote_only.sql` para `CREATE INDEX CONCURRENTLY` consolidado no README — usar nas Stories 29.2-29.5.


**Executor:** `@data-engineer` | **Quality Gate:** `@architect`
**Quality Gate Tools:** `[migration_diff_audit, supabase_parity_check, naming_standard_validation]`
**Complexidade:** M (2h) | **Story points:** 3 | **Prioridade:** P0 (BLOQUEANTE para 29.2-29.7)
**Dependências:** nenhuma (primeira do epic)
**Bloqueia:** 29.2, 29.3, 29.4, 29.5, 29.6, 29.7

**Resumo do executado (versão final — substitui plano original):**

1. **Spike de paridade via Management API** (não `supabase db diff` — Docker indisponível): confirmou que remote registra apenas até v027 com `name=NULL`, e que migrations 028/029/030 foram aplicadas via Studio mas não rastreadas. Confirmou também que SQL real de v024/v025 no remote = `021_phone_normalization_part1/2`.
2. **Renomes locais**:
   - `024_mensagens_sender_display_name.sql` → `024b_mensagens_sender_display_name.sql`
   - `028_fix_v_mensagens_admin_grant.sql` → `028a_fix_v_mensagens_admin_grant.sql`
   - `028_meta_campaign_actions.sql` → `028b_meta_campaign_actions.sql`
   - `029_cliente_id_obra_mensagens.sql` → `029a_cliente_id_obra_mensagens.sql`
   - `029_privacy_acceptance.sql` → `029b_privacy_acceptance.sql`
3. **Stubs vazios deletados e substituídos por arquivos populados com SQL real:**
   - `024_remote_only.sql` → DELETADO
   - `025_remote_only.sql` → DELETADO
   - `024_phone_normalization_part1_remote_only.sql` (NOVO — conteúdo idêntico ao 021_phone_normalization_part1.sql)
   - `025_phone_normalization_part2_remote_only.sql` (NOVO — conteúdo idêntico ao 021_phone_normalization_part2.sql)
4. **Anotação de drift** adicionada no header de `021_phone_normalization_part1.sql` e `_part2.sql` (não renomeados — esses arquivos permanecem como artefato histórico).
5. **Tracking remote reconciliado via transação** no `supabase_migrations.schema_migrations`:
   - `UPDATE` v027 `SET name='property_id_obras'` (era NULL)
   - `INSERT` 6 novos rows: `024b`, `028a`, `028b`, `029a`, `029b`, `030` com SQL completo no campo `statements`
   - **Resultado final: 33 rows, todas com `name NOT NULL`**.
6. **Convenção formalizada** em `supabase/migrations/README.md`:
   - **3 dígitos** (NÃO 4 — alteração da decisão original, porque 4 dígitos quebra ordenação com as 33 migrations existentes).
   - **Sufixo letra `a`/`b`/`c`** para conflitos de mesmo número (suportado pela ordenação lexicográfica do CLI).
   - Regra: nunca aplicar via Studio sem migration local commitada.
   - Padrão de ghost migration `_remote_only.sql` para SQL aplicado via Studio (ex.: `CREATE INDEX CONCURRENTLY`).
7. **Próximas migrations do Epic 29 começam em `031_*`** (atualizado em PERFORMANCE-PLAN seção 5).

**Pré-requisitos para Stories 29.2-29.7 começarem:** ATENDIDOS. Story file: `docs/stories/active/29-1-reconciliar-migrations-duplicadas.md`.

**Risco realizado:** BAIXO. Toda operação remote executada em transação multi-statement via Management API, com `SELECT` de validação no final do payload. Nenhuma migration já aplicada foi renomeada.

**Rollback (não usado):** `DELETE FROM supabase_migrations.schema_migrations WHERE version IN ('024b','028a','028b','029a','029b','030'); UPDATE ... SET name=NULL WHERE version='027';` + reverter renomes via `git revert`.

---

### Story 29.2 — Migration `031_fk_indexes_critical.sql` (~20 índices FK ausentes)

**Status: IMPLEMENTAÇÃO DONE em 2026-05-13 — aguardando `@architect *qa-gate 29.2`**
**Implementação:** Dara @data-engineer em 2026-05-13 (modo YOLO)
**Arquivo migration:** `supabase/migrations/031_fk_indexes_critical_remote_only.sql`
**Story file:** `docs/stories/active/29-2-fk-indexes-criticos.md` (Change Log V1.1)
**Resultado:**
- **26 índices criados** (não 29 — spike removeu 3 por colunas inexistentes no remote: `conversation_state.lead_id`, `visit_feedback.appointment_id`, `visit_feedback.org_id`)
- Aplicação via **Supabase Management API** (single-statement por POST — funciona com CONCURRENTLY já que cada chamada sai da transação)
- Wall-clock: 21:55Z → 21:58:23Z ≈ **~49s**
- Todos `indisvalid=true`, `indisready=true`
- Tracking: `supabase_migrations.schema_migrations` com `version='031'`, `name='fk_indexes_critical_remote_only'`, `array_length(statements,1)=26`
- Build: `pnpm --filter @trifold/web build` exit code 0
- EXPLAIN ANALYZE: `idx_system_events_resolved_by` já escolhido pelo planner. Tabelas <30 rows (conversation_state, obra_mensagens) continuam Seq Scan — comportamento correto, índices acionarão automaticamente conforme tabelas crescem
- Zero downtime observado

**Executor sugerido:** `@data-engineer` | **Quality Gate sugerido:** `@architect`
**Quality Gate Tools:** `[concurrent_index_validation, idempotency_check, rollback_review, explain_analyze_proof]`
**Complexidade:** M (2h) | **Story points:** 5 | **Prioridade:** P0
**Dependências:** **29.1 (BLOQUEANTE)**

**Descrição:** Criar ~20 índices em FKs hot que hoje não têm índice (Supabase NÃO cria FK index automático). Aplicação via Supabase Studio SQL Editor + ghost migration `031_fk_indexes_critical_remote_only.sql`.

**Índices (lista completa do `performance-database-audit.md`):**

```sql
-- conversation_state
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversation_state_lead
  ON conversation_state(lead_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversation_state_property
  ON conversation_state(current_property_id);

-- leads
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_property_interest
  ON leads(property_interest_id) WHERE property_interest_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_utm_campaign
  ON leads(org_id, utm_campaign) WHERE utm_campaign IS NOT NULL;

-- appointments
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_property
  ON appointments(property_id);

-- unit_sales, units
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_unit_sales_lead ON unit_sales(lead_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_unit_sales_broker ON unit_sales(broker_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_units_reserved_lead
  ON units(reserved_by_lead_id) WHERE reserved_by_lead_id IS NOT NULL;

-- lead_property_interest
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_property_interest_lead
  ON lead_property_interest(lead_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_property_interest_property
  ON lead_property_interest(property_id);

-- visit_feedback (5 FKs sem índice)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visit_feedback_lead ON visit_feedback(lead_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visit_feedback_property ON visit_feedback(property_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visit_feedback_appointment ON visit_feedback(appointment_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visit_feedback_broker ON visit_feedback(broker_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visit_feedback_org ON visit_feedback(org_id);

-- broker_assignments
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_broker_assignments_property
  ON broker_assignments(property_id);

-- obra_mensagens, obra_fotos, obra_documentos
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_obra_mensagens_sender ON obra_mensagens(sender_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_obra_mensagens_cliente ON obra_mensagens(cliente_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_obra_fotos_fase ON obra_fotos(fase_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_obra_fotos_uploaded_by ON obra_fotos(uploaded_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_obra_documentos_uploaded_by ON obra_documentos(uploaded_by);

-- follow_up_log
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_log_org ON follow_up_log(org_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_log_rule ON follow_up_log(rule_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_log_lead_type_created
  ON follow_up_log(lead_id, type, created_at DESC);

-- email_logs, email_blasts, email_automations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_logs_template ON email_logs(template_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_logs_org_status_sent
  ON email_logs(org_id, status, sent_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_blasts_template ON email_blasts(template_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_automations_template ON email_automations(template_id);

-- system_events
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_events_resolved_by
  ON system_events(resolved_by) WHERE resolved_by IS NOT NULL;
```

**Validação obrigatória pós-aplicação:**
- `EXPLAIN ANALYZE SELECT * FROM messages m JOIN conversations c ON c.id = m.conversation_id JOIN leads l ON l.id = c.lead_id WHERE l.assigned_broker_id = $1 LIMIT 100;` → DEVE mostrar index scan em vez de seq scan.
- `\d obra_mensagens` no Studio → confirmar índices criados.

**Risco:** BAIXO. `CONCURRENTLY` + `IF NOT EXISTS` torna seguro. Overhead estimado: +5-10% em writes (leads, messages) — aceitável.

---

### Story 29.3 — Migration `032_composite_indexes_hot_remote_only.sql` (índices compostos) — **DONE (2026-05-14)**

**Executor sugerido:** `@data-engineer` | **Quality Gate sugerido:** `@architect`
**Complexidade:** M (2h) | **Story points:** 5 | **Prioridade:** P0
**Dependências:** **29.1 (BLOQUEANTE)** — atendido
**Status:** 9 índices compostos aplicados via Management API single-statement em 16s wall-clock (2026-05-14 12:18:17→12:18:33 UTC). Todos com `indisvalid=true, indisready=true`. Tracking version 032 registrado com 9 statements. EXPLAIN ANALYZE Query B (leads): Seq Scan + top-N heapsort → Index Scan `idx_leads_org_active_updated` (Sort eliminado; custo Limit 18.74..18.86 → 1.16..5.79). Query A (messages): planner mantém índice simples para tabela ~300 rows (comportamento esperado, precedente 29.2 — composto disponível para crescimento). Análise de redundância: os 10 índices simples existentes (`idx_messages_conversation`, `idx_conversations_lead`, `idx_conversations_org`, etc.) foram MANTIDOS como complementares — servem queries sem ORDER BY. system_events compostos novos têm `org_id` como PRIMEIRO campo, superior aos existentes (`idx_system_events_category`, `idx_system_events_level`) para queries multi-tenant. Build PASS após pnpm install (next-themes faltava do Epic 30 — não relacionado). File: `supabase/migrations/032_composite_indexes_hot_remote_only.sql`.

**Descrição:** Índices compostos para queries hot que hoje usam índice simples + sort em memória.

```sql
-- messages: composto (conversation_id, created_at DESC) — usado em quase TODA query
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conv_created
  ON messages(conversation_id, created_at DESC);

-- conversations: para listagens
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_org_last_msg
  ON conversations(org_id, last_message_at DESC NULLS LAST);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_lead_last_msg
  ON conversations(lead_id, last_message_at DESC NULLS LAST);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_active_last_msg
  ON conversations(last_message_at DESC) WHERE is_ai_active = true;

-- leads: composto para listagem do dashboard
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_org_active_updated
  ON leads(org_id, updated_at DESC) WHERE is_active = true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_org_stage_active
  ON leads(org_id, stage_id, is_active);

-- appointments para post-visit followup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_completed_org
  ON appointments(org_id, scheduled_at DESC) WHERE status = 'completed';

-- system_events com org_id no índice
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_events_org_level_created
  ON system_events(org_id, level, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_events_org_category_created
  ON system_events(org_id, category, created_at DESC);
```

**Validação:** mesmas técnicas da 29.2 + comparar `EXPLAIN ANALYZE` de query `/dashboard/conversas` antes/depois.

**Risco:** BAIXO.

---

### Story 29.4 — Migration `033_vector_index_knowledge_base.sql` — **DONE (2026-05-13)**

**Executor sugerido:** `@data-engineer` | **Quality Gate sugerido:** `@architect`
**Complexidade:** P (1h) | **Story points:** 3 | **Prioridade:** P0
**Dependências:** **29.1 (BLOQUEANTE)** — atendido
**Status:** Migration 033 aplicada via Management API. 2 índices criados em 2s cada. `lists=10` calibrado (sqrt(33)≈5.7, piso 10). EXPLAIN ANALYZE: 9.989ms → 0.224ms (~45x). IVFFlat funcional validado em modo forçado (0.208ms). Tracking 033 registrado. Build PASS. Smoke RAG runtime pendente Gabriel.

**Descrição:** Criar vector index IVFFlat em `knowledge_base.embedding` (vector(1536)). Atualmente toda chamada RAG faz sequential scan + distance calc.

```sql
-- Vector index principal (IVFFlat com lists proporcional a sqrt(N rows))
-- AJUSTAR `lists` conforme volume real ANTES de aplicar:
-- - 100 rows: lists = 10
-- - 1k rows: lists = 32
-- - 10k rows: lists = 100
-- - 100k rows: lists = 316

CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding
  ON knowledge_base USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- Índice auxiliar para filtro is_active antes do vector match
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_base_org_active
  ON knowledge_base(org_id) WHERE is_active = true;
```

**Pré-requisito:** rodar `SELECT count(*) FROM knowledge_base WHERE is_active = true;` ANTES da aplicação e ajustar `lists` proporcional a `sqrt(N)`.

**Nota:** `CREATE INDEX ... USING ivfflat` **NÃO suporta CONCURRENTLY** em pgvector — esse índice precisa de lock exclusivo. Para minimizar impacto, executar em janela de baixo tráfego (ou madrugada).

**Validação:** chamar `match_knowledge` RPC e medir tempo de resposta antes/depois. Esperado: 1-3s → 50-100ms.

**Risco:** MÉDIO. Lock exclusivo durante criação. Janela de baixo tráfego obrigatória.

---

### Story 29.5 — Migration `034_partial_indexes_queues.sql`

**Status: DONE (InReview pendente QA gate) — implementada por @data-engineer em 2026-05-14**
**Story file:** `docs/stories/active/29-5-partial-indexes-queues.md`
**Spike executado:** 7 colunas confirmadas, 4 partials novos (nenhum conflito), slot 034 livre.

**Resultados (2026-05-14):**
- 4 índices criados via Management API single-statement (pattern Stories 29.2/29.4)
- Tracking version 034 registrado em `supabase_migrations.schema_migrations`
- Todos `indisvalid=true` + `indisready=true`
- Planner JÁ usa os 4 partials (mesmo com volume baixo). Ganho mais expressivo: `follow_up_log` query **9x mais rápida** (6.889ms → 0.770ms) porque o partial em `(scheduled_at) WHERE status='pending'` eliminou o Sort externo
- Build `pnpm --filter @trifold/web build` PASS exit 0
- **Próximo:** `@architect *qa-gate 29.5`

**Executor sugerido:** `@data-engineer` | **Quality Gate sugerido:** `@architect`
**Complexidade:** XS (30 min) | **Story points:** 2 | **Prioridade:** P1
**Dependências:** **29.1 (BLOQUEANTE)**

**Descrição:** Partial indexes em colunas de status para queues — índices muito menores e rápidos que índice simples sobre toda a tabela.

```sql
-- email_sends_queue
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_sends_queue_pending_scheduled
  ON email_sends_queue(scheduled_for) WHERE status = 'pending';

-- follow_up_log pending
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_log_pending
  ON follow_up_log(scheduled_at) WHERE status = 'pending';

-- webhook_logs
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_logs_unprocessed
  ON webhook_logs(created_at DESC) WHERE processed = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_logs_leadgen
  ON webhook_logs(leadgen_id) WHERE leadgen_id IS NOT NULL;
```

**Risco:** BAIXO.

---

### Story 29.6 — Migration `035_materialize_meta_campaign_roas.sql`

**Executor sugerido:** `@data-engineer` | **Quality Gate sugerido:** `@architect`
**Quality Gate Tools:** `[migration_review, view_diff_audit, downtime_window_validation]`
**Complexidade:** M (3h) | **Story points:** 5 | **Prioridade:** P0
**Dependências:** **29.1 (BLOQUEANTE)**, executa idealmente após 29.2 (índices em leads/unit_sales que a view consome).

**Descrição:** Transformar `meta_campaign_roas` de VIEW simples para MATERIALIZED VIEW com refresh automático.

```sql
-- DROP a view existente
DROP VIEW IF EXISTS meta_campaign_roas CASCADE;

-- CREATE materialized version
CREATE MATERIALIZED VIEW meta_campaign_roas AS
  -- (copiar exatamente a query da migration 016_meta_campaign_roas_view.sql)
  WITH ... -- 3 CTEs existentes
WITH DATA;

-- UNIQUE index para REFRESH CONCURRENTLY (sem lock)
CREATE UNIQUE INDEX idx_meta_campaign_roas_pk
  ON meta_campaign_roas(org_id, meta_campaign_id);

-- Refresh inicial (já incluso no WITH DATA acima)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY meta_campaign_roas; -- usar apenas em refreshes subsequentes
```

**Atualizar rotas que consomem (auditar):**
- `/api/meta-ads/campaigns/[campaign_id]/route.ts`
- `/dashboard/campaigns/meta/page.tsx` (se SELECT direto da view)
- Qualquer outra consumidora — `grep -rn "meta_campaign_roas" packages/web/src`

**Janela de baixo tráfego:** durante o DROP VIEW + CREATE MATERIALIZED VIEW (estimado <30s + 1-2 min para o refresh inicial), a feature de ROAS no dashboard ficará indisponível ou retornará dados parciais. Coordenar com PO antes do push.

**Refresh strategy:** Story 29.7 vai agendar `REFRESH MATERIALIZED VIEW CONCURRENTLY meta_campaign_roas` a cada 30 min via pg_cron. Trade-off: dados ficam até 30 min defasados, mas dashboard fica 50× mais rápido.

**Risco:** MÉDIO. Downtime curto. Rollback: `DROP MATERIALIZED VIEW meta_campaign_roas; CREATE VIEW meta_campaign_roas AS ...` (recriar a view original).

---

### Story 29.7 — Migration `036_pg_cron_cleanup_jobs.sql`

**Executor sugerido:** `@data-engineer` | **Quality Gate sugerido:** `@architect`
**Complexidade:** M (2h) | **Story points:** 3 | **Prioridade:** P0
**Dependências:** 29.1; 29.6 (refresh ROAS depende da MV existir)

**Descrição:** Ativar pg_cron extension + agendar 5 jobs de cleanup + refresh ROAS.

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- system_events: 30 dias
SELECT cron.schedule(
  'cleanup-system-events',
  '0 3 * * *',
  $$ DELETE FROM system_events WHERE created_at < now() - interval '30 days' $$
);

-- webhook_logs: 90 dias para processed=true
SELECT cron.schedule(
  'cleanup-webhook-logs',
  '0 4 * * *',
  $$ DELETE FROM webhook_logs WHERE processed = true AND created_at < now() - interval '90 days' $$
);

-- follow_up_log: 180 dias
SELECT cron.schedule(
  'cleanup-followup-log',
  '0 4 * * 0',
  $$ DELETE FROM follow_up_log WHERE created_at < now() - interval '180 days' $$
);

-- email_logs: 365 dias
SELECT cron.schedule(
  'cleanup-email-logs',
  '0 5 * * 0',
  $$ DELETE FROM email_logs WHERE created_at < now() - interval '365 days' $$
);

-- Refresh ROAS view a cada 30 min
SELECT cron.schedule(
  'refresh-meta-campaign-roas',
  '*/30 * * * *',
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY meta_campaign_roas $$
);
```

**Validação:**
- `SELECT * FROM cron.job;` → confirmar 5 jobs ativos.
- 24h após aplicação: verificar tamanho de `system_events` cai (DELETE rodou).

**Risco:** BAIXO. pg_cron é mantido pelo Supabase; rollback = `SELECT cron.unschedule('job-name');`.

---

### Story 29.8 — Connection pooler explícito no Vercel

**Executor sugerido:** `@devops` | **Quality Gate sugerido:** `@architect`
**Complexidade:** P (1h) | **Story points:** 2 | **Prioridade:** P1
**Dependências:** **nenhuma** — paralelizável com qualquer outra story do epic

**Descrição:** Auditar e fixar `SUPABASE_URL` no Vercel para apontar para pooler porta `6543` (transaction mode). Manter `DATABASE_URL` direct (5432) só para migrations.

**Por quê:** Vercel functions são serverless — cada cold start abre nova conexão. Sem pooler, em alta concorrência o pool Postgres se esgota.

**Plano:**
1. Verificar valor atual de `SUPABASE_URL` no Vercel Project Settings → Environment Variables.
2. Se estiver em `:5432` → mudar para `:6543` (transaction mode).
3. Validar via deploy preview que rotas API continuam funcionando.
4. Re-deploy production.

**Risco:** BAIXO. Pooler é o padrão recomendado pela Supabase para Vercel.

---

## Out of Scope (explícito)

- **Particionamento de `system_events`, `messages`, `obra_mensagens`, `webhook_logs`** → Epic 34 (34.4, 34.5, 34.6) — exige downtime maior.
- **Denormalização de `messages.org_id`** → Epic 33 (33.4) — exige backfill + trigger.
- **Refator do cron `/api/cron/followup`** (800 → 15 queries) → Epic 33 (33.1).
- **RLS policy refactor** (substituir EXISTS aninhado por org_id direto) → Epic 33 (33.5).
- **Materialização de outras views** → caso a caso, conforme necessidade.
- **Adicionar Speed Insights / RUM** → Epic 27 (diferido).

## Riscos do Epic

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Lock exclusivo em tabela hot durante CREATE INDEX | Média | Alta | `CONCURRENTLY` obrigatório (AC global B3). Validar via `pg_locks` em janela de teste. |
| Drift local↔remote em Supabase Studio | Alta | Média | Story 29.1 reconcilia ANTES de qualquer outra mudança. |
| Conflito com Lucas se push migration durante epic | Média | Baixa | Comunicação antecipada via Slack/equivalente. Usar sufixos `031a_*` se necessário. |
| Vector index com `lists` mal calibrado | Baixa | Média | Story 29.4 mede `count(*)` antes; reindex futuro se volume crescer. |
| Refresh ROAS demorar mais que 30 min (ciclo se sobreporia) | Baixa | Média | Validar tempo de refresh inicial em 29.6. Ajustar schedule se necessário. |
| pg_cron jobs falhando silenciosamente | Baixa | Média | Validar `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;` semanalmente. |
| Materialized view com stale data confundindo gestores | Média | Baixa | Documentar TTL de 30 min na UI do dashboard ROAS (label "atualizado há X min"). |

## Dependencies

- **Bloqueia:** Epic 30 (Over-fetch killers — queries refatoradas se beneficiam dos índices criados aqui), Epic 33 (Backend heavy — followup cron usa índices criados).
- **Bloqueado por:** Nenhum.
- **Paralelizável com:** Story 28 restantes (já complete), Epic 25/26 do Lucas (escopo disjunto — auth/obras vs DB).

## Definition of Done do Epic

- [ ] 7 migrations aplicadas no remote: `030a_reconcile_migrations`, `031_fk_indexes_critical`, `032_composite_indexes_hot`, `033_vector_index_knowledge_base`, `034_partial_indexes_queues`, `035_materialize_meta_campaign_roas`, `036_pg_cron_cleanup_jobs`.
- [ ] pg_cron ativo com 5 jobs agendados — validável via `SELECT * FROM cron.job;`.
- [ ] Materialized view `meta_campaign_roas` com refresh automático a cada 30 min.
- [x] `SUPABASE_URL` no Vercel apontando para pooler 6543. **(Story 29.8 done 2026-05-13 — escopo real foi separação private/public var, não mudança de porta TCP. SDK Supabase usa HTTP REST 443, não TCP 6543. `SUPABASE_URL` adicionado em Production+Preview+Development; `NEXT_PUBLIC_SUPABASE_URL` corrigido (estava vazio). Pending @architect qa-gate.)**
- [ ] QA gate de pelo menos 3 stories críticas (29.2, 29.3, 29.6) PASS com `EXPLAIN ANALYZE` antes/depois comparado.
- [ ] Dashboard ROAS abre em <500ms (medível em DevTools Network).
- [ ] RAG search em <100ms.
- [ ] `supabase migration list` mostra paridade local↔remote.
- [ ] Zero downtime observado em produção durante os pushes.

## Próximos Passos (sequência ótima de execução)

**Estado atual (2026-05-12):** Story 29.1 PASS pelo @architect. Stories 29.2-29.8 DESBLOQUEADAS.

```
[DONE] 1. @sm *draft 29.1            ← BLOQUEANTE — concluída
[DONE] 2. @architect *qa-gate 29.1   ← PASS (gate file: docs/qa/gates/29-1-architect-gate.md)
[NEXT] 3. @devops *push 29.1
─── Após 29.1 Status=Done (já está) ───
4. PARALELIZAR AGORA (fan-out de uma única wave):
   - @sm *draft 29.2 (FK indexes)        ← migration 031_*
   - @sm *draft 29.3 (compostos)         ← migration 032_*
   - @sm *draft 29.4 (vector)            ← migration 033_*
   - @sm *draft 29.5 (partials)          ← migration 034_*
   - @sm *draft 29.8 (pooler — independente)
5. @data-engineer *develop em paralelo (arquivos disjuntos)
6. @architect *qa-gate em paralelo
7. @devops *push em sequência (semantic commits separados)
─── Após 29.2-29.5 Status=Done ───
8. @sm *draft 29.6 (materialize ROAS — precisa de janela) ← migration 035_*
9. @sm *draft 29.7 (pg_cron — depende de 29.6)            ← migration 036_*
10. Sequência final: 29.6 → 29.7
```

**Tempo total estimado:** 5 dias úteis se 29.2-29.5 paralelizarem; 8-10 dias se sequencial.
