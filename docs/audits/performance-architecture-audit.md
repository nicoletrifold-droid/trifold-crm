# Auditoria de Performance Arquitetural — Trifold CRM

> **Auditor:** Aria (@architect)
> **Data:** 2026-05-12
> **Escopo:** `packages/web` — Next.js 16.2.2 App Router, React 19, Supabase, Tailwind 4
> **Inventário:** 293 arquivos TS/TSX, 61 page.tsx, 112 API routes, ~42K linhas, 11 cron jobs
> **Build atual:** `.next/` = 378 MB (server 119 MB, static 2 MB)

---

## TL;DR

### Top 5 problemas críticos

1. **`next.config.ts` vazio** — zero otimizações Next 16 ativadas. Sem `compress`, sem `images`, sem `experimental.optimizePackageImports`, sem `serverExternalPackages`. **Impacto: bundle, build time e SSR latency todos sub-ótimos por configuração default.**
2. **`googleapis@171.4.0` (194 MB) carregado em rota `/api/cron/campaign-poll` e callbacks OAuth** — não está no client bundle (bom!), mas explode cold-start do lambda Vercel. **Tamanho do `node_modules/.pnpm/googleapis@171.4.0` = 194 MB.** Mesmo tree-shaken, o cold-start dessa rota é 2-5s.
3. **Cascata de auth duplicada por request**: `middleware (proxy.ts)` faz `supabase.auth.getUser()` + role lookup, depois `getServerUser()` em CADA page faz `auth.getUser()` + lookup de novo. Sem `cache()` do React. **Resultado: 3-4 round trips Supabase por page view, ~200-400ms só em auth.**
4. **N+1 / over-fetch massivo no `/dashboard/analytics`** — joins `leads(id)`, `leads:leads(id)`, `leads:leads(id, qualification_score)` em 3 tabelas (`kanban_stages`, `properties`, `users`) só para contar leads. Cada query baixa **todos os IDs de leads agrupados por entidade**. Para 10k leads e 5 properties = 50k linhas para mostrar 5 números. Mesmo padrão em `/api/analytics/route.ts:53-68`.
5. **Zero estratégia de cache** — nenhum `React.cache()`, `unstable_cache`, `revalidate`, ou `Cache-Control` header em todo o codebase (`grep -rl "unstable_cache\|export const revalidate\|Cache-Control" src/` = 0 hits). Toda navegação re-executa todas as queries Supabase.

### Estimativa de ganho potencial (conservadora)

| Ação | TTFB | LCP | Bundle JS | Cold start |
|------|------|-----|-----------|------------|
| Quick wins (config + N+1) | -40% | -25% | -10% | -50% |
| Refactor caching + auth | -60% | -45% | -10% | -70% |
| Refactor completo (route splits + edge) | -75% | -60% | -35% | -85% |

**Páginas que melhor respondem:** `/dashboard/analytics`, `/dashboard/conversas`, `/dashboard` (home), `/dashboard/alertas`. APIs `/api/dashboard/metrics`, `/api/analytics/*`.

---

## Findings Detalhados

### Critical (P0)

#### P0-1. `next.config.ts` está literalmente vazio
**Evidência:** `packages/web/next.config.ts` (4 linhas, apenas tipo e export default).

Está perdendo TODAS estas otimizações default-off do Next 16:
- `experimental.optimizePackageImports` para `lucide-react` (12 client components o importam), `recharts`, `@dnd-kit/*`, `@trifold/shared` — sem isso o tree-shaking de barrel imports é incompleto.
- `serverExternalPackages: ['googleapis', 'web-push']` — `googleapis` (194 MB) e `web-push` deveriam ser external (não bundled) no server runtime do Next.
- `images.formats: ['image/avif', 'image/webp']` — atualmente o `next/image` serve só o que vier do remote pattern default (sem AVIF).
- `images.remotePatterns` — necessário para Supabase Storage signedURLs (atualmente `<img src>` é usado dentro de `SignedImage` em chat — bypass do next/image).
- `compress: true` (default true mas em produção Vercel já comprime, OK).
- `productionBrowserSourceMaps: false` (já default false, OK).
- `experimental.serverActions.bodySizeLimit` não definido — uploads de foto/áudio em `obra-mensagens` podem bater no default 1 MB.
- `experimental.staleTimes` — Next 15+ permite controlar cache do client-side router.

