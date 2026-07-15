# Story (UX) — Scrollbar do menu lateral: fino e discreto

**Status:** Done
**Tipo:** UX / polish
**Epic:** UI / Navegação
**Complexidade:** XS (1 regra CSS escopada + 1 className; sem migration, sem lógica)

## Contexto
Feedback do diretor: a **barra de rolagem do menu lateral** (`/dashboard`) está muito chamativa e
atrapalha a navegação. O scrollbar global do app é **8px com track visível** (`globals.css`), o que no
sidebar escuro vira uma barra cinza destacada ao lado dos itens do menu.

## Decisão de UX
Aplicar um scrollbar **fino (6px), com track transparente e thumb arredondado sutil** que só ganha
contraste no **hover** — escopado APENAS ao container do menu (`.sidebar-scroll`), sem alterar o
scrollbar global (que serve tabelas, kanban, etc. — evitar regressão nessas telas).

## Acceptance Criteria
1. **AC1** — O scrollbar do menu lateral fica visivelmente **mais fino** (6px vs 8px) e discreto
   (track transparente, thumb arredondado com baixa opacidade).
2. **AC2** — O thumb ganha destaque no **hover** do menu (affordance preservada).
3. **AC3** — Funciona em **light e dark** (cor neutra `stone-500` com alpha) — ver [[feedback-theme-convention]].
4. **AC4** — **Nenhuma** outra área muda: o scrollbar global (tabelas, kanban, listas) permanece igual.

## Tasks
- [x] `globals.css`: classe `.sidebar-scroll` (width 6px, track transparent, thumb rounded alpha, hover).
- [x] `sidebar-nav.tsx`: adiciona `sidebar-scroll` ao `<nav>` que rola (linha 116).
- [x] Verificação: `next build` OK, `npm test` 975 pass. (Conferência visual final no preview.)

## Out of Scope
- Scrollbar global do app (mantido 8px).
- Scrollbar horizontal do kanban (`.kanban-scroll`) e de tabelas (`ScrollableX`).

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-15 | 1.0 | Scrollbar do sidebar → fino/discreto via `.sidebar-scroll` (escopado), sem tocar o global. build OK, 975 testes. Done. | @ux-design-expert (Uma) + @dev |
| 2026-07-15 | 1.1 | Ajuste após preview: thumb um pouco mais visível (55%, hover 80%). Push por @devops. PR #201 squash-merged em `main` (`b7b348ed`). Deploy Vercel de produção disparado. | @devops (Gage) |

## Dev Agent Record
### File List
- `packages/web/src/app/globals.css`
- `packages/web/src/components/layout/sidebar-nav.tsx`
- `docs/stories/ux-sidebar-scrollbar-fino.story.md` (novo)

## QA Results
### Review Date: 2026-07-15 — Reviewed By: Quinn
| Check | Veredito | Evidência |
|-------|----------|-----------|
| Code review | PASS | Classe escopada `.sidebar-scroll`; aplicada só no `<nav>` do sidebar; global intacto. |
| Unit tests | PASS | 975 tests, sem regressão. |
| Acceptance criteria | PASS | AC1-AC4 (conferência visual final no preview/prod). |
| No regressions | PASS | Não altera `::-webkit-scrollbar` global nem `.kanban-scroll`. |
| Documentation | PASS | Story + gate. |

Build: next build OK · npm test 975 pass. Nota: mudança puramente visual — conferência final de aparência no preview.
Gate: PASS → docs/qa/gates/ux-sidebar-scrollbar-fino.yml
— Quinn 🛡️
