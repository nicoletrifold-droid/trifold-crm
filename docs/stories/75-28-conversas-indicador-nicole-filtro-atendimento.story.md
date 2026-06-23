# Story 75-28 — Conversas: indicador da Nicole (IA) + filtro Atendimento (IA/Humano)

## Metadata
- **Status:** Done
- **Epic:** 75 · **Branch:** main · **Complexidade:** S (2 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]

## Story
**As a** gerente/supervisor/admin, **I want** identificar e filtrar as conversas que a
Nicole (IA) está atendendo na tela de Conversas, **so that** eu acompanhe o desempenho
dela, veja o que está sendo tratado e entre para corrigir falhas.

## Contexto
Regressão da 75-25: a tabela antiga de `/dashboard/conversas` mostrava o status
"IA ativa"/"Handoff"; o novo card (estilo chat) não trouxe esse indicador. Resultado:
as 65/71 conversas ativas atendidas pela Nicole (is_ai_active=true) somem visualmente
("não aparecem mais as conversas da Nicole"). Elas estão na lista, só não marcadas.
`conversations.is_ai_active` já está na query. Intervir já funciona (abrir a conversa
e responder → handoff; `gerente-comercial` em CAN_SEND_ROLES).

## Escopo
**IN:**
- Card de `/dashboard/conversas`: selo **"🤖 Nicole"** quando `is_ai_active`, ou
  **"Atendimento humano"** quando handoff.
- Filtro **Atendimento** (Todos / Nicole (IA) / Humano) via param `ia` —
  `LeadFilters` ganha prop opcional `showAtendimento` (default off; só renderiza quando passado).
- Página aplica o filtro `ia` e inclui no `hasFilter`/Limpar.

**OUT:** `/broker/chat` (corretor vê os próprios leads; indicador IA opcional, fora de escopo).
Mudança no fluxo de handoff/resposta (já funciona).

## Acceptance Criteria
1. Cada card mostra "🤖 Nicole" (IA ativa) ou "Atendimento humano" (handoff).
2. Filtro "Atendimento" com Todos/Nicole(IA)/Humano; filtra por `is_ai_active`.
3. `ia` conta como filtro ativo (Limpar zera junto).
4. `LeadFilters` sem `showAtendimento` (leads pages) permanece inalterado.
5. typecheck e lint limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.28-...yml`, quality_score 93)
- **typecheck/lint:** limpos.
- **Dados prod:** 65/71 ativas são da Nicole; 4 sem corretor (monitoráveis via filtro Nicole(IA)).

## File List
- `packages/web/src/components/lead-filters.tsx`
- `packages/web/src/app/dashboard/conversas/page.tsx`
