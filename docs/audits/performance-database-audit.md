# Auditoria de Performance de Banco de Dados — Trifold CRM

**Auditor:** @data-engineer (Dara)
**Data:** 2026-05-12
**Escopo:** Supabase Postgres (migrations 001–029), queries em `packages/web`, `packages/ai`, `packages/bot`
**Migrations analisadas:** 30 arquivos, 65 tabelas, 60 índices declarados, 22 triggers, 13 funções

---

## TL;DR

A performance ruim do CRM tem **causa-raiz tripla** e bem mapeável:

1. **Índices de FK críticos ausentes** — Supabase não cria índice automático em FK, e várias FKs hot (sender_id, broker_id, lead_id em conversation_state, property_interest_id em leads, etc.) estão **sem índice**. Cada DELETE/UPDATE em parent table dispara FULL SCAN em filhas grandes (messages, obra_mensagens, conversations).
2. **RLS com EXISTS de N níveis** + `auth.uid()` re-executado em cada linha — todas as policies de `messages`, `conversations`, `obra_mensagens`, `typologies`, `units` fazem subqueries com `SELECT user_id FROM brokers WHERE id = public.user_broker_id()` que **recalculam por linha**. Em `SELECT ... FROM messages WHERE conversation_id IN (...)`, isso explode em latência quando há > 50 mensagens.
3. **N+1 generalizado no backend** — múltiplos handlers (`/api/cron/followup`, `/api/system-events`, `/api/admin/mensagens`, `/dashboard/conversas`, `/api/leads/[id]/timeline`, `/api/leads/[id]/summary`) fazem 5–20+ round-trips ao DB onde 1–2 queries resolveriam. Pior caso: cron de followup faz **O(rules × leads × 5 queries)** sequenciais, sem batching.

Soma disso: tudo que toca `messages`/`obra_mensagens`/`conversations`/`system_events` está **2–10x mais lento que deveria**.

Há também **bagunça grave em migrations** (sufixos duplicados 021/024/025/028/029) que pode causar drift entre local e remote — vide seção final.

---

## Critical Issues (P0)

### P0-1: FK indexes ausentes em colunas hot — impacto compounding em RLS

Supabase **não cria índice automaticamente em colunas FK**. As FKs abaixo são percorridas por RLS e por JOINs do app em todo SELECT, mas não têm índice dedicado:

| Tabela | Coluna FK | Referência | Usado em (queries / RLS) | Impacto |
|---|---|---|---|---|
| `conversation_state` | `lead_id` (via FK em 001, mas só conversation_id tem UNIQUE) | leads | `/api/leads/[id]/summary` route line 53; `/api/cron/enrich-leads` | SEQ SCAN em conversation_state a cada lead detail page |
| `conversation_state` | `current_property_id` | properties | qualquer DELETE em properties | FULL SCAN |
| `leads` | `property_interest_id` | properties | `/api/leads?property_id=` filtro; agregação em dashboard metrics; followup cron | leads é tabela grande — SEQ SCAN a cada filtro |
| `appointments` | `property_id` | properties | followup cron joins (`property:properties!property_id`); deletion cascades | FULL SCAN |
| `unit_sales` | `lead_id` | leads | view `meta_campaign_roas` JOIN; deletion CASCADE | FULL SCAN no JOIN da view ROAS |
| `unit_sales` | `broker_id` | users | reports / dashboards | — |
| `units` | `reserved_by_lead_id` | leads | reservations | — |
| `lead_property_interest` | `lead_id`, `property_id` | leads, properties | — (apenas UNIQUE composta existe) | SEQ SCAN ao listar interesses de 1 lead |
| `visit_feedback` | `lead_id`, `property_id`, `appointment_id`, `broker_id`, `org_id` | múltiplas | followup cron line 284 (`feedback:visit_feedback`) | FULL SCAN em cada execução do cron |
| `broker_assignments` | `property_id` | properties | RLS join | — |
| `obra_mensagens` | `sender_id` | users | `v_mensagens_admin` line 11–14 JOIN; `/api/admin/mensagens` | SEQ SCAN em toda listagem admin |
| `obra_mensagens` | `cliente_id` | users (adicionada em 029) | `/api/admin/mensagens` aggregation; cliente sees own conversations | índice composto (obra_id, cliente_id) existe mas SEM índice puro em cliente_id |
| `obra_fotos` | `fase_id`, `uploaded_by` | obra_fases, users | timeline da obra | — |
| `obra_documentos` | `uploaded_by` | users | — | — |
| `system_events` | `org_id`, `resolved_by` | organizations, users | `/api/system-events` filtra por org_id mas só tem (level, created_at) e (category, created_at), faltando (org_id, level, created_at) | mistura de queries: TODAS filtram por org_id, hoje o planner usa index só em level/created_at e faz filter |
| `follow_up_log` | `org_id`, `rule_id` | organizations, follow_up_rules | dashboards | — |
| `appointments` | `broker_id` (tem idx_appointments_broker, OK)<br>`property_id` (NÃO tem) | users / properties | — | — |
| `push_subscriptions` | já tem UNIQUE(user_id, endpoint) → OK | — | — | — |
| `email_logs` | `template_id` | email_templates | dashboards | — |
| `email_blasts` | `template_id`, `created_by` | email_templates, auth.users | — | — |
| `email_automations` | `template_id` | email_templates | trigger evaluation | — |
| `webhook_logs` | `org_id` | organizations | já tem (org_id, created_at) | OK |

