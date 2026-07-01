# Story 75-100 — IMOB: engajamento editável INLINE na lista (fora do modal)

## Metadata
- **Status:** Done (QA PASS) — pronto p/ @devops · **Epic:** IMOB · **Branch:** fix/75-100-imob-engajamento-inline · **Complexidade:** XS (1 ponto)
- **executor:** @dev · **quality_gate:** @qa · **Prioridade:** 🟢 ajuste de UX (pedido do diretor).

## Story
**As a** gestão, **I want** mudar o engajamento da imobiliária **direto na coluna da lista** (dropdown), sem abrir o modal de edição, **so that** seja rápido igual ao dropdown de "Perfil" na tela de Usuários.

## Escopo
**IN (só `imobiliarias-manager.tsx`, sem migration):**
1. **Remover** o campo "Engajamento na venda" do modal de edição (form).
2. **Coluna "Engaj." vira dropdown inline** (Não avaliado / Alta / Média / Baixa) com dot colorido; `onChange` → `PATCH /api/imob/imobiliarias/[id]` `{ engajamento }` → `router.refresh()`. `stopPropagation` no `<td>` pra não abrir o modal ao clicar.
**OUT:** backend inalterado (API PATCH de engajamento já existe/validada na 75-97); sem migration.

## Acceptance Criteria
1. **Given** a lista, **then** a coluna Engaj. é um dropdown editável (com dot colorido); trocar salva na hora, sem abrir modal.
2. **Given** o modal de edição, **then** NÃO tem mais o campo de engajamento.
3. **Given** clicar no dropdown, **then** não abre o modal de edição (stopPropagation).
4. typecheck/lint limpos.

## Dev Agent Record (@dev — 2026-07-01)
- [x] Removido engajamento do FormState/EMPTY/toForm + do modal; removido import `Engajamento` (não usado).
- [x] Coluna Engaj. = `<select>` inline (dot colorido, disabled enquanto salva) + handler `setEngajamento` (PATCH + refresh) + `stopPropagation` no td.
- **Checks:** `tsc` 0, `eslint` 0. Sem migration. Reusa a validação de engajamento da API (75-97).

## QA Results (@qa — 2026-07-01)
- **PASS.** Mudança de UI pura; PATCH de engajamento já validado (75-97, CHECK no banco). AC1-4 por inspeção + tsc/lint 0. Sem risco de dado.

## Change Log
- 2026-07-01 — @dev/@qa — engajamento movido do modal p/ dropdown inline na lista. Done.
- 2026-07-01 — @sm/@po — Story criada + GO (ajuste de UX).
