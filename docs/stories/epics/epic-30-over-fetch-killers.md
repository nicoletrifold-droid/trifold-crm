---
epic: 30
title: Over-fetch & N+1 Killers — Reescrita das queries que carregam ordens de magnitude mais dados do que precisam
status: Ready
created_at: 2026-05-14
created_by: Morgan (@pm) — criado diretamente pelo orchestrador após Epic 29 fechar (gate 29.7 PASS)
priority: P0
source_plan: docs/audits/PERFORMANCE-PLAN.md (seção 6)
source_audits:
  - docs/audits/performance-architecture-audit.md (Aria @architect — over-fetch patterns nas rotas)
  - docs/audits/performance-database-audit.md (Dara @data-engineer — N+1 queries no servidor)
depends_on: [29]   # Epic 29 entregue 2026-05-14 (35 índices + matview ROAS + pg_cron)
blocks: [31, 33]   # 31 = caching layer (Redis/edge), 33 = backend heavy refactor
stories_planned: [30.1, 30.2, 30.3, 30.4, 30.5, 30.6, 30.7, 30.8, 30.9]
estimated_points: 39
estimated_duration: ~1.5 sprint (~7-8 dias úteis se 30.5/30.6/30.7/30.9 paralelizarem como wave inicial)
---

# Epic 30 — Over-fetch & N+1 Killers

## Objetivo do Epic

Atacar o **próximo gargalo da plataforma agora que o DB está rápido** (Epic 29 entregou 35 índices + matview ROAS + pg_cron cleanup): **rotas que continuam lentas mesmo com índice escolhido pelo planner, porque carregam ordens de magnitude mais dados do que precisam para renderizar a UI**.

Padrões diagnosticados pelas auditorias (Aria + Dara):

1. **Over-fetch para count:** `/dashboard/analytics` baixa **9.500 UUIDs** de `leads(id)` em múltiplos joins apenas para mostrar **21 números na UI** — ~190KB de payload para o que poderia ser uma agregação SQL.
2. **N+1 disfarçado de `Promise.all`:** home `/dashboard/page.tsx` faz `stages.map(stage => supabase.select(count))` — 1 query por stage. Com 8 stages, são 8 round-trips para cada hit do dashboard, quando uma única `GROUP BY stage_id` resolveria.
3. **Listas inteiras sem paginação:** `/dashboard/leads` carrega 5k+ leads num único select, depois React renderiza tudo. Mesmo com índice ativo, o gargalo virou hidratação e payload.
4. **`messages` sem limit em listagem de conversas:** `/dashboard/conversas` faz `messages.in(conversation_ids).order().NO_LIMIT` para descobrir a última mensagem de cada conversa — payload cresce linearmente com o histórico.
5. **15 queries sequenciais por request:** `/api/system-events/route.ts` faz 15 counts independentes; uma RPC com counts agregados em JSON resolve em 1 round-trip.
6. **Bug silencioso de over-fetch:** `/api/dashboard/metrics` filtra por `.eq("stage", "qualified")` mas a coluna real é `stage_id uuid` — counts retornam **0** sem erro, e a UI consome esses números como se fossem reais.
7. **Paginação fake em `/api/admin/mensagens`:** `.slice(offset, offset+limit)` em JS depois de carregar TUDO do DB — paginação que não pagina.

**Ganho esperado:**
- `/dashboard/analytics` TTFB **~800ms → <300ms** e payload **~190KB → ~3KB**.
- `/dashboard/conversas` payload **-90%+** (preview desnormalizado em vez de array de messages).
- `/dashboard/leads` com 5k+ rows **<500ms** (paginação real).
- Métricas do `/dashboard` **paramparam de retornar 0** (bug 30.6 corrigido).
- `/api/system-events` **15 queries → 1 RPC**.

## Por que agora (urgência operacional)

**Sinal de campo:** Mesmo após Epic 29 entregar **-97% no ROAS** e **~45x no RAG**, o usuário ainda percebe a plataforma "pesada" em algumas rotas. Diagnóstico: o gargalo se moveu do **DB → camada de over-fetch + N+1 do servidor Next.js**. O planner está rápido, mas o servidor está pedindo dados demais.

