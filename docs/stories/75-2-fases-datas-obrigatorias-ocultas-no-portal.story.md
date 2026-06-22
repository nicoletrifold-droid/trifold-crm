# Story 75-2 — Datas de fase obrigatórias (uso interno) e ocultas no portal do cliente

## Metadata
- **Status:** InReview
- **Epic:** 58 — Portal do Cliente
- **Branch:** main

## Context
Hoje as datas de início/término de uma fase (`obra_fases.start_date` / `end_date`) são **opcionais** no cadastro (admin) e são **exibidas ao cliente** no portal (home + página "Fases da Obra").

Decisão de produto: as datas passam a ser uma ferramenta **interna** de organização (definir fase atual, ordenar cronograma, montar "Próximos marcos"). Portanto:
1. **Tornam-se obrigatórias** no cadastro e na edição de fase (admin).
2. **Deixam de ser exibidas ao cliente** no portal — a data existe no banco e segue organizando o sistema, mas não aparece pro cliente.

Escopo de exibição: vale para **todos os clientes** (decisão geral, não condicional por obra). A **"Entrega prevista" da obra** (`obras.expected_delivery_date`) é outro conceito (entrega final) e **continua visível**. O painel **admin** (`/dashboard/obras/...`) continua mostrando as datas das fases (uso interno).

Onde as datas de fase aparecem hoje no portal (a remover):
- `cliente/[obra_id]/page.tsx` (home): linha "Prev. conclusão: {data}" no card "Fase Atual"; linha "Prev. {data}" no card "Etapa Atual"; data por item no bloco "Próximos marcos".
- `cliente/[obra_id]/fases/page.tsx`: bloco "Início / Conclusão|Previsão" de cada fase.

Confirmação técnica: o único caller do PATCH `/api/admin/obras/[obra_id]/fases/[fase_id]` é o `fase-edit-modal.tsx` — logo, exigir datas no PATCH não quebra updates parciais em outro lugar.

## Acceptance Criteria

### Admin — datas obrigatórias
- [x] AC1: No formulário "Adicionar Fase" (`fase-create-form.tsx`), os campos "Data de início" e "Data de término" passam a ser obrigatórios: label com `*`, input `required`, e o botão "Adicionar Fase" fica desabilitado enquanto qualquer uma estiver vazia.
- [x] AC2: No modal "Editar Fase" (`fase-edit-modal.tsx`), os campos de data ficam obrigatórios da mesma forma (label `*`, `required`, botão "Salvar" desabilitado sem ambas as datas).
- [x] AC3: A API POST `/api/admin/obras/[obra_id]/fases` rejeita (400) quando `start_date` ou `end_date` estiver ausente/vazio, com mensagem clara.
- [x] AC4: A API PATCH `/api/admin/obras/[obra_id]/fases/[fase_id]` rejeita (400) se `start_date` ou `end_date` vier presente no body com valor vazio/null (não permite "apagar" a data). Updates que não tocam nas datas seguem funcionando.

### Portal — datas de fase ocultas (todos os clientes)
- [x] AC5: Na home (`cliente/[obra_id]/page.tsx`), o card "Fase Atual" NÃO exibe mais a linha "Prev. conclusão: {data}" — exibe o label de status da fase no lugar (sem data).
- [x] AC6: Na home, o card "Etapa Atual" NÃO exibe mais a linha "Prev. {data}" (mantém nome/descrição da etapa).
- [x] AC7: Na home, o bloco "Próximos marcos" mantém a lista de marcos (rótulos "Início — X" / "Conclusão — Y") ordenada cronologicamente (ordenação interna por data preservada), porém SEM exibir a linha da data.
- [x] AC8: Na página "Fases da Obra" (`cliente/[obra_id]/fases/page.tsx`), o bloco de datas "Início / Conclusão|Previsão" de cada fase é removido. Restante (etapa, status, barra de progresso) inalterado.
- [x] AC9: A "Entrega prevista" da obra continua visível na home (hero + card "Entrega Prevista"). Nenhuma data de fase permanece visível no portal.

### Geral
- [x] AC10: Painel admin (`/dashboard/obras/[obra_id]`) continua exibindo as datas das fases (sem alteração). Lógica de "fase atual"/ordenação que usa datas internamente permanece funcionando.

