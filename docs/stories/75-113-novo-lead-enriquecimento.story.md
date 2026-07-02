# Story 75-113 — Campos de enriquecimento também no "Novo Lead"

## Metadata
- **Status:** InReview — @dev + @qa · pronto p/ @devops (sem migration) · **Epic:** Leads · **Branch:** feat/75-113-novo-lead-enriquecimento · **Complexidade:** S (1 ponto)
- **quality_gate_tools:** [typecheck, lint]

## Story
Estende a Story 75-112: os mesmos campos de perfil (Observação, Finalidade, Orçamento, Prazo de compra, Forma de pagamento) agora também no cadastro manual **Novo Lead** (`/dashboard/leads/new`), pra já entrar preenchido.

## Escopo
**IN:** `app/dashboard/leads/new/page.tsx` — server action `createLead` lê os 5 campos do form e grava no upsert; UI ganha os 3 selects (Finalidade/Prazo/Forma, via `lib/leads/enrich`) + Orçamento (texto) + Observação (textarea). Valores vazios → null (respeita os CHECK da migration 154).

**OUT:** nada de banco (colunas já existem — 154). Auto-preenchimento pelo Meta = follow-up.

## Acceptance Criteria
1. "Novo Lead" mostra os 5 campos; ao cadastrar, gravam no lead e aparecem no Editar/leitura.
2. Selects gravam valores válidos; vazio → null (CHECK ok).
3. typecheck/lint limpos.

## File List
- `packages/web/src/app/dashboard/leads/new/page.tsx`

## Change Log
- 2026-07-02 — @dev/@qa — Enriquecimento no cadastro manual de lead. tsc 0, lint 0. Sem migration. Handoff @devops.
