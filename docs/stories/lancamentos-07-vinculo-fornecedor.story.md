# Story Lançamentos-07 — Vincular fornecedor ao cartão

## Metadata
- **Status:** InReview — @dev + @qa · pronto p/ @devops (migration 150) · **Epic:** Lançamentos · **Branch:** feat/lancamentos-07-vinculo-fornecedor · **Complexidade:** M (2 pontos)
- **quality_gate_tools:** [typecheck, lint, teste de banco (upsert dedup + cascade) em txn rollback]

## Story
**As a** usuário do board, **I want** vincular fornecedores (do cadastro global) a um cartão, **so that** eu saiba quais fornecedores estão envolvidos naquela tarefa/lançamento. Fecha o épico.

## Escopo
**IN:**
1. Migration 150 — `lancamento_card_fornecedores` (N:N card↔fornecedor, `UNIQUE(card_id, fornecedor_id)`, cascades; RLS sem policy).
2. API `GET`/`POST /cards/[id]/fornecedores` (listar/vincular, upsert idempotente) + `DELETE /cards/[id]/fornecedores/[fornId]` (desvincular).
3. Modal — bloco "Fornecedores" na sidebar: chips vinculados (desvincular) + picker (buscar na lista global, vincular).
4. Face do cartão — badge de contagem de fornecedores; contador no `[id]/page`. Lista global de fornecedores passada ao board/modal.

**OUT:** — (épico completo).

## Acceptance Criteria
1. Vincular fornecedor pelo picker aparece nos chips e no badge do cartão; não duplica (upsert).
2. Desvincular remove o vínculo e atualiza o badge.
3. Excluir cartão OU fornecedor remove o vínculo (cascade).
4. Tudo gated; typecheck/lint limpos.

## File List
- `supabase/migrations/150_lancamento_card_fornecedores.sql`
- `packages/web/src/app/api/lancamentos/cards/[id]/fornecedores/route.ts` · `[fornId]/route.ts`
- `packages/web/src/app/dashboard/lancamentos/_components/lancamento-board.tsx` · `lancamento-card-modal.tsx`
- `packages/web/src/app/dashboard/lancamentos/[id]/page.tsx`

## Change Log
- 2026-07-02 — @sm/@po/@dev/@qa — Vínculo fornecedor↔cartão (picker + badge). Fecha o épico Lançamentos. tsc 0, lint 0. Handoff @devops (migration 150).
