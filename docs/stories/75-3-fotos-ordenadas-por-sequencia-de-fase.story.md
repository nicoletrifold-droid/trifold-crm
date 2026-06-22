# Story 75-3 — Fotos ordenadas pela sequência das fases (portal + admin)

## Metadata
- **Status:** Done
- **Epic:** 58 — Portal do Cliente
- **Branch:** main

## Context
A galeria de fotos da obra deve apresentar as fotos **na mesma sequência das fases** (ordenadas por `obra_fases.order_index`), tanto no portal do cliente quanto no painel admin.

Estado atual (verificado em produção para a obra `74bd0414-…`, 73 fotos):
- **Modelo de dados:** `obra_fotos` já possui `fase_id` (FK → `obra_fases`) e `caption`. O formulário de upload (admin) já tem o select "Vincular a uma fase (opcional)". **68 das 73 fotos já têm `fase_id`**; apenas 5 estão sem fase.
- **Portal** (`cliente/[obra_id]/fotos/page.tsx`): já **agrupa** fotos por fase e tem filtro por fase, porém ordena os grupos pela **recência da foto**, não pela sequência (`order_index`) das fases.
- **Admin** (`obra-detail-tabs.tsx`, aba Fotos): exibe grade **plana** ordenada por `created_at desc`, sem agrupar por fase.

Como a maioria das fotos já está vinculada à fase, "reorganizar as existentes" é essencialmente uma mudança de **ordenação/agrupamento no código** — sem migração de dados.

Decisões do solicitante:
- Vale para **todas as obras** (não é condicional por obra; a obra `74bd0414-…` foi apenas a amostra usada para verificar o dado real).
- Aplicar em **portal + admin**.
- As fotos **sem fase** vão para um grupo **"Sem fase" ao final** (sem tentativa de adivinhar a fase pela caption).

## Acceptance Criteria
- [x] AC1: Novo helper compartilhado (`packages/web/src/lib/obra-fotos-grouping.ts`) que recebe fotos (`{ fase_id }`) + fases (`{ id, name, order_index }`) e retorna grupos `{ faseId, faseName, fotos[] }` ordenados pelo `order_index` da fase; o grupo de fotos sem fase (`fase_id` null) — rótulo "Sem fase" — vem sempre por último. A ordem das fotos dentro de cada grupo preserva a ordem recebida (query atual: `created_at desc`).
- [x] AC2: Portal (`cliente/[obra_id]/fotos/page.tsx`) usa o helper: os grupos passam a aparecer na sequência das fases (`order_index`), com "Sem fase" no fim. Filtro por fase, contadores e cabeçalhos de grupo continuam funcionando.
- [x] AC3: Admin (aba Fotos de `obra-detail-tabs.tsx`) passa a exibir as fotos publicadas **agrupadas por fase**, com um cabeçalho por fase, na sequência das fases (`order_index`), "Sem fase" no fim. Botão de exclusão (admin/supervisor) e abertura do lightbox seguem funcionando em cada foto.
- [x] AC4: O bloco de fotos pendentes/rejeitadas do papel "obras" (`pendenteFotos`) continua sendo exibido (ao final), sem regressão.
- [x] AC5: Nenhuma mudança de schema/migração; nenhuma alteração no fluxo de upload. Fotos já vinculadas se reorganizam automaticamente; as 5 sem fase aparecem em "Sem fase".

## Out of Scope
- Atribuir `fase_id` às 5 fotos sem fase (decidido: ficam em "Sem fase").
- UI para reordenar fotos manualmente dentro de uma fase (drag & drop).
- Editar a fase de uma foto já enviada (não há UI hoje; fora de escopo).
- Mudar a granularidade do agrupamento (continua por `fase_id`, que é a etapa).

## Dependencies
- Nenhuma. `fase_id` e `order_index` já disponíveis nas queries.

## Complexity
- **T-shirt:** S (1 helper novo + 2 telas consumindo; sem backend).

## Business Value
O cliente acompanha a evolução da obra na ordem real das fases; o admin gerencia as fotos na mesma lógica. Aproveita o vínculo de fase que já existe na base.

## Risks
- Baixo. Garantir que fases deletadas (foto com `fase_id` órfão → na prática vira null por `ON DELETE SET NULL`) ou `order_index` ausente caiam de forma segura no fim.

## Definition of Done
- ACs atendidos, type-check/lint OK no escopo, QA gate PASS, deploy via @devops.

## File List
- `docs/stories/75-3-fotos-ordenadas-por-sequencia-de-fase.story.md` (this file)
- `packages/web/src/lib/obra-fotos-grouping.ts` (new)
- `packages/web/src/app/cliente/[obra_id]/fotos/page.tsx` (to update)
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/obra-detail-tabs.tsx` (to update)

## Dev Notes (@dev / Dex)
- Novo `lib/obra-fotos-grouping.ts`: `groupFotosByFaseOrder(fotos, fases)` agrupa por `fase_id`, ordena por `order_index` da fase; `fase_id` null/órfã → rank Infinity (sempre por último, rótulo "Sem fase"). Ordem interna preserva a recebida (`created_at desc`).
- Portal `fotos/page.tsx`: substituída a montagem inline de grupos pelo helper; `latestDate` por grupo recalculado num `.map`. Filtro por fase, pills e cabeçalhos mantidos.
- Admin `obra-detail-tabs.tsx`: `fotoGroups = groupFotosByFaseOrder(fotos, fases)`; a aba Fotos passou de grade plana para seções por fase (cabeçalho com nome + contador) na sequência das fases; pendentes ("obras") agora num bloco "Aguardando aprovação" ao final. Delete (admin/supervisor) e lightbox preservados por foto.
- type-check 0 erros no escopo; eslint EXIT 0. Validação extra contra produção (obra 74bd0414…): grupos saem na ordem Canteiro→Serviços Preliminares→Infraestrutura→Superestrutura→Alvenarias→Revestimentos, "Sem fase" (5) no fim.

## QA Results (@qa / Quinn)
**Veredito: PASS** — AC1–AC5 atendidos. Helper ordena por `order_index` com "Sem fase" garantidamente no fim; portal e admin consomem o mesmo helper (consistência). Sem schema/migração — as 68 fotos já vinculadas se reordenam sozinhas. Validação em dados reais de produção confirmou a ordem dos grupos e o "Sem fase" ao final. type-check 0 erros no escopo; eslint EXIT 0. Sem regressão em filtro/contador/lightbox/delete/pendentes. Pronta para @devops *push.

## Change Log
- @sm (River): story criada em Draft.
- @po (Pax): validação 10/10 → GO. Status Draft → Ready.
- @dev (Dex): helper + portal + admin implementados. Status Ready → InReview.
- @qa (Quinn): QA gate PASS (inclui validação em dados de produção). Pronta para @devops *push.
- @devops (Gage): push em produção (commit cb16784). Status → Done.