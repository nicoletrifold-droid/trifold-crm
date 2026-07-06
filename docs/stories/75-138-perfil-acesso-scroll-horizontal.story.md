# Story 75-138 — Perfil de Acesso: barra de rolagem horizontal alcançável na matriz

## Metadata
- **Status:** Done · **Epic:** Configurações · **PR:** #135 · **Complexidade:** XS (1 ponto) · **Branch:** fix/75-138-perfil-acesso-scroll-horizontal
- **executor:** @dev · **quality_gate:** @qa

## Contexto
Na tela **Perfil de Acesso** (`/dashboard/configuracoes/perfil-acesso`) há 9 perfis, mas só ~5 colunas cabem na largura. A matriz (`permissions-matrix.tsx`) vive num container `max-h-[600px] overflow-auto`: o scroll horizontal existe (e o Chrome tem barra estilizada no `globals.css`), porém a barra fica no **rodapé de uma caixa de 600px**, que cai logo abaixo da área visível — então o gestor não consegue alcançá-la pra ver os perfis à direita.

## Escopo
**IN:** em `permissions-matrix.tsx`, trocar a altura fixa do container de rolagem por uma **relativa à viewport** (`max-h-[calc(100vh-16rem)]`), para que o rodapé do container — onde fica a barra horizontal — permaneça visível na tela. Garantir `overflow-auto` (x+y). Mesma correção no skeleton se aplicável (não tem scroll, ignorar).

**OUT:** redesenhar a matriz (ex.: fixar coluna Módulo já é sticky); barra horizontal duplicada no topo; virar cards no mobile.

## Acceptance Criteria
1. **Given** 9 perfis (mais largo que a tela), **when** abro a tela, **then** existe uma barra de rolagem horizontal **visível e alcançável** que revela os perfis à direita.
2. **Given** a rolagem horizontal, **then** a coluna "Módulo" (sticky) e o cabeçalho de perfis (sticky) continuam funcionando.
3. **Given** muitos módulos, **then** a rolagem vertical continua funcionando dentro do container.
4. tsc/lint limpos; tema light/dark ok.

## Tasks (@dev)
- [ ] `permissions-matrix.tsx`: `max-h-[600px]` → `max-h-[calc(100vh-16rem)]` no container de rolagem.
- [ ] tsc/eslint.

## Riscos
- **Mínimo.** Só uma classe de altura. Sticky header/coluna preservados (mesmo container).

## Dev Agent Record (@dev — 2026-07-06)
- **`permissions-matrix.tsx`:** container de rolagem `max-h-[600px]` → `max-h-[calc(100vh-16rem)]`; o rodapé (com a barra horizontal, já estilizada em `globals.css`) passa a ficar dentro da viewport. Sticky header/coluna e scroll vertical inalterados (mesmo container/overflow-auto).
- **Checks:** tsc 0 · eslint 0 · vitest 788/788 (sem lógica nova).
- **Files:** `app/dashboard/configuracoes/perfil-acesso/permissions-matrix.tsx`.

## QA Results (@qa — 2026-07-06)
- **PASS.** AC1 (barra horizontal alcançável) ✓ · AC2 (sticky Módulo/perfis preservados) ✓ · AC3 (scroll vertical mantido) ✓ · AC4 (tsc/eslint/788, dark) ✓. Mudança isolada de 1 classe.

## Change Log
- 2026-07-06 — @devops — Branch + commit + push + **PR #135** + merge. Status → Done.
- 2026-07-06 — @qa — **QA GATE: PASS**. 4 ACs, 788/788.
- 2026-07-06 — @dev — Fix (altura relativa à viewport). Status → InReview.
- 2026-07-06 — @po — **GO (10/10)**. Status Draft → Ready → InProgress.
- 2026-07-06 — @sm — Story criada (Draft).
