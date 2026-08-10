# Story 75-287 — Badges do /broker congelam (layout server) → badges vivos

**Story ID:** 75-287
**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** P/M (~3 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint]
- **Tipo:** bug fix (SDC/YOLO — mesma classe da 75-223/75-286)

---

## Story

Como **corretor com o app aberto o dia todo (PWA)**, quero que os números do menu reflitam a
realidade sem F5: hoje **Agenda, Chat (verde), Meus Leads e Bolsão** congelam na última carga
completa da página.

---

## Context

Pendência registrada desde a 75-223 e reconfirmada na 75-286: **tudo que é contado em layout
server do App Router congela em navegação interna.** O `broker/layout.tsx` calcula QUATRO
badges assim:

| Badge | Regra (hoje inline no layout) |
|---|---|
| Agenda | appointments futuros `scheduled/confirmed` do org **+ broker_id = user.id** |
| Chat (verde) | `getBrokerUnreadTotal` (RPC `get_broker_unread_total`) |
| Meus Leads | `lead_distribution_log` status `distributed` com `created_at > leads_notifications_seen_at` |
| Bolsão | leads ativos com `bolsao_em` not null e sem dono |

Para o corretor o efeito é pior que no dashboard: o app fica aberto como PWA por horas — lead
novo distribuído, conversa nova e lead no bolsão **não aparecem** até um reload.

### Decisão de desenho — 1 rota, não 4

O `liveBadges[]` da 75-286 faz 1 fetch por entrada. Quatro entradas = 4 requests/min por
corretor. Em vez disso: o `SidebarNav` passa a **dedupe-ar endpoints** e aceitar resposta
`{ counts: { [href]: number } }` além de `{ count }` — 4 badges vivos com **1 request/min**.
O contrato antigo (`{ count }`, dashboard) continua válido.

---

## Acceptance Criteria

- [x] **AC1 — os 4 badges atualizam sem F5** em ≤60s (ou ao focar/navegar). _(mesmo mecanismo
      validado em prod no Chat/Agenda do dashboard; confirmar visualmente pós-deploy)_
- [x] **AC2 — fonte única.** As 4 réguas saem do layout para `lib/broker/nav-counts.ts`
      (reusando `getUpcomingAppointmentsCount` com filtro opcional de broker e
      `getBrokerUnreadTotal`), consumida pelo layout E pela rota — zero regra duplicada.
- [x] **AC3 — rota gateada.** `GET /api/broker/nav-counts`: requireAuth + `requireRole(broker)`
      (mesmo gate do layout, que redireciona não-broker); anônimo = 401; cliente user-scoped
      (mesma RLS do layout). `force-dynamic`.
- [x] **AC4 — 1 request por ciclo.** Entradas de `liveBadges` com o MESMO endpoint disparam
      um único fetch (`Map` por endpoint); resposta `{ counts }` alimenta os hrefs.
- [x] **AC5 — dashboard não regride.** Contrato `{ count }` intacto (Chat e Agenda do
      /dashboard continuam funcionando); tom verde do Chat do broker preservado
      (`badgeTone` vem do item server-side e o live só troca o número).
- [x] **AC6 — testes.** `nav-counts.test.ts` congela as 4 réguas (fake supabase por tabela +
      RPC); `appointments-count.test.ts` cobre com/sem `brokerId`.

---

## Tasks

- [x] `lib/agenda/appointments-count.ts`: filtro opcional `brokerId`
- [x] `lib/broker/nav-counts.ts`: `getBrokerNavCounts()` com as 4 réguas movidas do layout
- [x] `SidebarNav`: dedupe de endpoint + suporte a `{ counts: Record<href, number> }`
- [x] Rota `GET /api/broker/nav-counts`
- [x] `broker/layout.tsx`: consumir a lib + passar `liveBadges` (4 hrefs, 1 endpoint)
- [x] Testes (vitest) + lint + typecheck
- [ ] Smoke pós-deploy: curl anônimo = 401 na rota nova (e nas 2 do dashboard, regressão)

## File List

- `packages/web/src/lib/broker/nav-counts.ts` (novo — 4 réguas movidas do layout)
- `packages/web/src/lib/broker/nav-counts.test.ts` (novo)
- `packages/web/src/app/api/broker/nav-counts/route.ts` (novo)
- `packages/web/src/lib/agenda/appointments-count.ts` (filtro opcional `brokerId`)
- `packages/web/src/lib/agenda/appointments-count.test.ts` (cobre com/sem broker)
- `packages/web/src/components/layout/sidebar-nav.tsx` (dedupe endpoint + `{ counts }`)
- `packages/web/src/app/broker/layout.tsx` (consome a lib + `liveBadges`)
- `docs/stories/75-287-badge-broker-vivo.story.md`

## QA Results (@qa)

**Gate: PASS** — vitest 165 arquivos / 2075 testes verdes (7 expected fail pré-existentes),
`type-check` limpo, lint 0 erros (21 warnings pré-existentes). Réguas movidas LITERALMENTE
(diff conferido contra o layout antigo, incluindo fallback `1970-01-01` do seen_at e o filtro
75-89 do bolsão). Raio de impacto: broker layout + SidebarNav (dashboard coberto por AC5 e
pela suíte). Pendência consciente: smoke pós-deploy.
