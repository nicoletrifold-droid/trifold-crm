# Story 75-112 — Editar Lead: campo Observação + enriquecimento do perfil

## Metadata
- **Status:** InReview — @dev + @qa · pronto p/ @devops (migration 154) · **Epic:** Leads · **Branch:** feat/75-112-lead-observacao-enriquecimento · **Complexidade:** M (2-3 pontos)
- **quality_gate_tools:** [typecheck, lint, verificação das colunas/constraints no banco]

## Story
**As a** qualquer usuário que edita o lead (admin/supervisor/gerente-comercial ou o corretor dono), **I want** um campo de Observação livre + campos de perfil (finalidade, orçamento, prazo, forma de pagamento) no Editar Lead, **so that** a equipe entenda melhor o perfil do lead.

## Escopo
**IN:**
1. Migration 154 — `leads` += `observacao text`, `finalidade text` (CHECK moradia/investimento/ambos), `orcamento text`, `prazo_compra text` (CHECK imediato/ate_3m/3_6m/mais_6m), `forma_pagamento text` (CHECK financiamento/a_vista/fgts/consorcio). Todos nullable.
2. `lib/leads/enrich.ts` — opções + labels (values batem com os CHECK).
3. `api/leads/[id]` PATCH — os 5 campos entram em `allowedFields` (mesmo gate de edição já existente).
4. Formulários de Editar Lead (dashboard + corretor) — Observação (textarea full-width) + Finalidade/Prazo/Forma (selects) + Orçamento (texto).
5. Leitura: dashboard (`InfoRow`) + painel do corretor (`<dl>`) exibem os campos preenchidos.

**OUT:** formulário de CRIAR lead (`/dashboard/leads/new`) — pode entrar depois; auto-preencher finalidade a partir do form do Meta — futuro.

## Acceptance Criteria
1. Editar Lead mostra os 5 campos; salvar persiste; visível na leitura (dashboard + corretor).
2. Editável por admin/supervisor/gerente-comercial e pelo corretor dono (gate existente do PATCH).
3. Selects gravam valores válidos (CHECK não rejeita); Observação/Orçamento livres.
4. typecheck/lint limpos; colunas + constraints criadas.

## File List
- `supabase/migrations/154_leads_enriquecimento.sql`
- `packages/web/src/lib/leads/enrich.ts`
- `packages/web/src/app/api/leads/[id]/route.ts`
- `packages/web/src/app/dashboard/leads/[id]/_components/dashboard-lead-edit-form.tsx` · `edit-lead-toggle.tsx` · `page.tsx`
- `packages/web/src/app/broker/leads/[id]/_components/lead-edit-form.tsx` · `lead-details-panel.tsx` · `page.tsx`

## Change Log
- 2026-07-02 — @sm/@po/@dev/@qa — Observação + finalidade/orçamento/prazo/forma de pagamento no Editar Lead (dashboard+corretor) + leitura. tsc 0, lint 0. Handoff @devops (migration 154 aplicada).
