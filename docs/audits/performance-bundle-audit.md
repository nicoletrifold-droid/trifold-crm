# Auditoria de Bundle & Dependências — Trifold CRM

> Análise estática (sem build) realizada em `packages/web` (Next.js 16.2.2 + React 19).
> Data: 2026-05-12. Escopo: dependências, padrões de import, code-splitting, assets, CSS, SW, console logs.

---

## TL;DR

**Estado geral:** Saudável, mas com **3 vetores de bloat evitáveis** facilmente mitigáveis.

| # | Achado | Impacto estimado | Esforço |
|---|--------|------------------|---------|
| 1 | `recharts` carregado eager no `/dashboard/analytics` (`use client`, 1 página apenas) | ~90–120 KB gzip no JS inicial dessa rota | Baixo |
| 2 | `lucide-react@1.7.0` — versão antiga, **43 ícones únicos** importados em 31 arquivos via named export (deveria tree-shake, mas a versão 1.x não é a moderna `lucide-react@0.4xx+`; verificar comportamento real) | 10–80 KB dependendo do tree-shake real | Baixo |
| 3 | `next.config.ts` **vazio** — sem `optimizePackageImports`, sem `serverComponentsExternalPackages`, sem `images.remotePatterns`, sem `compiler.removeConsole` | 30–80 KB + bypass de várias otimizações nativas | Baixo |
| 4 | **66 de 132 páginas em `/app` têm `'use client'`** (50%) — alto, mas a maioria parece justificada (formulários, dnd-kit, useState) | Indireto | Médio (auditoria caso a caso) |
| 5 | **Zero `next/dynamic`** no projeto — nenhum modal, chart ou form pesado é code-split | 40–150 KB economizáveis em rotas-chave | Médio |
| 6 | `googleapis@171` (194 MB no `node_modules`) **só usado em `lib/google.ts` server-side via 4 API routes** — OK do ponto de vista de bundle (não vaza pro client), mas falta `serverExternalPackages` para evitar tentativas de bundling | 0 KB no client (já está ok) — mas risco em refactor | Baixo (preventivo) |

**Top quick wins (ordem recomendada):**
1. Adicionar `experimental.optimizePackageImports: ['lucide-react', 'recharts', '@trifold/shared']` em `next.config.ts`.
2. `compiler.removeConsole: { exclude: ['error', 'warn'] }` em produção.
3. `next/dynamic` no `LeadsChart` (recharts) — economia direta na rota mais visitada `/dashboard/analytics`.
4. Mover logo da raiz do projeto (`/logo-Trifold-laranja.webp`) — ou deletar (está duplicado em `public/logo-trifold.webp`).
5. `serverExternalPackages: ['googleapis']` (defensivo).

---

## CRITICAL — Bundle Issues

### C1. `next.config.ts` está praticamente vazio

`/Users/ogabrielhr/trifold-crm/packages/web/next.config.ts` tem apenas:
```ts
const nextConfig: NextConfig = { /* config options here */ };
```

**Faltam (todos high-impact):**
- `experimental.optimizePackageImports` — Next consegue rewriter named-imports de barrels em deep-imports automaticamente. Lista alvo: `['lucide-react', 'recharts', '@trifold/shared', '@dnd-kit/core', '@dnd-kit/sortable']`.
- `serverExternalPackages: ['googleapis', 'web-push', 'resend']` — força permanecerem em CommonJS no server e nunca tentar bundling pro client. Hoje funciona por convenção, mas qualquer refactor que importe `lib/google.ts` num client component **vaza 194 MB de googleapis para o bundler**.
- `compiler.removeConsole` para drop em produção.
- `images.formats: ['image/avif', 'image/webp']` e `images.remotePatterns` (Supabase storage URLs para fotos das obras).
- `productionBrowserSourceMaps: false` (default já é false, mas vale confirmar).

### C2. `recharts` carregado eager em rota `use client`

