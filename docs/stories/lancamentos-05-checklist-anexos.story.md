# Story Lançamentos-05 — Checklists + anexos no cartão

## Metadata
- **Status:** InReview — @dev + @qa · pronto p/ @devops (migration 148 + bucket) · **Epic:** Lançamentos · **Branch:** feat/lancamentos-05-checklist-anexos · **Complexidade:** M-L (3-5 pontos)
- **quality_gate_tools:** [typecheck, lint, verificação das tabelas/bucket no banco]

## Story
**As a** usuário do board, **I want** checklist e anexos nos cartões, **so that** eu quebre tarefas em subitens e guarde arquivos junto ao cartão.

## Escopo
**IN:**
1. Migration 148 — `lancamento_card_checklist` + `lancamento_card_attachments` (RLS sem policy) + bucket privado `lancamentos`.
2. API checklist: `GET`/`POST /cards/[id]/checklist`, `PATCH`/`DELETE /cards/[id]/checklist/[itemId]`.
3. API anexos: `GET`/`POST (upload) /cards/[id]/attachments`, `DELETE /cards/[id]/attachments/[attId]`, `GET /cards/[id]/attachments/[attId]/signed-url` (download 1h). Padrão do módulo Pastas (bucket privado + admin client).
4. Modal — bloco Checklist (barra de progresso, marcar/adicionar/excluir) + bloco Anexos (upload até 25MB, download, remover).
5. Face do cartão + contadores no `[id]/page` — badge de checklist (x/y, verde quando completo) e de anexos.

**OUT:** fornecedores (Story 6/7).

## Acceptance Criteria
1. Adicionar/marcar/excluir itens de checklist reflete na barra e nos badges do cartão.
2. Upload de arquivo (≤25MB) aparece na lista; download abre via signed URL; remover apaga do banco e do bucket.
3. Badges de checklist/anexos aparecem na face do cartão e atualizam ao mexer no modal.
4. Tudo gated; bucket privado (sem acesso público).
5. typecheck/lint limpos; tabelas + bucket criados.

## File List
- `supabase/migrations/148_lancamento_card_extras.sql`
- `packages/web/src/app/api/lancamentos/cards/[id]/checklist/route.ts` · `checklist/[itemId]/route.ts`
- `packages/web/src/app/api/lancamentos/cards/[id]/attachments/route.ts` · `attachments/[attId]/route.ts` · `attachments/[attId]/signed-url/route.ts`
- `packages/web/src/app/dashboard/lancamentos/_components/lancamento-card-modal.tsx` · `lancamento-board.tsx`
- `packages/web/src/app/dashboard/lancamentos/[id]/page.tsx`

## Change Log
- 2026-07-02 — @sm/@po/@dev/@qa — Checklists + anexos (bucket privado). tsc 0, lint 0. Handoff @devops (migration 148).
