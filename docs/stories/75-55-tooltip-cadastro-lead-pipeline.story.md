# Story 75-55 — Tooltip no indicador X/3 do card do pipeline (cadastro do lead)

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** XS (1 ponto)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]

## Story
**As a** usuário do pipeline, **I want** entender o que o "X/3" do card significa ao passar o
mouse, **so that** eu saiba que é a completude do cadastro do lead e o que falta.

## Contexto
O card do pipeline mostra uma barra "X/3" = quantos dos 3 campos obrigatórios (Nome, Telefone,
Empreendimento de interesse) estão preenchidos. Sem rótulo, o usuário não entendia. Pedido: tooltip.

## Escopo
**IN:** em `components/pipeline/lead-card.tsx`, `title` no container do X/3 com texto explicativo
e os campos faltantes (helper `getMissingMandatoryLabels`). Ex.: "Cadastro do lead: 2 de 3
obrigatórios · Faltando: Empreendimento de interesse". Completo → "Cadastro do lead completo (3 de 3...)".
**OUT:** tooltip estilizado (usa o title nativo do navegador, como no badge de espera 75-49).

## Acceptance Criteria
1. Hover no X/3 mostra o tooltip com a contagem e os obrigatórios faltantes.
2. Lead completo mostra texto de "completo". typecheck/lint limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.55-tooltip-cadastro-lead-pipeline.yml`). Aditivo, title nativo.

## File List
- `packages/web/src/components/pipeline/lead-card.tsx`

## Change Log
- 2026-06-24 — @sm/@dev/@qa — Tooltip no X/3 explicando o cadastro do lead + campos faltantes.
