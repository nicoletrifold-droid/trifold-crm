# Plano Mestre de Otimização de Performance — Trifold CRM

> **Autor:** Auditoria consolidada (Aria @architect + Dara @data-engineer + Quinn @qa + análise de bundle)
> **Data:** 2026-05-12
> **Branch:** `main` (HEAD: 65af123)
> **Escopo:** Monorepo Trifold CRM — Next.js 16.2.2 + React 19 + Supabase + Vercel
> **Status:** Plano aguardando aprovação do PO antes de @pm criar Epics

---

## 0. Sumário Executivo

### O diagnóstico em 5 frases

1. **Voamos cegos.** Não existe RUM, nem APM, nem Sentry, nem Speed Insights — Web Vitals reais (LCP/INP/CLS) são desconhecidos hoje.
2. **`next.config.ts` está vazio** — todas as otimizações default-off do Next 16 estão desligadas (optimizePackageImports, serverExternalPackages, images, removeConsole).
3. **Auth roda 3–4× por page view** — `getServerUser` sem `React.cache()`, middleware + layout + page todos fazem `auth.getUser()` independente.
4. **Over-fetch + N+1 generalizados** — `/dashboard/analytics` baixa 9.500 UUIDs para mostrar 21 números; `/api/cron/followup` faz ~800 queries sequenciais por execução; `/dashboard/conversas` puxa todas as mensagens de todas as conversas só para mostrar previews.
5. **~20 FKs sem índice + RLS recursiva + ROAS view não materializada** — base de dados paga preço composto em toda query que toca `messages`, `obra_mensagens`, `conversations`, `system_events`, `meta_campaign_roas`.

### Estimativa de ganho potencial (conservadora)

| Ondas de execução | TTFB | LCP | Bundle JS inicial | Cold start lambda | Queries Supabase/page |
|------|------|-----|-----------|------------|------|
| Sprint 0–1 (observabilidade + config) | -10% | -10% | -15% | -50% | mesma |
| Sprint 2 (DB indexes + cleanup) | -50% | -30% | — | — | mesma |
| Sprint 3 (over-fetch kill) | -60% | -45% | — | — | -70% payload |
| Sprint 4 (caching + auth) | -70% | -55% | -5% | — | -60% |
| Sprint 5 (bundle + rendering) | -70% | -65% | -40% | -30% | — |
| Sprint 6 (backend heavy) | -75% | -65% | -40% | -85% | -85% (cron) |

### Estado atual quantitativo

| Métrica | Valor atual | Fonte |
|---------|-------------|-------|
| Arquivos TS/TSX em `packages/web` | 293 | `find` |
| API routes | 112 | `find packages/web/src/app/api -name route.ts` |
| `'use client'` em `/app` | 66 de 132 (50%) | grep |
| `loading.tsx` em todo `/app` | 0 | find |
| `error.tsx` em todo `/app` | 2 (só `/cliente`) | find |
| `next/dynamic` no codebase | 0 | grep |
| `React.cache()` no codebase | 0 | grep |
| `unstable_cache` no codebase | 0 | grep |
| `Cache-Control` headers em API | 0 | grep |
| `useSWR` / `@tanstack/react-query` | 0 (não instalado) | grep |
| `Suspense` em pages | 1 (apenas `/login`) | grep |
| Test files em `packages/web` | 2 | find |
| `useEffect` calls | 86 (52 sites) | grep |
| `AbortController` em useEffect | 16 ocorrências | grep |
| `setInterval`/`setTimeout` sem cleanup | ~13 diferenciais | grep |
| Migrations | 30 (com 5 conflitos de numeração) | ls |
| Tabelas com FK sem índice | ~20 (visit_feedback, unit_sales, conversation_state, …) | audit |
| Queries `.select('*')` sem `.limit()` | múltiplas (analytics, conversas, leads, pipeline) | audit |
| `console.*` totais | 151 (80 client + 66 API + 5 lib) | grep |
| `logEvent()` adoption em rotas API | 7 de 112 (6%) | grep |
| `.next/` build | 378 MB | du |
| `node_modules/.pnpm/googleapis` | 194 MB | du |

---

## 1. Filosofia do plano

### Princípios

1. **Observabilidade primeiro.** Não otimize o que não pode medir — Sprint 0 instala instrumentação antes de qualquer mudança.
2. **Aditivo, não destrutivo.** Toda otimização proposta é backward-compatible — nenhuma reescrita de feature.
3. **Pequenos diffs com fallbacks.** Cada story é entregável em isolamento e pode ser revertida via flag/feature toggle.
4. **DB antes de app.** Índice ausente é o ganho × custo mais alto possível — atacar primeiro.
5. **Mensuração pós-deploy.** Cada Epic tem um critério de aceitação que inclui métrica de comparação antes/depois (via Speed Insights ou Supabase logs).

### Convenções AIOS

- Cada Epic abaixo está em **proposta** — `@pm` deve validar e criar oficialmente via `*create-epic`.
- Cada Story dentro do Epic é uma proposta — `@sm` cria via `*draft` e `@po` valida.
- Fluxo padrão por Story: `@sm *draft → @po *validate → @dev *develop → @qa *qa-gate → @devops *push`.

---

## 2. Mapa de Epics propostos

