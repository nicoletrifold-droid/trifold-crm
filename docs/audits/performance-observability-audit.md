# Auditoria de Observabilidade & Qualidade para Performance — Trifold CRM

**Auditor:** Quinn (QA Guardian, AIOS)
**Data:** 2026-05-12
**Branch:** `main` (HEAD: 65af123)
**Escopo:** `packages/web` + cron jobs + webhooks + service worker
**Stack auditado:** Next.js 16.2.2, React 19.2.4, Supabase, Vercel, web-push
**Modo:** Análise estática + leitura de configs — **NENHUM CÓDIGO MODIFICADO**

---

## TL;DR — Visibilidade Atual

> **A equipe hoje está cega para performance.** Não existe um único caminho instrumentado para responder "qual rota está lenta?", "qual o LCP do cliente?", "qual query Supabase é a mais cara?", "quanto tempo a Nicole leva para responder?".

O que existe hoje:

| Capacidade | Status | Observação |
|------------|--------|------------|
| Logs estruturados em DB | PARCIAL | `system_events` existe (mig 009), mas só 8 arquivos em todo `packages/web/src` usam `logEvent` — em 112 rotas API |
| Console logs em produção | SIM | 151 `console.*` calls (80 client + 66 API), sem level filtering, sem sampling |
| Health check | SIM | `/api/health` testa Supabase + env vars; **não testa Resend, Anthropic, Telegram, Meta Graph** |
| Web Vitals (LCP/INP/CLS) | NÃO | Zero referência a `web-vitals`, `reportWebVitals`, `onLCP`, etc. |
| RUM (Real User Monitoring) | NÃO | Sem `@vercel/analytics` nem `@vercel/speed-insights` |
| APM / tracing | NÃO | Sem OpenTelemetry, Sentry, Datadog, New Relic |
| Error tracking | NÃO | Erros vão para `console.error` (volátil) + às vezes `system_events` |
| Bundle size tracking | NÃO | Sem `@next/bundle-analyzer`, sem CI check |
| Query Supabase timing | QUASE NADA | 5 `latency_ms` em 524 `await supabase.*` (~1%) |
| Error boundaries por rota | QUASE NADA | 2 `error.tsx` em 144 arquivos `.tsx` (só rotas `/cliente/[obra_id]`) |
| Rate limiting | NÃO | Sem middleware, sem `ratelimit`, sem `upstash` |
| Coverage de testes | BAIXÍSSIMO | **16 test files** em todo o monorepo; **2 em `packages/web`** |

**Diagnóstico em uma frase:** *Existe logging básico em DB, mas não existe observabilidade. Performance só vai melhorar de forma reativa (quando o usuário reclamar) até que instrumentação seja adicionada.*

---

## Gaps Críticos de Observabilidade

### 🔴 P0-1: Sem Web Vitals — invisível ao usuário real

**Evidência:**
- `/Users/ogabrielhr/trifold-crm/packages/web/src/app/layout.tsx` não exporta `reportWebVitals` nem importa qualquer biblioteca de métricas.
- `grep -rn "reportWebVitals|web-vitals|onCLS|onINP|onLCP" packages/web/src` retornou **vazio**.
- `package.json` não declara `@vercel/analytics` nem `@vercel/speed-insights`.

**Impacto:** Não há como saber LCP/INP/CLS reais. Se o portal do cliente (`/cliente/[obra_id]`) estiver lento em mobile 3G, ninguém percebe até alguém reclamar. Como o app já é PWA com SW (`mig 023`), a falta de RUM é mais grave — você não vê regressões pós-deploy.

**Recomendação:**
1. Instalar `@vercel/speed-insights` + `@vercel/analytics` (1 linha no `layout.tsx` cada) — custo zero no plano Hobby/Pro.
2. Implementar `reportWebVitals` enviando para `system_events` (ou Vercel) com `org_id` e `route` no payload — você já tem o sink.

---

### 🔴 P0-2: Logger estruturado existe, mas é ignorado em 93% das rotas

**Evidência:**
- `/Users/ogabrielhr/trifold-crm/packages/web/src/lib/logger.ts` define `logEvent({ level, category, event_type, message, metadata })` com sink no DB.
- **Apenas 7 arquivos** em `packages/web/src/app/api` chamam `logEvent`. Existem **112 rotas API**.
- Os outros **66 usos de console.* em rotas API** não vão para `system_events` — só para os logs voláteis da Vercel (limite de retenção curta).