**Impacto:** Build maior, lambdas com peso, navegações sem prefetch optimizado.

#### P0-2. `googleapis@171.4.0` infla cold-start do lambda
**Evidência:**
- `node_modules/.pnpm/googleapis@171.4.0` = **194 MB**
- Importado em: `src/lib/google.ts:1` (`import { google } from "googleapis"`)
- Consumido em: `api/auth/google/route.ts`, `api/auth/google/callback/route.ts`, `api/campaigns/discover-fields/route.ts`, `api/cron/campaign-poll/route.ts` (524 linhas)

O `googleapis` SDK importa CENTENAS de APIs por padrão (Forms, Drive, Calendar, etc.). O bundler do Next inclui boa parte mesmo com tree-shaking porque o módulo usa `Function()` dinâmico. No Vercel cada lambda fica >50 MB descompactado, levando 2-5s no cold start.

**Soluções (em ordem de esforço):**
1. **Mínimo esforço:** mudar para imports específicos `import { forms_v1 } from "googleapis/build/src/apis/forms"` + `import { drive_v3 } from "googleapis/build/src/apis/drive"` + `import { OAuth2Client } from "google-auth-library"` — corta ~80% do peso.
2. **Médio esforço:** trocar `googleapis` por chamadas REST diretas (`fetch` direto na Forms/Drive REST API) + `google-auth-library` só para OAuth. Esta é a recomendação oficial do Next/Vercel para reduzir cold-start.
3. **Configurar `serverExternalPackages: ['googleapis']`** em `next.config.ts` para que o módulo seja resolvido em runtime (não bundled).

#### P0-3. Auth duplicada por request (4 round-trips Supabase)
**Evidência:** Para qualquer page `/dashboard/*`:
1. `middleware` em `src/proxy.ts` → `updateSession()` em `src/lib/supabase/middleware.ts:73` chama `supabase.auth.getUser()` (1 RTT). Depois `getUserRole()` (linha 24-28) faz query em `users` (1 RTT se sem app_metadata).
2. `dashboard/layout.tsx:52` chama `getServerUser()` que faz **OUTRO** `supabase.auth.getUser()` (1 RTT) + query em `users` (1 RTT).
3. `dashboard/[page].tsx` (ex: `/dashboard/page.tsx:6`) chama `getServerUser()` **DE NOVO**.

Total: **3-4 RTTs Supabase** só para descobrir quem é o usuário, em CADA navegação. `auth.getUser()` é um POST para `/auth/v1/user` (~80-150ms cada).

**Sem `React.cache()`** envolvendo `getServerUser()` — `cache()` desduplica chamadas dentro do mesmo render server-side.

**Patch arquitetural:**
```ts
// src/lib/auth.ts
import { cache } from "react"

export const getServerUser = cache(async (): Promise<AppUser> => {
  // ... mesmo conteúdo
})
```
Apenas isso elimina chamadas duplicadas dentro do mesmo render. Para deduplicar entre middleware e page, persistir o role em `app_metadata` (já parcialmente feito — middleware já tenta `user.app_metadata.role` primeiro) e cachear em cookie/header.

#### P0-4. Over-fetch absurdo em `/dashboard/analytics`
**Evidência:** `src/app/dashboard/analytics/page.tsx:32-34`
```ts
supabase.from("kanban_stages").select("id, name, color, position, leads(id)")
supabase.from("properties").select("id, name, leads:leads(id)")
supabase.from("users").select("id, name, leads:leads(id)")
```

