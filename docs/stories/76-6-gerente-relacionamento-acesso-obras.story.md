# Story 76-6 — gerente-relacionamento herda acesso a Obras (como o perfil obras)

## Metadata
- **Status:** Done · **Epic:** 76 · **Branch:** main · **Complexidade:** S (1 ponto)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [migration]

## Story
**As a** gerente de relacionamento (Samara), **I want** ver e gerir as Obras como o perfil
obras, **so that** eu continue com o acesso que tinha antes (ela veio do perfil obras).

## Contexto
Bug (2026-06-24): Samara via o menu Obras mas a lista vinha vazia (0 obras). Causa: a RLS de
`obras` (e sub-tabelas) libera dados via `is_admin_or_supervisor()`, que incluía
admin/supervisor/obras/gerente-comercial — mas NÃO gerente-relacionamento. O perfil obras vê
as obras justamente por estar nessa função. Fix: adicionar `gerente-relacionamento` à função.
A navegação continua governada pelos módulos (canAccess) — a RLS só destrava os dados.

## Escopo
**IN:** migration 111 — `CREATE OR REPLACE is_admin_or_supervisor()` incluindo
`gerente-relacionamento` (aplicada em prod via Management API).
**OUT:** mudar módulos/permissões de UI (já corretos na 75-41).

## Acceptance Criteria
1. Samara (gerente-relacionamento) vê e gerencia Obras e sub-páginas (fotos/docs/fases/clientes/mensagens da obra) como o perfil obras.
2. Navegação dela segue restrita aos módulos do perfil (RLS só destrava dados).
3. Demais perfis inalterados.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/76.6-gerente-relacionamento-acesso-obras.yml`)

## File List
- `supabase/migrations/111_gerente_relacionamento_rls.sql` (aplicada em prod)