**Impacto:**
- A dashboard `/dashboard/sistema/page.tsx` exibe `errors_24h` e `messages_24h` — mas como 93% das rotas não logam estruturado, esses contadores subnotificam massivamente o que está realmente quebrando.
- Erros em endpoints "frios" (e.g., cron `/api/cron/keep-alive`, `/api/properties`, `/api/leads`, etc.) só aparecem se alguém abrir o Vercel Dashboard a tempo.

**Recomendação:**
1. Criar regra ESLint customizada que **proíbe `console.error` em `app/api/**`** e força `logEvent({ level: 'error', ... })`.
2. Migrar gradualmente — começar pelas rotas mais quentes: `/api/leads`, `/api/cron/*`, `/api/webhook/*`.
3. Padronizar `metadata` para incluir SEMPRE `duration_ms`, `user_id` (se autenticado), `request_id`.

---

### 🔴 P0-3: Zero error boundaries em `/dashboard` — uma exception derruba o app inteiro

**Evidência:**
- `find packages/web/src/app -name "error.tsx"` retorna **apenas 2 arquivos**:
  - `cliente/[obra_id]/error.tsx`
  - `cliente/[obra_id]/mensagens/error.tsx`
- **Nenhum `error.tsx`** em `/dashboard`, `/broker`, root layout, ou qualquer outra rota.
- **Nenhum `global-error.tsx`** existe (catch-all do Next 16).

**Impacto:** Se um componente da dashboard estourar (ex: `recharts` em `analytics`, JSON malformado vindo de Supabase, undefined index, etc.), o usuário vê uma tela em branco e o React derruba toda a árvore. Não há captura.

**Recomendação:**
1. Adicionar `/app/global-error.tsx` (obrigatório para capturar erros do root layout no Next 16).
2. Adicionar `/app/dashboard/error.tsx` e `/app/broker/error.tsx` (no mínimo).
3. Cada `error.tsx` deve chamar `logEvent({ level: 'error', category: 'ui', metadata: { stack, digest, route } })`.

---

### 🔴 P0-4: Health check incompleto — não monitora dependências externas reais

**Evidência:** `/Users/ogabrielhr/trifold-crm/packages/web/src/app/api/health/route.ts` linhas 13-43.
- Testa: Supabase (`organizations` table query) + env vars presentes.
- **Não testa:** Resend (envio email), Anthropic API (latência Claude), Telegram Bot API, Meta Graph API, Web Push (VAPID), Storage.

**Impacto:** O health pode retornar 200 OK mesmo com Resend caído (Story 21.x depende de Resend), com Anthropic em rate limit (Nicole para), com WABA token expirado (já caiu em 2026-05-04). Vercel cron `/api/cron/webhook-health` existe mas não foi inspecionado aqui — vale validar.

**Recomendação:**
1. Adicionar checks paralelos com `Promise.allSettled` para: Resend ping (`GET /domains`), Anthropic (`GET /v1/models` com 2s timeout), Meta Graph (`GET /me?fields=id` se WABA configurado).
2. Categorizar em `critical` (Supabase, Anthropic) e `degraded` (Resend, Telegram) — retornar 503 só quando `critical` cai.
3. Documentar SLOs no README e linkar à dashboard `/dashboard/sistema`.

---

## 🟡 Gaps P1 (importantes mas não bloqueantes)

### 🟡 P1-1: Sem timing de query Supabase em 99% das chamadas

**Evidência:**
- 524 ocorrências de `await supabase` em `packages/web/src`.
- Apenas 5 `latency_ms` / `duration_ms` em rotas API.
- O único timing real está no `/api/health` (linha 23-25) e em `/api/cron/keep-alive` (linha 25).

**Impacto:** Quando o app fica lento, é impossível saber se é DB, network, render, ou Anthropic. Cego.

**Recomendação:**
1. Criar wrapper `withTiming(label, fn)` em `lib/observability.ts` e instrumentar pelo menos as 10 rotas mais quentes (mensagens, leads, properties).
2. Logar p50/p95 por categoria em `system_events.metadata`.

---

### 🟡 P1-2: 86 useEffects, 52 call sites — risco de race conditions em fetches