Cada `leads(id)` retorna o array completo de IDs de leads relacionados. Para uma org com:
- 6 stages × 1000 leads/stage = 6.000 IDs no payload de stages
- 5 properties × 500 leads/property = 2.500 IDs em properties
- 10 brokers × 100 leads/broker = 1.000 IDs em users

= 9.500 UUIDs transportados só para mostrar 21 números (counts).

Plus `Array.isArray(stage.leads).length` calculado no Node depois — CPU desperdiçado.

Mesmo padrão em `src/app/api/analytics/route.ts:53,58,68`.

**Solução:** RPC do Postgres ou view materializada agregando counts. Alternativa rápida — `count: 'exact', head: true` por grupo, em paralelo via `Promise.all`.

#### P0-5. Zero estratégia de cache (server + HTTP)
**Evidência (greps com 0 resultados):**
- `grep -r "unstable_cache" src/` → 0
- `grep -r "export const revalidate" src/` → 0
- `grep -r "Cache-Control" src/app/api` → 0
- `grep -r "import { cache } from .react." src/` → 0
- `grep -r "useSWR\|@tanstack/react-query" src/` → 0

**Consequência:**
- Toda navegação re-roda toda query.
- Listas de propriedades (mudam raramente) — re-fetched.
- Lista de stages do kanban (mudam quase nunca) — re-fetched.
- Lista de brokers — re-fetched.
- O usuário trocando de aba `/dashboard/analytics → /dashboard/leads → voltar` re-executa tudo (apesar do client-side router cache do Next, queries no servidor recompõem).

**Solução em camadas:**
1. **`React.cache()`** para deduplicar dentro do mesmo render (getServerUser, listas referenciais).
2. **`unstable_cache()` com tags** para dados raramente mutáveis (`kanban_stages`, `properties.is_active`, `users` por role).
3. **`revalidateTag(...)`** nos endpoints/server actions que mutam essas tabelas.
4. **`Cache-Control`** em API routes idempotentes (`/api/analytics/*`, `/api/dashboard/metrics`): `s-maxage=60, stale-while-revalidate=300`.

---

### High (P1)

#### P1-1. Conversas page faz fetch-all de mensagens
**Evidência:** `src/app/dashboard/conversas/page.tsx:27-31`
```ts
const { data: messages } = await supabase
  .from("messages")
  .select("conversation_id, content, created_at")
  .in("conversation_id", conversationIds)
  .order("created_at", { ascending: false })  // NO LIMIT!
```

Para mostrar 1 preview por conversa, baixa TODAS as mensagens de TODAS as conversas ativas e itera pegando a primeira. Para 50 conversas × 200 mensagens = 10.000 rows transferidos para mostrar 50 previews.

**Solução:** `SELECT DISTINCT ON (conversation_id) ...` via RPC, OU `last_message_at` + `last_message_preview` desnormalizado em `conversations` (campo já existe parcialmente — `last_message_at`).

#### P1-2. Dashboard home N+1 com `Promise.all(stages.map(...))`
**Evidência:** `src/app/dashboard/page.tsx:30-41`
```ts
await Promise.all(
  stages.map(async (s) => {
    const { count } = await supabase.from("leads")
      .select("*", { count: "exact", head: true })
      .eq("stage_id", s.id).eq("is_active", true)
    stageCounts[s.id] = count ?? 0
  })
)
```

Para 6 stages, dispara 6 queries em paralelo. Mais barato que serial mas ainda 6 RTTs. Uma única query `GROUP BY stage_id` resolveria — via RPC Postgres ou `.select('stage_id', { count: 'exact' })` agrupado.

#### P1-3. Lead detail puxa todas as messages com `messages:messages()`
**Evidência:** `src/app/dashboard/leads/[id]/page.tsx:80-90`
```ts
.from("conversations")
.select(`id, channel, status, last_message_at, messages:messages(id, role, content, created_at)`)
.eq("lead_id", id).order("last_message_at", { ascending: false }).limit(5)
```

