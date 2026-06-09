# Story 54-2 — Broker Leads: Filtros por Status de Tarefa

## Metadata
- **Status:** InProgress
- **Priority:** P1
- **Complexity:** S (~1h)
- **Created:** 2026-06-09
- **Author:** @sm (River)
- **Validated:** 2026-06-09 by @po (Pax) — GO

## User Story
**Como** corretor, **quero** clicar nos cards do dashboard (Atrasadas, Para hoje, etc.)
e ir direto para a lista de leads filtrada por aquele status de tarefa,
**para que** eu não precise rolar manualmente procurando o lead certo.

## Acceptance Criteria
- **AC1:** `?tasks=atrasadas` → exibe leads com pelo menos 1 tarefa vencida (due_at < hoje, não concluída)
- **AC2:** `?tasks=para-hoje` → leads com tarefa vencendo hoje
- **AC3:** `?tasks=futuras` → leads com tarefa futura (due_at >= amanhã)
- **AC4:** `?tasks=sem-tarefas` → leads sem nenhuma tarefa pendente
- **AC5:** Chip visual mostrando filtro ativo, com botão × para limpar
- **AC6:** Combina com filtros existentes (stage, property, days, q)
- **AC7:** Cards do dashboard navegam para a URL correta

## Tasks
- [x] T1: Buscar tarefas pendentes do broker em paralelo com leads
- [x] T2: Lógica de filtro por status de tarefa (client-side em JS)
- [x] T3: Chip visual do filtro ativo na página de leads
- [x] T4: Atualizar hrefs dos cards do dashboard broker (54-1)
- [x] T5: Typecheck clean

## Files
- `packages/web/src/app/broker/leads/page.tsx`
- `packages/web/src/app/broker/page.tsx`
