# Story 52-3 — Lead Drawer: Abas de Filtro de Tarefas

## Metadata
- **Status:** Done
- **Priority:** P1
- **Complexity:** XS (~30min)
- **Created:** 2026-06-09

## Solicitação
Robson Silva (corretor) reportou que as abas de tarefas não apareciam no lead.
Implementar filtros: "A realizar", "Para hoje", "Atrasadas", "Futuras".

## Tasks
- [x] T1: Adicionar estado `taskTab` ao drawer
- [x] T2: Calcular buckets (atrasadas, para-hoje, futuras) via `todayStart`
- [x] T3: Renderizar abas com contagem e destaque vermelho para atrasadas
- [x] T4: Substituir `pendingTasks` por `tabTasks` na lista
- [x] T5: Empty state "Sem tarefas." quando tab não tem itens
- [x] T6: TypeScript clean