Os 5 últimos conversations + TODAS suas mensagens são carregadas no servidor. Em conversas longas (centenas de turnos com a Nicole), isso é megabytes por render. O `.limit(5)` aplica só aos conversations, não aos messages.

**Solução:** `messages:messages(id, role, content, created_at).order(created_at, ascending: false).limit(20)` aninhado, ou separar em endpoint dedicado lazy-load.

#### P1-4. Service Worker quebrado / sem cache real
**Evidência:** `public/sw.js`
```js
self.addEventListener('fetch', (event) => {
  // ...para non-cliente:
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request).then((r) => r ?? fetch(event.request)))
  )
})
```

- Nada além de `/cliente/offline` é **adicionado** ao cache. Nenhum `cache.put()` em rota alguma.
- O fallback `caches.match` para 90% das URLs sempre retorna `undefined` → fallback faz `fetch(event.request)` novamente (que já falhou) → erro de rede.
- Sem versioning de assets — clientes ficam com SW antigo em produção. Tag de versão (`'trifold-offline-v2'`) é a única.
- Registrado de dentro do `PushPrompt` (`src/components/portal/push-prompt.tsx:26`) — só registra se o usuário renderizar esse componente; admin/broker nunca registram.

**Risco:** desnecessário ativar um SW global para uma SPA admin que não tem comportamento offline real. Melhor escopar SW APENAS ao `/cliente` (já é o que o fetch handler faz para navigate, mas a rede `fetch.catch` ainda intercepta tudo).

#### P1-5. Polling agressivo de 30s em 3 telas
**Evidência:**
- `src/app/dashboard/sistema/page.tsx:86` — `setInterval(fetchData, 30000)`
- `src/app/dashboard/sistema/emails/page.tsx:40` — idem
- `src/app/dashboard/sistema/webhooks/page.tsx:78` — idem

Sem `document.hidden` guard, sem backoff em erro, sem cancelamento via `AbortController`. Aba aberta em background faz request a cada 30s indefinidamente. Cada request é auth (`requireAuth()` faz 2 RTTs Supabase) + work.

**Solução:** abrir `EventSource` (SSE) do servidor, OU `visibilitychange` listener para pausar quando hidden, OU passar para Supabase Realtime + subscription.

#### P1-6. SignedURL por message, sem cache
**Evidência:** `src/app/cliente/[obra_id]/mensagens/_components/chat-feed.tsx:55-95` (`SignedAudio`, `SignedImage`)

Cada bubble de imagem/áudio faz `supabase.storage.from(bucket).createSignedUrl(path, 300)` em `useEffect`. 50 imagens = 50 round-trips ao Supabase Storage. Sem batching, sem cache (`URL` regenerada em todo re-render do componente pai — porque o componente é função sem `React.memo`).

**Solução:**
1. Server component gera signed URLs no SSR (page que já busca mensagens pode chamar `createSignedUrls(paths)` em batch — Supabase suporta).
2. Cachear no LocalStorage com TTL = 5 min.
3. Trocar `createSignedUrl` pelo `getPublicUrl` se bucket é público (não é o caso aqui).

#### P1-7. `useUser()` hook duplica auth no client
**Evidência:** `src/hooks/use-user.ts`

Subscribe a `onAuthStateChange`, sempre faz `auth.getUser()` + query `users`. Como o user JÁ veio do servidor via `getServerUser()` em layouts, esse hook duplica o trabalho. Como o servidor não passa `user` para client via context, qualquer componente client que precisa do user re-faz a request.

**Solução:** criar `<UserProvider>` que recebe `user` do server layout e expõe via React context. Hook lê do context (sync, zero RTT).

#### P1-8. Sidebar layout faz mais 2 queries por navigation
**Evidência:** `src/app/dashboard/layout.tsx:56-68`

