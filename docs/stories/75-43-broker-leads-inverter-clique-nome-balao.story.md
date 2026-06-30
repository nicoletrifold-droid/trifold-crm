# Story 75-43 — Meus Leads: inverter clique (nome → detalhe, balão → conversa)

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** S (1 ponto)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]

## Story
**As a** corretor, **I want** que na lista "Meus Leads" o **nome** abra o **detalhe do lead**
(drawer com tarefas/histórico) e o **balão de chat** abra a **conversa** (Conversa com o
Agente), **so that** o comportamento fique intuitivo (estava invertido).

## Contexto
Pedido do usuário (2026-06-24): estava invertido — clicar no nome ia pra conversa e o balão
abria o drawer. Inverter nos dois layouts (mobile + desktop) de `leads-list-with-drawer.tsx`.

## Escopo
**IN:** trocar handlers em `leads-list-with-drawer.tsx`: nome = `setSelectedLeadId` (drawer);
balão (MessageCircle) = `Link` para `/broker/leads/[id]` (conversa). Mobile e desktop.
**OUT:** mudar o conteúdo do drawer ou da conversa.

## Acceptance Criteria
1. Clicar no nome do lead abre o drawer de detalhe (tarefas/histórico).
2. Clicar no balão abre a conversa (/broker/leads/[id]).
3. Vale em mobile e desktop. typecheck/lint limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.43-broker-leads-inverter-clique-nome-balao.yml`)

## File List
- `packages/web/src/app/broker/leads/_components/leads-list-with-drawer.tsx`