**Evidência:**
- `grep -rn "useEffect(" packages/web/src --include="*.tsx"` → **52 call sites**.
- `grep -rn "AbortController|signal:" packages/web/src` → **16 ocorrências** (incluindo um wrapper).
- `grep -rn "let cancelled|let isMounted" packages/web/src` → **2 guards** (`lead-detail-drawer.tsx`).
- O padrão dominante é `fetch().then(setState)` sem proteção contra unmount/refetch concorrente.

**Impacto:** Em telas com filtros (e.g., `/dashboard/sistema/page.tsx` linha 84-88, polling de 30s + filtros mutáveis `filterLevel`/`filterCategory`), múltiplos fetches podem voltar fora de ordem e sobrescrever estado mais novo com estado mais velho — bug clássico de "esta tela parece travada".

**Arquivos com risco alto identificados:**
- `app/dashboard/sistema/page.tsx` — polling 30s + 2 filtros, sem AbortController.
- `app/dashboard/sistema/emails/page.tsx` — polling 30s.
- `app/dashboard/sistema/webhooks/page.tsx` — polling 30s.
- `app/dashboard/mensagens/_components/mensagens-inbox.tsx` — debounce + fetch.
- `app/cliente/[obra_id]/notificacoes/page.tsx` — fetch em effect sem cancelamento.

**Recomendação:**
1. Adotar SWR ou TanStack Query (já são padrão Next 16) — eles cuidam de cancellation, dedupe, stale-while-revalidate, e cache automático.
2. Antes da migração: padronizar guard pattern (`AbortController` ou `cancelled` flag) em todo `useEffect` que faz `fetch`.

---

### 🟡 P1-3: `useEffect` total (86) >> cleanup (`return () =>`, 12) — possível vazamento de listeners e timers

**Evidência:**
- 22 `setInterval/setTimeout` vs 9 `clearInterval/clearTimeout` — diferença de 13, alguns são de fato sem cleanup (intencional? acidental?).
- Realtime channels (`admin-chat-feed.tsx`, `cliente/.../chat-feed.tsx`) **têm cleanup correto** (`removeChannel`) — bom.
- Listeners `document.addEventListener` em `lead-detail-drawer.tsx` **têm cleanup** — bom.

**Impacto moderado:** Em SPAs com long sessions (CRM operacional roda o dia todo), timers órfãos acumulam, segurando closures grandes. RAM cresce, GC pausa, UI trava.

**Recomendação:**
1. Habilitar `eslint-plugin-react-hooks` com `exhaustive-deps: error` (atualmente `eslint-config-next` traz como warn).
2. Code-mod: adicionar lint custom que avisa quando `useEffect` declara `setInterval/setTimeout/addEventListener` sem `return`.

---

### 🟡 P1-4: 144 `.tsx` files, 77 com `"use client"` — sobre-clientelização

**Evidência:**
- **53% dos componentes são client components.** Em apps Next 16 bem otimizados, esse número fica abaixo de 30%.
- Layouts dashboard estão Server Components (bom), mas páginas inteiras tipo `dashboard/sistema/page.tsx` são client porque precisam de `useEffect` para fetch — quando poderiam ser RSC com Server Action.

**Impacto:** Bundle JS maior, hidratação mais lenta, mais re-renders. LCP no dashboard provavelmente sofre.

**Recomendação:**
1. Converter páginas pure-fetch (`/dashboard/sistema/*`) para Server Components com `revalidate: 30` ou Server Action — elimina o polling client-side.
2. Manter "use client" apenas em folhas com interatividade real (forms, modals, charts).
3. Medir bundle antes/depois com `@next/bundle-analyzer`.

---

### 🟡 P1-5: Cron `email-queue` processa serial — concorrência zero

**Evidência:** `/Users/ogabrielhr/trifold-crm/packages/web/src/app/api/cron/email-queue/route.ts` linhas 54-159.
- Loop `for (const orgId of orgIds)` linha 54.
- Dentro, loop `for (const item of items)` linha 104.
- Cada item faz `await sendEmail(...)` + 2 `await supabase.update(...)` em **sequência total**.
- Sem `Promise.all`, sem batch, sem `p-limit`.