`alertCount` e `mensagensCount` são duas `count: exact head: true` em CADA page do dashboard, em PARALELO com tudo da page. São queries baratas mas adicionam ~60-120ms ao TTFB. Sem cache.

**Solução:** `unstable_cache` com tag `org:${orgId}:badges` e `revalidateTag` quando um lead novo entra ou uma mensagem é lida.

#### P1-9. Bundle pesado em `campaign-detail-client.tsx` (1080 linhas)
**Evidência:** `src/app/dashboard/campaigns/meta/[campaign_id]/campaign-detail-client.tsx` — 1.080 linhas, marcado `"use client"`.

Tudo é renderizado no client: data fetching, tabelas, SVG chart manual, modal de budget. Sem code splitting. Carrega o componente inteiro (~80-100 KB minified) para qualquer admin que abrir.

**Solução:** dividir em sub-componentes server (header, tabela de adsets podem ser SSR) + client islands menores (chart interativo, modal). Usar `next/dynamic({ ssr: false })` para o chart SVG que precisa de mouse.

---

### Medium (P2)

#### P2-1. `lucide-react` em 12+ client components sem `optimizePackageImports`
Cada client component que importa `import { X, Y, Z } from "lucide-react"` resulta em chunk com TODOS os SVGs importados explicitamente, mas o tree-shaking de Lucide é frágil sem `experimental.optimizePackageImports` habilitado.

**Solução:** habilitar `experimental.optimizePackageImports: ['lucide-react', 'recharts', '@dnd-kit/core', '@dnd-kit/sortable']` em `next.config.ts`.

#### P2-2. `recharts` carregado eagerly em `/dashboard/analytics`
**Evidência:** `src/components/analytics/leads-chart.tsx:1` (`"use client"`), 339 linhas. `recharts` pesa 8.5 MB instalado, ~120 KB no bundle.

A página `/dashboard/analytics` é client-component-heavy. `recharts` poderia ser:
```ts
const LeadsChart = dynamic(() => import("@web/components/analytics/leads-chart").then(m => m.LeadsChart), { ssr: false })
```
Defere carregamento até hidratação. Já que a página é admin, o `ssr: false` é aceitável (não precisa ser SEO-friendly).

#### P2-3. Pipeline page carrega TODOS os leads sem paginação
**Evidência:** `src/app/dashboard/pipeline/page.tsx:40-76` — `.select(...).eq("is_active", true).order(...)` sem `.limit()`.

Para 5.000+ leads ativos, traz 5.000 rows com joins. Kanban no client lida com isso, mas TTFB e payload sofrem.

**Solução:** paginar por stage (top N por stage), com "carregar mais" no client. Ou usar virtualization (já tem `@dnd-kit` mas sem virtual scroll).

#### P2-4. Tabela `/dashboard/leads` sem paginação, sem virtualization
**Evidência:** `src/app/dashboard/leads/page.tsx:17-40` — sem `.limit()`, sem `.range()`.

Tabela HTML normal renderizando 1.000+ rows. DOM gigante, Tailwind classes sendo computadas para cada `<tr>`. Tempo de hydration cresce linearmente.

**Solução:** `.range(0, 49)` por padrão + paginação ou infinite scroll com `react-window`/`react-virtual`.

#### P2-5. Sem Suspense / streaming
**Evidência:** `grep -rln "Suspense" src/ = 1 hit` (`src/app/login/page.tsx`).

Next 13+ App Router suporta streaming SSR via `<Suspense>` — partes lentas renderizam progressivamente. Sem Suspense em nenhuma page do dashboard, o TTFB engole TODA a queries antes de mandar HTML.

**Exemplo prático:** em `/dashboard`, o card "Empreendimentos" depende de `properties` (1 query) mas o "Pipeline" depende de N+1 stage counts. O usuário espera AMBOS para ver QUALQUER coisa. Com Suspense, properties aparecem em 100ms e pipeline streama.