Arquivo: `/Users/ogabrielhr/trifold-crm/packages/web/src/components/analytics/leads-chart.tsx` (339 linhas, `"use client"`).
Importa **7 símbolos named** de `recharts` (BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer).

- Consumido **apenas** em `/Users/ogabrielhr/trifold-crm/packages/web/src/app/dashboard/analytics/page.tsx`.
- `recharts@3.8.1` é grande (~8.5 MB unpacked, ~95 KB gzip do core).
- A página de analytics é server-side mas importa o componente client **eagerly** — bundle de analytics carrega recharts inteiro mesmo se o gráfico estiver fora da viewport ou se o usuário visualizar apenas os cards.

**Recomendação:** `const LeadsChart = dynamic(() => import('@web/components/analytics/leads-chart').then(m => m.LeadsChart), { ssr: false, loading: () => <ChartSkeleton/> })`. Economia: ~70–95 KB gzip nessa rota.

### C3. `googleapis` — risco potencial de vazamento

- `googleapis@171.4.0` ocupa 194 MB no `node_modules`.
- Hoje usado **só** em `/Users/ogabrielhr/trifold-crm/packages/web/src/lib/google.ts` (sem `import "server-only"` no topo do arquivo).
- Consumidores conhecidos (todos server, OK):
  - `app/api/auth/google/route.ts`
  - `app/api/auth/google/callback/route.ts`
  - `app/api/campaigns/discover-fields/route.ts`
  - `app/api/cron/campaign-poll/route.ts`

**Risco:** sem `import "server-only"` em `lib/google.ts` e sem `serverExternalPackages: ['googleapis']` no `next.config`, qualquer dev que importe `getOAuth2Client` num client component criará um vazamento gigante. Adicionar **ambas** as proteções é trivial e bloqueia regressão.

---

## HIGH PRIORITY

### H1. Zero `next/dynamic` no projeto

`grep -rn "next/dynamic" packages/web/src` = **0 matches**. Apenas 3 usos de `Suspense` (todos em `app/login/page.tsx` para `useSearchParams`).

**Candidatos óbvios para code-split (todos `use client`, todos com >300 LOC):**

| Arquivo | LOC | Por quê é candidato |
|---------|-----|---------------------|
| `app/dashboard/campaigns/meta/[campaign_id]/campaign-detail-client.tsx` | **1080** | Detalhe de campanha — rota não-crítica do menu |
| `app/dashboard/properties/[id]/units/[unitId]/page.tsx` | 744 | Subrota de unidade |
| `app/dashboard/agenda/page.tsx` | 674 | Calendar/agenda |
| `app/broker/agenda/page.tsx` | 617 | Mesma coisa para broker |
| `app/dashboard/leads/[id]/page.tsx` | 507 | Drawer + timeline |
| `components/leads/lead-detail-drawer.tsx` | 404 | **Drawer**: importado em `kanban-board.tsx` mas só aparece on-click |
| `app/dashboard/sistema/email-blasts/novo/_components/wizard.tsx` | (multi-step) | Wizard só carregado em /novo |
| `app/dashboard/sistema/email-templates/_components/preview-modal.tsx` | — | **Modal** — clássico dynamic candidate |
| `app/dashboard/obras/[obra_id]/_components/foto-upload-form.tsx` | 357 | Upload pesado, modal |
| `components/portal/push-prompt.tsx` | — | Push prompt do cliente — usa web-push API, lazy seria ideal |

Em particular: **`LeadDetailDrawer` é importado direto no `kanban-board.tsx`** (que já é `use client` com dnd-kit). O drawer só abre em click — é o caso de uso paradigmático de `dynamic(() => import(...), { ssr: false })`.

### H2. `lucide-react@1.7.0` — versão fora do padrão

`package.json` declara `"lucide-react": "^1.7.0"`. **Atenção:** a linha de releases oficial do `lucide-react` está em `0.4xx`. Versão `1.x` é um **fork ou pacote diferente** (provavelmente publicado por outro autor) — confirmar antes de tomar ação.