**Decisão tática:**
- Epic 30 vem **antes** de Epic 31 (caching) porque cachear uma query que baixa 190KB não resolve — só esconde o problema. Reescrever a query primeiro, cachear depois é a ordem correta.
- Epic 30 vem **antes** de Epic 33 (backend heavy refactor do followup cron) porque os ganhos aqui são frontends-visíveis (TTFB, payload, hidratação) e os do Epic 33 são backend-only.
- Epic 30 capitaliza **diretamente** o Epic 29: as RPCs criadas nas Stories 30.1/30.5/30.8 vão usar os índices compostos da Story 29.3 (`idx_leads_org_active_updated`, `idx_leads_org_stage_active`, `idx_system_events_org_level_created`) — composição multiplicativa de ganho.

**Por que este epic agora entre as otimizações:**
- ROI alto + risco controlável: 9 stories, 39 SP, mudanças localizadas em rotas específicas (não toca DB schema crítico, exceto Story 30.2 com 1 coluna desnormalizada + 1 trigger).
- Bug 30.6 está retornando 0 silenciosamente em produção HOJE — toda decisão tomada com base nesse painel é cega.
- Sem este epic, qualquer Epic 31 (caching) seria construído em cima de queries quebradas.

## Contexto do Sistema Existente

- **Stack:** Next.js 14 App Router (SSR + Server Actions), Supabase JS client (Postgres + RLS).
- **DB:** Postgres 15 com **35 índices novos do Epic 29** (incluindo compostos hot em `leads`, `messages`, `conversations`, `system_events`).
- **Última migration aplicada:** `036_pg_cron_cleanup_jobs_remote_only.sql` (Story 29.7, 2026-05-14). **Epic 30 começa em `037_*`** (convenção 3-dígito + sufixo `a/b/c` para conflitos, conforme `supabase/migrations/README.md`).
- **Rotas hot afetadas:**
  - `/dashboard/page.tsx` (home — stage counts via N+1)
  - `/dashboard/analytics/page.tsx` + `/api/analytics/*` (over-fetch de 9.5k UUIDs)
  - `/dashboard/conversas/page.tsx` (messages sem limit)
  - `/dashboard/leads/page.tsx` (5k+ rows sem paginação)
  - `/dashboard/pipeline/page.tsx` (todos os leads de todos os stages)
  - `/dashboard/leads/[id]/page.tsx` (messages aninhadas sem limit)
  - `/api/dashboard/metrics/route.ts` (bug `stage` vs `stage_id`)
  - `/api/system-events/route.ts` (15 queries sequenciais)
  - `/api/admin/mensagens/route.ts` (paginação fake em JS)
- **Tabelas mais tocadas:** `leads`, `conversations`, `messages`, `kanban_stages`, `system_events`.

## Decisão Arquitetural — RPC vs Multi-Query vs Desnormalização

**Problema técnico:** Cada padrão de over-fetch/N+1 tem uma solução natural diferente. Padronizar uma única abordagem (ex: "tudo vira RPC") é tão ruim quanto não padronizar.

**Critérios de decisão (decisão oficial deste epic):**

| Padrão do código atual | Solução preferida | Por quê |
|-----------------------|-------------------|---------|
| `Promise.all([count, count, count, ...])` independentes no mesmo request | **RPC Postgres retornando JSON com counts agregados** | Elimina N round-trips para 1. Usa `GROUP BY` ou `FILTER (WHERE ...)` no SQL. Casos: 30.5, 30.8. |
| `select(*, count: exact, head: true)` rodando 5+ vezes na mesma rota | **RPC ou subqueries agregadas em 1 SELECT** | Idem acima. Caso: 30.1. |
| Lista paginável que hoje carrega tudo | **`.range(offset, offset+limit-1)` + `searchParams?page=N`** | Padrão Supabase nativo. Casos: 30.3, 30.4, 30.9. |
| "Última mensagem por conversa" para listagem | **Coluna desnormalizada + trigger AFTER INSERT** | Para listagens hot, custo O(1) de leitura > custo amortizado de trigger. Caso: 30.2. |
| Join aninhado `select('*, messages(*)')` sem limit | **Adicionar `.order().limit()` no aninhamento** | Mudança mínima, Supabase suporta nativamente. Caso: 30.7. |
| Bug de campo errado em filtro | **Fix direto (1 linha)** | Sem refatoração estrutural. Caso: 30.6. |

**Regra geral:** preferir RPC quando a query precisa de **múltiplos round-trips OU agregação SQL não trivial**. Preferir mudança local (limit/range) quando a estrutura do select já está certa, só falta restringir.

