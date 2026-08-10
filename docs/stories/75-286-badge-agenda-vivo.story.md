# Story 75-286 — Badge da Agenda congela (layout server) → badge vivo

**Story ID:** 75-286
**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** P (~2 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint]
- **Tipo:** bug fix simples (SDC/YOLO — story enxuta, sem fase @po separada)

---

## Story

Como **gestor com o CRM aberto**, quero que o número ao lado do menu **Agenda** reflita os
compromissos reais, sem precisar de F5. Em 10/08 o badge mostrava **1** com **2** compromissos
futuros na tela da Agenda.

---

## Context

Achado em 10/08 pelo Marcos. Diagnóstico confirmado com query em prod: os 2 compromissos
(`scheduled`, futuros) existiam e a query do badge retornaria 2 — mas o segundo foi criado às
11:27 BRT, **depois** da carga da aba.

### Causa-raiz — mesma da Story 75-223 (badge do Chat)

`agendaCount` é calculado em `app/dashboard/layout.tsx` (server component). No App Router,
**layouts não re-renderizam em navegação interna** — o número fica da última carga completa até
um reload. Gotcha já documentado; o fix do Chat criou exatamente o padrão para reuso:

- rota de contagem (`force-dynamic`, mesmo gate do menu) devolvendo `{ count }`;
- prop `liveBadge` no `SidebarNav` (client) — refetch no mount, a cada 60s, em
  focus/visibilitychange e a cada mudança de pathname; fail-open.

Limitação atual: `liveBadge` aceita **um único item** — e o slot já é do Chat. Precisa
generalizar para N itens.

---

## Acceptance Criteria

- [x] **AC1 — badge da Agenda atualiza sem F5.** Compromisso criado/cancelado com a aba aberta
      reflete no badge em ≤60s (ou imediatamente ao navegar/focar a aba). _(mesmo mecanismo já
      validado em prod para o Chat; confirmar visualmente pós-deploy)_
- [x] **AC2 — mesma régua do layout.** A rota de contagem usa a MESMA regra do
      `agendaCount` do layout (org-wide, `status in (scheduled, confirmed)`,
      `scheduled_at >= now`), extraída para fonte única em `lib/` — layout e rota consomem a
      mesma função ([[feedback-consultar-fonte-nao-duplicar-constante]]).
- [x] **AC3 — mesmo gate do menu.** Rota exige auth + `canAccess("agenda")`; anônimo = 401,
      sem permissão = 403. Cliente user-scoped (mesma RLS do layout — sem admin client).
- [x] **AC4 — badge do Chat não regride.** `SidebarNav` passa a aceitar N badges vivos;
      o comportamento do Chat (75-223) permanece idêntico, incluindo fail-open (agora por item).
- [x] **AC5 — teste que falharia com o bug de regressão.** `appointments-count.test.ts` congela
      a régua da contagem (tabela, filtros org/status/futuro e `count null → 0`). O suporte a
      múltiplos `liveBadges` não tem teste de componente — o repo não tem infra de teste de
      componente (zero `.test.tsx`, sem testing-library); cobertura fica no smoke pós-deploy.

---

## Tasks

- [x] Extrair contagem p/ `lib/agenda/appointments-count.ts` (usada por layout + rota)
- [x] Rota `GET /api/agenda/appointments-count` (requireAuth + canAccess("agenda"), force-dynamic)
- [x] `SidebarNav`: `liveBadge` → `liveBadges[]` (estado por href em `Record`, fetch-all compartilhado,
      dep do efeito serializada em `liveKey` p/ estabilidade)
- [x] `dashboard/layout.tsx`: passar Chat + Agenda condicionados às permissões
- [x] Testes (vitest) + lint + typecheck
- [ ] Smoke pós-deploy: curl anônimo na rota = 401 + badge atualiza sem F5

## File List

- `packages/web/src/lib/agenda/appointments-count.ts` (novo)
- `packages/web/src/lib/agenda/appointments-count.test.ts` (novo)
- `packages/web/src/app/api/agenda/appointments-count/route.ts` (novo)
- `packages/web/src/components/layout/sidebar-nav.tsx` (prop `liveBadge` → `liveBadges[]`)
- `packages/web/src/app/dashboard/layout.tsx` (usa a lib + passa os 2 badges vivos)
- `docs/stories/75-286-badge-agenda-vivo.story.md`

## QA Results (@qa)

**Gate: PASS** — vitest 164 arquivos / 2067 testes verdes (7 expected fail pré-existentes),
`type-check` limpo, lint 0 erros (21 warnings pré-existentes). Sem referência remanescente à
prop antiga `liveBadge` (broker/layout não usava). Raio de impacto: só o sidebar do
`/dashboard`; broker intocado. Pendência consciente: smoke pós-deploy (401 anônimo + badge).

## Follow-ups conhecidos (fora do escopo)

- Badge do `/broker` (`getBrokerUnreadTotal`) tem o mesmo congelamento — story própria.