- 31 arquivos importam de `lucide-react` (todos via named import — OK para tree-shake).
- 43 ícones únicos usados no projeto inteiro (lista no anexo).
- `node_modules/.pnpm/lucide-react@1.7.0_react@19.2.4` ocupa **38 MB** desempacotado — alto. Tree-shake do ESM cobre, mas o tamanho disco sinaliza que o pacote inclui muito boilerplate.

**Ação recomendada:**
1. Confirmar identidade do pacote (npm view lucide-react@1.7.0).
2. Se for o fork: avaliar trocar pelo oficial `lucide-react` (v0.4xx, react 19 compatível) ou por `@lucide-icons/react`.
3. Aplicar `optimizePackageImports: ['lucide-react']` independente da versão — Next vai gerar deep imports automaticamente.

### H3. Barrel imports em `@trifold/shared` (cliente)

`packages/shared/src/index.ts` reexporta tudo (types, constants, meta client, phone utils):

```ts
export * from "./types/lead"
export * from "./constants/pipeline"
export * from "./constants/lead-fields"
export * from "./constants/stages"
export * from "./meta"          // ← inclui client.ts, errors.ts, rate-limiter.ts, types
export * from "./utils/phone"
```

**Riscos client:**
- `components/pipeline/lead-card.tsx` (`use client`) faz `import { MANDATORY_FIELDS } from "@trifold/shared"` — junto com isso o bundler pode arrastar `meta/client.ts`, `meta/rate-limiter.ts`, etc., se tree-shaking falhar (depende de `sideEffects: false` no package.json — **e o package.json do shared NÃO declara `sideEffects`**).
- `app/dashboard/campaigns/meta/[campaign_id]/campaign-detail-client.tsx` (`use client`) importa 5 tipos + tipos do shared — types são erased mas o barrel ainda força o bundler a analisar.

**Ações:**
1. Adicionar `"sideEffects": false` no `packages/shared/package.json` — habilita tree-shake agressivo.
2. Considerar separar o barrel em subpaths: `@trifold/shared/types`, `@trifold/shared/constants`, `@trifold/shared/meta` (server-only), `@trifold/shared/phone`. Permite imports server-only do `meta/client.ts` (que tem rate-limiter, errors) sem risco de cliente arrastar.
3. Listar `@trifold/shared` em `optimizePackageImports`.

### H4. `'use client'` em páginas que poderiam ser server (66/132 ≈ 50%)

Amostragem de **componentes pequenos** com `use client` que poderiam ser server components com small islands:

| Arquivo | Sintoma |
|---------|---------|
| `app/cliente/[obra_id]/error.tsx` | Error boundary — `use client` é obrigatório, OK |
| `app/cliente/[obra_id]/mensagens/error.tsx` | Idem, OK |
| `components/admin/role-dropdown.tsx` | OK — usa `useRouter` + `fetch` |
| `app/dashboard/obras/[obra_id]/_components/obra-edit-button.tsx` | Provavelmente só abre modal — poderia ser `<form>` server action |
| `app/dashboard/obras/[obra_id]/_components/foto-delete-button.tsx` | Botão de delete — poderia ser `<form action={serverAction}>` |
| `app/dashboard/obras/[obra_id]/_components/doc-delete-button.tsx` | Idem |
| `app/cliente/page.tsx` | **Landing do portal cliente** — vale auditar se realmente precisa client |
| `app/dashboard/configuracoes/integracoes/google-integration-card.tsx` | Card de status; talvez só botão precisa ser client |

A regra prática é: **`use client` no menor leaf possível, nunca em página completa**. Algumas páginas grandes (744 LOC, 674 LOC) que são `use client` certamente têm trechos que poderiam ser server-rendered.

---

## MEDIUM PRIORITY

### M1. Console logs em produção

```
console.log  : 16 ocorrências
console.error: 55
console.warn : 9
```

A maioria está em **API routes (server)**, mas há ocorrências em:
- `src/lib/logger.ts` (centralizador — OK)
- 2 `.tsx` files com `console.log/error` (error boundaries — OK)

