# Story 75-37 — Filtro "Data da Tarefa" em Meus Leads (corretor)

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** S (2 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]

## Story
**As a** corretor, **I want** filtrar a lista "Meus Leads" pela data das minhas tarefas
(Hoje, Amanhã, Esta Semana, Próxima Semana, Este Mês, Próximo Mês, Todo Período ou
intervalo De/Até), **so that** eu veja direto na lista os leads com tarefas futuras sem
precisar abrir lead por lead nem depender da agenda diária do dashboard.

## Contexto
Pedido do usuário (2026-06-23), espelhando o filtro "Data da Tarefa" do antigo CRM Supremo:
um seletor com atalhos rápidos + campos De/Até. A tela `/broker/leads` já tinha um filtro
de tarefas grosseiro (`tasks` = atrasadas/para-hoje/futuras/sem-tarefas) consumido por links
do dashboard, mas sem um seletor visível por intervalo de datas. As tarefas vivem em
`lead_tasks` (coluna de vencimento `due_at`, pendentes = `completed_at IS NULL`).

## Escopo
**IN:**
- Componente client `task-date-filter.tsx` (popover): atalhos Hoje/Amanhã/Esta Semana/
  Próxima Semana/Este Mês/Próximo Mês/Todo Período + inputs De/Até + Aplicar/Limpar.
- Helper `lib/broker/task-date-range.ts`: converte preset/De/Até em intervalo `{from,to}`
  (isola `new Date()` p/ não violar a regra de pureza em server component).
- `/broker/leads`: lê params `td`/`tdfrom`/`tdto`, busca `lead_tasks` pendentes do corretor
  e filtra os leads cujas tarefas vencem no intervalo selecionado; chip de filtro ativo.
**OUT:** edição de tarefas; filtro de data em outras telas; alteração do filtro `tasks`
existente (mantido funcionando p/ os links do dashboard).

## Acceptance Criteria
1. Atalhos Hoje/Amanhã/Esta Semana/Próxima Semana/Este Mês/Próximo Mês aplicam o intervalo
   correto e listam apenas leads com tarefa pendente vencendo nesse intervalo.
2. "Todo Período" lista leads com qualquer tarefa pendente (com ou sem `due_at`).
3. Intervalo personalizado De/Até filtra por `due_at` no range (Até inclusivo até o fim do dia).
4. Semana = domingo→sábado (convenção BR); mês = 1º dia → fim do mês.
5. Só considera tarefas do próprio corretor (`assigned_to = user.id`) e pendentes (`completed_at IS NULL`).
6. Chip de filtro ativo com botão × que limpa `td`/`tdfrom`/`tdto` preservando os demais filtros.
7. typecheck e lint limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.37-broker-filtro-data-tarefa.yml`)
- **typecheck/lint:** limpos.

## File List
- `packages/web/src/lib/broker/task-date-range.ts` (novo)
- `packages/web/src/app/broker/leads/_components/task-date-filter.tsx` (novo)
- `packages/web/src/app/broker/leads/page.tsx`
