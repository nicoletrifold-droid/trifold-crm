# Story 75-304 — Perfis de Acesso 2.0 · F3-3: Chamados via capabilities

**Story ID:** 75-304
**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** XS (~2 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint, next build, smoke em dev]
- **Tipo:** migração de gate (F3-3, template 75-302/303)

## Story

Como **admin**, quero **as 2 ações de Suporte decididas pela matriz** (`chamados.ver_todos`,
`chamados.responder`), porque hoje são 5 checagens inline `role === "admin" || "supervisor"`
espalhadas por API, tela, card e badge do menu.

**Zero mudança de comportamento** (diff seed × gate): ambos os seeds = [admin, supervisor] =
as checagens inline. `chamados.apagar` NÃO entra: o único gate de exclusão é RLS
(`chamados_delete_admin`) — vira enforced na F4, nunca antes (anti-"botão que mente").

## Context (conferido em `main` @ `a05bc36b`, 13/08)

Sites: `api/admin/chamados/route.ts:141` (escopo todos×próprios → ver_todos) ·
`api/admin/chamados/[id]/route.ts:12` (PATCH 403 → responder) ·
`dashboard/chamados/page.tsx:31` (isAdmin → ver_todos; card → responder) ·
`chamado-card.tsx:150,203` (botões — a prop `isAdmin` só servia p/ isso → RENOMEADA
`canRespond`, threading novo pela wrapper) · `dashboard/layout.tsx:162` (badge do Suporte →
ver_todos, resolvido 1× antes das queries). `broker/suporte` segue `false` hardcoded (escopo
da área do corretor, não autorização).

## Acceptance Criteria

- [x] **AC1** — 5 sites inline substituídos por `can()`/`requireCapability`; UI separa
      ver_todos (lista/título/marker/filtros/badge) de responder (botões do card).
- [x] **AC2** — Comportamento idêntico (seeds = checagens antigas; teste congela os 2 espelhos).
- [x] **AC3** — 2 capabilities enforced; ações na matriz sob Suporte e nas Exceções.
- [x] **AC4** — Gates verdes + smoke em dev.
- [x] **AC5** — Limites: `chamados.apagar` segue não-enforced (gate é RLS — F4); RLS de
      `chamados_select` (god-gate) intocada (F4).

## Change Log

- 2026-08-13 · @sm (River) · Draft (template F3).
- 2026-08-13 · @po (Pax) · **GO (9/10)** — exigido: separar ver_todos de responder na UI
  (card não pode herdar "ver" como "agir"); apagar fora por não ter gate de código. → Ready.

## File List

| arquivo | ação |
|---|---|
| `api/admin/chamados/route.ts` | escopo da listagem → `can("chamados.ver_todos")` |
| `api/admin/chamados/[id]/route.ts` | PATCH → `requireCapability("chamados.responder")` |
| `dashboard/chamados/page.tsx` | `isAdmin`→ver_todos + `canRespond`→responder (2 caps) |
| `chamados-client-wrapper.tsx` | prop `canRespond` nova, encaminhada ao card |
| `chamado-card.tsx` | prop `isAdmin` RENOMEADA `canRespond` (únicos usos: botões) |
| `dashboard/layout.tsx` | badge Suporte → `podeVerTodosChamados` via can() |
| `lib/capabilities.ts` + `.test.ts` | 2 caps enforced + espelho congelado (9 enforced no total) |

## Dev Agent Record

**Fable 5 · @dev (Dex) · YOLO · 13/08/2026** · Branch `feat/75-304-chamados-capability`.

- Diff seed×gate: [A,S] ×2 = inline antigo — zero delta, congelado em teste.
- UI: ver × agir separados (a matriz agora PODE dar "ver todos" sem "responder" — antes era
  impossível; com os seeds atuais nada muda até alguém configurar).
- Nota de performance: o badge do layout adiciona 1 lookup indexado de exceção por navegação
  (canAccess dotted etapa 1 é query direta) — desprezível no hot path (dezenas de queries/nav).
- Smoke em dev (read-only): **5/5** — "Todos os tickets" + botões p/ admin, menu Suporte de pé,
  2 ações na matriz. Gates: suíte **2334 passed** · tsc 0 · eslint base 24 · build 0.
- Não observado: corretor vendo só os próprios (sem credencial ativa; coberto por espelho + RLS
  existente que já filtra `reporter_id`).

## QA Results

### 2026-08-13 · Quinn (@qa) · Round 1 — **PASS · quality score 95**

3ª execução limpa do template. Destaque positivo: o rename `isAdmin`→`canRespond` no card
elimina uma mentira semântica antiga. Conferido que `broker/suporte` continua com ações
desligadas e que a RLS segue como rede por baixo (defense in depth até F4). Sem concerns.