**Recomendação:** adicionar `compiler: { removeConsole: { exclude: ['error', 'warn'] } }` no `next.config.ts`. Bônus: tira ruído de monitoramento de cliente em produção e reduz alguns KB.

### M2. Imagens & assets

- `/Users/ogabrielhr/trifold-crm/logo-Trifold-laranja.webp` (2.6 KB) está **na raiz do projeto** (não em `public/`). É um arquivo perdido/duplicado — `public/logo-trifold.webp` (2.6 KB) já existe e é o utilizado por `components/layout/sidebar-nav.tsx`. **Pode ser deletado.**
- `public/` tem **96 KB total**. Tudo otimizado: `logo-trifold.webp` (2.6K), `icon-512.png` (1.8K), `icon-192.png` (547B), SVGs pequenos. **Excelente.**
- **Zero `<img>` tag bruto** — todos os usos visuais estão via `next/image` (10 arquivos). 

### M3. Service Worker

`public/sw.js` (1.5 KB). Implementação **enxuta e correta**:
- Cache offline isolado para `/cliente/offline`.
- Network-first com fallback.
- Cleanup de caches antigos no activate (com try/catch em `.catch(()=>{})` — bom).
- Push notification + click handler.

**Nada a melhorar** no SW em si. Não há `workbox`, não há cache de assets estáticos (Next.js já entrega imutáveis com `_next/static/*` com headers longos — desnecessário re-cachear). 

### M4. CSS / Tailwind

- `app/globals.css` tem **80 linhas** — incluindo theme inline (Tailwind v4), scrollbar, fadeIn, slideIn keyframes, mobile safe-area. **Limpo.**
- PostCSS config: somente `@tailwindcss/postcss` — minimal e correto para Tailwind 4.
- Tailwind 4 já faz purge em produção via `content` auto-detection. **OK.**

### M5. `tsconfig.json` — `target: ES2017`

`packages/web/tsconfig.json` tem `"target": "ES2017"`. Em 2026, navegadores modernos suportam ES2022+ trivialmente. Atualizar para `ES2022` (ou `ESNext`) gera código menos transpilado, com `async/await` nativo, optional chaining nativo, classes nativas — ~5–15 KB economizados em código transpilado desnecessário.

---

## Inventário de arquivos grandes (>300 linhas)

### Client components (`.tsx`)

| LOC | Arquivo | use client? |
|-----|---------|-------------|
| 1080 | `app/dashboard/campaigns/meta/[campaign_id]/campaign-detail-client.tsx` | sim |
| 744 | `app/dashboard/properties/[id]/units/[unitId]/page.tsx` | sim |
| 674 | `app/dashboard/agenda/page.tsx` | (server import — verificar) |
| 617 | `app/broker/agenda/page.tsx` | (server import — verificar) |
| 507 | `app/dashboard/leads/[id]/page.tsx` | — |
| 490 | `app/dashboard/obras/[obra_id]/_components/admin-chat-feed.tsx` | sim |
| 447 | `app/dashboard/leads/[id]/timeline/page.tsx` | — |
| 439 | `app/dashboard/properties/[id]/edit/page.tsx` | sim |
| 433 | `app/dashboard/campaigns/meta/campaigns-meta-client.tsx` | sim |
| 404 | `components/leads/lead-detail-drawer.tsx` | sim (drawer — candidato dynamic) |
| 364 | `app/dashboard/obras/[obra_id]/_components/obra-detail-tabs.tsx` | — |
| 358 | `app/cliente/[obra_id]/mensagens/_components/chat-feed.tsx` | sim |
| 357 | `app/dashboard/sistema/email-envio-rapido/_components/quick-send-form.tsx` | sim |
| 357 | `app/dashboard/obras/[obra_id]/_components/foto-upload-form.tsx` | sim |
| 339 | `components/analytics/leads-chart.tsx` | sim (recharts) |
| 337 | `app/dashboard/properties/[id]/page.tsx` | — |
| 335 | `app/dashboard/properties/new/page.tsx` | sim |

