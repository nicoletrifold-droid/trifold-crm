# Story 76-5 — Tirar o perfil Obras do inbox central de Mensagens

## Metadata
- **Status:** Done · **Epic:** 76 · **Branch:** main · **Complexidade:** S (1 ponto)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]

## Story
**As a** gestor, **I want** que o perfil Obras não acesse o inbox central de Mensagens,
**so that** a comunicação com clientes fique restrita a admin/supervisor/gerente-relacionamento.

## Contexto
Decisão (Q4) do usuário. Nuance encontrada: o perfil `obras` já tem `mensagens=false` no
`role_permissions` (a página `/dashboard/mensagens` já fica oculta p/ Ana Luiza/Teste Obras).
O resíduo era o `"obras"` nas APIs do inbox central (`/api/admin/mensagens/*`). Esta story
remove esse resíduo (defesa em profundidade). NÃO mexe nas mensagens por obra
(`/api/admin/obras/[obra_id]/mensagens/*`), que são parte do trabalho do perfil Obras.

## Escopo
**IN:** remover `"obras"` de `ALLOWED_ROLES`/`STAFF_ROLES` em `api/admin/mensagens/route.ts`,
`conversa/route.ts`, `conversa/participants/route.ts` (mantém gerente-relacionamento).
**OUT:** mensagens por obra (obra detail); módulo Chat (76-4).

## Acceptance Criteria
1. APIs do inbox central de Mensagens não aceitam mais o role `obras`.
2. gerente-relacionamento/supervisor/admin seguem com acesso.
3. Mensagens por obra (obra detail) inalteradas. typecheck/lint limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/76.5-tirar-obras-do-mensagens.yml`)

## File List
- `packages/web/src/app/api/admin/mensagens/route.ts`
- `packages/web/src/app/api/admin/mensagens/conversa/route.ts`
- `packages/web/src/app/api/admin/mensagens/conversa/participants/route.ts`
