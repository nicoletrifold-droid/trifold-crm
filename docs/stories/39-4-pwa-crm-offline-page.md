# Story 39-4: CRM offline page + fallback no service worker

## Status
Draft

## Complexity
S (Small) — 1 nova página + atualização do SW

## Executor Assignment
```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run type-check", "npm run lint"]
```

## Story

**As a** corretor usando o CRM instalado como PWA,
**I want** ver uma página amigável quando estiver sem internet em vez de um erro genérico do browser,
**so that** eu entenda o que está acontecendo e saiba que o app voltará a funcionar quando a conexão retornar.

## Acceptance Criteria

1. Existe o arquivo `packages/web/src/app/dashboard/offline/page.tsx`:
   - Componente client (`'use client'`)
   - Escuta o evento `window.addEventListener('online', ...)` e quando disparado faz `window.location.href = '/dashboard'`
   - Exibe:
     - Fundo `bg-stone-50 dark:bg-stone-950`
     - Ícone de wifi cortado (SVG inline ou Lucide `WifiOff`)
     - Título "Sem conexão" (text-gray-900 dark:text-stone-100)
     - Parágrafo "Você está offline. O CRM voltará automaticamente quando a conexão for restabelecida."
     - Botão "Tentar novamente" que ao click faz `window.location.href = '/dashboard'` (mesma estratégia da página offline do Portal)
     - Mensagem pequena embaixo: "A página recarrega automaticamente ao reconectar."
   - Não requer autenticação — deve ser servida pelo SW mesmo sem sessão

2. O arquivo `packages/web/public/sw.js` é atualizado:
   - A constante `OFFLINE_PAGE_DASHBOARD` é declarada: `const OFFLINE_PAGE_DASHBOARD = '/dashboard/offline'`
   - `APP_SHELL_URLS` inclui `OFFLINE_PAGE_DASHBOARD` (pré-cacheada no install)
   - O handler `fetch` tem um novo branch para navegação em `/dashboard`:
     ```js
     if (request.mode === 'navigate' && url.pathname.startsWith('/dashboard')) {
       event.respondWith(
         fetch(request).catch(() =>
           caches.match(OFFLINE_PAGE_DASHBOARD).then(
             (r) => r ?? new Response('Offline', { status: 503 })
           )
         )
       )
       return
     }
     ```
   - O branch existente para `/cliente` permanece inalterado
   - A lógica de `offlineFallback()` para `/cliente` continua apontando para `OFFLINE_PAGE_CLIENTE`

3. A página `/dashboard/offline` responde com HTTP 200 quando acessada diretamente (rota válida).

4. A página está dentro do escopo da autenticação do dashboard? **NÃO** — deve ser acessível sem login para o SW conseguir servi-la offline. Verificar se o middleware de auth do Next.js bloqueia esta rota e, se bloquear, adicionar à whitelist do matcher no `middleware.ts`.

5. `npm run type-check` e `npm run lint` passam sem erros.

## Scope

### IN
- `packages/web/src/app/dashboard/offline/page.tsx` — novo arquivo
- `packages/web/public/sw.js` — adicionar `OFFLINE_PAGE_DASHBOARD` + branch navigate `/dashboard`

### OUT
- Cache de dados do dashboard para uso offline (leads, pipeline)
- Sincronização de ações realizadas offline (backlog, requer IndexedDB + Background Sync)
- Offline page para rotas fora de `/dashboard` e `/cliente`

## Dependencies

- `packages/web/src/middleware.ts` — verificar se `/dashboard/offline` precisa ser adicionado ao matcher de rotas públicas

## Dev Notes

### Verificar middleware de auth
O middleware do projeto provavelmente protege todas as rotas `/dashboard/*` com redirect para `/login`. A página offline deve ser exceção — o SW serve a resposta cacheada do SW, não do Next.js server, então tecnicamente não passa pelo middleware quando servida pelo cache. Mas é boa prática garantir que a rota seja pública caso o SW não tenha a página cacheada ainda.

Verificar o arquivo `src/middleware.ts` (ou similar) e a configuração `matcher`. Adicionar `/dashboard/offline` à lista de rotas públicas se necessário.

### Consistência visual com Portal offline
A página do Portal (`/cliente/offline`) usa fundo `bg-stone-950` (dark). O CRM usa `bg-stone-50 dark:bg-stone-950` para respeitar o tema claro/escuro do CRM. Manter consistência dentro de cada contexto.

### Versão do SW
Esta story modifica o `sw.js`. As constantes de cache (`APP_SHELL_CACHE`, `STATIC_CACHE`) têm versão hardcoded `v3`. Por enquanto, bumpar para `v4` ao adicionar o novo OFFLINE_PAGE_DASHBOARD. Story 39-5 vai resolver o versionamento automático — até lá, bump manual é aceitável.

### Teste sem internet
Para testar:
1. DevTools → Network → "Offline" ou "No throttling" → selecionar "Offline"
2. Navegar para `/dashboard/pipeline`
3. Deve aparecer a página `/dashboard/offline` em vez de erro `net::ERR_INTERNET_DISCONNECTED`

## Dev Agent Record

### Agent Model Used
_a preencher_

### Debug Log References
_a preencher_

### Completion Notes
_a preencher_

### File List
_a preencher_

### Change Log
_a preencher_
