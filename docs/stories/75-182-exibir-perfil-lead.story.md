# Story 75-182 — Exibir "Perfil (marketing)" na visualização do lead

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core (leads)
- **Branch:** feat/75-182-exibir-perfil-lead
- **Tipo:** Follow-up da 75-181 (1/3 do lote aprovado pelo Marcos)

## Context
Os 8 campos de perfil (75-181) só apareciam ao EDITAR o lead. Follow-up: exibi-los na
visualização — página do lead no dashboard (lista de InfoRows) e painel "Detalhes"
(slide-over) do corretor.

## Acceptance Criteria
- [x] AC1: Helper único `formatLeadPerfil(lead)` em `lib/leads/enrich.ts` — retorna só campos
  preenchidos, com labels resolvidos (REUSE nas 2 telas; campo vazio não vira linha "—").
- [x] AC2: Página do lead (dashboard) mostra as linhas do perfil entre os campos 75-112 e Observação.
- [x] AC3: Painel Detalhes do corretor (card "Dados do Lead") idem, no padrão dt/dd existente.
- [x] AC4: type-check/lint/suíte verdes.

## File List
- `docs/stories/75-182-exibir-perfil-lead.story.md` (this file)
- `packages/web/src/lib/leads/enrich.ts` (formatLeadPerfil + LeadPerfilDisplay)
- `packages/web/src/app/dashboard/leads/[id]/page.tsx`
- `packages/web/src/app/broker/leads/[id]/_components/lead-details-panel.tsx`

## Change Log
- @sm/@po: fluxo mínimo — follow-up direto aprovado ("vamos fazer os 3").
- @dev (Dex): formatLeadPerfil (só preenchidos, labels legíveis); páginas dashboard+corretor mapeiam.
- @qa (Quinn): PASS — 1080/1080, tsc verde, lint limpo.
- @devops (Gage): PR #TBD squash-merge, deploy prod automático.
