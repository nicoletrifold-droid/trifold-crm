# Story 75-11 — "Registrar Ligação": salvar o imóvel selecionado no lead (persistente)

## Metadata
- **Status:** InReview
- **Epic:** 51/63 — Corretor / Atendimento
- **Branch:** main

## Context
No modal "Registrar Ligação" do corretor (`broker/_components/quick-history-modal.tsx`), o campo "Empreendimento / Imóvel (opcional)" hoje só vai para o `metadata` da nota do contato — **não atualiza o lead**. Resultado: num segundo contato o corretor precisa selecionar de novo.

O lead já tem `leads.property_interest_id` (FK → properties) e o PATCH `/api/leads/[id]` já aceita esse campo. Basta: ao salvar o registro, gravar o imóvel no lead; e ao abrir o modal, pré-selecionar com o imóvel já vinculado.

## Acceptance Criteria
- [x] AC1: Ao salvar "Registrar Ligação" com um Empreendimento/Imóvel selecionado, o `property_interest_id` do lead é atualizado (PATCH `/api/leads/[id]`), além de continuar no metadata da nota.
- [x] AC2: O select de Empreendimento/Imóvel abre **pré-selecionado** com o imóvel atual do lead (`currentPropertyId`), quando houver — num 2º contato já vem preenchido.
- [x] AC3: Só dispara o update quando o imóvel selecionado **difere** do atual (evita PATCH desnecessário). Selecionar vazio não apaga o imóvel já salvo (mantém o atual). 
- [x] AC4: Sem regressão no restante do modal (stage/calor/tarefa/agendamento/nota) nem em outros usos do componente.

## Out of Scope
- Permitir "desvincular" o imóvel pelo modal (não apaga; só define/atualiza).
- Mudar a tela de detalhes do lead ou o cadastro de imóvel.

## Dependencies
- `leads.property_interest_id` e PATCH `/api/leads/[id]` (já aceitam o campo).

## Complexity
- **T-shirt:** XS/S (1 prop nova + init do select + 1 linha no PATCH + passar a prop no(s) caller(s)).

## Business Value
O imóvel de interesse fica registrado no lead a partir de qualquer atendimento — segundo contato já vem com o imóvel certo, menos retrabalho e melhor contexto.

## Risks
- Baixo. Não apaga imóvel ao deixar vazio; PATCH só quando muda.

## Definition of Done
- ACs atendidos, type-check/lint OK, QA gate PASS, deploy via @devops.

## File List
- `docs/stories/75-11-registrar-ligacao-salva-imovel-no-lead.story.md` (this file)
- `packages/web/src/app/broker/_components/quick-history-modal.tsx`
- caller(s) do QuickHistoryModal (passar `currentPropertyId`)

## Dev Notes (@dev / Dex)
- `quick-history-modal.tsx`: prop nova `currentPropertyId`; `propertyId` inicia com ela (select pré-selecionado); no PATCH `/api/leads/[id]` adiciona `property_interest_id` quando `propertyId` muda em relação ao atual (vazio não apaga). Metadata da nota inalterado.
- `lead-detail-drawer.tsx`: passa `currentPropertyId={lead.property_interest?.id ?? null}` ao modal.
- type-check 0 erros; eslint 0 erros (2 warnings pré-existentes no drawer, fora de escopo).

## QA Results (@qa / Quinn)
**Veredito: PASS** — AC1–AC4. Imóvel selecionado persiste no lead via PATCH (campo já aceito); select abre pré-preenchido; só atualiza quando muda; vazio preserva o atual. Sem migration, sem regressão. type-check/eslint OK. Pronta para @devops *push.

## Change Log
- @sm (River): story criada em Draft.
- @po (Pax): validação → GO. Status Draft → Ready.
- @dev (Dex): persiste imóvel no lead + pré-seleção. Status Ready → InReview.
- @qa (Quinn): QA gate PASS. Pronta para @devops *push.