**Stories que adicionam RPCs (30.1, 30.5, 30.8) devem:**
1. Criar a função em migration `037_*_rpcs.sql` agrupando todas as 3 RPCs num único arquivo (reduz overhead de tracking).
2. Definir tipos de retorno explícitos via `RETURNS TABLE (...)` ou `RETURNS jsonb`.
3. Marcar `SECURITY INVOKER` (default) para herdar RLS do caller — **NÃO usar `SECURITY DEFINER`** sem revisão explícita.
4. Documentar parâmetros e exemplos de uso no header SQL.

## Enhancement Details

### O que está sendo adicionado

1. **3 RPCs Postgres novas** (Stories 30.1, 30.5, 30.8) agregadas em 1 migration `037_dashboard_rpcs_remote_only.sql`:
   - `get_analytics_summary(org_id uuid, period interval)` → JSON com counts e métricas.
   - `get_dashboard_stage_counts(org_id uuid)` → `TABLE(stage_id, count)`.
   - `get_system_events_dashboard(org_id uuid, window_hours int)` → JSON com 15 counts agregados.

2. **1 migration de schema desnormalizado** (Story 30.2) `038_conversations_last_message_preview.sql`:
   - Adicionar coluna `conversations.last_message_preview text`.
   - Adicionar coluna `conversations.last_message_role varchar(20)`.
   - Trigger `AFTER INSERT ON messages` atualizando a conversa pai.
   - **Backfill obrigatório** com SQL idempotente.

3. **Reescritas em 6 rotas Next.js** (Stories 30.1, 30.2, 30.3, 30.4, 30.5, 30.7):
   - Substituir queries over-fetch por chamadas a RPCs ou queries restritas.
   - Adicionar `searchParams` para paginação onde aplicável.

4. **2 fixes localizados** (Stories 30.6, 30.9):
   - 30.6: trocar `.eq("stage", ...)` por `.eq("stage_id", ...)` em `/api/dashboard/metrics`.
   - 30.9: substituir `.slice()` em JS por `.range()` no Supabase em `/api/admin/mensagens`.

### Como integra com o sistema existente

- **Aditivo em DB:** RPCs novas, 1 coluna nova em `conversations`, 1 trigger novo. Nenhum schema destrutivo.
- **Aditivo em RLS:** RPCs com `SECURITY INVOKER` herdam policies existentes — nenhuma policy precisa ser alterada.
- **Mudança de contrato em API:** Stories 30.3, 30.4, 30.9 adicionam paginação. **Verificar consumidores client-side**: rotas chamadas só pela UI interna do dashboard → OK; rotas potencialmente externas → adicionar fallback de page default.
- **Trigger AFTER INSERT em `messages` (30.2):** overhead esperado <1ms por insert (1 UPDATE em conversation parent). `messages` é insert-heavy mas não bottleneck atual — aceitável.

### Pré-requisitos verificáveis

```bash
# Confirmar Epic 29 fechado e índices compostos disponíveis
psql -c "SELECT indexname FROM pg_indexes WHERE indexname IN (
  'idx_leads_org_active_updated', 'idx_leads_org_stage_active',
  'idx_messages_conv_created', 'idx_conversations_org_last_msg',
  'idx_system_events_org_level_created'
);"
# → DEVE retornar 5 rows. Caso contrário, Epic 29 não está aplicado e Epic 30 vai sub-render.

# Confirmar migration tracking
psql -c "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 3;"
# → DEVE mostrar 036 como mais recente.

# Confirmar bug 30.6 ainda ativo (pré-fix)
psql -c "SELECT column_name FROM information_schema.columns WHERE table_name='leads' AND column_name IN ('stage','stage_id');"
# → DEVE retornar apenas 'stage_id'. Se retornar 'stage' também, escopo da 30.6 muda.
```

### Sucesso mensurável

- **`/dashboard/analytics` TTFB <300ms** (vs ~800ms baseline) — medível via DevTools Network ou `curl -w "%{time_starttransfer}"`.
- **Payload de `/dashboard/conversas` -90%+** — verificável no DevTools Network tab (size column antes/depois).
- **`/dashboard/leads` com 5k+ leads <500ms TTFB** — paginação para 50 rows iniciais.
- **`/api/dashboard/metrics` para de retornar 0** (Story 30.6) — validar com seed conhecido (org com leads em stages variados).
- **`/api/system-events` queries por request: 15 → 1** — validável via pg_stat_statements ou log do Supabase.
- **`/dashboard/page.tsx` queries por request: 8+ → 1** — idem.
- **Zero regressões funcionais** — UI mostra os mesmos números/dados de antes (exceto Story 30.6 que **corrige** números errados).