#### P2-6. Sem `loading.tsx` em nenhuma rota do dashboard
**Evidência:** `find src/app -name "loading.tsx" = 0 hits`.

Sem loading.tsx, transições entre páginas mostram o cursor "thinking" do browser. Com `loading.tsx`, o Next mostra skeleton imediatamente.

#### P2-7. `error.tsx` só em 2 lugares
**Evidência:** `src/app/cliente/[obra_id]/error.tsx` e `src/app/cliente/[obra_id]/mensagens/error.tsx`.

Nenhuma error boundary no dashboard. Qualquer erro de DB resulta em 500 puro do Vercel.

#### P2-8. `tsconfig.json` `target: ES2017`
**Evidência:** `packages/web/tsconfig.json:3` — `"target": "ES2017"`.

Browsers modernos suportam ES2022+. Target ES2017 força polyfills/transpilação desnecessária (async/await iterators, optional chaining, nullish coalescing, etc.). Aumenta bundle.

**Solução:** `"target": "ES2022"` ou `"esnext"`. SWC já lida com browserslist via Next.

#### P2-9. Cron jobs duplicados em vercel.json e packages/web/vercel.json
**Evidência:** Root `vercel.json` declara 11 crons; `packages/web/vercel.json` declara 5 crons (subconjunto). Se o build usa só um deles, o outro é morto. Se ambos forem aplicados, duplicação.

#### P2-10. Sem `serverExternalPackages` para `web-push`
`web-push` (~500 KB compilado) usa `node:crypto` nativo — deveria ser external.

---

## Quick Wins (< 4h cada)

> Cada um é um story autocontido. Priorizado por impacto/esforço.

### QW-1. Criar `next.config.ts` decente (1h)
Configurar tudo em uma só story. Ver "Recomendações de configuração" abaixo. **Ganho: -10% bundle, -30% cold-start.**

### QW-2. `React.cache()` em `getServerUser` (30 min)
Wrap function in `cache()`. **Ganho: -200ms TTFB em todas páginas com layout + page.**

### QW-3. Substituir `leads(id)` joins por counts agregados em `/dashboard/analytics` e `/api/analytics/*` (2h)
Reescrever 3 selects de joins por 3 selects de count com group. **Ganho: -80% payload, -50% query time em analytics.**

### QW-4. Adicionar `.limit(50)` em tabela de leads + paginação por searchParams (2h)
`src/app/dashboard/leads/page.tsx` + `src/app/dashboard/pipeline/page.tsx`. **Ganho: -90% payload em workspace grande.**

### QW-5. `last_message_preview` na query inicial de conversas, eliminar fetch-all de messages (2h)
Reescrever `src/app/dashboard/conversas/page.tsx:27-31`. Ou via RPC ou via campo desnormalizado. **Ganho: -95% payload em /dashboard/conversas.**

### QW-6. `loading.tsx` + `error.tsx` em layouts do `/dashboard` e `/cliente` (1h)
Skeletons básicos. **Ganho: percepção de velocidade, sem mudança de TTFB real.**

### QW-7. `serverExternalPackages: ['googleapis', 'web-push']` (15 min)
Adicionar em `next.config.ts`. **Ganho: -50% cold-start em rotas que tocam google/push.**

### QW-8. `dynamic({ ssr: false })` no `LeadsChart` (15 min)
**Ganho: -100KB no bundle inicial de /dashboard/analytics.**

### QW-9. `Cache-Control: s-maxage=60, stale-while-revalidate=300` em `/api/dashboard/metrics`, `/api/analytics/*` (1h)
**Ganho: pulado por Vercel Edge em hits subsequentes (TTFB ~20ms vs 400ms).**

### QW-10. Pausar polling quando aba está hidden (1h cada × 3 telas)
Adicionar `document.visibilityState === 'hidden' ? skip : fetch` em sistema/sistema/emails/sistema/webhooks. **Ganho: -100% load fantasma em abas inativas.**

