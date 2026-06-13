# Story 54-3 — Broker: Suporte a tema light/dark

## Metadata
- **Status:** Done
- **Priority:** P1
- **Complexity:** M (~2-3h)
- **Created:** 2026-06-10
- **Author:** @sm (River)

## User Story
**Como** corretor, **quero** alternar entre tema claro e escuro no `/broker`,
**para que** eu tenha a mesma experiência de personalização que outros usuários do sistema.

## Context
A convenção correta do sistema é:
- `/dashboard` e `/broker` → light/dark responsivo com variantes `dark:`
- `/cliente` → sempre dark hardcoded (portal mobile do cliente final)

O layout do broker foi hardcodado como sempre-dark no commit `c104b0a` ao tentar corrigir
um bug de tema misturado na página `/broker/leads`. O fix correto é usar `dark:` variants
em todos os componentes broker, não forçar dark no layout.

## Acceptance Criteria
- **AC1:** `broker/layout.tsx` usa `bg-stone-50 dark:bg-stone-950` (sem classe `dark` hardcoded)
- **AC2:** Todas as páginas `/broker` respondem corretamente ao tema escolhido pelo corretor
- **AC3:** Toggle de tema na sidebar funciona e persiste entre navegações
- **AC4:** Nenhuma página do `/broker` mistura fundo claro com componentes dark hardcoded
- **AC5:** `/cliente` permanece sempre dark (não afetado)

## Scope
**IN:**
- `broker/layout.tsx`
- `broker/page.tsx`
- `broker/leads/page.tsx`
- `broker/pipeline/` (todas as páginas e componentes)
- `broker/agenda/` (todas as páginas)
- Componentes usados exclusivamente no broker

**OUT:**
- `/cliente/*` — permanece sempre dark
- `/dashboard/*` — já funciona corretamente
- Componentes compartilhados já responsivos (ex: `SidebarNav`, `lead-filters.tsx`)

## Tasks
- [x] T1: Reverter `broker/layout.tsx` para `bg-stone-50 dark:bg-stone-950`
- [x] T2: Auditar `broker/page.tsx` — já usa `dark:` corretamente, sem alteração
- [x] T3: Auditar `broker/leads/page.tsx` — 9 classes corrigidas
- [x] T4: Auditar `broker/pipeline/` — usa KanbanBoard compartilhado, já responsivo
- [x] T5: Auditar `broker/agenda/` — já usa `dark:` corretamente, sem alteração
- [x] T6: Auditar demais páginas broker (`/instalar`, `/suporte`) — corrigidas
- [x] T7: Typecheck + lint clean

## Files
- `packages/web/src/app/broker/layout.tsx`
- `packages/web/src/app/broker/page.tsx`
- `packages/web/src/app/broker/leads/page.tsx`
- `packages/web/src/app/broker/pipeline/` (a ser mapeado no T4)
- `packages/web/src/app/broker/agenda/` (a ser mapeado no T5)

## Definition of Done
- Corretor consegue alternar entre light e dark
- Todas as telas do `/broker` respondem corretamente
- Typecheck e lint passam sem novos erros
- `/cliente` não é afetado
