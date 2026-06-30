# Story 75-33 — Padronizar fuso horário do servidor em Brasília

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** XS (1 ponto)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, build]

## Story
**As a** usuário, **I want** ver as datas/horas do sistema sempre em horário de Brasília,
**so that** não haja divergência entre o que vejo e o horário real (ex.: lead às 13:43).

## Contexto
Pedido do usuário (2026-06-23). DB guarda UTC (timestamptz, correto). ~100 formatações
não fixam o fuso → no servidor (Vercel=UTC) aparecia UTC. Brasil sem horário de verão →
America/Sao_Paulo = UTC-3 fixo. A Vercel RESERVA o env var `TZ` (não permite criar), então
definimos via instrumentation do Next no startup do runtime Node.

## Escopo
**IN:** `src/instrumentation.ts` → `register()` seta `process.env.TZ='America/Sao_Paulo'`
no runtime Node. Toda renderização server-side passa a ser BRT.
**OUT:** varredura dos ~100 toLocale* (melhoria futura p/ acessos de outro fuso); o
navegador já usa o fuso local (BRT para o time no Brasil).

## Acceptance Criteria
1. `register()` define TZ=America/Sao_Paulo no runtime nodejs.
2. Datas renderizadas no servidor passam a sair em BRT (UTC-3).
3. typecheck, lint e build limpos (Next reconhece o instrumentation).

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.33-...yml`, quality_score 90)
- **typecheck/lint/build:** limpos.
- **Ressalva:** efeito server-side; conferir após deploy. Componentes client seguem o fuso do navegador (BRT no Brasil).

## File List
- `packages/web/src/instrumentation.ts` (novo)
