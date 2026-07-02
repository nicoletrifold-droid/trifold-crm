# Story Lançamentos-04 — Cartão rico: etiquetas, prazo, responsável

## Metadata
- **Status:** InReview — @dev + @qa · pronto p/ @devops (migration 147) · **Epic:** Lançamentos · **Branch:** feat/lancamentos-04-cartao-rico · **Complexidade:** M (2-3 pontos)
- **quality_gate_tools:** [typecheck, lint, verificação das colunas no banco]

## Story
**As a** usuário do board, **I want** etiquetas coloridas, prazo e responsável nos cartões, **so that** eu organize e priorize as tarefas do lançamento como no Trello.

## Escopo
**IN:**
1. Migration 147 — `lancamento_cards` ganha `due_date timestamptz`, `assignee_id uuid→users`, `labels text[] DEFAULT '{}'` (nullable/default → seguro).
2. `lancamentos.ts` — paleta `LABEL_COLORS` (reusa chaves de `COR_HEX`).
3. API cards: POST retorna os novos campos; PATCH aceita `due_date`/`assignee_id`/`labels` (labels filtradas pela paleta).
4. Board — face do cartão mostra barras de etiqueta, pill de prazo (urgência: cinza→âmbar→vermelho) e avatar do responsável (iniciais + cor determinística).
5. Modal — picker de etiquetas, select de responsável (lista de usuários internos) e input de prazo; salvam na hora.
6. `[id]/page.tsx` — seleciona os novos campos + join do responsável + carrega `members` (usuários internos ativos) e passa ao board.

**OUT:** checklists/anexos (Story 5), fornecedores (6/7).

## Acceptance Criteria
1. Adicionar/remover etiquetas no cartão reflete na face (barras) e persiste.
2. Definir prazo mostra pill com tom por urgência; vencido = vermelho, ≤2 dias = âmbar.
3. Definir responsável mostra avatar (iniciais) na face; select lista usuários internos.
4. Cartões antigos (sem esses campos) seguem funcionando (defaults).
5. typecheck/lint limpos; colunas criadas no banco.

## File List
- `supabase/migrations/147_lancamento_cards_rich.sql`
- `packages/web/src/lib/lancamentos/lancamentos.ts` (LABEL_COLORS)
- `packages/web/src/app/api/lancamentos/cards/route.ts` · `cards/[id]/route.ts`
- `packages/web/src/app/dashboard/lancamentos/_components/lancamento-board.tsx` · `lancamento-card-modal.tsx`
- `packages/web/src/app/dashboard/lancamentos/[id]/page.tsx`

## Change Log
- 2026-07-02 — @sm/@po/@dev/@qa — Cartão rico (etiquetas/prazo/responsável). tsc 0, lint 0. Handoff @devops (migration 147).
