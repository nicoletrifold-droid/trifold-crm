# Story 75-49 — Indicador "⏱ aguardando há X" na lista de leads do corretor

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** S (2 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]

## Story
**As a** corretor, **I want** ver há quanto tempo cada lead está em "Aguardando atendimento",
**so that** eu sinta a pressão de atender rápido (item #4 do pacote SLA).

## Contexto
Fecha o pacote SLA (project-sla-atendimento-decisoes, #4). Reusa o `businessMinutesBetween`
(75-48) e o trigger `primeiro_atendimento_em` (75-45). Tempo = distribuição → agora, contando
só expediente — consistente com o alerta e o analytics.

## Escopo
**IN:** em `broker/leads/page.tsx` (server): para leads em "Aguardando atendimento" (stage
AGUARDANDO) ainda não atendidos, calcular `businessMinutesBetween(distribuição, agora)` (lê
`roleta_config` via admin client; gated — só roda se houver leads aguardando). Passar
`waitingMinutes` ao `leads-list-with-drawer.tsx`, que renderiza o badge "⏱ aguardando há X"
no card mobile e na coluna Etapa do desktop. Cor escala com o SLA (≤30 âmbar, ≤60 laranja, >60 vermelho).
**OUT:** indicador no kanban do dashboard (pode ser follow-up); ordenar a lista por espera.

## Acceptance Criteria
1. Badge aparece só em leads de "Aguardando atendimento" não atendidos e com distribuição registrada.
2. Tempo = minutos de expediente desde a distribuição (pausa à noite), igual ao SLA.
3. Renderiza em mobile e desktop; aditivo (não altera o resto da lista).
4. Sem query extra quando não há leads aguardando. typecheck/lint limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.49-indicador-aguardando-lista.yml`)
- Aditivo, gated, business-time reusado. type-check/lint limpos.

## File List
- `packages/web/src/app/broker/leads/page.tsx`
- `packages/web/src/app/broker/leads/_components/leads-list-with-drawer.tsx`

## Change Log
- 2026-06-24 — @sm/@dev/@qa — Indicador de espera na lista (#4 do pacote SLA). Fecha o pacote.