```
Sprint 0 (1 sem)  →  EPIC 27: Performance Observability Foundation
Sprint 1 (1 sem)  →  EPIC 28: Next.js Config Quick Wins
Sprint 2 (1 sem)  →  EPIC 29: Database Performance Blitz
Sprint 3 (2 sem)  →  EPIC 30: Over-fetch & N+1 Killers
Sprint 4 (2 sem)  →  EPIC 31: Caching Layer & Auth Optimization
Sprint 5 (2 sem)  →  EPIC 32: Bundle & Rendering Optimization
Sprint 6 (1 sem)  →  EPIC 33: Backend Heavy Lifting (cron, RLS, signed URLs)
Sprint 7+ (cont.) →  EPIC 34: Hardening & Long-term (testes, partitioning, rate limit)
```

> **Dependências críticas:**
> - Epic 27 → 28 → 29 são paralelizáveis após instalar instrumentação.
> - Epic 30 depende de Epic 29 (índices reduzem custo de queries refatoradas).
> - Epic 31 depende de Epic 30 (cache precisa de dados pequenos para fazer sentido).
> - Epic 32 e 33 dependem de Epic 27 (precisamos medir antes/depois com Speed Insights).
> - Epic 34 é contínuo.

---

## 3. Epic 27 — Performance Observability Foundation

**Objetivo:** Instalar a base de medição. Sem isso, nada que vier depois é mensurável.

**Por que primeiro:** Quinn argumentou que qualquer otimização posterior será "no escuro". Sem RUM, não há baseline. Esforço total: 2–3 dias.

### Stories propostas

| # | Story | Agentes | Esforço | Story points |
|---|-------|---------|---------|--------------|
| 27.1 | Instalar `@vercel/speed-insights` + `@vercel/analytics` no `layout.tsx` | @sm → @dev → @qa → @devops | 30 min | 1 |
| 27.2 | Adicionar `global-error.tsx` + `app/dashboard/error.tsx` + `app/broker/error.tsx` + `app/cliente/error.tsx` com `logEvent` no catch | @sm → @dev → @qa → @devops | 1h | 2 |
| 27.3 | Health check completo: paralelizar `Promise.allSettled` com Anthropic, Resend, Meta Graph, WhatsApp Cloud, Telegram. Categorizar critical vs degraded. | @sm → @dev → @qa → @devops | 3h | 3 |
| 27.4 | Migrar 10 rotas API mais quentes para `logEvent({ level, duration_ms, request_id })` em vez de `console.*` (leads POST, leads PATCH, mensagens, webhook/whatsapp, cron/followup, cron/email-queue) | @sm → @dev → @qa → @devops | 1 dia | 5 |
| 27.5 | Criar `lib/observability.ts` com `withTiming(label, fn)` wrapper + instrumentar `/api/dashboard/metrics`, `/api/analytics/*`, `/api/leads`, `/api/system-events` | @sm → @dev → @qa → @devops | 4h | 3 |
| 27.6 | Instalar Sentry (server + client) com source maps Vercel + sample rate 10% para trace, 100% para erros. Atualizar `error.tsx` para `Sentry.captureException` | @sm → @dev → @qa → @devops | 4h | 5 |
| 27.7 | Adicionar `@next/bundle-analyzer` em modo opt-in (`ANALYZE=true`) + script `pnpm analyze` | @sm → @dev → @qa → @devops | 30 min | 1 |
| 27.8 | Habilitar `eslint-plugin-react-hooks: exhaustive-deps: error` + regra custom: `no-console` em `app/api/**` | @sm → @dev → @qa → @devops | 2h + fixes | 5 |

**Critério de aceitação do Epic:**
- Speed Insights mostra LCP/INP/CLS por rota no Vercel dashboard.
- Sentry recebe erros server + client com source maps.
- 10 rotas mais quentes têm `duration_ms` em `system_events`.
- `pnpm analyze` gera bundle report consumível.

**Total estimado:** 20 story points / ~3 dias úteis.

---

## 4. Epic 28 — Next.js Config Quick Wins

**Objetivo:** Ligar todas as otimizações default-off do Next 16 que estão desativadas por configuração vazia.

**Por que cedo:** ROI gigante × esforço mínimo (1 PR resolve várias). Zero risco arquitetural.

### Stories propostas