### QW-11. `UserProvider` para eliminar `useUser()` redundante (3h)
Server layout → context → hook. **Ganho: -200ms em qualquer page que renderiza componente que usa `useUser`.**

### QW-12. Batch signedURLs no SSR de mensagens (3h)
Gerar URLs no servidor (1 batch call) em vez de N chamadas client. **Ganho: -90% latency em chat com muitas mídias.**

---

## Refactors Estruturais

> Stories maiores, exigem desenho. Ordem reflete dependências.

### R-1. Substituir `googleapis` por imports específicos ou REST (1-2 dias)
- **Por quê:** 194 MB → ~5 MB no lambda.
- **Como:** Mapear chamadas em `lib/google.ts` (5 funções) para `google-auth-library` + `fetch` REST. Risco baixo (API estável).
- **Bloqueia:** R-3 (edge runtime).

### R-2. Sistema de cache em camadas (2-3 dias)
- **Layer 1 — Request cache:** `cache()` em getters de dados referenciais (`getStages()`, `getProperties()`, `getBrokers()`).
- **Layer 2 — Cross-request cache:** `unstable_cache(fn, [keys], { tags, revalidate })`.
- **Layer 3 — HTTP cache:** Cache-Control + Vercel Edge Cache.
- **Layer 4 — Revalidation:** Server actions chamam `revalidateTag('stages')` quando relevante.
- **Bloqueia:** R-4 (otimização de tela individual).

### R-3. Edge runtime para rotas read-only (3-5 dias)
- Identificar rotas que só lêem Supabase via fetch (sem `googleapis`, sem `web-push`, sem `resend`).
- Adicionar `export const runtime = 'edge'` — reduz cold-start de ~2s para ~20ms.
- Candidatos: `/api/analytics/*`, `/api/dashboard/metrics`, `/api/leads/[id]/timeline`, `/api/health`.
- **Bloqueado por:** R-1 (auth do supabase precisa funcionar em edge — `@supabase/ssr` já suporta).

### R-4. Refatorar `/dashboard/analytics` e `/dashboard/conversas` para Suspense + streaming (1 semana)
- Cada card é seu próprio async Server Component dentro de Suspense.
- Loading skeleton por card.
- Métricas individuais cacheadas com tags.
- **Ganho esperado:** TTFB <100ms, LCP <800ms em /dashboard/analytics.

### R-5. Quebrar `campaign-detail-client.tsx` em islands menores (3 dias)
- Header + KPIs → Server Component.
- AdSets table → Server Component (com sort no servidor).
- Chart de timeseries → Client island com `dynamic({ ssr: false })`.
- Modal de budget → Client island lazy (`dynamic`).
- Action log → Server Component com `<Suspense>`.
- **Ganho esperado:** -60% bundle, página interativa em 500ms.

### R-6. Implementar virtualization em listas (1 semana)
- `/dashboard/leads`, `/dashboard/pipeline` (Kanban columns), tabela de email logs, tabela de webhook logs.
- Usar `@tanstack/react-virtual` (não está nas deps — adicionar).
- **Ganho esperado:** workspace com 10k+ leads navegável.

### R-7. Repensar Service Worker (2-3 dias)
- Decidir: SW é só para o `/cliente`? Então registrar SÓ ali e escopar matcher.
- Implementar cache real (network-first p/ API, stale-while-revalidate p/ assets).
- Versionamento robusto (cache name com build hash).
- Fallback offline real para `/cliente/[obra_id]` (Last-Known-Good).

### R-8. Substituir cron jobs de polling por webhooks/realtime onde possível (1 semana)
- 11 cron jobs no `vercel.json`, alguns rodando a cada 3 min (`campaign-poll`).
- Avaliar quais podem virar webhook-driven (já existem para Meta Ads, Resend, WhatsApp).
- **Ganho:** -90% custo de invocações Vercel.

---

