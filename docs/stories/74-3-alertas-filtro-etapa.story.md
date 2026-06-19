# Story 74-3 — Filtro por Etapa na tela de Alertas

## Metadata
- **Status:** InReview
- **Epic:** 57 — Melhorias Operacionais CRM
- **Branch:** main

## Context
A tela de Alertas (`/dashboard/alertas`) já permite filtrar por Corretor, Empreendimento, Origem e Dias mínimos, e a tabela já exibe a coluna "Etapa" de cada lead. Falta um filtro que permita escolher **em qual etapa** estão os alertas — útil para focar, por exemplo, só nos leads em "1º Contato".

O dado já está disponível no client: cada `AlertItem` carrega `stageName`. Portanto o filtro é puramente client-side, espelhando o filtro de "Empreendimento" já existente.

## Acceptance Criteria
- [x] AC1: Novo filtro "Etapa" (select) na barra de filtros da tela de Alertas, com opção padrão "Todas".
- [x] AC2: As opções do select são as etapas distintas presentes nos alertas atuais (`stageName`), ordenadas alfabeticamente, excluindo o placeholder "-".
- [x] AC3: Selecionar uma etapa filtra a tabela para mostrar só os alertas daquela etapa; combina com os demais filtros (Corretor/Empreendimento/Origem/Dias) de forma aditiva.
- [x] AC4: O filtro de Etapa entra na lógica de `hasActiveFilters` e é zerado pelo botão "Limpar filtros".
- [x] AC5: O contador "X de Y" reflete o resultado já filtrado por etapa.
- [x] AC6: Sem alteração de backend/query; reaproveita `AlertItem.stageName` já carregado.

## Out of Scope
- Filtro por etapa via query no servidor (mantém-se client-side).
- Mudar a coluna "Etapa" da tabela ou a ordenação.
- Multi-seleção de etapas (select simples, uma etapa por vez).

## Dependencies
- `AlertItem.stageName` já populado em `page.tsx` (sem mudança necessária).

## Complexity
- **T-shirt:** XS (um select + um campo no state de filtros, espelhando o de Empreendimento).

## Business Value
Permite à gestão focar os alertas por estágio do funil, agilizando a priorização de quem precisa de atenção.

## Risks
- Baixo. Garantir que o select só apareça/filtre corretamente quando há etapas válidas.

## Definition of Done
- ACs atendidos, type-check/lint OK no escopo, QA gate PASS, deploy via @devops.

## File List
- `docs/stories/74-3-alertas-filtro-etapa.story.md` (this file)
- `packages/web/src/app/dashboard/alertas/_components/alertas-table.tsx` (updated)

## Dev Notes (@dev / Dex)
- Espelhou o filtro "Empreendimento": `stage` em `EMPTY_FILTERS`, `stageOptions` (distintas, sem "-", ordenadas), filtro aditivo em `filtered`, inclusão em `hasActiveFilters`. Select posicionado entre Corretor e Empreendimento, condicionado a `stageOptions.length > 0`.

## QA Results (@qa / Quinn)
**Veredito: PASS** — AC1–AC6 atendidos. `pnpm type-check` 0 erros no arquivo (remanescentes pré-existentes em `email-templates/visual-editor.tsx`); `eslint` EXIT 0. Sem backend; sem regressão em sort/contador/demais filtros.

## Change Log
- @sm (River): story criada em Draft.
- @po (Pax): validação 10/10 → GO. Status Draft → Ready.
- @dev (Dex): filtro de Etapa implementado em alertas-table. Status Ready → InReview.
- @qa (Quinn): QA gate PASS. Pronta para @devops *push.
