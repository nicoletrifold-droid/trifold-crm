# Story 75-184 — Analytics: seção "Perfil dos Leads" (insights p/ marketing)

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core (analytics)
- **Branch:** feat/75-184-analytics-perfil
- **Tipo:** Follow-up da 75-181 (3/3 do lote aprovado pelo Marcos)

## Context
Com os campos de perfil capturados (75-181), exibidos (75-182) e auto-preenchidos pela Nicole
(75-183), falta o marketing ENXERGAR os agregados. Nova seção "Perfil dos Leads" no
`/dashboard/analytics`, respeitando o período global e o filtro de empreendimento.

Decisões:
- **Base ENTRADAS** (todos os criados na janela, inclusive perdidos) — perfil demográfico
  independe do desfecho; consistente com a métrica unificada (75-179).
- Faixas (renda/idade/filhos) em **ordem natural** (leitura de distribuição); profissão por
  contagem (top 8, agrupada case-insensitive).
- Header mostra "X de Y leads com perfil" (transparência de preenchimento).

## Acceptance Criteria
- [x] AC1: helper puro `lib/analytics/perfil.ts::aggregatePerfil(rows)` (labels via enrich.ts;
  faixas em ordem natural; profissão top 8 case-insensitive; comPerfil/total) + 6 testes.
- [x] AC2: seção "Perfil dos Leads" na página com 6 cards (Profissão, Renda, Faixa etária,
  Filhos, Estado civil, Moradia & Pet), padrão visual dos blocos existentes; card vazio =
  "Sem dados"; seção sem nenhum perfil = empty-state explicativo.
- [x] AC3: respeita período global (sinceISO/untilISO) e filtro de empreendimento.
- [x] AC4: type-check/lint/suíte verdes.

## Out of Scope
- Cidade/Bairro no agregado (texto livre disperso — precisa normalização; follow-up).
- Perfil no PDF do relatório (dá pra adicionar depois se o marketing pedir).
- Cruzamentos (renda × empreendimento) — v2 se houver demanda.

## File List
- `docs/stories/75-184-analytics-perfil.story.md` (this file)
- `packages/web/src/lib/analytics/perfil.ts` (novo — agregação pura)
- `packages/web/src/lib/analytics/perfil.test.ts` (novo)
- `packages/web/src/app/dashboard/analytics/page.tsx` (query + seção)

## Change Log
- @sm/@po: fluxo — follow-up direto aprovado ("vamos fazer os 3").
- @dev (Dex): aggregatePerfil (ordem natural p/ faixas, top 8 profissões case-insensitive,
  comPerfil/total) + query base entradas (limit 5000, filtro empreendimento) + 6 cards.
- @qa (Quinn): PASS — suíte completa verde (6 testes novos), tsc verde, lint limpo.
- @devops (Gage): PR squash-merge, deploy prod automático.
