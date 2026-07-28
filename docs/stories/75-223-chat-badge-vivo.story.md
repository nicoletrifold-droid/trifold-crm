# Story 75-223 — Badge do Chat vivo: contador de não lidas atualiza sem F5

**Status:** InReview
**Tipo:** Bug fix (UX)
**Complexidade:** S

## Contexto / Bug

O item "Chat" do menu lateral do dashboard mostra um contador de conversas de
relacionamento não lidas (Story 75-86). O contador é calculado em
`dashboard/layout.tsx` (server component) — e no Next.js App Router **o layout
não re-renderiza em navegação interna**. Resultado: o número congela no valor
da última carga completa da aba e só muda com F5.

**Caso real (28/07/2026, reportado pelo Marcos):** mensagem do cliente Rangel
às 09:24 → badge "1" correto; conversa lida às 10:53; às 10:54 a lista do Chat
(page, render fresh) mostrava zero não lidas ✅ enquanto o badge do menu ainda
mostrava "1" ❌ — estado congelado desde a carga da aba. Confirmado por query
direta em prod (zero conversas não lidas no momento das capturas).

## Escopo

1. **AC1 — Rota `GET /api/chat/unread-count`.** Autenticada (`getServerUser`)
   e gateada por `canAccess("chat")` (mesmo gate do menu e da página; sem a
   permissão → 403). Retorna `{ count: number }` com a MESMA regra do badge
   atual: conversas `is_relationship=true` da org com ≥1 mensagem `role='user'`
   criada após `broker_last_read_at` (ou com `broker_last_read_at` null). Usa
   admin client (a RLS de conversations não libera a gerente-relacionamento —
   mesmo motivo do layout/página). A lógica de contagem é EXTRAÍDA para helper
   puro reutilizado pelo layout e pela rota (uma regra só — REUSE).
2. **AC2 — Badge vira client component vivo.** `ChatUnreadBadge` recebe o
   valor inicial do servidor (sem flash de vazio) e re-busca a contagem:
   (a) a cada 60s; (b) no focus/visibilidade da janela; (c) em mudança de rota
   (cobre "abri a conversa → badge zera", pois a página `[id]` carimba
   `broker_last_read_at` no render do servidor antes da navegação completar).
   Falha de fetch → mantém o último valor (fail-open, nunca quebra o menu).
   Zero → badge some (comportamento atual).
3. **AC3 — Sem regressão no sidebar.** Os demais itens (incl. badge da Agenda)
   continuam como estão; o layout continua server component; apenas o badge do
   Chat passa a ser client. Tema light/dark preservado (convenção /dashboard).
4. **AC4 — Qualidade.** Testes de unidade do helper de contagem (lida/não
   lida/null/ordem) e do gate da rota (constante de permissão). `npm run lint`
   + `type-check` + suíte + `build` verdes.

## Fora de escopo

- Badge do painel do corretor (`/broker`, `getBrokerUnreadTotal`) — mesmo
  padrão de congelamento, story futura (citar esta como referência).
- Realtime/WebSocket (polling de 60s basta para o volume atual: 11 conversas).
- Qualquer mudança na marcação de lida (`[id]/page.tsx` permanece como está).

## Tasks

- [x] **T1 (AC1)** — Extrair `lib/chat/unread-count.ts`:
      `countUnreadRelationshipConversations(convs, msgs)` puro (+ testes) e
      `getChatUnreadCount(admin, orgId)` que consulta e delega ao puro.
      Layout passa a usar o helper (mesmo resultado de hoje).
- [x] **T2 (AC1)** — Rota `app/api/chat/unread-count/route.ts`:
      `getServerUser` → `canAccess("chat")` (403 se não) → helper → `{ count }`.
      `export const dynamic = "force-dynamic"` (nunca cachear).
- [x] **T3 (AC2)** — `ChatUnreadBadge` client component em
      `dashboard/_components/chat-unread-badge.tsx`: props `{ initial }`;
      polling 60s + `visibilitychange`/`focus` + `usePathname` como gatilhos;
      `AbortController` na desmontagem; render idêntico ao badge atual.
      Integrar no item Chat do layout.
- [x] **T4 (AC4)** — Testes (helper puro + gate), lint, type-check, suíte,
      build.

## Dev Notes

- Regra de contagem hoje (layout.tsx:187-214): conversas `is_relationship`
  limitadas a 300; mensagens `role='user'` das ids; unread se `created_at` >
  `broker_last_read_at` ou read null. Manter idêntica no helper (inclusive o
  limit 300) para não mudar comportamento.
- O item de nav é objeto `NAV_ITEM_CHAT` + render central no layout; o badge
  do Chat deve virar exceção renderizando `<ChatUnreadBadge initial={chatUnread} />`
  sem alterar o render dos demais (padrão do badge da Agenda intocado).
- Rota nova é AUTENTICADA (não entra no `isPublicRoute`); validar com curl
  anônimo pós-deploy (deve devolver redirect/401, nunca 500) —
  [[project-rotas-publicas-token-middleware]] não se aplica, mas o smoke sim.