**Impacto:** Com `BATCH_SIZE=50` e Resend respondendo ~500ms, processar 1 org leva 25s só de Resend, mais 2-5s de DB updates. **Vercel cron tem timeout default de 10s no plano Hobby**, 60s no Pro. Se houver 5 orgs, o cron timeouta. Emails ficam em "processing" para sempre (não há TTL/recovery visível).

**Recomendação:**
1. Paralelizar com `Promise.allSettled` + `p-limit(5)` (limite Resend respeita rate).
2. Adicionar `processing_started_at` + cron de "unstick" para recuperar items presos.
3. Logar `duration_ms` total + emails/segundo em `system_events`.

---

### 🟡 P1-6: Push notifications sem queue e sem retry — falhas silenciosas

**Evidência:** `/Users/ogabrielhr/trifold-crm/packages/web/src/lib/server/push-service.ts`
- `Promise.allSettled` envia em paralelo (bom).
- `.catch` engole erro silenciosamente — apenas trata `statusCode === 410` (subscription expirada).
- **Não loga** falhas, **não retenta** outros códigos (500 do gateway, network timeout, etc.).
- Sem `logEvent`, sem `console.error` para outras falhas.

**Impacto:** Push enviado pro corretor pode falhar (timeout, gateway 5xx) e ninguém percebe. Apenas notificações expiradas viram observáveis (pela limpeza). Em produção, taxa de delivery real é desconhecida.

**Recomendação:**
1. No `.catch`, distinguir códigos: 4xx (cliente, delete sub se 404/410) vs 5xx/network (retry com backoff + log warn).
2. Adicionar `logEvent({ category: 'push', event_type: 'delivery_failed', metadata: { user_id, statusCode } })`.

---

### 🟡 P1-7: Sem rate limiting em endpoints públicos / webhooks

**Evidência:**
- `ls packages/web/middleware*` retorna nada — **não há middleware**.
- `grep -rn "rate.limit|ratelimit" packages/web/src` retorna **zero**.
- Webhooks `whatsapp`, `resend`, `meta-ads` validam HMAC (bom) mas não têm proteção contra burst/replay sustained.

**Impacto:** Se Meta enviar 10k webhooks/s em backfill (já aconteceu historicamente em outros sistemas), a função serverless escala e o DB Supabase é o gargalo. Pode esgotar connections, derrubar a produção.

**Recomendação:**
1. Adicionar `@upstash/ratelimit` em webhooks: 100 req/s por IP é suficiente para Meta.
2. Considerar middleware de auth (`packages/web/src/middleware.ts`) que rate-limit dashboard.

---

### 🟡 P1-8: TS `strict` ligado, mas `noUncheckedIndexedAccess` desligado

**Evidência:** `packages/web/tsconfig.json` e `tsconfig.json` root.
- `"strict": true` — bom.
- **Falta** `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`.

**Impacto:** Acesso `array[0]` retorna tipo sem `| undefined` — em runtime, `Cannot read properties of undefined` é o erro mais comum em prod. O processamento da `email-queue` (linhas 81-101) faz vários `as Record<...>` casts que mascararam isso — bomba relógio.

**Recomendação:**
1. Ligar `noUncheckedIndexedAccess: true` no `packages/web/tsconfig.json` — esperar centenas de erros, corrigir aos poucos por feature.
2. Considerar `exactOptionalPropertyTypes: true` no longo prazo.

---

## Bugs de Performance Prováveis no Código

### Suspeita-1: Cron `email-queue` pode estourar timeout do Vercel
**Local:** `app/api/cron/email-queue/route.ts:54-159`
**Sintoma esperado:** Função serverless retorna 504 ou trunca; emails ficam em `status='processing'` permanentemente.
**Como confirmar:** Procurar registros em `email_sends_queue WHERE status='processing' AND scheduled_for < NOW() - INTERVAL '1 hour'`.

### Suspeita-2: Polling em `/dashboard/sistema` cria fetch concorrentes ao trocar filtro rápido
**Local:** `app/dashboard/sistema/page.tsx:84-88`
**Sintoma esperado:** UI mostra dados antigos por alguns segundos depois de trocar filtro; flickering.
**Como confirmar:** Abrir DevTools → Network, trocar filtros rapidamente, ver requests sobrepostas sem cancellation.

