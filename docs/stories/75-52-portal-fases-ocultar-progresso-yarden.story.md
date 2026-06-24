# Story 75-52 — Portal Fases: ocultar "Cronograma da obra / Progresso geral" no Yarden

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** XS (1 ponto)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]

## Story
**As a** Trifold, **I want** não exibir o progresso geral (%) na página "Fases da Obra" do
portal para a obra Yarden, **so that** o cliente do Yarden não veja essa informação.

## Contexto
A Story 75-1 já oculta o progresso na HOME do portal para Yarden (gating por NOME). Faltava a
página **Fases da Obra** (`cliente/[obra_id]/fases`), que tem o próprio card "Cronograma da obra
/ Progresso geral X%". Pedido do usuário: remover exclusivamente para o Yarden.

## Escopo
**IN:** em `cliente/[obra_id]/fases/page.tsx`, flag `hideProgress = obra.name === "Yarden"` →
oculta o card "Cronograma da obra" inteiro. Progresso POR FASE segue visível (só o geral some).
**OUT:** outras obras (mostram normal); progresso por fase; demais páginas.

## Acceptance Criteria
1. Yarden: card "Cronograma da obra / Progresso geral" NÃO aparece na página Fases.
2. Outras obras: card aparece normalmente.
3. Progresso por fase continua visível em todas. typecheck/lint limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.52-portal-fases-ocultar-progresso-yarden.yml`)
- Mesmo gating por nome da 75-1. Aditivo. type-check/lint limpos.

## File List
- `packages/web/src/app/cliente/[obra_id]/fases/page.tsx`

## Change Log
- 2026-06-24 — @sm/@dev/@qa — Oculta progresso geral na página Fases p/ Yarden (gating por nome, igual 75-1).
