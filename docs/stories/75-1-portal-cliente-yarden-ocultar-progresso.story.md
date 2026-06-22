# Story 75-1 — Portal do cliente: ocultar % de progresso para a obra Yarden

## Metadata
- **Status:** Done
- **Epic:** 58 — Portal do Cliente
- **Branch:** main

## Context
A home do portal do cliente (`/cliente/[obra_id]`, arquivo `packages/web/src/app/cliente/[obra_id]/page.tsx`) mostra hoje, para qualquer obra:
- No hero "SUA OBRA": uma barra de progresso animada + o texto "Progresso geral: X%".
- Um card de stats "PROGRESSO" com o valor percentual (ex.: "4%") e um sub-texto de prazo ("↑ No prazo").

Para a obra **Yarden** especificamente, o cliente NÃO deve ver o percentual executado da obra. A solicitação é cosmética e restrita a essa obra: as demais obras continuam exibindo o % normalmente.

A identificação da obra Yarden será feita por **match de nome** (`obra.name === "Yarden"`), decisão consciente do solicitante (trade-off aceito: se a obra for renomeada, o % volta a aparecer). Não haverá migration nem flag no banco nesta story.

## Acceptance Criteria
- [x] AC1: No hero "SUA OBRA", quando `obra.name === "Yarden"`, a barra de progresso (`AnimatedProgressBar`) e o texto "Progresso geral: X%" NÃO são renderizados.
- [x] AC2: Com o % oculto, o hero mantém "Entrega prevista: {data}" visível (alinhado à direita, como hoje).
- [x] AC3: O card de stats "PROGRESSO" passa a ter o rótulo "Cronograma" e exibe apenas o status de prazo ("No prazo" quando `status === em_andamento`, senão o label de status), sem o valor percentual.
- [x] AC4: Para qualquer outra obra (`obra.name !== "Yarden"`), o comportamento permanece IDÊNTICO ao atual: barra + "Progresso geral: X%" no hero e card "Progresso" com o valor percentual.
- [x] AC5: Sem alteração de backend/query, sem migration; mudança restrita a `cliente/[obra_id]/page.tsx`.

## Out of Scope
- Página "Fases da Obra" e o progresso por fase (continua exibindo % por fase normalmente).
- Esconder o % para outras obras.
- Flag no banco / coluna em `obras` / tela de admin para ligar-desligar por obra (poderá ser uma evolução futura).
- Qualquer mudança no cálculo de `progress_pct`.

## Dependencies
- Nenhuma. `obra.name` e `obra.progress_pct` já são carregados na query atual da página.

## Complexity
- **T-shirt:** XS (uma flag derivada `hideProgress = obra.name === "Yarden"` e dois trechos condicionais no JSX da home).

## Business Value
Atende solicitação direta do negócio para a obra Yarden: o cliente acompanha prazo e fases sem ver o percentual de execução, evitando leitura equivocada de "obra atrasada/adiantada" pelo número cru.

## Risks
- Baixo. Risco principal é o acoplamento ao nome "Yarden" (documentado em Context). Garantir que o layout do hero não quebre quando só "Entrega prevista" é exibido.

## Definition of Done
- ACs atendidos, type-check/lint OK no escopo, QA gate PASS, deploy via @devops.

## File List
- `docs/stories/75-1-portal-cliente-yarden-ocultar-progresso.story.md` (this file)
- `packages/web/src/app/cliente/[obra_id]/page.tsx` (to be updated by @dev)

## Dev Notes (@dev / Dex)
- Flag derivada `hideProgress = obra.name === "Yarden"` logo após `statusLabel`.
- Hero: `AnimatedProgressBar` e o span "Progresso geral: X%" envoltos em `!hideProgress`. Container do rodapé do hero alterna `justify-end` (só Entrega prevista) / `justify-between` (ambos).
- Card de stats: ramo condicional — `hideProgress` renderiza `<StatCard label="Cronograma" value="No prazo"/>` (sem %), senão mantém o card "Progresso" original intacto.
- `StatCard` ganhou prop opcional `valueVariant?: "default" | "success"` para colorir o "No prazo" de verde (`text-green-400`), preservando o sinal positivo de prazo; sem mudança nos demais usos (default = branco).
- type-check: 0 erros no arquivo (remanescentes pré-existentes em `email-templates/visual-editor.tsx`, fora de escopo). eslint EXIT 0.

## QA Results (@qa / Quinn)
**Veredito: PASS** — AC1–AC5 atendidos. O ramo não-Yarden do hero e do card é byte-idêntico ao original (sem regressão para outras obras); `valueVariant` default mantém os demais StatCards em branco. `pnpm type-check` 0 erros no arquivo (remanescentes pré-existentes em `email-templates/visual-editor.tsx`, fora de escopo); `eslint` EXIT 0. Sem backend/migration. Pronta para @devops *push.

## Change Log
- @sm (River): story criada em Draft.
- @po (Pax): validação 10/10 → GO. Status Draft → Ready.
- @dev (Dex): implementado em `cliente/[obra_id]/page.tsx` (hero + card Cronograma + prop `valueVariant` no StatCard). Status Ready → InReview.
- @qa (Quinn): QA gate PASS. Pronta para @devops *push.
- @devops (Gage): rebase em origin/main + push (commit 30b0767). Inclui também o ajuste de contraste das datas (fluxo leve, sem story). Status InReview → Done.