## Out of Scope
- Migration/backfill de datas em fases já existentes com `start_date`/`end_date` nulos (não exibimos datas no portal, então não há impacto visual; novas/edições passam a exigir).
- Esconder o **%** de progresso na página "Fases da Obra" (segue como está; o hide de % da story 75-1 foi só na home e só Yarden).
- Mudança no conceito/visual de "Entrega prevista" da obra.
- Campos `expected_start_date`/`expected_end_date` (não usados na UI em escopo).

## Dependencies
- Nenhuma migration. Colunas já existem.

## Complexity
- **T-shirt:** S/M (6 arquivos: 2 forms admin, 2 rotas de API, 2 páginas do portal; mudanças pequenas e localizadas em cada).

## Business Value
Padroniza o cadastro (datas sempre presentes → cronograma confiável internamente) e simplifica a leitura do cliente, que passa a acompanhar status/progresso e a entrega final sem ruído de datas intermediárias de fase.

## Risks
- Baixo/Médio. Tornar data obrigatória pode atritar o cadastro rápido — mitigado por ser decisão explícita do negócio. Garantir que a remoção dos blocos de data não quebre o layout dos cards/listas.

## Definition of Done
- ACs atendidos, type-check/lint OK no escopo, QA gate PASS, deploy via @devops.

## File List
- `docs/stories/75-2-fases-datas-obrigatorias-ocultas-no-portal.story.md` (this file)
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/fase-create-form.tsx` (to update)
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/fase-edit-modal.tsx` (to update)
- `packages/web/src/app/api/admin/obras/[obra_id]/fases/route.ts` (to update)
- `packages/web/src/app/api/admin/obras/[obra_id]/fases/[fase_id]/route.ts` (to update)
- `packages/web/src/app/cliente/[obra_id]/page.tsx` (to update)
- `packages/web/src/app/cliente/[obra_id]/fases/page.tsx` (to update)

## Dev Notes (@dev / Dex)
**Admin (datas obrigatórias):**
- `fase-create-form.tsx`: labels "Data de início/término" com `*`, inputs `required`, guard `if (!name.trim() || !startDate || !endDate) return`, botão desabilitado se faltar qualquer data.
- `fase-edit-modal.tsx`: idem (labels `*`, `required`, guard, botão Salvar desabilitado sem ambas as datas).
- `fases/route.ts` (POST): valida `start_date`/`end_date` (trim), retorna 400 "Data de início e término são obrigatórias"; insere os valores validados (não mais `?? null`).
- `fases/[fase_id]/route.ts` (PATCH): se `start_date`/`end_date` vierem no body, rejeita valor vazio com 400; mantém update parcial (chaves ausentes não são tocadas).

**Portal (datas de fase ocultas, todos os clientes):**
- `cliente/[obra_id]/page.tsx`: card "Fase Atual" → mostra só o label de status (removida linha "Prev. conclusão"); card "Etapa Atual" → removida linha "Prev. {data}", mantém nome da fase; "Próximos marcos" → removida a linha de data, lista mantida e ordenada por data internamente. Hero/card "Entrega Prevista" da obra **mantidos**.
- `cliente/[obra_id]/fases/page.tsx`: removido o bloco "Início/Conclusão|Previsão"; `formatDate()` (agora sem uso) removido. `start_date`/`end_date` seguem usados internamente no `buildFaseGroups` (ordenação).

type-check: 0 erros nos 6 arquivos (remanescentes pré-existentes em `email-templates/visual-editor.tsx`, fora de escopo). eslint EXIT 0.

## QA Results (@qa / Quinn)
**Veredito: PASS** — AC1–AC10 atendidos. Admin: forms com `*`/`required`/botão desabilitado + API POST 400 sem datas e PATCH que rejeita esvaziar (mantendo update parcial). Portal: removidas as 3 exibições de data de fase na home (Fase Atual → status; Etapa Atual → nome; Próximos marcos → sem data, lista/ordenação por data preservadas) e o bloco de datas na página Fases (`formatDate` removido por ficar sem uso). "Entrega prevista" da obra mantida (hero + card). Sem regressão: `formatShortDate` segue em uso, `marco.date` na ordenação interna, painel admin inalterado. `type-check` 0 erros no escopo; `eslint` EXIT 0. Pronta para @devops *push.

## Change Log
- @sm (River): story criada em Draft.
- @po (Pax): validação 10/10 → GO. Status Draft → Ready.
- @dev (Dex): implementados os 6 arquivos (admin obrigatório + portal oculta datas). Status Ready → InReview.
- @qa (Quinn): QA gate PASS. Pronta para @devops *push.