## Recomendações de configuração

### `packages/web/next.config.ts` recomendado

```ts
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Otimização de imports — corta barrel imports automaticamente
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "@trifold/shared",
    ],
    serverActions: {
      bodySizeLimit: "10mb", // Para uploads de foto/áudio em obra-mensagens
    },
    // Mantém client router cache curto — evita stale data percebida
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },

  // Mantém node_modules pesados fora do bundle do server
  serverExternalPackages: [
    "googleapis",
    "google-auth-library",
    "web-push",
  ],

  // Imagens Supabase + Meta Ads CDN
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
      {
        protocol: "https",
        hostname: "scontent.fwhatsapp.net",
      },
      {
        protocol: "https",
        hostname: "*.fbcdn.net",
      },
    ],
    minimumCacheTTL: 60 * 60 * 24, // 24h
  },

  // Compressão (Vercel já comprime, mas dev local se beneficia)
  compress: true,

  // Desliga source maps em produção (já default false, explícito)
  productionBrowserSourceMaps: false,

  // Headers globais — caching de assets estáticos
  async headers() {
    return [
      {
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/cliente/",
          },
        ],
      },
    ]
  },

  // Disable powered-by header
  poweredByHeader: false,

  // Mantém typecheck no build (já temos turbo type-check)
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
}

export default nextConfig
```

### `packages/web/tsconfig.json` — `target` recomendado

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",        // era ES2017
    // ... resto inalterado
  }
}
```

### `vercel.json` — consolidação

Decidir entre root `vercel.json` (11 crons) ou `packages/web/vercel.json` (5 crons). Como o build é `pnpm turbo build --filter=@trifold/web`, o `outputDirectory: packages/web/.next` está no root — **manter root como source of truth, remover `packages/web/vercel.json`** (ou vice-versa, contanto que NÃO existam ambos).

Adicionar headers para responses de API:

```jsonc
{
  "headers": [
    {
      "source": "/api/analytics/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "private, s-maxage=60, stale-while-revalidate=300" }
      ]
    },
    {
      "source": "/api/dashboard/metrics",
      "headers": [
        { "key": "Cache-Control", "value": "private, s-maxage=30, stale-while-revalidate=120" }
      ]
    }
  ]
}
```

---

## Resumo executivo

O Trifold CRM tem uma base sólida em App Router com bom uso de Server Components (apenas ~22% dos pages são client, e o domínio /cliente é bem isolado). Os problemas de performance são **arquiteturais, não estruturais**:

1. **Configuração:** `next.config.ts` vazio = todas otimizações Next desligadas.
2. **Caching:** nenhuma camada de cache existe — toda navegação re-executa todo trabalho.
3. **Auth:** 3-4 round-trips Supabase por page view, sem `React.cache()`.
4. **Over-fetch:** N+1 patterns em analytics, conversas, dashboard home — multiplicadores de 10x-100x em payload.
5. **Cold-start:** `googleapis` (194 MB) sem `serverExternalPackages`.

**Sequência recomendada de stories:**

| Sprint | Stories | Outcome |
|--------|---------|---------|
| Sprint 1 (quick wins) | QW-1, QW-2, QW-7, QW-8, QW-9, QW-6 | -40% TTFB perceived, -10% bundle |
| Sprint 2 (over-fetch) | QW-3, QW-4, QW-5, QW-10, QW-11 | -60% payload em analytics/conversas |
| Sprint 3 (caching) | R-2 | -50% queries Supabase totais |
| Sprint 4 (cold-start) | R-1, R-3 | Lambdas <100ms cold start |
| Sprint 5 (UX) | R-4, R-5 | Streaming SSR em telas críticas |
| Sprint 6 (escala) | R-6, R-7, R-8 | Workspace 50k+ leads viável |

Nenhuma das mudanças requer reescrita arquitetural — todas são aditivas e backward-compatible. Risk profile baixo se atacadas na ordem.

— Aria