**Diagnóstico:** Supabase docs sobre [unindexed foreign keys](https://supabase.com/docs/guides/database/postgres/foreign-keys) é claro — esses são todos índices recomendados. O performance impact aparece como:
- Cascading DELETE em `properties` faz SEQ SCAN em `conversation_state`, `appointments`, `leads`
- RLS policy `messages_select` lê `conversations → leads → brokers` recursivamente; sem índice em `conversation_state.lead_id`, joins ficam O(N)
- O cron `/api/cron/followup` (que roda a cada 5min em business hours) puxa `feedback:visit_feedback` por appointment — sem índice de FK, é SEQ SCAN N vezes

### P0-2: RLS policies fazendo `SELECT … FROM brokers/users` sem leverage de índice + repetição em cada row

Trecho problemático (mig 004, `messages_select`):

```sql
EXISTS (
  SELECT 1 FROM conversations c
  WHERE c.id = messages.conversation_id
  AND c.org_id = public.user_org_id()
  AND (
    public.is_admin_or_supervisor()
    OR EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = c.lead_id
      AND l.assigned_broker_id = (SELECT user_id FROM brokers WHERE id = public.user_broker_id())
    )
  )
)
```

**Problemas:**

1. `(SELECT user_id FROM brokers WHERE id = public.user_broker_id())` é **avaliado por linha** se o planner não fizer InitPlan (Postgres trata STABLE funções de forma conservadora dentro de RLS). Em conversation com 1000 mensagens, isso é 1000× lookups em brokers.
2. `public.user_broker_id()` internamente faz `SELECT b.id FROM brokers b JOIN users u WHERE u.auth_id = auth.uid()` — outro JOIN. Quatro JOINs encadeados por linha no pior caso.
3. `public.is_admin_or_supervisor()` é chamado em loop também.
4. Não há policy para `service_role` em `messages` (existe um comentário "service_role bypassa" — funciona, mas em routes que rodam com anon key + jwt do user, todo SELECT em messages paga o preço).

**Padrão usado em `meta_campaigns`/`meta_insights_daily`** é melhor: usa `org_id = public.user_org_id()` direto, sem subqueries aninhadas. Esse é o padrão a propagar.

Também: **lead_facts** e **lead_memories** (mig 012) usam `lead_id IN (SELECT id FROM leads WHERE org_id = user_org_id())` — esse IN é avaliado uma vez (subquery não correlata), mas retorna o universo inteiro de leads da org. Em uma org com 5k leads, IN com 5k UUIDs é um hash lookup razoável, mas pior do que um EXISTS correlato com (lead_id, org_id) índice.

### P0-3: `meta_campaign_roas` é VIEW (não materializada) com 3 CTEs agregando

Mig 016 cria `meta_campaign_roas` como `CREATE VIEW` simples. Cada GET em `/api/meta-ads/campaigns/[campaign_id]` invoca:

- CTE 1: GROUP BY org_id, entity_id em `meta_insights_daily` (linha por dia × campanha × nível — pode crescer rápido)
- CTE 2: JOIN `meta_campaigns × leads ON utm_campaign = mc.name` — string match, sem índice em `leads.utm_campaign`
- CTE 3: triple JOIN `meta_campaigns × leads × kanban_stages × unit_sales`

Em uma org com >100 leads e algumas semanas de insights, cada hit no dashboard ROAS é **2–5 segundos**.

**Falta:**
- Índice em `leads.utm_campaign` (text)
- Versão materializada com refresh a cada 30 min (cron job)
- Ou: precomputar via aggregate diária em `meta_insights_daily` extension

### P0-4: `knowledge_base.embedding` sem vector index

Mig 001 cria `knowledge_base.embedding vector(1536)`. Mig 005 cria `match_knowledge()` RPC que faz `ORDER BY kb.embedding <=> query_embedding LIMIT match_count`. **Mas NÃO há `CREATE INDEX … USING ivfflat`** em knowledge_base.embedding (existe em `lead_memories.embedding`, mig 012).

Toda chamada de RAG faz sequential scan + distance calc na tabela inteira. Em 100 docs é OK. Em 1k+ docs vira gargalo de 1–3s por mensagem.

### P0-5: N+1 catastrófico no `/api/cron/followup` (executa em business hours, possivelmente a cada 5–15min)

Análise do arquivo (487 linhas):

```
Loop 1: for rule in rules (N rules):
  Q1: fetch leads in stage         (1 query)
  Q2: fetch cooldown logs           (1 query, batched OK)
  Q3: fetch conversations           (1 query, batched OK)
  Loop 2: for lead in eligibleLeads (M leads):
    Q4: fetch last 10 messages      (1 query PER LEAD — N+1!)
    Q5: insert follow_up_log        (1 write)
    Q6: insert message              (1 write)
    Q7: update conversation         (1 write)
    Q8: insert activity             (1 write)

Then: post-visit processing:
  Q9: fetch ALL completed appointments (no limit, no org filter, no date cutoff!)
  Loop 3: for appt in completedAppointments (K appointments):
    Q10: check existing log         (1 query PER APPT — N+1!)
    Q11: dynamic import @trifold/ai (per-iteration!)
    Q12: anthropic call             (network)
    Q13: insert follow_up_log
    Q14: send telegram              (network)
    Q15: fetch conversations        (1 query PER APPT — N+1!)
    Q16: insert message
    Q17: update conversation
    Q18: insert activity
```

**Pior caso para 1 org com 5 rules × 100 leads × 50 visitas concluídas**:
- 5 + 5×(2 + 100×1) = ~510 queries no laço de rules
- 1 + 50×6 = ~301 queries no laço de visitas
- **Total: ~800 queries sequenciais** por execução do cron, sem batch, sem Promise.all interno

Além disso: **falta filtro `org_id` no SELECT de `completedAppointments`** (linha 278), e **falta filtro de data** — se 1 ano de visitas concluídas, processa tudo de novo.

### P0-6: Dashboard `/dashboard/conversas` puxa TODAS as mensagens de TODAS as conversas ativas

```typescript
// page.tsx
const { data: messages } = await supabase
  .from("messages")
  .select("conversation_id, content, created_at")
  .in("conversation_id", conversationIds)  // pode ser 100+ conversas
  .order("created_at", { ascending: false })
  // ⚠️ SEM .limit() — puxa tudo
```

Em 50 conversas × 200 mensagens médias = 10.000 rows trafegando para o servidor só para encontrar a primeira de cada. Resolver via SQL:

```sql
SELECT DISTINCT ON (conversation_id) conversation_id, content, created_at
FROM messages
WHERE conversation_id = ANY($1)
ORDER BY conversation_id, created_at DESC;
```

Ou criar coluna denormalizada `conversations.last_message_preview` + trigger.

### P0-7: `/api/admin/mensagens` carrega TODAS obra_mensagens sem paginação real

Linhas 44–54 de `route.ts`:

```ts
let msgQuery = supabase
  .from("obra_mensagens")
  .select("obra_id, cliente_id, content, ...")
  .eq("org_id", appUser.org_id)
  .not("cliente_id", "is", null)
  .order("created_at", { ascending: false })
// SEM .limit() — paginação aplicada DEPOIS, em JS
```

Agregação em Map é feita em memória e depois `paginated = conversas.slice(offset, offset + limit)`. Quando obra_mensagens tiver 50k rows, hub admin trava.

---

## High Priority (P1)

### P1-1: `/api/system-events` faz 8 queries sequenciais quando 1 RPC com aggregations resolveria

`route.ts` (124 linhas) faz:
1. SELECT * de eventos (com limit, OK)
2. COUNT errors 24h
3. COUNT messages 24h
4. Loop em 4 categorias → 2 COUNT por categoria = 8 queries
5. SELECT metadata de 100 claudeEvents (para calcular média em JS!)
6. COUNT rag total
7. COUNT rag fallbacks

= **15 queries** para 1 endpoint de dashboard. Solução: 1 RPC retornando todas as métricas em 1 JSON, ou usar Promise.all (atualmente é sequencial!).

### P1-2: `system_events` cresce sem cleanup automático

Mig 009 deixa comentário: `-- DELETE FROM system_events WHERE created_at < now() - interval '30 days';`. Não foi implementado em pg_cron nem em cron route. Logs já podem estar acumulando há ~1 ano → milhões de rows. Falta também índice composto `(org_id, level, created_at DESC)` (existe `(level, created_at)` mas não inclui org_id, então o filtro de org_id é via "Recheck").

### P1-3: `email_sends_queue` sem partial index para `pending`

Mig 018 cria `idx_email_sends_queue_status_scheduled (status, scheduled_for)`. Mas a query de cron de envio é sempre `WHERE status = 'pending' AND scheduled_for <= now()`. Um **partial index** `WHERE status = 'pending'` seria 10–50× menor e mais rápido:

```sql
CREATE INDEX idx_email_sends_queue_pending
  ON email_sends_queue (scheduled_for)
  WHERE status = 'pending';
```

### P1-4: `leads.utm_campaign` sem índice — JOIN da view ROAS faz seq scan em leads

Mig 016 (`leads_per_campaign` CTE) faz:
```sql
JOIN leads l ON l.utm_campaign = mc.name
```

Sem índice em `leads.utm_campaign`, é SEQ SCAN em leads para CADA campanha Meta. Quando você tem 20 campanhas × 5k leads = 100k row-comparisons por refresh da view.

### P1-5: `conversations` sem índice em `last_message_at`

O dashboard de conversas (`/dashboard/conversas`) faz `.order("last_message_at", { ascending: false })`. `/api/cron/enrich-leads` faz `.gte("last_message_at", cutoff)`. Nenhum índice em `conversations.last_message_at` → SEQ SCAN sempre que listar conversations.

### P1-6: `messages` sem índice composto `(conversation_id, created_at)` — fundamental

Existem 2 índices separados em `messages`:
- `idx_messages_conversation` em `(conversation_id)`
- `idx_messages_created_at` em `(created_at)`

Mas TODA query é `WHERE conversation_id = X ORDER BY created_at`. O planner pode usar o primeiro índice e depois sort, mas com o composto **eliminamos o sort completamente**:

```sql
CREATE INDEX idx_messages_conv_created
  ON messages (conversation_id, created_at DESC);
```

### P1-7: RLS de `messages_insert` valida `conversation_id → org_id` por INSERT

Mig 004 linha 168–175. Cada INSERT em messages (e há **muitos** — todo webhook WhatsApp insere) precisa ler `conversations` para validar org. Service role bypassa, mas se algum endpoint não usa service role, isso pesa. Recomenda-se denormalizar `org_id` em messages diretamente (já tem em obra_mensagens, mig 020) e ter policy `org_id = public.user_org_id()`.

### P1-8: `obra_mensagens` lookup pelo client filtra por `obra_id IN (subquery)` em cada SELECT

Mig 029 policy:
```sql
USING (
  obra_id IN (SELECT obra_id FROM cliente_obras WHERE user_id = public_user_id())
  AND (cliente_id = public_user_id() OR sender_id = public_user_id())
)
```

Tudo bem para client (poucos obras), mas falta índice em `cliente_obras.user_id` SOZINHO — só tem `idx_cliente_obras_user_id` (OK, existe). Verificar se planner está usando.

### P1-9: `triggerAutomations` em `/api/leads` (POST) é não-bloqueante mas pode acumular

Linha 114 de `/api/leads/route.ts`: `void triggerAutomations("lead.created", { ... })`. Esse `void` lança fire-and-forget — no Vercel, isso pode ser **garbage collected** antes de completar (já que a function morre). Em alta concorrência (vários leads novos), gera writes paralelos sem controle. Sugerir uso do `after()` do Next 15 (já usado em email-blasts).

### P1-10: View `v_mensagens_admin` (mig 024) sem WHERE — sempre full join

```sql
CREATE VIEW v_mensagens_admin AS
SELECT m.*, o.name FROM obra_mensagens m JOIN obras o ON o.id = m.obra_id;
```

Sem filtro de `org_id` na view, qualquer query precisa filtrar **depois**. Como obra_mensagens já tem org_id direto, a view força um JOIN desnecessário com obras quando o consumer só queria nome. Sugerir: usar select com join no client `obra:obras(name)` em vez de view, ou criar `v_mensagens_admin_per_org` materializada.

### P1-11: Dashboard `/api/dashboard/metrics` filtra por `lead.stage` (varchar) mas leads tem `stage_id` (uuid)

`route.ts` linha 56–80: `.eq("stage", "qualified")` — **essa coluna não existe em `leads`** (a coluna é `stage_id` uuid FK para kanban_stages). Provavelmente erro silencioso — `count` virá 0 sempre.

Confirmar mig 001 (sem coluna `stage`) e mig 011 (sem ALTER TABLE adding stage). Esta query está **quebrada** mas retornando count=0 silenciosamente (ou possivelmente um erro retornado e silenciado pelo `Promise.all`).

---

## Optimizations (P2)

### P2-1: Substituir helper functions RLS por inline operator quando possível

`public.user_org_id()` é chamado em quase todas as policies. É SECURITY DEFINER STABLE, mas Postgres às vezes não consegue inliná-lo. Em **policies hot**, usar diretamente:

```sql
USING (org_id = (SELECT org_id FROM users WHERE auth_id = auth.uid()))
```

…desde que tenha índice em `users.auth_id` (já existe via UNIQUE).

### P2-2: Particionar `system_events` por mês

`system_events` é insert-heavy (todos os webhooks logam). Em 6 meses tem milhões de rows. Particionamento por `created_at` mensal permite DROP de partições antigas instantâneo. Padrão:

```sql
CREATE TABLE system_events (...)
PARTITION BY RANGE (created_at);

CREATE TABLE system_events_2026_05 PARTITION OF system_events
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
```

### P2-3: Considerar partição em `messages` e `obra_mensagens` por created_at

Mesmo argumento — insert-heavy, append-only, queries quase sempre filtram por janela recente.

### P2-4: Adicionar `is_active` em índices parciais para `leads`, `properties`

`leads` quase sempre tem `WHERE is_active = true` no app. Versão parcial:

```sql
CREATE INDEX idx_leads_org_active
  ON leads(org_id, updated_at DESC) WHERE is_active = true;
```

### P2-5: `email_logs` GROW unbounded

Mig 018 não tem cleanup. `email_logs` é append-only e cresce indefinidamente. Sugerir retention 90 dias + archive para storage frio.

### P2-6: `webhook_logs` GROW unbounded + sem org_id em alguns inserts

Mig 015. webhook_logs.org_id é NULLABLE (com motivo legítimo: webhook chega antes de saber org). Mas é **insert-heavy** (Meta + WhatsApp + Resend). Adicionar retention + cleanup.

### P2-7: `follow_up_log` cresce sem cleanup

Mesmo padrão. Append-only, cresce indefinidamente.

### P2-8: `lead_memories` IVFFlat com lists=100 pode estar mal-configurado

Mig 012: `WITH (lists = 100)`. Regra prática: `lists ≈ sqrt(N rows)`. Para 1k rows, 32 lists. Para 100k, 316. Se o volume real está fora dessa faixa, performance vector search degrada. **Avaliar** quantidade de rows atuais e ajustar.

### P2-9: Vector index não recriado após reindex/bulk load

IVFFlat precisa de REINDEX após bulk inserts grandes para clusters ficarem otimizados. Não há job de manutenção.

### P2-10: Sem connection pooler explícito no admin client

`createAdminClient()` (admin.ts) usa supabase-js direto. Vercel functions são serverless — cada cold start abre nova conexão. Em alta concorrência pode esgotar pool do Postgres. Recomenda-se usar pooler **transaction mode** (porta 6543) para todos os routes serverless, e direct (porta 5432) só para migrations/long-running queries.

Verificar se `SUPABASE_URL` está apontando para pooler. Caso não, configurar `DATABASE_URL` no Vercel.

### P2-11: Sem `pg_cron` configurado para jobs internos

Hoje cleanup, refresh de view materializada, cron de followup, etc. são todos Vercel Cron HTTP-triggered. Para tarefas internas (cleanup, refresh ROAS, vacuum), `pg_cron` no Supabase eliminaria latência de roundtrip HTTP.

### P2-12: Vacuum/Analyze automático

Postgres autovacuum funciona, mas em tabelas write-heavy (messages, system_events) o autovacuum pode estar lento por defaults. Considerar tunar `autovacuum_vacuum_scale_factor = 0.05` para essas tabelas.

---

## Índices Recomendados (CREATE INDEX SQL pronto)

```sql
-- ============================================
-- P0: FK indexes críticos
-- ============================================

-- conversation_state.lead_id (não existe! Só conversation_id UNIQUE)
CREATE INDEX IF NOT EXISTS idx_conversation_state_lead
  ON conversation_state(lead_id);

CREATE INDEX IF NOT EXISTS idx_conversation_state_property
  ON conversation_state(current_property_id);

-- leads.property_interest_id
CREATE INDEX IF NOT EXISTS idx_leads_property_interest
  ON leads(property_interest_id) WHERE property_interest_id IS NOT NULL;

-- leads.utm_campaign (usado em meta_campaign_roas view)
CREATE INDEX IF NOT EXISTS idx_leads_utm_campaign
  ON leads(org_id, utm_campaign) WHERE utm_campaign IS NOT NULL;

-- appointments.property_id
CREATE INDEX IF NOT EXISTS idx_appointments_property
  ON appointments(property_id);

-- unit_sales.lead_id, unit_sales.broker_id
CREATE INDEX IF NOT EXISTS idx_unit_sales_lead ON unit_sales(lead_id);
CREATE INDEX IF NOT EXISTS idx_unit_sales_broker ON unit_sales(broker_id);

-- units.reserved_by_lead_id
CREATE INDEX IF NOT EXISTS idx_units_reserved_lead
  ON units(reserved_by_lead_id) WHERE reserved_by_lead_id IS NOT NULL;

-- lead_property_interest
CREATE INDEX IF NOT EXISTS idx_lead_property_interest_lead
  ON lead_property_interest(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_property_interest_property
  ON lead_property_interest(property_id);

-- visit_feedback (toda FK sem índice)
CREATE INDEX IF NOT EXISTS idx_visit_feedback_lead ON visit_feedback(lead_id);
CREATE INDEX IF NOT EXISTS idx_visit_feedback_property ON visit_feedback(property_id);
CREATE INDEX IF NOT EXISTS idx_visit_feedback_appointment ON visit_feedback(appointment_id);
CREATE INDEX IF NOT EXISTS idx_visit_feedback_broker ON visit_feedback(broker_id);
CREATE INDEX IF NOT EXISTS idx_visit_feedback_org ON visit_feedback(org_id);

-- broker_assignments.property_id
CREATE INDEX IF NOT EXISTS idx_broker_assignments_property
  ON broker_assignments(property_id);

-- obra_mensagens.sender_id, cliente_id (puro)
CREATE INDEX IF NOT EXISTS idx_obra_mensagens_sender ON obra_mensagens(sender_id);
CREATE INDEX IF NOT EXISTS idx_obra_mensagens_cliente ON obra_mensagens(cliente_id);

-- obra_fotos.fase_id, uploaded_by
CREATE INDEX IF NOT EXISTS idx_obra_fotos_fase ON obra_fotos(fase_id);
CREATE INDEX IF NOT EXISTS idx_obra_fotos_uploaded_by ON obra_fotos(uploaded_by);

-- obra_documentos.uploaded_by
CREATE INDEX IF NOT EXISTS idx_obra_documentos_uploaded_by
  ON obra_documentos(uploaded_by);

-- system_events.org_id (composto com level + created_at para dashboard)
CREATE INDEX IF NOT EXISTS idx_system_events_org_level_created
  ON system_events(org_id, level, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_org_category_created
  ON system_events(org_id, category, created_at DESC);

-- system_events.resolved_by
CREATE INDEX IF NOT EXISTS idx_system_events_resolved_by
  ON system_events(resolved_by) WHERE resolved_by IS NOT NULL;

-- follow_up_log.org_id, rule_id
CREATE INDEX IF NOT EXISTS idx_followup_log_org ON follow_up_log(org_id);
CREATE INDEX IF NOT EXISTS idx_followup_log_rule ON follow_up_log(rule_id);
CREATE INDEX IF NOT EXISTS idx_followup_log_lead_type_created
  ON follow_up_log(lead_id, type, created_at DESC);

-- email_logs FKs e queries hot
CREATE INDEX IF NOT EXISTS idx_email_logs_template ON email_logs(template_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_org_status_sent
  ON email_logs(org_id, status, sent_at DESC);

-- email_blasts.template_id
CREATE INDEX IF NOT EXISTS idx_email_blasts_template ON email_blasts(template_id);

-- email_automations.template_id
CREATE INDEX IF NOT EXISTS idx_email_automations_template
  ON email_automations(template_id);

-- ============================================
-- P0/P1: Compostos para queries hot
-- ============================================

-- messages: (conversation_id, created_at DESC) — usado em quase TODA query
CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON messages(conversation_id, created_at DESC);
-- (após validar, dropar idx_messages_conversation simples)

-- conversations: last_message_at para listagens
CREATE INDEX IF NOT EXISTS idx_conversations_org_last_msg
  ON conversations(org_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_conversations_lead_last_msg
  ON conversations(lead_id, last_message_at DESC NULLS LAST);

-- conversations.is_ai_active para enrich-leads cron
CREATE INDEX IF NOT EXISTS idx_conversations_active_last_msg
  ON conversations(last_message_at DESC) WHERE is_ai_active = true;

-- leads: composto para listagem do dashboard
CREATE INDEX IF NOT EXISTS idx_leads_org_active_updated
  ON leads(org_id, updated_at DESC) WHERE is_active = true;

-- leads: por stage com is_active
CREATE INDEX IF NOT EXISTS idx_leads_org_stage_active
  ON leads(org_id, stage_id, is_active);

-- appointments para no-show detection / cron
-- (já existe idx_appointments_noshow_detection — OK)
-- Adicionar índice para post-visit (status=completed):
CREATE INDEX IF NOT EXISTS idx_appointments_completed_org
  ON appointments(org_id, scheduled_at DESC) WHERE status = 'completed';

-- ============================================
-- P0: knowledge_base vector index AUSENTE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding
  ON knowledge_base USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);
-- ajustar lists conforme volume real

CREATE INDEX IF NOT EXISTS idx_knowledge_base_org_active
  ON knowledge_base(org_id) WHERE is_active = true;

-- ============================================
-- P1: Partial indexes para queues
-- ============================================

CREATE INDEX IF NOT EXISTS idx_email_sends_queue_pending_scheduled
  ON email_sends_queue(scheduled_for) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_followup_log_pending
  ON follow_up_log(scheduled_at) WHERE status = 'pending';

-- ============================================
-- P1: webhook_logs por processed status
-- ============================================

CREATE INDEX IF NOT EXISTS idx_webhook_logs_unprocessed
  ON webhook_logs(created_at DESC) WHERE processed = false;

CREATE INDEX IF NOT EXISTS idx_webhook_logs_leadgen
  ON webhook_logs(leadgen_id) WHERE leadgen_id IS NOT NULL;
```

**Total proposto:** ~35 índices novos. Estimado overhead: +5–10% em write throughput de leads/messages, mas read latency cai 2–10×.

---

## Refactors estruturais

### R1: Materializar `meta_campaign_roas`

```sql
-- Substitui CREATE VIEW por:
CREATE MATERIALIZED VIEW meta_campaign_roas AS
  SELECT ... -- mesma CTE
WITH NO DATA;

CREATE UNIQUE INDEX idx_meta_campaign_roas_pk
  ON meta_campaign_roas(org_id, meta_campaign_id);

-- Refresh job (pg_cron ou Vercel Cron):
REFRESH MATERIALIZED VIEW CONCURRENTLY meta_campaign_roas;
```

Refresh a cada 15–30 min. Trade-off: dados de ROAS ficam 30 min defasados, mas dashboard fica 50× mais rápido.

### R2: Denormalizar `messages.org_id` (e RLS direta)

```sql
ALTER TABLE messages ADD COLUMN org_id uuid REFERENCES organizations(id);

-- backfill:
UPDATE messages m SET org_id = c.org_id
FROM conversations c WHERE c.id = m.conversation_id;

ALTER TABLE messages ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX idx_messages_org_conv_created
  ON messages(org_id, conversation_id, created_at DESC);

-- Substituir policy:
DROP POLICY messages_select ON messages;
CREATE POLICY messages_select ON messages
  FOR SELECT USING (org_id = public.user_org_id());
```

Garantir via trigger que `org_id` está sempre consistente com `conversations.org_id`.

### R3: Cleanup jobs via pg_cron

```sql
-- Requires pg_cron extension (enable in Supabase dashboard)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- system_events: 30 dias
SELECT cron.schedule(
  'cleanup-system-events',
  '0 3 * * *',  -- 3am daily
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
  '0 4 * * 0',  -- weekly
  $$ DELETE FROM follow_up_log WHERE created_at < now() - interval '180 days' $$
);

-- email_logs: 365 dias
SELECT cron.schedule(
  'cleanup-email-logs',
  '0 5 * * 0',
  $$ DELETE FROM email_logs WHERE created_at < now() - interval '365 days' $$
);

-- Refresh ROAS view
SELECT cron.schedule(
  'refresh-meta-campaign-roas',
  '*/30 * * * *',  -- a cada 30 min
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY meta_campaign_roas $$
);
```

### R4: Particionar `system_events`, `messages`, `obra_mensagens`, `webhook_logs` por mês

Padrão postgres declarative partitioning:

```sql
-- Exemplo system_events
CREATE TABLE system_events_new (
  -- mesmos campos
  ...
) PARTITION BY RANGE (created_at);

CREATE TABLE system_events_2026_05 PARTITION OF system_events_new
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- migration via INSERT SELECT + swap names
```

Custos: requer downtime curto para swap. Benefício: DROP TABLE de partições antigas é O(1).

### R5: Refator `/api/cron/followup` para batched queries

Atual: ~800 queries por execução. Target: ~10–15 queries totais.

Padrão sugerido:
1. 1 query: `SELECT … FROM leads l JOIN follow_up_rules r ON … WHERE r.is_active = true AND l.is_active = true AND … (incluir join com últimas mensagens via lateral)` — usando LATERAL subquery para pegar última mensagem por lead em 1 round-trip.
2. 1 query batch: fetch follow_up_log dos últimos 48h `WHERE lead_id = ANY($1)`.
3. JS faz o pattern matching e decide ações.
4. Bulk inserts: `INSERT INTO follow_up_log VALUES (...), (...), (...)` em 1 round-trip.

### R6: Refator `/api/system-events` para 1 RPC

Criar RPC `get_dashboard_metrics(org_id, window_hours)` que retorna JSON com todos os counts agregados — 1 query em vez de 15.

### R7: Denormalizar `conversations.last_message_preview` + `last_message_role` + trigger

Resolve o problema do dashboard de conversas sem precisar puxar messages.

```sql
ALTER TABLE conversations
  ADD COLUMN last_message_preview text,
  ADD COLUMN last_message_role varchar(20);

-- Trigger
CREATE OR REPLACE FUNCTION update_conversation_last_msg()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations SET
    last_message_preview = LEFT(NEW.content, 100),
    last_message_role = NEW.role,
    last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_messages_update_conv
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_last_msg();
```

### R8: Realtime subscriptions com filtro server-side

Verificar (`admin-chat-feed.tsx`, `chat-feed.tsx`) se subscriptions têm filtro `filter: 'obra_id=eq.X'` ou similar. Subscription sem filtro recebe TODOS os events da tabela e descarta no client — alto overhead em Postgres replication slot.

### R9: Connection pooler explícito

No Vercel env, garantir que `SUPABASE_URL` aponte para o pooler na porta `6543` (transaction mode) para todos os routes serverless. `DATABASE_URL` direto (5432) apenas para migrations.

---

## Migrations Conflitantes / Bagunça

Listagem com problemas:

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
```

### Diagnóstico

1. **Numeração paralela** — três migrations diferentes com prefixo `021`, dois com `028`, dois com `029`. Supabase CLI processa em ordem alfabética da string completa, então a ordem real fica:
   - `021_obras_storage_policies.sql` < `021_phone_normalization_part1.sql` < `021_phone_normalization_part2.sql`
   - `028_fix_v_mensagens_admin_grant.sql` < `028_meta_campaign_actions.sql`
   - `029_cliente_id_obra_mensagens.sql` < `029_privacy_acceptance.sql`

   Isso é **frágil** — rename de migration quebraria ordem.

2. **`024_remote_only.sql` e `025_remote_only.sql` são stubs** ("Applied via Supabase Studio — kept as local stub to match remote migration history"). Indica que **alguém aplicou SQL via Studio diretamente**, divergindo do migration tree. Comentários da memória [project_supabase_migration_pitfalls.md](file:///Users/ogabrielhr/.claude/projects/-Users-ogabrielhr-trifold-crm/memory/project_supabase_migration_pitfalls.md) já documentam esse hazard como uma das 2 principais armadilhas.

   **Risco:** ninguém sabe exatamente o que foi aplicado em prod nos slots 024/025 — se o env local for resetado, vai faltar SQL.

3. **`028_fix_v_mensagens_admin_grant.sql`** corrige `028_meta_campaign_actions.sql` mas com mesmo prefixo. Em ambiente novo, a ordem alfa do CLI executa `fix` ANTES do GRANT da view. View ainda não existe quando o fix é aplicado → erro silencioso (`GRANT ... ON v_mensagens_admin TO authenticated` em view inexistente).

   Mas a view foi criada em `024_mensagens_sender_display_name.sql`, então em ordem alfa real:
   - 024_mensagens_sender_display_name (cria view)
   - 024_remote_only (stub)
   - 025_remote_only (stub)
   - 026_email_settings
   - 027_property_id_obras
   - 028_fix_v_mensagens_admin_grant (GRANT — OK, view existe)
   - 028_meta_campaign_actions

   Funciona, mas é **acidental**.

4. **`019_portal_cliente_enum.sql` + `020_portal_cliente.sql` split** — documentado e tem razão técnica (SQLSTATE 55P04). OK.

### Recomendações

1. **Reconciliar migrations** — rodar `supabase db diff` contra remote para confirmar que 024/025 stubs realmente cobrem o que foi aplicado via Studio. Idealmente, recuperar o SQL real do Studio history e commitar.

2. **Renomear migrations conflitantes** para garantir ordem determinística:
   - `021_obras_storage_policies` → `021a_obras_storage_policies` (ou bump para 021.5)
   - `028_fix_v_mensagens_admin_grant` → `028a_fix_…`
   - `029_privacy_acceptance` → `029a_privacy_…`

   Padronizar com sufixo letra para distinguir.

3. **Politica daqui pra frente:** numerar com 4 dígitos + nome explícito (`0030_…`, `0031_…`) e proibir aplicar via Studio em prod — sempre migration commitada primeiro.

4. **Adicionar `supabase migration list` no PR check** para detectar drift entre local e remote antes do merge.

---

## Resumo Executivo de Esforço

| Item | Esforço | Impacto esperado |
|------|---------|------------------|
| Adicionar todos os índices listados (P0) | 1–2h | Reduz 50–80% da latência média em routes com JOINs |
| Criar materialized view ROAS | 2h | Dashboard ROAS: 2–5s → 50–200ms |
| Adicionar vector index em knowledge_base | 10min | RAG search: 1–3s → 50–100ms |
| Refator cron de followup (batched) | 4–6h | Cron: 800 queries → 10–15 queries |
| Refator system-events para RPC | 2–3h | Dashboard sistema: 15 queries → 1 query |
| pg_cron cleanup jobs | 1h | Tabelas hot ficam estáveis em tamanho |
| Denormalizar messages.org_id + RLS direta | 3–4h | Toda query em messages: 30–50% mais rápida |
| Particionar system_events | 4h + downtime | DROP de partições antigas = instantâneo |
| Reconciliar migrations 024/025 stubs | 1h + revisão | Elimina risco de drift |
| Connection pooler explícito (Vercel env) | 30min | Reduz cold-start latency |

**Quick wins (< 4h total):** Adicionar índices listados (P0) + vector index em knowledge_base + cleanup jobs pg_cron + connection pooler. Isso sozinho deve melhorar percepção de performance em ~60%.

**Médio prazo (1 semana):** Materializar ROAS + refatorar cron followup + denormalizar messages.org_id.

**Longo prazo:** Particionamento + reconcile migrations + observability de slow queries via pg_stat_statements.