| # | Story | Agentes | Esforço | Story points |
|---|-------|---------|---------|--------------|
| 28.1 | Atualizar `next.config.ts` completo: `compiler.removeConsole`, `experimental.optimizePackageImports` (lucide-react, recharts, @dnd-kit/*, @trifold/shared), `serverExternalPackages` (googleapis, web-push, resend, google-auth-library), `images.formats + remotePatterns`, `experimental.serverActions.bodySizeLimit: 10mb`, `experimental.staleTimes`, headers para `/sw.js` e `/_next/static`, `poweredByHeader: false` | @sm → @dev → @qa → @devops | 1h | 3 |
| 28.2 | Atualizar `tsconfig.json` (web + root) — `target: ES2022`, adicionar `noUncheckedIndexedAccess: true` (esperar centenas de erros — segmentar fixes em Story 28.3) | @sm → @dev → @qa → @devops | 1h | 2 |
| 28.3 | Resolver erros novos de TS gerados pelo `noUncheckedIndexedAccess` — onda 1: `lib/`, `hooks/`, `components/` (deixar API routes para Story 31.x) | @sm → @dev → @qa → @devops | 1 dia | 5 |
| 28.4 | Adicionar `import "server-only"` no topo de `lib/google.ts`, `lib/email.ts`, `lib/server/push-service.ts`, `lib/anthropic.ts` se existir | @sm → @dev → @qa → @devops | 30 min | 1 |
| 28.5 | Adicionar `"sideEffects": false` em `packages/shared/package.json` (validar via teste de bundle pós-mudança) | @sm → @dev → @qa → @devops | 1h | 2 |
| 28.6 | Criar `loading.tsx` em `/dashboard`, `/dashboard/leads`, `/dashboard/pipeline`, `/dashboard/conversas`, `/dashboard/analytics`, `/cliente/[obra_id]` — skeletons básicos com Tailwind | @sm → @dev → @qa → @devops | 2h | 3 |
| 28.7 | Adicionar headers de cache em `vercel.json` para `/api/analytics/*` (`s-maxage=60, swr=300`) e `/api/dashboard/metrics` (`s-maxage=30, swr=120`) — consolidar `vercel.json` root vs `packages/web/vercel.json` numa única fonte | @sm → @dev → @qa → @devops | 1h | 2 |
| 28.8 | Deletar `logo-Trifold-laranja.webp` da raiz do projeto (duplicado, não referenciado — apenas `public/logo-trifold.webp` é usado) | @sm → @dev → @qa → @devops | 5 min | 1 |

**Critério de aceitação do Epic:**
- Bundle inicial cai ≥10% (medido pelo bundle-analyzer da Story 27.7).
- Cold start de rotas que tocam `googleapis` cai ≥50% (medido por `duration_ms` em Story 27.5).
- `pnpm type-check` passa após Story 28.3.

**Total estimado:** 19 story points / ~3 dias úteis.

---

## 5. Epic 29 — Database Performance Blitz

**Objetivo:** Atacar a raiz da lentidão. Índices ausentes + cleanup + materialização da view ROAS.

**Por que prioritário:** Dara mediu que apenas a adição dos índices recomendados reduz latência média de routes com JOINs em 50–80%.

### Stories propostas

> **Ordem reflete bloqueante B2 do PO review:** Story 29.1 (reconciliar migrations duplicadas) DEVE rodar antes de qualquer nova migration nesta epic, caso contrário 030–035 herdam a bagunça de numeração.

| # | Story | Agentes | Esforço | Story points |
|---|-------|---------|---------|--------------|
| 29.1 | **[BLOQUEANTE]** Reconciliar migrations conflitantes (021×3, 028×2, 029×2) e stubs `024_remote_only` / `025_remote_only`: rodar `supabase db diff` contra remote, recuperar SQL real aplicado via Studio, commitar. Padronizar nomeação futura com 4 dígitos `0030_*`. **Sem isto, todas as Stories 29.2–29.7 ficam bloqueadas.** | @sm → @data-engineer → @qa → @devops | 2h | 3 |
| 29.2 | Migration `0030_fk_indexes_critical.sql` com ~20 índices em FKs ausentes: `conversation_state(lead_id)`, `conversation_state(current_property_id)`, `leads(property_interest_id)`, `appointments(property_id)`, `unit_sales(lead_id, broker_id)`, `units(reserved_by_lead_id)`, `lead_property_interest(lead_id, property_id)`, `visit_feedback(*)` (5 FKs), `broker_assignments(property_id)`, `obra_mensagens(sender_id, cliente_id)`, `obra_fotos(fase_id, uploaded_by)`, `obra_documentos(uploaded_by)`, `follow_up_log(org_id, rule_id, lead_id+type+created_at)`, `email_logs(template_id, org_id+status+sent_at)`, `email_blasts(template_id)`, `email_automations(template_id)`, `system_events(resolved_by)` | @sm → @data-engineer → @qa → @devops | 2h | 5 |
| 29.3 | Migration `0031_composite_indexes_hot.sql`: `idx_messages_conv_created (conversation_id, created_at DESC)`, `idx_conversations_org_last_msg`, `idx_conversations_lead_last_msg`, `idx_conversations_active_last_msg WHERE is_ai_active`, `idx_leads_org_active_updated WHERE is_active`, `idx_leads_org_stage_active`, `idx_appointments_completed_org WHERE status='completed'`, `idx_system_events_org_level_created`, `idx_system_events_org_category_created`, `idx_leads_utm_campaign` (composto org_id + utm_campaign) | @sm → @data-engineer → @qa → @devops | 2h | 5 |
| 29.4 | Migration `0032_vector_index_knowledge_base.sql`: `CREATE INDEX … USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50)` + reindex `lead_memories.embedding` se necessário; ajustar `lists` proporcional ao volume (sqrt(N rows)) | @sm → @data-engineer → @qa → @devops | 1h | 3 |
| 29.5 | Migration `0033_partial_indexes_queues.sql`: `idx_email_sends_queue_pending_scheduled WHERE status='pending'`, `idx_followup_log_pending WHERE status='pending'`, `idx_webhook_logs_unprocessed WHERE processed=false`, `idx_webhook_logs_leadgen WHERE leadgen_id IS NOT NULL` | @sm → @data-engineer → @qa → @devops | 30 min | 2 |
| 29.6 | Migration `0034_materialize_meta_campaign_roas.sql`: `DROP VIEW meta_campaign_roas; CREATE MATERIALIZED VIEW … WITH NO DATA; CREATE UNIQUE INDEX (org_id, meta_campaign_id); REFRESH MATERIALIZED VIEW CONCURRENTLY` + atualizar rotas que consomem se necessário | @sm → @data-engineer → @qa → @devops | 3h | 5 |
| 29.7 | Migration `0035_pg_cron_cleanup_jobs.sql`: ativar `pg_cron` extension; agendar jobs diários/semanais para `system_events` (30d retention), `webhook_logs` (90d processed), `follow_up_log` (180d), `email_logs` (365d), `REFRESH MATERIALIZED VIEW meta_campaign_roas` a cada 30 min | @sm → @data-engineer → @qa → @devops | 2h | 3 |
| 29.8 | Auditar e fixar `SUPABASE_URL` no Vercel para apontar para pooler porta `6543` (transaction mode); manter `DATABASE_URL` direct (5432) só para migrations | @sm → @devops | 1h | 2 |

**Dependências internas:**
- 29.1 → bloqueia 29.2, 29.3, 29.4, 29.5, 29.6, 29.7 (paridade migration tree é pré-requisito)
- 29.6 → bloqueia agendamento de `REFRESH MATERIALIZED VIEW` na 29.7
- 29.2/29.3/29.4/29.5 podem rodar em paralelo após 29.1
- 29.8 é independente (config Vercel) — pode rodar em paralelo com qualquer outra

**Critério de aceitação do Epic (todas as Stories 29.2–29.7):**

> **[BLOQUEANTE B3 do PO review — AC global obrigatório para QA gate]**
>
> 1. **Toda `CREATE INDEX` em Stories 29.2, 29.3, 29.4, 29.5 DEVE usar `CONCURRENTLY`** — caso contrário lock exclusivo na tabela durante a criação derruba produção (`messages`, `conversations`, `leads` são hot). Exemplo obrigatório:
>    ```sql
>    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conv_created
>      ON messages (conversation_id, created_at DESC);
>    ```
> 2. **Toda migration DEVE ser idempotente:** usar `IF NOT EXISTS` em índices/colunas/extensões, `IF EXISTS` em DROPs, `ON CONFLICT DO NOTHING` em INSERTs de seed se houver.
> 3. **Toda migration DEVE ter bloco de rollback SQL comentado no fim do arquivo** (`-- ROLLBACK: DROP INDEX … / DROP MATERIALIZED VIEW …`) — facilita reverter sem `supabase db reset`.
> 4. **Story 29.6 (DROP VIEW + CREATE MATERIALIZED VIEW)** exige downtime curto da feature de ROAS — coordenar janela de baixo tráfego com o PO antes do `@devops *push`.
> 5. **Atenção CONCURRENTLY:** não pode rodar dentro de uma transação. O Supabase CLI faz cada arquivo em uma transação por default — splitar migrations grandes ou usar `-- supabase: split-statements` se a CLI suportar; alternativamente aplicar índices via SQL Editor do Studio com ordem documentada.

**Critério de aceitação funcional:**
- `EXPLAIN ANALYZE` em queries hot mostra index scan em vez de seq scan.
- Dashboard ROAS (`/dashboard/campaigns/meta`) abre em <500ms (vs 2–5s baseline).
- `system_events` para de crescer indefinidamente (validar tamanho 7 dias após Story 29.7).
- `supabase migration list` mostra paridade local vs remote pós-Story 29.1.
- Zero downtime observado durante criação dos índices (validar via Speed Insights p99 do período de deploy).

**Total estimado:** 28 story points / ~5 dias úteis (com QA gate cuidadoso porque DB mudanças exigem rollback plan).

---

## 6. Epic 30 — Over-fetch & N+1 Killers

**Objetivo:** Reescrever queries que carregam ordens de magnitude mais dados que o necessário.

**Por que depois de 29:** Algumas dessas queries são "salvas" pelos índices novos. Outras precisam ser reescritas porque o problema é estrutural (carregar 10k rows em vez de fazer GROUP BY).

### Stories propostas

| # | Story | Agentes | Esforço | Story points |
|---|-------|---------|---------|--------------|
| 30.1 | Reescrever `/dashboard/analytics` e `/api/analytics/*`: substituir `leads(id)` joins por count agregado server-side via RPC `analytics_get_counts_by_entity(org_id, entity)` ou Promise.all de `.select('*', { count: 'exact', head: true })`. Esperado: 50.000 → 21 valores no payload | @sm → @architect → @dev → @qa → @devops | 1 dia | 8 |
| 30.2 | Reescrever `/dashboard/conversas`: criar coluna desnormalizada `conversations.last_message_preview text, last_message_role varchar(20)` + trigger `AFTER INSERT ON messages`; remover query `messages.in(conversation_ids).order().NO_LIMIT` | @sm → @data-engineer → @dev → @qa → @devops | 4h | 5 |
| 30.3 | Adicionar paginação real em `/dashboard/leads/page.tsx` (`.range(0, 49)` + searchParams `?page=N`) + virtualization opcional | @sm → @dev → @qa → @devops | 4h | 5 |
| 30.4 | Adicionar paginação por stage em `/dashboard/pipeline/page.tsx` (top 50 leads por stage com "carregar mais"); medir hidratação antes/depois com Speed Insights | @sm → @dev → @qa → @devops | 1 dia | 5 |
| 30.5 | Reescrever home `/dashboard/page.tsx`: substituir `Promise.all(stages.map(... count))` por uma única query `SELECT stage_id, COUNT(*) FROM leads WHERE org_id=$1 AND is_active=true GROUP BY stage_id` via RPC ou view | @sm → @dev → @qa → @devops | 2h | 3 |
| 30.6 | Fixar bug em `/api/dashboard/metrics` linha 56–80: query usa `.eq("stage", "qualified")` mas coluna é `stage_id` uuid (counts retornam 0 silenciosamente). Trocar para `.eq("stage_id", qualifiedStageId)` ou filtrar via JOIN com `kanban_stages.name` | @sm → @dev → @qa → @devops | 1h | 3 |
| 30.7 | Refatorar `/dashboard/leads/[id]`: limitar `messages:messages(...)` aninhado em conversations para `.order('created_at', { ascending: false }).limit(20)` | @sm → @dev → @qa → @devops | 1h | 2 |
| 30.8 | Refatorar `/api/system-events/route.ts`: substituir 15 queries sequenciais por 1 RPC `get_dashboard_metrics(org_id, window_hours)` retornando JSON com todos os counts agregados | @sm → @data-engineer → @dev → @qa → @devops | 4h | 5 |
| 30.9 | Adicionar paginação real em `/api/admin/mensagens`: SQL pagination em vez de `.slice(offset, offset+limit)` em JS após carregar tudo | @sm → @dev → @qa → @devops | 2h | 3 |

**Critério de aceitação do Epic:**
- `/dashboard/analytics` TTFB <300ms (vs ~800ms baseline) — medido por Speed Insights.
- Payload de `/dashboard/conversas` cai 90%+ — medido em Network DevTools.
- `/dashboard/leads` com 5k+ leads carrega <500ms.
- Métricas de `/dashboard` (counts por stage) param de retornar 0 (Story 30.6).

**Total estimado:** 39 story points / ~1.5 sprint.

---

## 7. Epic 31 — Caching Layer & Auth Optimization

**Objetivo:** Implementar caching em 4 camadas: request, cross-request, HTTP, client-router.

**Por que depois de 30:** Cachear over-fetch perpetua o problema. Primeiro reduzir payload, depois cachear.

### Stories propostas

| # | Story | Agentes | Esforço | Story points |
|---|-------|---------|---------|--------------|
| 31.1 | Wrap `getServerUser` com `React.cache()` em `src/lib/auth.ts`. Validar com `console.time` que dedupes ocorrem dentro do mesmo render | @sm → @dev → @qa → @devops | 30 min | 2 |
| 31.2 | Persistir `role` em `app_metadata` no Supabase Auth na criação do user (server action) e ler do JWT no middleware sem hit no DB; manter fallback DB para users legados | @sm → @architect → @dev → @qa → @devops | 4h | 5 |
| 31.3 | Criar `<UserProvider>` (Server Component que passa user para Context Client) + refatorar `useUser()` hook para ler do Context (sem auth.getUser) | @sm → @dev → @qa → @devops | 3h | 3 |
| 31.4 | Criar `lib/cache/referential.ts` com `getStages(orgId)`, `getProperties(orgId)`, `getBrokers(orgId)` usando `unstable_cache` com tags `['stages:${orgId}']` etc., revalidate 5 min | @sm → @architect → @dev → @qa → @devops | 4h | 5 |
| 31.5 | Adicionar `revalidateTag` em todas as server actions que mutam `kanban_stages`, `properties`, `users` (broker), `organizations` | @sm → @dev → @qa → @devops | 3h | 3 |
| 31.6 | Cache em sidebar badges (`alertCount`, `mensagensCount` em `dashboard/layout.tsx`): `unstable_cache` com tag `badges:${orgId}` + invalidação em lead create / message read | @sm → @dev → @qa → @devops | 3h | 3 |
| 31.7 | Adicionar `document.visibilityState === 'hidden' ? skip : fetch` em pollings de 30s: `/dashboard/sistema/page.tsx`, `/dashboard/sistema/emails/page.tsx`, `/dashboard/sistema/webhooks/page.tsx` | @sm → @dev → @qa → @devops | 1h | 2 |
| 31.8 | Avaliar migrar pollings para Supabase Realtime subscriptions onde fizer sentido (`system_events` para `/sistema`) — spike de 4h pra decidir | @sm → @architect → @dev → @qa → @devops | 1 dia (spike + decisão) | 5 |

**Critério de aceitação do Epic:**
- RTTs Supabase por page view cai de 3–4 para 1–2 (medido via Speed Insights server timing + `withTiming` da Story 27.5).
- Lista de stages/properties/brokers retorna do cache em <5ms na maioria das requests (medido com `unstable_cache` hit rate em metadata).
- Aba em background não dispara fetches inúteis (verificado por DevTools throttling).

**Total estimado:** 28 story points / ~1 sprint.

---

## 8. Epic 32 — Bundle & Rendering Optimization

**Objetivo:** Reduzir JS no client + introduzir streaming SSR para percepção de velocidade.

**Por que depois de 31:** Auth + caching reduzem trabalho de servidor; agora atacar o que o cliente recebe.

### Stories propostas

| # | Story | Agentes | Esforço | Story points |
|---|-------|---------|---------|--------------|
| 32.1 | `dynamic({ ssr: false })` no `LeadsChart` (recharts) em `/dashboard/analytics`. Adicionar `ChartSkeleton`. Esperado: -90 KB gzip da rota | @sm → @dev → @qa → @devops | 1h | 2 |
| 32.2 | `dynamic({ ssr: false })` no `LeadDetailDrawer` em `kanban-board.tsx`. Esperado: -50 KB gzip em `/dashboard/pipeline` | @sm → @dev → @qa → @devops | 1h | 2 |
| 32.3 | `dynamic` em modais e wizards: `preview-modal.tsx`, `wizard.tsx` (email-blasts/novo), `foto-upload-form.tsx`, `obra-edit-modal.tsx`, `privacy-consent-modal.tsx` | @sm → @dev → @qa → @devops | 3h | 3 |
| 32.4 | Quebrar `campaign-detail-client.tsx` (1080 LOC) em islands: Header server, AdSets table server (sort no SQL), Chart timeseries dynamic+ssr:false, Modal budget dynamic, Action log com Suspense | @sm → @ux-design-expert (review UX) → @dev → @qa → @devops | 1 semana | 13 |
| 32.5 | Adicionar `<Suspense>` por card em `/dashboard/analytics` e `/dashboard` (home) — cada card vira async Server Component com loading skeleton individual | @sm → @architect → @dev → @qa → @devops | 1 dia | 8 |
| 32.6 | Audit de `'use client'` em pages grandes (>500 LOC): `agenda/page.tsx`, `properties/[id]/units/[unitId]/page.tsx`. Mover lógica não-interativa para Server Components, manter `'use client'` em folhas pequenas | @sm → @architect → @dev → @qa → @devops | 1 semana | 13 |
| 32.7 | Botões small de delete/edit em `/dashboard/obras/*` que são `'use client'` virarem `<form action={serverAction}>` puro (Next 15+ Form Actions) | @sm → @dev → @qa → @devops | 4h | 3 |
| 32.8 | Substituir `googleapis@171` (194 MB) por imports específicos `googleapis/build/src/apis/forms` + `googleapis/build/src/apis/drive` + `google-auth-library` standalone, OU migrar para fetch REST + `google-auth-library` apenas | @sm → @architect → @dev → @qa → @devops | 2 dias | 8 |
| 32.9 | Confirmar identidade de `lucide-react@1.7.0` (npm view); se for fork, migrar para `lucide-react@0.4xx` oficial | @sm → @dev → @qa → @devops | 2h + decisão | 3 |
| 32.10 | Edge runtime nas rotas read-only que não tocam googleapis/web-push/resend: `/api/analytics/*`, `/api/dashboard/metrics`, `/api/leads/[id]/timeline`, `/api/health` — `export const runtime = 'edge'` | @sm → @architect → @dev → @qa → @devops | 1 dia | 5 |

**Critério de aceitação do Epic:**
- Bundle inicial cai ≥35% (do baseline pós-Sprint 1).
- LCP em `/dashboard/analytics` <1s (medido Speed Insights).
- Cold start em rotas edge cai para <100ms.
- Página `/dashboard/campaigns/meta/[campaign_id]` interativa em <500ms.

**Total estimado:** 60 story points / ~2 sprints.

---

## 9. Epic 33 — Backend Heavy Lifting

**Objetivo:** Refatorar handlers mais pesados (cron, RLS, signed URLs, SW).

### Stories propostas

| # | Story | Agentes | Esforço | Story points |
|---|-------|---------|---------|--------------|
| 33.1 | Refatorar `/api/cron/followup/route.ts` (487 linhas, ~800 queries/exec): substituir por 1 query LATERAL + bulk inserts. Target: ≤15 queries totais | @sm → @data-engineer → @dev → @qa → @devops | 3 dias | 13 |
| 33.2 | Adicionar filtro `org_id` + `WHERE scheduled_at > now() - interval '30 days'` no SELECT de `completedAppointments` em followup cron (linha 278) | @sm → @dev → @qa → @devops | 1h | 2 |
| 33.3 | Paralelizar `email-queue` cron com `Promise.allSettled` + `p-limit(5)` (respeitar rate Resend) + adicionar `processing_started_at` + recovery cron para items presos >1h | @sm → @dev → @qa → @devops | 1 dia | 8 |
| 33.4 | Migration `036_denormalize_messages_org_id.sql`: ADD COLUMN `messages.org_id`, backfill via UPDATE FROM conversations, ALTER NOT NULL, trigger consistency, simplificar RLS de `messages` para `org_id = user_org_id()` direto | @sm → @data-engineer → @qa → @devops | 1 dia | 8 |
| 33.5 | Refatorar RLS de `obra_mensagens`, `typologies`, `units` no padrão de `meta_campaigns` (org_id direto sem EXISTS aninhado) | @sm → @data-engineer → @qa → @devops | 1 dia | 8 |
| 33.6 | Batch signed URLs no SSR de `/cliente/[obra_id]/mensagens`: gerar todas as URLs num único `createSignedUrls(paths)` no server, passar como props (sem N round-trips client) | @sm → @dev → @qa → @devops | 1 dia | 5 |
| 33.7 | Refatorar Service Worker: escopar registration somente em `/cliente/*` (não global), cache real (network-first p/ API, stale-while-revalidate p/ assets), versionamento com build hash | @sm → @architect → @dev → @qa → @devops | 1 dia | 5 |
| 33.8 | Push notifications retry + structured logging: distinguir 4xx (delete sub) vs 5xx/network (retry com backoff), `logEvent({ category: 'push', event_type: 'delivery_failed' })` | @sm → @dev → @qa → @devops | 4h | 3 |
| 33.9 | Garantir `triggerAutomations` em `/api/leads` POST usa `after()` do Next 15 em vez de `void` fire-and-forget (evita GC prematuro no Vercel) | @sm → @dev → @qa → @devops | 1h | 2 |

**Critério de aceitação do Epic:**
- Cron followup completa em <30s mesmo com 1000 leads ativos (vs hoje, timeout em larga escala).
- Email queue não tem mais items presos em `status='processing'` >1h.
- RLS de `messages` mostra plan execution sem subqueries aninhadas (`EXPLAIN ANALYZE`).
- Chat de mensagens com 50 mídias abre em <800ms (vs ~5s).

**Total estimado:** 54 story points / ~2 sprints.

---

## 10. Epic 34 — Hardening & Long-term

**Objetivo:** Rede de segurança permanente. Continuous improvement.

### Stories propostas

| # | Story | Agentes | Esforço | Story points |
|---|-------|---------|---------|--------------|
| 34.1 | E2E smoke tests com Playwright para fluxos críticos: login → dashboard → criar lead → ver lead detail; portal cliente → ver obra → enviar mensagem | @sm → @qa → @devops | 1 semana | 13 |
| 34.2 | Snapshot test do bundle size — falhar CI se `.next/build` aumentar >5% sem aprovação no PR | @sm → @devops | 4h | 3 |
| 34.3 | Lighthouse CI: rodar em PR contra preview deploy, falhar se LCP > 2.5s ou CLS > 0.1 nas rotas críticas | @sm → @devops | 1 dia | 5 |
| 34.4 | Particionar `system_events` por mês (`PARTITION BY RANGE (created_at)`) + automação de criação/drop de partições antigas via pg_cron | @sm → @data-engineer → @qa → @devops | 1 dia + downtime curto | 8 |
| 34.5 | Particionar `messages` e `obra_mensagens` por mês — após Story 30.2 estar estável | @sm → @data-engineer → @qa → @devops | 2 dias + downtime | 13 |
| 34.6 | Particionar `webhook_logs` por mês + retention 90 dias | @sm → @data-engineer → @qa → @devops | 1 dia | 5 |
| 34.7 | Virtualization em tabelas grandes: instalar `@tanstack/react-virtual`, aplicar em `/dashboard/leads`, `/dashboard/sistema/emails`, `/dashboard/sistema/webhooks`, Kanban columns | @sm → @dev → @qa → @devops | 1 semana | 13 |
| 34.8 | Rate limiting com `@upstash/ratelimit` em middleware: 100 req/s por IP nos webhooks Meta/WhatsApp; 60 req/min/user em endpoints dashboard | @sm → @architect → @dev → @qa → @devops | 1 dia | 5 |
| 34.9 | Fixar erros de TS gerados pelo `noUncheckedIndexedAccess` em `api/*` (onda 2 do Story 28.3) | @sm → @dev → @qa → @devops | 3 dias | 8 |
| 34.10 | Substituir os 86 `useEffect+fetch` por SWR ou TanStack Query (instalar lib) — migração incremental, prioritizar telas com polling | @sm → @architect → @dev → @qa → @devops | 2 semanas | 21 |
| 34.11 | OpenTelemetry SDK via `instrumentation.ts` exportando para Vercel OTel collector ou Honeycomb | @sm → @architect → @dev → @qa → @devops | 1 semana | 13 |
| 34.12 | Avaliar substituir cron jobs polling por webhooks/realtime onde aplicável (campaign-poll cada 3min é caro) | @sm → @architect → @dev → @qa → @devops | spike 4h + execução variável | — |

**Critério de aceitação do Epic:**
- E2E suite passa em CI.
- Bundle não cresce sem aprovação.
- Lighthouse CI ativo em PR.
- `system_events`, `messages`, `obra_mensagens`, `webhook_logs` particionadas.
- Rate limiting ativo em webhooks.

**Total estimado:** ~120 story points / contínuo ao longo de 4–6 sprints.

---

## 11. Roadmap visual (sugerido)

```
Semana 1   ████ Epic 27 — Observabilidade (Speed Insights, Sentry, error.tsx)
Semana 2   ████ Epic 28 — Next.js config quick wins (next.config, ts target, loading.tsx)
Semana 3   ████ Epic 29 — DB Blitz (indexes, ROAS materialized, pg_cron cleanup)
Semana 4   ██   Epic 30 — Over-fetch parte 1 (analytics, conversas, dashboard home)
Semana 5     ██ Epic 30 — Over-fetch parte 2 (leads, pipeline, system-events RPC)
Semana 6   ██   Epic 31 — Caching parte 1 (React.cache, app_metadata, UserProvider)
Semana 7     ██ Epic 31 — Caching parte 2 (unstable_cache referencial, revalidateTag, visibility guards)
Semana 8   ████ Epic 32 — Bundle parte 1 (dynamic imports, Suspense)
Semana 9   ████ Epic 32 — Bundle parte 2 (campaign-detail split, googleapis refactor, edge runtime)
Semana 10  ██   Epic 33 — Backend parte 1 (followup cron refactor, email-queue parallel)
Semana 11    ██ Epic 33 — Backend parte 2 (messages.org_id denorm, signed URLs batch, SW scope)
Semana 12+ contínuo Epic 34 — Hardening (E2E, partition, virtualization, rate limit, SWR migration)
```

> **Cadência sugerida:** Sprints de 1 semana para Epics 27–28 (quick wins), 2 semanas para 30–32 (refactors), tracking via QA Loop nos Epics 29, 33 (DB e backend, mais críticos).

---

## 12. Resumo executivo de esforço total

| Epic | Story points | Duração estimada | Risco |
|------|--------------|------------------|-------|
| 27 — Observabilidade | 20 | 3 dias úteis | Baixo |
| 28 — Next.js Config | 19 | 3 dias úteis | Baixo |
| 29 — DB Blitz | 28 | 5 dias úteis | Médio (DB) |
| 30 — Over-fetch Killers | 39 | 1.5 sprint | Médio |
| 31 — Caching & Auth | 28 | 1 sprint | Médio |
| 32 — Bundle & Rendering | 60 | 2 sprints | Médio-Alto |
| 33 — Backend Heavy | 54 | 2 sprints | Alto |
| 34 — Hardening | ~120 | Contínuo (4–6 sprints) | Baixo (testes), Alto (partition) |
| **Total** | **~368 SP** | **~12–14 semanas** focused | — |

---

## 13. Próximos passos AIOS (handoff)

Esta auditoria é o input para o ciclo SDC (Story Development Cycle). Os passos abaixo seguem a Constitution do AIOS (`.aios-core/constitution.md`):

### Passo 1 — Validação pelo PO

```
@po *validate-plan docs/audits/PERFORMANCE-PLAN.md
```

PO confirma escopo, prioridade e dependências. Em particular, decide:
- Bater Epic 27 antes de tudo (recomendação Quinn) ou paralelizar 28 também?
- Aceitar custo Sentry (free tier suficiente?) e adicionar `@vercel/speed-insights` (custo zero no Pro)?
- Particionamento de `system_events` (Story 34.4) tem downtime curto — janela aceitável?

### Passo 2 — Criação oficial dos Epics pelo PM

```
@pm *create-epic 27 — Performance Observability Foundation
@pm *create-epic 28 — Next.js Config Quick Wins
... (um por vez ou batch)
```

PM expande cada Epic com: business value, success metrics, risks, dependencies, e gera `EPIC-{ID}-EXECUTION.yaml`.

### Passo 3 — SM cria stories conforme PM execute-epic

Para cada Epic em execução, ciclo padrão:

```
@pm *execute-epic 27           # PM ativa epic, marca story 27.1 como "next"
@sm *draft 27.1                # SM cria docs/stories/active/27-1-*.md
@po *validate-story 27.1       # PO 10-point checklist
@dev *develop                  # Dex implementa (modo YOLO por default)
@qa *qa-gate                   # Quinn executa quality gate
@devops *push                  # Gage faz commit + PR
```

### Passo 4 — Quality gates específicos por Epic

| Epic | Gate adicional |
|------|----------------|
| 27 | Speed Insights ativo no dashboard Vercel; Sentry recebendo eventos teste |
| 29 | `EXPLAIN ANALYZE` antes/depois das migrations comparados em PR |
| 30 | Speed Insights antes/depois comparados em PR (LCP/INP melhora demonstrada) |
| 32 | Bundle analyzer antes/depois anexado ao PR |
| 33 | Cron job rodado em staging antes do merge; métricas duration_ms ≤ baseline |

### Passo 5 — Métricas de sucesso global

Reportar quinzenalmente (durante sprints):

- LCP p75 (target: <1.5s no dashboard, <1s no portal cliente)
- INP p75 (target: <200ms)
- TTFB p75 (target: <400ms em rotas autenticadas)
- Bundle inicial first-load (target: <250 KB gzip)
- Cold start lambda p95 (target: <300ms para rotas que não tocam googleapis)
- Queries Supabase / page view p50 (target: <3)
- Erros não capturados (target: <0.1% de eventos)

---

## 14. Anexo — Localização dos 4 relatórios fonte

| Relatório | Path | Autor |
|-----------|------|-------|
| Arquitetural | `/Users/ogabrielhr/trifold-crm/docs/audits/performance-architecture-audit.md` | Aria (@architect) |
| Database | `/Users/ogabrielhr/trifold-crm/docs/audits/performance-database-audit.md` | Dara (@data-engineer) |
| Bundle & Deps | `/Users/ogabrielhr/trifold-crm/docs/audits/performance-bundle-audit.md` | Análise estática |
| Observabilidade & QA | `/Users/ogabrielhr/trifold-crm/docs/audits/performance-observability-audit.md` | Quinn (@qa) |

> Os 4 relatórios são a **fonte da verdade** detalhada. Este plano mestre é o **mapa de execução** com priorização e dependências. Quando houver ambiguidade em uma Story, consultar o relatório fonte correspondente.

---

**Próxima ação sugerida ao Gabriel:**

1. Ler este documento + os 4 relatórios anexos.
2. Decidir corte: quero todos os 8 Epics? Quais cortar/adiar?
3. Confirmar custos novos (Sentry — free tier suficiente?, Upstash — se Epic 34.8 aprovado).
4. Quando aprovado: ativar `@po` para validar o plano, depois `@pm *create-epic 27` para começar.
