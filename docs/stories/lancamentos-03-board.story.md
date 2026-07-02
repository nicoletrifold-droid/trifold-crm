# Story Lançamentos-03 — Board Kanban por lançamento

## Metadata
- **Status:** InReview — @dev + @qa · pronto p/ @devops (migration 146) · **Epic:** Lançamentos · **Branch:** feat/lancamentos-03-board · **Complexidade:** M-L (3-5 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, teste de banco do fluxo (colunas/cartões/cascade) em txn rollback]

## Story
**As a** admin/supervisor/obras, **I want** um board Kanban (listas + cartões + arrastar + comentários) dentro de cada lançamento, **so that** eu organize as tarefas do lançamento daquele empreendimento como no Trello.

## Contexto
Relocação do Kanban dormente `imob_*` (Story 75-88/75-95). Diferença central: as colunas pertencem a um **lançamento** (`lancamento_id`) → board por empreendimento (o dormente era board único por org). Reaproveita o motor `@dnd-kit`, os padrões de API e o modal. Cartão rico (etiquetas/prazo/responsável), checklists e anexos ficam para as Stories 4/5.

## Escopo
**IN:**
1. Migration 146 — `lancamento_columns` (com `lancamento_id`), `lancamento_cards`, `lancamento_card_comments`; RLS sem policy; cascades (lançamento→coluna→cartão→comentário).
2. APIs (gated via `lancamentosGuard`): `POST /columns` (com `lancamento_id`), `PATCH`/`DELETE /columns/[id]`, `POST /cards`, `PATCH`/`DELETE /cards/[id]`, `POST /cards/reorder`, `GET`/`POST /cards/[id]/comments`.
3. `lancamento-board.tsx` (fork do imob-board + prop `lancamentoId`) e `lancamento-card-modal.tsx` (fork).
4. `[id]/page.tsx` — busca colunas+cartões, **semeia 5 listas padrão** (Backlog·A fazer·Em andamento·Aprovação·Concluído) no 1º acesso, renderiza header + board.

**OUT:** etiquetas/prazo/responsável (Story 4), checklists/anexos (Story 5), fornecedores (Story 6/7), progresso/contadores no card do índice.

## Acceptance Criteria
1. Abrir um lançamento pela 1ª vez cria as 5 listas padrão; abrir de novo não duplica.
2. Criar/renomear/excluir listas e criar/editar/excluir cartões funciona (excluir lista/cartão em cascata).
3. Arrastar cartão entre listas e reordenar dentro da lista persiste (via `/cards/reorder`).
4. Comentários listam e adicionam (autor + timestamp).
5. Tudo gated (403 sem acesso ao módulo); board isolado por `lancamento_id`.
6. typecheck/lint limpos; teste de banco do fluxo (cascade) OK.

## File List
- `supabase/migrations/146_lancamento_kanban.sql`
- `packages/web/src/app/api/lancamentos/columns/route.ts` · `columns/[id]/route.ts`
- `packages/web/src/app/api/lancamentos/cards/route.ts` · `cards/[id]/route.ts` · `cards/reorder/route.ts` · `cards/[id]/comments/route.ts`
- `packages/web/src/app/dashboard/lancamentos/_components/lancamento-board.tsx` · `lancamento-card-modal.tsx`
- `packages/web/src/app/dashboard/lancamentos/[id]/page.tsx` (substitui o stub)

## Change Log
- 2026-07-02 — @sm/@po/@dev/@qa — Board Kanban por lançamento (relocação do imob_* com `lancamento_id`). tsc 0, lint 0. Handoff @devops (migration 146).
