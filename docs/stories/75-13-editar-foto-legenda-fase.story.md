# Story 75-13 — Editar foto da obra (legenda + fase), livre para o perfil obras

## Metadata
- **Status:** Done
- **Epic:** 58 — Portal/Obras
- **Branch:** main

## Context
Na grade de fotos da obra (admin, `obra-detail-tabs.tsx`) não havia como editar uma foto já enviada — só excluir. É preciso poder corrigir a **legenda** e a **fase** da foto. Essa edição é **livre** para admin/supervisor e **também para o perfil obras** (sem aprovação do supervisor).

(Parte do lote pedido junto com: 75-14 exclusão com aprovação pelo obras, e 75-15 purga de reprovados em 7 dias — implementadas separadamente.)

## Acceptance Criteria
- [x] AC1: Novo `PATCH /api/admin/obras/[obra_id]/fotos/[foto_id]` aceita `caption` (string|null) e `fase_id` (uuid|null, validado pertencer à obra). Roles: admin/supervisor/obras. Sem aprovação.
- [x] AC2: Na grade de fotos, botão de editar (lápis) em cada foto — para todos os perfis — abre modal com legenda + select de fase; salva via PATCH e dá refresh.
- [x] AC3: Sem regressão no upload, exclusão (admin/supervisor) ou lightbox.

## Out of Scope
- Exclusão pelo obras com aprovação (Story 75-14).
- Purga de reprovados (Story 75-15).

## Dependencies
- `obra_fotos.caption` / `fase_id` (já existem).

## Complexity
- **T-shirt:** S (1 PATCH + modal + botão).

## Business Value
Corrigir legenda/fase de fotos sem precisar reenviar; autonomia para o time de obras.

## Risks
- Baixo. Edição de campos não destrutiva; fase validada contra a obra.

## File List
- `docs/stories/75-13-editar-foto-legenda-fase.story.md` (this file)
- `packages/web/src/app/api/admin/obras/[obra_id]/fotos/[foto_id]/route.ts` (PATCH)
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/foto-edit-modal.tsx` (new)
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/obra-detail-tabs.tsx` (botão + modal)

## Dev Notes (@dev / Dex)
- PATCH valida fase pertencente à obra; caption trim/null; logAudit `foto.update`.
- `FotoEditModal` (caption + select de fase) reusa o padrão dos modais existentes; botão lápis no overlay (stopPropagation p/ não abrir lightbox), visível a todos os perfis.
- type-check 0 erros; eslint EXIT 0.

## QA Results (@qa / Quinn)
**Veredito: PASS** — AC1–AC3. PATCH com validação de fase + roles; UI de edição livre p/ obras; sem regressão. type-check/eslint OK. Pronta para @devops *push (sem migration).

## Change Log
- @sm (River): story criada.
- @po (Pax): GO.
- @dev (Dex): PATCH + modal + botão. Status → InReview.
- @qa (Quinn): PASS. Pronta para push.
- @devops (Gage): push em produção (commit 3b9e03e). Status → Done.