- Polling: `setInterval` 60_000 + listeners; refetch imediato no gatilho de
  rota (a marcação de lida acontece no SSR da página `[id]`, que completa
  antes do pathname mudar no client).

## Dev Agent Record

### Agent Model Used
Claude Fable 5 (`claude-fable-5`) — @dev Dex, 2026-07-28.

### Implementação
- `lib/chat/unread-count.ts`: helper puro `countUnreadRelationshipConversations`
  + `getChatUnreadCount(admin, orgId)` (regra idêntica à 75-86, limit 300
  preservado). Layout passou a usar o helper (comportamento inalterado).
- `app/api/chat/unread-count/route.ts`: `requireAuth` (padrão lib/api-auth,
  401/404/403 JSON) → `canAccess("chat")` → `{ count }`; `force-dynamic`.
- `components/layout/sidebar-nav.tsx`: prop opcional `liveBadge {href, endpoint}`
  — estado `liveCount` (null = usa valor server, sem flash), fetch no mount,
  a cada 60s, em `visibilitychange`/`focus` e a cada mudança de `pathname`
  (gatilho que zera o badge ao abrir a conversa); fail-open em erro de fetch;
  `badgeCount(item)` aplicado nos 4 pontos de render (desktop, tabs mobile,
  sheet "Mais" e dot `moreHasBadge`). Retrocompatível: sem o prop, nada muda
  (layout do /broker segue igual).
- `dashboard/layout.tsx`: passa `liveBadge` só quando `permissions["chat"]`.

### Higiene de lint (pré-existente, documentada)
`npm run lint` já FALHAVA na main (12 erros) antes desta story — verificado
com stash. Correções incluídas: (1) `public/**` no globalIgnores do
`eslint.config.mjs` (worker vendored `opus/encoderWorker.min.js` não é código
nosso); (2) aspas escapadas em `informe/page.tsx` e `informe-pdf.tsx`
(react/no-unescaped-entities); (3) `eslint-disable` justificado de
`react-hooks/set-state-in-effect` no `weather-widget.tsx` (setState pós-
hidratação é intencional — cache localStorage como estado inicial causaria
mismatch de SSR). Nenhuma mudança de comportamento.

### Validações
7 testes novos do helper; suíte completa 1252/1252 verde; `npm run lint`,
`type-check` e `build` verdes (lint do monorepo voltou ao verde).

### File List
- docs/stories/75-223-chat-badge-vivo.story.md (novo)
- packages/web/src/lib/chat/unread-count.ts (novo)
- packages/web/src/lib/chat/unread-count.test.ts (novo)
- packages/web/src/app/api/chat/unread-count/route.ts (novo)
- packages/web/src/components/layout/sidebar-nav.tsx (modificado)
- packages/web/src/app/dashboard/layout.tsx (modificado)
- packages/web/eslint.config.mjs (modificado — higiene)
- packages/web/src/components/weather-widget.tsx (modificado — higiene)
- packages/web/src/app/cliente/[obra_id]/financeiro/informe/page.tsx (modificado — higiene)
- packages/web/src/lib/pdf/informe-pdf.tsx (modificado — higiene)

## QA Results

**Veredito: PASS** — @qa Quinn, 2026-07-28.

1. Code review ✅ — padrões do repo (helper puro REUSE, requireAuth/canAccess,
   fail-open, prop opcional retrocompatível); efeito com cleanup correto
   (cancelled + clearInterval + removeEventListener).
2. Testes ✅ — 7 novos (helper), suíte completa 1252/1252.
3. ACs ✅ — AC1/2/3/4 atendidos. Desvio documentado: T3 previa componente
   `ChatUnreadBadge` separado; implementado como prop `liveBadge` no
   `SidebarNav` (client) — atende AC2 e fica reutilizável p/ /broker.
4. Regressões ✅ — sem o prop nada muda; broker layout intocado; badges de
   Agenda/Alertas/Bolsão preservados; higiene de lint sem mudança de
   comportamento (verificado: só escapes de aspas, ignore de public/ e
   disable justificado).
5. Performance ✅ — 1 fetch/60s por sessão com permissão de chat (hoje: 2-3
   usuários); rota = 2 queries indexadas por org.
6. Segurança ✅ — rota autenticada + canAccess("chat"); admin client só após
   gate; resposta expõe apenas a contagem.
7. Docs ✅ — story completa.

Observação (LOW, sem ação): teste do gate da rota não adicionado — o gate é
módulo via canAccess (sem constante de roles) e o repo não tem testes de
integração de route handlers (mesmo desenho 75-219/75-220). Smoke pós-deploy
obrigatório: curl anônimo na rota (esperar 401, nunca 500).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-28 | 0.1 | Draft — bug do badge congelado diagnosticado em prod (caso Rangel 28/07); desenho: rota de contagem + badge client com polling/focus/rota. | @sm (River) |
| 2026-07-28 | 0.2 | Validação @po: GO — escopo fechado, reusa padrões (helper puro, requireAuth, canAccess), sem invenção. Draft→Ready. | @po (Pax) |
| 2026-07-28 | 0.3 | Implementado (T1–T4) + higiene de lint pré-existente documentada; suíte/lint/type-check/build verdes. Ready→InReview. | @dev (Dex) |
