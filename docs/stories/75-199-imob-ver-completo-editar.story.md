# Story 75-199 — Perfil imob: "Ver completo"/"Editar Lead" caíam no dashboard

## Metadata
- **Status:** InReview
- **Epic:** 75 — CRM core (mundo IMOB)
- **Branch:** fix/75-199-imob-ver-completo-editar
- **Tipo:** Bug — reportado pelo Marcos (prints da Daiana, 2026-07-22): no drawer
  do lead em /dashboard/imob/leads, "Ver completo" e "Editar Lead" jogavam o
  usuário imob para /dashboard.

## Context
Cadeia do bug:
1. `lead-detail-drawer.tsx:231-238` — basePath dos botões era um ALLOWLIST
   (admin/supervisor/gerente-comercial → `/dashboard/leads`); qualquer outro
   perfil ficava no default `/broker/leads/<id>`.
2. `broker/layout.tsx:38` — `role !== "broker"` → `redirect("/dashboard")`.
   Perfil imob (e também gerente-relacionamento/obras) caía no dashboard.
3. Mesmo chegando à página, `/dashboard/leads/[id]` escondia a edição
   (`canEdit` só admin/supervisor/gerente-comercial). A API PATCH já permitia a
   Daiana (fallback "corretor responsável").

## Acceptance Criteria
- [x] AC1: drawer roteia por EXCEÇÃO — só `role === "broker"` usa `/broker/leads`;
  todo perfil de dashboard vai p/ `/dashboard/leads` (cobre imob, obras,
  gerente-relacionamento).
- [x] AC2: página `/dashboard/leads/[id]` — `canEdit` inclui `imob` QUANDO
  `lead.segmento === "imob"` (mundo isolado: imob não edita lead do principal).
- [x] AC3: API `PATCH /api/leads/[id]` espelha a regra (imob + lead imob), além
  do fallback de responsável já existente.
- [x] AC4: type-check/lint (arquivos tocados)/suíte verdes.

## File List
- `docs/stories/75-199-imob-ver-completo-editar.story.md` (this file)
- `packages/web/src/components/leads/lead-detail-drawer.tsx`
- `packages/web/src/app/dashboard/leads/[id]/page.tsx`
- `packages/web/src/app/api/leads/[id]/route.ts`

## Change Log
- @sm/@po 2026-07-22: fluxo mínimo (bug de roteamento/permissão de UI). GO.
- @dev (Dex) 2026-07-22: 3 pontos acima; canEdit movido p/ depois do fetch do
  lead (precisa do segmento).
- @qa (Quinn) 2026-07-22: PASS — suíte 1144/1144; type-check verde; eslint dos
  3 arquivos 0 erros; imob segue SEM editar lead do funil principal (UI+API);
  broker inalterado; obras/gerente-relacionamento ganham a página read-only em
  vez do redirect (comportamento que a página já previa p/ perfis fora da lista).
