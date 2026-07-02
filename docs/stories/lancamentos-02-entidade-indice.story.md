# Story Lançamentos-02 — Entidade Lançamento + índice

## Metadata
- **Status:** InReview — @dev + @qa · pronto p/ @devops (migration 145) · **Epic:** Lançamentos · **Branch:** feat/lancamentos-02-entidade-indice · **Complexidade:** M (2-3 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, verificação da tabela/FK no banco]

## Story
**As a** admin/supervisor/obras, **I want** cadastrar lançamentos (cada um = um empreendimento) e vê-los num índice em grid, **so that** eu possa abrir o board de cada empreendimento (Story 3).

## Escopo
**IN:**
1. Migration 145 — tabela `lancamentos` (nome, `property_interest_id`→properties, status CHECK, cor, created_by; RLS sem policy).
2. `lib/lancamentos/lancamentos.ts` — tipo + status (planejamento/lancamento/venda/concluido/pausado) + labels/tones + paleta de cor + `validateLancamento`.
3. API `POST /api/lancamentos` + `PATCH`/`DELETE /api/lancamentos/[id]` (gated via `lancamentosGuard`).
4. Índice `/dashboard/lancamentos` — grid de cards (cor, status, empreendimento) + filtro; substitui o placeholder da Story 1.
5. `_components/lancamentos-manager.tsx` — modal criar/editar + excluir.
6. `[id]/page.tsx` — stub do board (header) gated.

**OUT:** board/listas/cartões (Story 3), fornecedores (Story 6), progresso/contadores no card (dependem de cartões — Story 3+).

## Acceptance Criteria
1. Admin/supervisor/obras cria um lançamento (nome obrigatório; empreendimento/status/cor opcionais) e ele aparece no grid.
2. Editar e excluir funcionam; excluir pede confirmação.
3. Card mostra cor de identidade, badge de status e empreendimento vinculado; clicar abre `/dashboard/lancamentos/[id]`.
4. Sem permissão → redirect; APIs retornam 403 via guard.
5. typecheck/lint limpos; tabela `lancamentos` criada com FK p/ properties.

## File List
- `supabase/migrations/145_lancamentos.sql`
- `packages/web/src/lib/lancamentos/lancamentos.ts`
- `packages/web/src/app/api/lancamentos/route.ts` · `.../[id]/route.ts`
- `packages/web/src/app/dashboard/lancamentos/page.tsx` · `.../[id]/page.tsx`
- `packages/web/src/app/dashboard/lancamentos/_components/lancamentos-manager.tsx`

## Change Log
- 2026-07-02 — @sm/@po/@dev/@qa — Entidade + índice implementados. tsc 0, lint 0. Handoff @devops (migration 145).