### Suspeita-3: Webhook WhatsApp pode reprocessar mensagens duplicadas
**Local:** `app/api/webhook/whatsapp/route.ts` (linha 36 fala de "wamid idempotency check" mas precisa validar a constraint no DB).
**Como confirmar:** Procurar a constraint UNIQUE em `messages.wamid` ou na tabela equivalente. Se for soft check (SELECT antes INSERT), há race condition em alta concorrência. Meta retransmite — Story 21.1 lições devem aplicar.

### Suspeita-4: `email-blasts/novo/step-audience.tsx` faz 2 fetches paralelos sem dedupe
**Local:** `step-audience.tsx:40-41` — `fetch("/api/stages")` + `fetch("/api/properties")` montados via Promise.all (bom), mas sem cache. Toda vez que o user clica em "Voltar" + "Próximo" no wizard, refaz.

### Suspeita-5: `recharts` em `/dashboard/campaigns/...` provavelmente sem `dynamic()` import
**Evidência:** `grep "dynamic(" packages/web/src` → **0 ocorrências**. Recharts é ~150KB gzipped — vai para o bundle de toda página onde aparece.
**Como confirmar:** Rodar `next build` + inspecionar `.next/analyze` (após adicionar bundle-analyzer).

### Suspeita-6: SW (`public/sw.js`) — fix recente em 9d1663a indica fragilidade no activate
**Contexto:** Commits recentes "torna limpeza de cache no activate tolerante a erros" e "corrige retorno undefined quando offline page não está em cache" sugerem que o SW tem caminhos não testados. Sem teste do SW. Sem versionamento explícito visível em audit.

---

## Test Coverage — Estado Crítico

| Pacote | Test Files |
|--------|-----------|
| `packages/ai` | 13 |
| `packages/shared` | 1 |
| `packages/web` | **2** (email-layout + whatsapp webhook) |
| `packages/db` | 0 |
| `packages/bot` | 0 |
| **TOTAL** | **16** |

**Realidade brutal:**
- Em `packages/web` — onde estão **112 rotas API + 144 componentes** — existem **2 arquivos de teste**.
- Não há testes de performance (snapshot de bundle size, lighthouse CI, etc.).
- Não há testes de integração API → DB.
- Não há testes E2E (Playwright/Cypress).
- `vitest.config.ts` está configurado, mas o coverage é simbólico.

**Risco:** Qualquer otimização de performance vai quebrar coisas. Sem rede de segurança, refatoração de bundle, mudança de queries, e migração de useEffect → SWR são apostas no escuro.

**Recomendação prioritária:**
1. Antes de qualquer otimização agressiva, criar **smoke tests E2E** para fluxos críticos: login → dashboard → criar lead, portal cliente → ver obra.
2. Snapshot test do bundle: falhar CI se `.next/build` aumentar >5% sem PR justificando.

---

## ESLint / TS strictness Gaps

| Regra | Status atual | Recomendado |
|-------|-------------|-------------|
| `@typescript-eslint/strict-boolean-expressions` | OFF | warn |
| `react-hooks/exhaustive-deps` | warn (default Next) | **error** |
| `@next/next/no-img-element` | já ativo (Next default) | manter |
| `no-console` em `app/api/**` | OFF | **error** (forçar `logEvent`) |
| `noUncheckedIndexedAccess` (TS) | OFF | **on** |
| `exactOptionalPropertyTypes` (TS) | OFF | considerar |
| `eslint-plugin-perf` ou similar | nenhum | adicionar |
| Detecção de `dangerouslySetInnerHTML` | default | manter |

**Observação:** O `eslint.config.mjs` é minimalista — só herda `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`. Não há regras custom de projeto.

---

## Recomendações de Instrumentação (em ordem de ROI)

### Tier 1 — Plug-and-play, alto retorno, custo zero
1. **`@vercel/speed-insights`** + **`@vercel/analytics`** — 2 linhas no `layout.tsx`, métricas RUM imediatas (LCP, INP, CLS, TTFB) por rota.
2. **`@next/bundle-analyzer`** — rodar em CI, falhar PR se bundle crescer >5%.
3. **`web-vitals` lib** + reportar para `system_events` — granularidade por org_id/user.

