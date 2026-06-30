# Story 75-87 — Módulo "IMOB" (placeholder) para imobiliárias externas

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** feat/75-87-modulo-imob · **Complexidade:** XS (1 ponto)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]

## Story
**As a** admin/supervisor, **I want** um menu "IMOB" na navegação, **so that** futuramente eu gerencie as
imobiliárias externas que ajudam na venda dos empreendimentos. Por ora, só o item de menu + página placeholder
(novas diretrizes da função virão depois).

## Escopo
**IN:**
- **Sidebar do dashboard:** item **"IMOB"** (ícone `Handshake`) **logo abaixo do "Fluxo de Pagamento"**, gate
  hardcoded **admin/supervisor** (não passa pelo sistema de permissões enquanto a função é definida — mesmo
  padrão do Bolsão 75-73).
- **Página placeholder** `/dashboard/imob` ("Em breve") com **guard de acesso** (redirect p/ /dashboard se não
  for admin/supervisor).

**OUT:**
- Nenhuma funcionalidade do IMOB (definida em story futura). Não aparece no nav do corretor.

## Acceptance Criteria
1. **Given** admin ou supervisor no /dashboard, **then** vê "IMOB" na sidebar abaixo do "Fluxo de Pagamento".
2. **Given** outros perfis (corretor/obras/gerente-*), **then** NÃO veem o item; e a rota `/dashboard/imob` redireciona p/ /dashboard.
3. typecheck/lint limpos.

## Dev Notes
- `dashboard/layout.tsx`: `showImob = admin||supervisor`; `imobItem` no `afterRoleta` após o `fluxoItem`.
- Quando a função for definida: migrar gate p/ permissões de módulo (ver [[project-roles-permissoes]]) e endurecer guards.

## File List
- `packages/web/src/app/dashboard/layout.tsx` — item IMOB abaixo do Fluxo de Pagamento (admin/supervisor).
- `packages/web/src/app/dashboard/imob/page.tsx` — placeholder + guard.

## QA Results
- **Verdict: PASS.** Menu IMOB (Handshake) abaixo do Fluxo de Pagamento, gate admin/supervisor; página placeholder
  com redirect p/ não-admin/supervisor. type-check 0, lint 0. Sem funcionalidade (placeholder, conforme pedido).

## Change Log
- 2026-06-30 — @sm/@po/@dev — Módulo IMOB criado (só menu + placeholder, admin/supervisor). Diretrizes da função a definir.
