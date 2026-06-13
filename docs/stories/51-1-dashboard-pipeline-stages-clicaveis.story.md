# Story 51-1 — Dashboard: Estágios do Pipeline Clicáveis

## Metadata
- **Epic:** 51 — UX Dashboard
- **Story:** 51-1
- **Status:** InProgress
- **Priority:** P2
- **Complexity:** XS (~1h)
- **Created:** 2026-06-09
- **Author:** @sm (River)
- **Validated:** 2026-06-09 by @po (Pax) — verdict GO (9/10)

### Executor Assignment
- **Executor:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)

---

## User Story

**Como** usuário do Dashboard,
**Quero** clicar em um estágio do Pipeline Summary,
**Para que** seja redirecionado ao Pipeline com aquele estágio em foco (scroll automático).

---

## Acceptance Criteria

- **AC1:** Cada card de estágio no Dashboard é clicável (link real, não JS)
- **AC2:** O link navega para `/dashboard/pipeline?stage={slug}`
- **AC3:** Ao abrir o Pipeline via esse link, a view faz scroll automático para a coluna correspondente
- **AC4:** Hover no card exibe cursor pointer e sutil destaque visual (ring ou brightness)
- **AC5:** Funciona para todos os roles (admin, supervisor, corretor, gerente-comercial)
- **AC6:** Se o slug não corresponder a nenhuma coluna ativa, o Pipeline abre normalmente sem erro

---

## Scope

### IN
- `packages/web/src/app/dashboard/page.tsx` — wraps stage cards em `<Link>`
- `packages/web/src/components/pipeline/kanban-board.tsx` — novo prop `initialStageFocus`, scroll-to on mount
- `packages/web/src/app/dashboard/pipeline/page.tsx` — lê `filters.stage`, passa para `KanbanBoard`

### OUT
- Nenhuma mudança no banco de dados
- Nenhuma mudança no broker pipeline (`/broker/pipeline`)
- Nenhum novo componente

---

## Tasks

- [x] T1: Dashboard — wrap stage cards em `<Link href=/dashboard/pipeline?stage={stage.slug}>` com hover styles
- [x] T2: Pipeline page — ler `filters.stage` e passar como `initialStageFocus` ao `KanbanBoard`
- [x] T3: KanbanBoard — adicionar prop `initialStageFocus?: string`, scroll-to-column on mount via `useEffect`
- [x] T4: Typecheck + lint clean

---

## File List
- `packages/web/src/app/dashboard/page.tsx`
- `packages/web/src/app/dashboard/pipeline/page.tsx`
- `packages/web/src/components/pipeline/kanban-board.tsx`

---

## Change Log
- 2026-06-09: Story criada por @sm (River), validada por @po (Pax), iniciada por @dev (Dex)