---

## AC Global Obrigatório

> **Toda Story 30.1-30.9 DEVE cumprir TODOS os itens abaixo. Quality gate FALHA sem isso.**

1. **EXPLAIN ANALYZE antes/depois** para qualquer query SQL nova/refatorada. Anexar no story file ou gate.

2. **Medição de TTFB antes/depois** para rotas afetadas. Aceitável: `curl -w "%{time_starttransfer}\n" -o /dev/null -s {url}` em ambiente preview do Vercel ou local com seed conhecido.

3. **Verificação de regressão visual** — rota renderiza os mesmos dados que antes (exceto 30.6). Screenshot ou comparação manual antes/depois aceitos.

4. **RLS preserved** — toda RPC nova testada com user de outra org → DEVE retornar empty ou erro. **Sem `SECURITY DEFINER` sem aprovação explícita do @architect.**

5. **Idempotência em migrations** — `CREATE OR REPLACE FUNCTION`, `IF NOT EXISTS` em colunas, `DROP TRIGGER IF EXISTS` antes de recriar. Rollback SQL comentado no fim de cada migration.

6. **Trigger da Story 30.2 testado com seed real** — inserir mensagem manualmente, verificar que `conversations.last_message_preview` atualiza. Backfill SQL aplicado e verificado.

7. **Stories 30.3/30.4/30.9 (paginação)** — testar página 1, página intermediária e última página. `total_count` retornado para permitir cálculo de pages na UI.

---

## Stories Propostas (a serem criadas por @sm)

> **Ordem sugerida de execução (ver "Próximos Passos" no fim):** 30.6 como warm-up → wave paralela 30.5/30.7/30.9 → wave 30.1/30.3/30.4/30.8 → 30.2 por último (migration + trigger + backfill).

### Story 30.1 — Reescrever `/dashboard/analytics` + `/api/analytics/*`

**Executor sugerido:** `@dev` | **Quality Gate sugerido:** `@architect` (revisão da RPC + medição TTFB)
**Complexidade:** L (1 dia) | **Story points:** 8 | **Prioridade:** P0
**Dependências:** Epic 29 fechado (índice `idx_leads_org_active_updated` em uso)

**Resumo:** Substituir o padrão atual que baixa **9.500 UUIDs** de `leads(id)` via joins múltiplos para exibir 21 números, por uma RPC `get_analytics_summary(org_id, period)` que faz toda a agregação SQL server-side e retorna JSON enxuto. Alternativa aceita: `Promise.all` de `select('*', { count: 'exact', head: true })` paralelos — mas RPC é preferida porque elimina round-trips. Adicionar a função na migration `037_dashboard_rpcs_remote_only.sql`.

---

### Story 30.2 — Reescrever `/dashboard/conversas` (desnormalização `last_message_preview`)

**Executor sugerido:** `@data-engineer` (migration + trigger) → `@dev` (refator da rota) | **Quality Gate sugerido:** `@architect`
**Complexidade:** M (4h) | **Story points:** 5 | **Prioridade:** P0
**Dependências:** Epic 29 fechado; **executar por último** no Epic 30 (envolve migration + backfill).

**Resumo:** Adicionar colunas `conversations.last_message_preview text` e `last_message_role varchar(20)`, mais trigger `AFTER INSERT ON messages` que atualiza a conversa pai (e zera/atualiza em casos de edição se aplicável). Backfill via SQL: `UPDATE conversations c SET last_message_preview = m.content, last_message_role = m.role FROM (SELECT DISTINCT ON (conversation_id) ...) m WHERE c.id = m.conversation_id`. Após migration aplicada, refatorar `/dashboard/conversas/page.tsx` para ler diretamente da `conversations` (sem join em messages), eliminando a query `messages.in(conversation_ids).order().NO_LIMIT`. Migration: `038_conversations_last_message_preview_remote_only.sql`.

---

### Story 30.3 — Paginação em `/dashboard/leads`

**Executor sugerido:** `@dev` | **Quality Gate sugerido:** `@qa`
**Complexidade:** M (4h) | **Story points:** 5 | **Prioridade:** P0
**Dependências:** Epic 29 fechado (índice `idx_leads_org_active_updated`)