### Tier 2 — Error tracking (1 dia de trabalho)
4. **Sentry** (free tier 5k events/mês cobre fase atual):
   - Captura erros server (API routes) + client (React error boundaries).
   - Trace sampling 10% para perfilar rotas lentas.
   - Source maps via Vercel integration.
5. Migrar logger atual para co-existir com Sentry (Sentry primário, `system_events` secundário para queries SQL ad-hoc).

### Tier 3 — Instrumentação custom (1-2 semanas)
6. **`withTiming(label, fn)`** wrapper em `lib/observability.ts` — instrumentar 10 endpoints mais quentes.
7. **OpenTelemetry SDK** — Next 16 suporta nativo (`instrumentation.ts`). Exporta para Vercel OTel collector ou Honeycomb (free tier generoso).
8. **Custom dashboard** estendendo `/dashboard/sistema` com p50/p95/p99 por rota.

### Tier 4 — Performance hardening
9. **Server Components migration** — converter `/dashboard/sistema/*` pages para RSC + Server Actions.
10. **TanStack Query** — substituir 86 useEffect+fetch por queries cacheadas/canceladas.
11. **Rate limiting** (`@upstash/ratelimit`) em middleware + webhooks.

---

## Resumo Executivo de Prioridades

| Prioridade | Item | Esforço | Impacto |
|-----------|------|---------|---------|
| 🔴 P0 | Vercel Speed Insights + Analytics | 30 min | Alto — visibilidade RUM imediata |
| 🔴 P0 | `global-error.tsx` + `dashboard/error.tsx` | 1h | Alto — para de derrubar app inteiro |
| 🔴 P0 | Sentry (ou equivalente) | 4h | Crítico — erros hoje são invisíveis |
| 🔴 P0 | Migrar `console.error` em API para `logEvent` | 1 dia | Alto — dashboard `/sistema` para de mentir |
| 🟡 P1 | `noUncheckedIndexedAccess: true` + fix waves | 3 dias | Alto — previne classes inteiras de bug |
| 🟡 P1 | `withTiming()` wrapper + 10 endpoints | 1 dia | Médio — diagnóstico passa a existir |
| 🟡 P1 | E2E smoke tests (login + lead + obra) | 2 dias | Alto — habilita refactor seguro |
| 🟡 P1 | TanStack Query migration (`/sistema/*`) | 3 dias | Médio — elimina races e re-renders |
| 🟡 P1 | Email queue paralelizada + retry | 1 dia | Alto — destrava timeout do Vercel |
| 🟡 P1 | Rate limiting nos webhooks Meta | 0.5 dia | Médio — preveniu incidente futuro |

---

## Decisão de Gate

**VEREDICTO: NEEDS_WORK (informativo — esta é auditoria, não gate de story)**

**Justificativa:** O projeto está funcional e em produção, mas opera com observabilidade próxima a zero. Qualquer iniciativa de melhoria de performance vai trabalhar no escuro até instrumentação básica ser adicionada. A combinação de "53% client components + 86 useEffects + 2 testes em packages/web + zero RUM" é típica de produto que escalou rápido — comum, mas exige correção antes de otimizar.

**Próximo passo recomendado:** O Tier 1 inteiro (`@vercel/speed-insights` + `@vercel/analytics` + Sentry) leva menos de 1 dia e desbloqueia todos os passos seguintes. Sem isso, não há como medir o efeito de nenhuma otimização posterior.

---

**Arquivos-chave referenciados:**
- `/Users/ogabrielhr/trifold-crm/packages/web/package.json`
- `/Users/ogabrielhr/trifold-crm/packages/web/src/app/layout.tsx`
- `/Users/ogabrielhr/trifold-crm/packages/web/src/app/api/health/route.ts`
- `/Users/ogabrielhr/trifold-crm/packages/web/src/app/api/cron/email-queue/route.ts`
- `/Users/ogabrielhr/trifold-crm/packages/web/src/lib/logger.ts`
- `/Users/ogabrielhr/trifold-crm/packages/web/src/lib/server/push-service.ts`
- `/Users/ogabrielhr/trifold-crm/packages/web/src/app/dashboard/sistema/page.tsx`
- `/Users/ogabrielhr/trifold-crm/packages/web/tsconfig.json`
- `/Users/ogabrielhr/trifold-crm/packages/web/eslint.config.mjs`
- `/Users/ogabrielhr/trifold-crm/vercel.json`