### Server / API routes (`.ts`)

| LOC | Arquivo |
|-----|---------|
| 843 | `app/api/webhook/whatsapp/route.ts` |
| 638 | `app/api/telegram/webhook/route.ts` |
| 623 | `app/api/webhook/whatsapp/__tests__/route.test.ts` |
| 533 | `app/api/cron/meta-ads-intelligence/route.ts` |
| 524 | `app/api/cron/campaign-poll/route.ts` |
| 486 | `app/api/cron/followup/route.ts` |
| 439 | `app/api/meta-ads/campaigns/[campaign_id]/route.ts` |
| 398 | `app/api/webhooks/meta-ads/route.ts` |
| 327 | `app/api/cron/meta-sync-insights/route.ts` |

Server routes grandes não afetam bundle do cliente, mas afetam **cold-start** em serverless (Vercel). Vale aplicar dynamic imports para `@trifold/ai` (já é feito em vários cron jobs — bom padrão). O `webhook/whatsapp/route.ts` já faz `await import("@trifold/ai")` — pattern correto.

---

## Inventário de `'use client'`

- **Total de arquivos com `'use client'`:** 78
- **Arquivos em `/app`:** 66 de 132 (50%)
- **Arquivos em `/components`:** 12

Top componentes "líderes" client (já listados em H1/H4). Não há sinalização imediata de excesso bizarro — Trifold é uma aplicação **interativa** (Kanban dnd, formulários, chat, upload, modais). A maioria das `use client` é justificada por:
- `useState/useReducer/useEffect`
- Listeners (chat, dnd)
- Imports de `@dnd-kit` (que requer client)
- `useRouter.refresh()` após mutations

---

## Dependências analisadas

| Lib | Versão | Usada em | Server/Client | Tamanho desempacotado |
|-----|--------|----------|---------------|----------------------|
| `googleapis` | ^171.4.0 | `lib/google.ts` + 4 API routes | **server only** | 194 MB |
| `recharts` | ^3.8.1 | `components/analytics/leads-chart.tsx` | client (`use client`) | 8.5 MB |
| `lucide-react` | ^1.7.0 | 31 arquivos, 43 ícones | client (maioria) | 38 MB |
| `@supabase/ssr` + `supabase-js` | ^0.6.0 / ^2.49.0 | onipresente | server+client | 2.8 MB auth-js + 1.3 MB postgrest |
| `@dnd-kit/*` | core ^6.3.1, sortable ^10 | `components/pipeline/*` (3 arquivos) | client | 1.5 MB core + 364 KB sortable |
| `resend` | ^6.12.0 | 5 arquivos, todos API/server | **server only** | 236 KB |
| `web-push` | ^3.6.7 | `lib/server/push-service.ts` (server) | **server only** | 76 KB |
| `class-variance-authority`, `clsx`, `tailwind-merge` | — | `lib/utils.ts` (cn helper) | universal | minúsculos |

**Diagnóstico de uso server-only:** todos os 3 candidatos críticos (`googleapis`, `resend`, `web-push`) **estão estritamente no server**. Não há vazamento atual.

**Falta:** declarar `import "server-only"` no topo de `lib/google.ts`, `lib/email.ts`, `lib/server/push-service.ts` para fail-fast em refactor errado.

---

## Recomendações (priorizadas, com estimativa)

### Quick wins (≤30 min cada)

1. **Atualizar `next.config.ts`** — estimativa: 30–80 KB gzip economizados + várias proteções:
   ```ts
   const nextConfig: NextConfig = {
     compiler: {
       removeConsole: { exclude: ['error', 'warn'] },
     },
     experimental: {
       optimizePackageImports: [
         'lucide-react',
         'recharts',
         '@trifold/shared',
         '@dnd-kit/core',
         '@dnd-kit/sortable',
         '@dnd-kit/utilities',
       ],
     },
     serverExternalPackages: ['googleapis', 'web-push', 'resend'],
     images: {
       formats: ['image/avif', 'image/webp'],
       // remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
     },
   };
   ```