**Resumo:** Implementar `.range(0, 49)` na query Supabase + `searchParams?page=N` na URL + componente de controles de paginação (prev/next + page indicator) na UI. Retornar `count: 'exact'` no header da query para a UI calcular total de páginas. **Virtualização opcional** (react-virtual ou tanstack-virtual) se houver tempo dentro do orçamento. **Cuidado:** verificar se `/dashboard/leads` tem filtros server-side que precisam ser preservados (search, stage, etc.).

---

### Story 30.4 — Paginação por stage em `/dashboard/pipeline`

**Executor sugerido:** `@dev` | **Quality Gate sugerido:** `@qa`
**Complexidade:** M (1 dia) | **Story points:** 5 | **Prioridade:** P1
**Dependências:** Epic 29 fechado (índice `idx_leads_org_stage_active`)

**Resumo:** Em vez de carregar todos os leads de todos os stages do kanban, carregar **top 50 leads por stage** (ordem por `updated_at DESC`) com botão "carregar mais" por coluna. Medir tempo de **hidratação React** antes/depois (DevTools Performance tab) — esperado: redução significativa em orgs com 1k+ leads. Preservar funcionalidade de drag-and-drop entre stages.

---

### Story 30.5 — Reescrever home `/dashboard/page.tsx` (stage counts via RPC)

**Executor sugerido:** `@dev` | **Quality Gate sugerido:** `@architect`
**Complexidade:** P (2h) | **Story points:** 3 | **Prioridade:** P0
**Dependências:** Epic 29 fechado (índice `idx_leads_org_stage_active`)

**Resumo:** Substituir `Promise.all(stages.map(stage => supabase.from('leads').select('*', count: 'exact', head: true).eq('org_id', orgId).eq('stage_id', stage.id).eq('is_active', true)))` por uma única RPC `get_dashboard_stage_counts(org_id uuid) RETURNS TABLE(stage_id uuid, count bigint)` executando `SELECT stage_id, COUNT(*) FROM leads WHERE org_id = $1 AND is_active = true GROUP BY stage_id`. Adicionar a função na migration `037_dashboard_rpcs_remote_only.sql` (mesmo arquivo da 30.1 e 30.8).

---

### Story 30.6 — Fix bug `/api/dashboard/metrics` (`stage` vs `stage_id`)

**Executor sugerido:** `@dev` | **Quality Gate sugerido:** `@qa`
**Complexidade:** XS (1h) | **Story points:** 3 (alto valor por baixo esforço — bug crítico em produção) | **Prioridade:** P0
**Dependências:** nenhuma — primeira a executar (warm-up)

**Resumo:** Linhas 56-80 de `/api/dashboard/metrics/route.ts` fazem `.eq("stage", "qualified")` (e outros valores), mas a coluna real em `leads` é `stage_id uuid`. Resultado: **counts retornam 0 silenciosamente** e o painel mostra dados falsos. Fix: ou trocar para `.eq("stage_id", qualifiedStageId)` (resolvendo o `qualifiedStageId` via lookup em `kanban_stages` por `name`/`slug`), ou fazer JOIN com `kanban_stages` filtrando por `stages.name = 'qualified'`. Preferir lookup cacheado de `stage_id` por `name` se a lista de stages for estável. **Validar com seed:** criar lead em stage "qualified" e confirmar que count incrementa.

---

### Story 30.7 — Refatorar `/dashboard/leads/[id]` (limit em messages aninhadas)

**Executor sugerido:** `@dev` | **Quality Gate sugerido:** `@qa`
**Complexidade:** XS (1h) | **Story points:** 2 | **Prioridade:** P1
**Dependências:** Epic 29 fechado (índice `idx_messages_conv_created`)

**Resumo:** O select aninhado atual `supabase.from('leads').select('*, conversations(*, messages(*))').eq('id', leadId)` carrega TODAS as mensagens de todas as conversas do lead — pode ser centenas/milhares. Adicionar limit no aninhamento Supabase: `messages:messages(*).order('created_at', { ascending: false }).limit(20)`. Sintaxe Supabase JS: `select('*, conversations(*, messages(*))')` com `{ count: ..., head: ... }` ou via `.from('leads').select(... messages(...)).order(...)` — confirmar sintaxe correta na implementação. Se mais histórico for necessário, adicionar botão "ver mais mensagens" que faz query separada.

---

