# Story 76-7 — Middleware: liberar /dashboard/chat p/ gerente-relacionamento

## Metadata
- **Status:** Done · **Epic:** 76 · **Branch:** main · **Complexidade:** S (1 ponto)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]

## Story
**As a** gerente de relacionamento (Samara), **I want** abrir o módulo Chat sem ser
redirecionada, **so that** eu acesse as conversas de relacionamento.

## Contexto
Bug (2026-06-24): clicar em "Chat" jogava de volta pra /dashboard/obras. Causa: a middleware
restringe obras/gerente-relacionamento a uma allow-list de paths e `/dashboard/chat` não
estava nela (adicionado o role na 75-41, mas o path do Chat veio depois na 76-4).

## Escopo
**IN:** adicionar `!pathname.startsWith("/dashboard/chat")` à allow-list em `lib/supabase/middleware.ts`.
**OUT:** outras rotas.

## Acceptance Criteria
1. gerente-relacionamento abre /dashboard/chat (e subrotas) sem redirect.
2. Demais restrições do perfil inalteradas.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/76.7-middleware-libera-chat-gerente-relacionamento.yml`)

## File List
- `packages/web/src/lib/supabase/middleware.ts`