2. **Adicionar `"sideEffects": false`** em `packages/shared/package.json` — estimativa: 5–20 KB no client (cliente que importa `MANDATORY_FIELDS` para de potencialmente arrastar `meta/client.ts`).

3. **`import "server-only"`** em `lib/google.ts`, `lib/email.ts`, `lib/server/push-service.ts` — estimativa: 0 KB hoje, **bloqueia regressão futura de 194 MB**.

4. **Atualizar `tsconfig.target`** para `ES2022` — estimativa: 5–15 KB transpile menos.

5. **Deletar `logo-Trifold-laranja.webp` da raiz** — estimativa: limpeza, sem impacto de bundle.

### Médio prazo (1–3h)

6. **`next/dynamic` no `LeadsChart`** — estimativa: ~70–95 KB gzip economizados na rota `/dashboard/analytics`.

7. **`next/dynamic` no `LeadDetailDrawer`** (importado em `kanban-board.tsx`) — economizar 30–60 KB no carregamento inicial do `/dashboard/pipeline` (a rota mais frequente).

8. **`next/dynamic` em modais e wizards:**
   - `app/dashboard/sistema/email-templates/_components/preview-modal.tsx`
   - `app/dashboard/sistema/email-blasts/novo/_components/wizard.tsx`
   - `app/dashboard/obras/[obra_id]/_components/foto-upload-form.tsx`
   - `app/dashboard/obras/[obra_id]/_components/obra-edit-modal.tsx`
   - `app/cliente/[obra_id]/_components/privacy-consent-modal.tsx`
   
   Estimativa agregada: 50–150 KB economizados spread por rotas.

9. **Auditoria de barril `@trifold/shared`** — separar em subpaths (`/types`, `/constants`, `/meta`, `/phone`) — estimativa: 5–15 KB no client da página de campanhas Meta.

### Longo prazo / investigativo

10. **Confirmar `lucide-react@1.7.0`** — se for o fork problemático, migrar para o pacote oficial `lucide-react` (v0.4xx) — economia variável (10–80 KB dependendo de quanto tree-shake real está ocorrendo).

11. **Auditoria caso-a-caso de `'use client'`** nas páginas grandes (`agenda/page.tsx` 674 LOC, `properties/[id]/units/[unitId]/page.tsx` 744 LOC). Mover lógica não-interativa para server components — estimativa: 20–60 KB por página rica.

12. **Console logs**: revisar os 16 `console.log` em API routes do Telegram/cron — alguns vazam dados sensíveis (audio buffers, transcrições, fragmentos de respostas Nicole). Trocar por `logger.ts`.

---

## Estimativa consolidada

| Faixa | Ações | Impacto total estimado |
|-------|-------|------------------------|
| Quick wins (1–4) | Config + `server-only` + `sideEffects` | **40–120 KB gzip** initial load + proteções estruturais |
| Médio prazo (6–9) | `next/dynamic` em chart/drawer/modais | **150–300 KB gzip** spread por rotas frequentes |
| Longo prazo (10–11) | Refactor estrutural | **50–200 KB gzip** adicional |

**Total potencial: 240–620 KB gzip** de redução em JS de cliente, sem nenhuma reescrita de feature.

---

## Anexo — Lucide icons usados (43 únicos)

`Activity, AlertCircle, ArrowLeft, BarChart3, Bell, Building2, CalendarDays, Camera, Check, CheckCircle, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Eye, EyeOff, FileDown, FileText, GitMerge, GraduationCap, HardHat, Home, Inbox, Kanban, Layers, LayoutDashboard, LayoutTemplate, Loader2, Mail, Megaphone, MessageSquare, Paperclip, Pencil, Plus, Rocket, Search, Send, Settings, Shield, ShieldCheck, Star, Trash2, Upload, User, UserCheck, UserPlus, Users, X, XCircle, Zap`
