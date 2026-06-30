# Story 75-42 — Fix: filtro "Data da Tarefa" não mostrava nada (assigned_to nulo)

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** S (1 ponto)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]

## Story
**As a** corretor, **I want** que o filtro "Data da Tarefa" (75-37) realmente liste os leads
com tarefas no período, **so that** eu veja minhas tarefas futuras a partir da lista.

## Contexto
Bug reportado (2026-06-24): o filtro não retornava nada. Causa-raiz: na 75-37 a query de
`lead_tasks` recebeu `.eq("assigned_to", user.id)`, mas as tarefas criadas pelo corretor
gravam `assigned_to = NULL` → a query retornava zero (quebrou o filtro novo `td` E o antigo
`tasks`). O escopo do corretor já vem da interseção com os leads dele (a lista só traz
`assigned_broker_id = user.id`), então o `assigned_to` era uma trava indevida.

## Escopo
**IN:** remover `.eq("assigned_to", user.id)` da query de `lead_tasks` em `broker/leads/page.tsx`.
**OUT:** preencher `assigned_to` na criação de tarefa (não necessário p/ este filtro).

## Acceptance Criteria
1. Filtro "Data da Tarefa" (Hoje/Esta Semana/…/Todo Período/De-Até) lista os leads do corretor
   com tarefa pendente no período (ex.: 128 tarefas pendentes do Robson voltam a aparecer).
2. Filtros antigos (atrasadas/para-hoje/futuras) voltam a funcionar.
3. Escopo correto: só tarefas de leads do próprio corretor (via interseção). typecheck/lint limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.42-fix-filtro-data-tarefa-assigned-to.yml`)

## File List
- `packages/web/src/app/broker/leads/page.tsx`