### Story 30.8 — Refatorar `/api/system-events/route.ts` (15 queries → 1 RPC)

**Executor sugerido:** `@dev` | **Quality Gate sugerido:** `@architect`
**Complexidade:** M (4h) | **Story points:** 5 | **Prioridade:** P0
**Dependências:** Epic 29 fechado (índices `idx_system_events_org_level_created` + `idx_system_events_org_category_created`)

**Resumo:** Substituir as 15 queries sequenciais atuais (cada uma com `select count`, head:true) por uma RPC `get_system_events_dashboard(org_id uuid, window_hours int DEFAULT 24) RETURNS jsonb` retornando JSON com todos os counts agregados via `FILTER (WHERE ...)` clauses ou subqueries. Adicionar na migration `037_dashboard_rpcs_remote_only.sql`. Validar EXPLAIN ANALYZE da RPC: deve usar `idx_system_events_org_level_created` ou `idx_system_events_org_category_created` (criados no Epic 29).

---

### Story 30.9 — Paginação real em `/api/admin/mensagens`

**Executor sugerido:** `@dev` | **Quality Gate sugerido:** `@qa`
**Complexidade:** P (2h) | **Story points:** 3 | **Prioridade:** P1
**Dependências:** Epic 29 fechado

**Resumo:** Hoje a rota faz `.slice(offset, offset+limit)` em JS **depois** de carregar TODAS as mensagens. Substituir por `.range(offset, offset+limit-1)` no Supabase. Adicionar `count: 'exact'` para retornar total ao caller. Preservar contrato: se a rota é consumida por UI admin específica, garantir que payload mantém os mesmos campos. **Cuidado:** verificar se algum filtro/sort era aplicado em JS após o slice — se sim, mover para a query SQL (`.order()`, `.eq()`, `.ilike()` etc.).

---

## Out of Scope (explícito)

- **Caching layer (Redis / Vercel Edge Cache / SWR client-side)** → Epic 31. Reescrever a query primeiro, cachear depois.
- **Refator do cron `/api/cron/followup`** (800 → 15 queries) → Epic 33 (33.1).
- **Denormalização de `messages.org_id`** → Epic 33 (33.4). Story 30.2 desnormaliza `conversations.last_message_preview`, não `messages`.
- **Particionamento de `system_events`, `messages`** → Epic 34.
- **Observability / Speed Insights real-user monitoring** → Epic 27 (diferido).
- **Migrar para Server Components com `cache()` de React** → Epic 32 (separado, mais profundo).
- **Substituir Supabase JS client por Drizzle / Kysely / pgTyped** → não considerado neste epic.

## Riscos do Epic

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Trigger AFTER INSERT em `messages` (30.2) cria overhead em writes | Média | Baixo | Trigger é 1 UPDATE simples por insert (~1ms). `messages` não é o gargalo de write atual. Monitorar p99 de `/api/whatsapp/webhook` e `/api/telegram/webhook` por 48h após push. |
| Backfill da coluna `last_message_preview` (30.2) bloqueia tabela `conversations` | Média | Média | Backfill via batches `UPDATE ... WHERE id IN (SELECT ... LIMIT 1000)` em loop. Documentar SQL + tempo estimado antes de aplicar. |
| RPC com `SECURITY INVOKER` retorna empty por RLS quando dev esperava data | Média | Média | Cada RPC tem teste explícito de RLS no QA gate (call com user A → vê só data de A; user B → vê só B). |
| Tipo de retorno da RPC muda contrato implícito da UI | Média | Baixa | Definir tipos TS via `Database['public']['Functions']['get_analytics_summary']['Returns']` (gerado por `supabase gen types`). Verificar tipos no client antes do push. |
| Paginação muda contrato de `/api/admin/mensagens` (30.9) e quebra consumidor desconhecido | Baixa | Média | `grep -rn "/api/admin/mensagens" packages/` antes da Story. Se houver consumidor externo, manter parâmetro `?paginate=false` como fallback temporário. |
| Story 30.6 "corrige" números mas usuários treinados nos números errados ficam confusos | Baixa | Baixa | Documentar no story release notes. Sugerir nota in-app: "Métricas corrigidas a partir de DD/MM". |
| RPCs novas competindo com índices compostos do Epic 29 não escolherem o planner correto | Baixa | Média | EXPLAIN ANALYZE obrigatório no QA gate de cada RPC. Se planner errar, adicionar `SET LOCAL enable_seqscan = off` no início da RPC ou criar índice ad-hoc. |
| `searchParams` de paginação (30.3, 30.4) entrar em conflito com filtros existentes | Média | Baixa | Auditar `searchParams` consumidos hoje em cada rota antes de adicionar `?page`. Preservar todos os existentes. |

