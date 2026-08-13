# Story 75-309 — Perfis de Acesso 2.0 · F3-8: Clientes & Portal Viewer via capabilities

**Story ID:** 75-309
**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** S (~3 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint, next build, smoke em dev]
- **Tipo:** migração de gate (F3-8, complemento da 75-308)

## Story

Como **admin**, quero **Clientes do portal e o Portal Viewer decididos pela matriz** —
`clientes.gerenciar/apagar/resetar_senha` [A,S,OBR,GR], `clientes.sienge_vincular` [A,S],
`portal.ver_como_cliente` e `portal.financeiro_ver` [A,S] — matando as 6 cópias restantes de
`ALLOWED_ROLES` (clientes) + `VIEWER_ROLES` + o gate do menu que o próprio código pedia p/
migrar ("gate hardcoded, migrar p/ matriz" — comentário da 78-1, atendido).

**Zero mudança de comportamento** — espelho estrito ×6, congelado em teste. Sem migration
(nenhuma capability nova). Primeiros GRUPOS VIRTUAIS com 2+ ações na matriz (Clientes/Portal).

## Acceptance Criteria

- [x] **AC1** — Zero `ALLOWED_ROLES`/`VIEWER_ROLES` em `api/admin/clientes` + `lib/portal`;
      14 gates de rota + `requireViewerAccess` (8 páginas herdaram) + menu do layout via can().
- [x] **AC2** — Espelho estrito ×6 congelado.
- [x] **AC3** — 6 caps enforced (47 no total); grupos virtuais Clientes/Portal na matriz.
- [x] **AC4** — Gates verdes + smoke 10/10.
- [x] **AC5** — Limites: viewer segue READ-ONLY por construção (admin client; nada de
      escrita); RLS de clientes (god-gate) — F4; portal do CLIENTE final intocado.

## Change Log

- 2026-08-13 · @sm (River) · Draft. · @po (Pax) · **GO (9/10)** — exigido: mapear [id] GET/
  PATCH/DELETE por ocorrência (DELETE = apagar, não gerenciar). → Ready.

## File List

9 rotas (`api/admin/clientes/**` + `api/dashboard/portal-cliente/**`) ·
`lib/portal/viewer.ts` (canUsePortalViewer async via can; VIEWER_ROLES morta) ·
`dashboard/layout.tsx` (menu Portal Cliente) · `lib/capabilities.ts` (+6 enforced) ·
`capabilities.test.ts` (+1 espelho).

## Dev Agent Record

**Fable 5 · @dev (Dex) · YOLO · 13/08/2026** · Branch `feat/75-309-clientes-portal-capability`.

- Diff seed×gate ×6: idênticos. Substituição por ocorrência com assert de contagem
  (o [id]/route tem 3 gates com 2 caps distintas: GET/PATCH=gerenciar, DELETE=apagar).
- As 8 páginas do portal-viewer herdam de `requireViewerAccess` — 1 ponto de troca.
- Smoke 10/10 (API clientes 200; portal-cliente sem redirect; menu visível; 6 ações +
  2 grupos virtuais na matriz). Gates: suíte **2342 passed** · tsc 0 · eslint base 24 · build 0.

## QA Results

### 2026-08-13 · Quinn (@qa) · Round 1 — **PASS · quality score 96**

Fechamento limpo do domínio Obras/Clientes. O comentário-dívida da 78-1 ("migrar p/ matriz")
saiu do código junto com a migração — bom sinal de que o épico está pagando as promessas
antigas. Sem concerns.
