# Story Lançamentos-06 — Cadastro global de Fornecedores

## Metadata
- **Status:** InReview — @dev + @qa · pronto p/ @devops (migration 149) · **Epic:** Lançamentos · **Branch:** feat/lancamentos-06-fornecedores · **Complexidade:** M (2-3 pontos)
- **quality_gate_tools:** [typecheck, lint, verificação da tabela no banco]

## Story
**As a** admin/supervisor/obras, **I want** um cadastro global de fornecedores, **so that** eu reutilize os mesmos fornecedores em qualquer lançamento (vínculo no cartão = Story 7).

## Escopo
**IN:**
1. Migration 149 — tabela `fornecedores` (nome, razão social, CNPJ, categoria, status, contato, cidade/UF, endereço, site, obs; RLS sem policy). Modelada em `imobiliarias`.
2. `lib/lancamentos/fornecedores.ts` — tipo + status/labels/tones + categorias (chave/label/cor) + validação.
3. API `POST /api/lancamentos/fornecedores` + `PATCH`/`DELETE /[id]` (gated).
4. Página `/dashboard/lancamentos/fornecedores` — tabela (categoria com cor, contato, CNPJ, status) + filtros (categoria/status/busca) + modal criar/editar/excluir.
5. Botão **Fornecedores** no header do índice de lançamentos.

**OUT:** vínculo fornecedor↔cartão (Story 7).

## Acceptance Criteria
1. Criar/editar/excluir fornecedor funciona; nome obrigatório.
2. Filtros por categoria/status e busca por nome/CNPJ funcionam.
3. Botão "Fornecedores" no índice leva à tela; tudo gated pelo módulo.
4. typecheck/lint limpos; tabela criada.

## File List
- `supabase/migrations/149_fornecedores.sql`
- `packages/web/src/lib/lancamentos/fornecedores.ts`
- `packages/web/src/app/api/lancamentos/fornecedores/route.ts` · `[id]/route.ts`
- `packages/web/src/app/dashboard/lancamentos/fornecedores/page.tsx` · `_components/fornecedores-manager.tsx`
- `packages/web/src/app/dashboard/lancamentos/_components/lancamentos-manager.tsx` (botão Fornecedores)

## Change Log
- 2026-07-02 — @sm/@po/@dev/@qa — Cadastro global de fornecedores. tsc 0, lint 0. Handoff @devops (migration 149).