## Dependencies

- **Bloqueado por:** Epic 29 (entregue 2026-05-14). Stories 30.1, 30.3, 30.4, 30.5, 30.7, 30.8 dependem dos índices compostos criados na Story 29.3 e dos FK indexes da 29.2 para que o planner escolha index scan nas RPCs/queries novas.
- **Bloqueia:** Epic 31 (caching layer — cachear queries reescritas, não as antigas com over-fetch), Epic 33 (backend heavy — fluxos do cron followup vão depender das RPCs de aggregation criadas aqui se reaproveitarem padrão).
- **Paralelizável com:** Stories pequenas do Epic 25/26 (auth/obras do Lucas — escopo disjunto), Epic 27 (Observability, ainda diferido).

## Definition of Done do Epic

- [ ] 2 migrations aplicadas no remote: `037_dashboard_rpcs_remote_only.sql` (RPCs das stories 30.1/30.5/30.8), `038_conversations_last_message_preview_remote_only.sql` (story 30.2 com coluna + trigger + backfill).
- [ ] 9 stories Status=Done + 9 quality gates PASS (ou CONCERNS aceito).
- [ ] `/dashboard/analytics` TTFB <300ms validado em preview Vercel com seed de produção (snapshot).
- [ ] Payload de `/dashboard/conversas` reduzido em **>90%** (medição DevTools Network antes/depois anexada ao gate da Story 30.2).
- [ ] `/dashboard/leads` carrega em <500ms para org com 5k+ leads (paginação real, 50 rows/página).
- [ ] `/api/dashboard/metrics` (Story 30.6) retorna counts corretos para todos os stages — validado com seed conhecido.
- [ ] `/api/system-events` faz **1 query** por request (vs 15 anteriores) — validado via `pg_stat_statements` ou Supabase log.
- [ ] `/dashboard/page.tsx` faz **1 query** por request (vs 8+ anteriores) — idem.
- [ ] Trigger da Story 30.2 testado em produção: inserir mensagem real → `conversations.last_message_preview` atualizado em <100ms.
- [ ] Zero regressões funcionais reportadas em 48h após push de cada wave.
- [ ] Build PASS (`pnpm --filter @trifold/web build` exit 0) após cada Story.

---

## Próximos Passos (sequência ótima de execução)

**Estado atual (2026-05-14):** Epic 29 fechado (gate 29.7 PASS). Epic 30 com escopo formalizado neste arquivo. Próximo: criar Stories via `@sm *draft`.

```
[NOW]  1. @sm *draft 30.6    ← WARM-UP: bug fix simples (1h), valor altíssimo (métricas falsas em produção HOJE).
                              ←   Vai validar pipeline @sm → @po → @dev → @qa → @devops sem risco arquitetural.

[WAVE 1 — paralelo após 30.6 entregue]
       2. @sm *draft 30.5    ← RPC simples (1 query GROUP BY), arquivo único.
       3. @sm *draft 30.7    ← Mudança local de 1 linha (limit em select aninhado).
       4. @sm *draft 30.9    ← Refator local de pagination (slice → range).
                              ← Estas 3 são disjuntas em arquivos → paralelizáveis sem conflito.

[WAVE 2 — paralelo após Wave 1]
       5. @sm *draft 30.1    ← RPC analytics (mais complexa, 8 SP).
       6. @sm *draft 30.3    ← Paginação leads.
       7. @sm *draft 30.4    ← Paginação pipeline (depende conceptualmente de UX similar à 30.3).
       8. @sm *draft 30.8    ← RPC system-events.

[WAVE 3 — último]
       9. @sm *draft 30.2    ← Migration + trigger + backfill + refator de rota.
                              ← Por último porque tem maior superfície de risco (DDL + DML em conversations + trigger).
```

**Tempo total estimado:** 7-8 dias úteis se waves paralelizarem; 12-14 dias se sequencial.

**Alternativa: `@pm *execute-epic 30`** — gerar EPIC-30-EXECUTION.yaml com a sequência acima formalizada para tracking automático de waves. Recomendado se planejar paralelizar com mais de 1 dev/agent.
