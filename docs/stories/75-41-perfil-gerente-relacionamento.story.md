# Story 75-41 — Perfil "Gerente de Relacionamento" (clone do perfil Obras)

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** M (3 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]

## Story
**As a** admin, **I want** um novo perfil de acesso "Gerente de Relacionamento" com
exatamente os mesmos privilégios do perfil "Obras", **so that** eu possa reclassificar a
Samara (e futuros) sem perder nenhum acesso que ela tem hoje.

## Contexto
Pedido do usuário (2026-06-23): criar o perfil e mover samara@trifold.eng.br de "obras" para
ele. Privilégios da Samara = perfil obras (módulos `obras`/`brindes`/`chamados`) + exceções
individuais dela (`configuracoes`, `mensagens`, que ficam no usuário). Porém grande parte do
acesso "obras" é gated por ~37 checagens HARDCODED pelo nome literal `"obras"` no código
(APIs de obras, clientes, brindes, mensagens admin, imóveis-edit, middleware, login). Por
isso, além de criar o role + matriz, é preciso adicionar `"gerente-relacionamento"` em todas
essas checagens para os privilégios serem REALMENTE idênticos.

## Escopo
**IN:**
- DB: novo role `gerente-relacionamento` (label "Gerente de Relacionamento") na org +
  `role_permissions` = matriz da obras (`obras`/`brindes`/`chamados` = true, resto false).
- Código: adicionar `"gerente-relacionamento"` em TODAS as checagens de role com `"obras"`
  (arrays ALLOWED_ROLES/STAFF_ROLES/requireRole/IMOVEIS_EDIT_ROLES/includes; inline
  `=== "obras"`/`!== "obras"` em documentos, fotos, solicitar-exclusão, login, middleware);
  `getHardcodedPermissions` ganha `case "gerente-relacionamento"` (fallback).
- DB (pós-deploy): `users.role` da Samara `obras` → `gerente-relacionamento`.
**OUT:** mudar privilégios da obras; afetar Ana Luiza / Teste Obras (seguem "obras"); UI nova.

## Acceptance Criteria
1. Novo role aparece em Configurações › Perfis de Acesso com a matriz obras/brindes/chamados.
2. Usuário "gerente-relacionamento" tem acesso idêntico ao "obras" em TODAS as rotas gated
   (obras CRUD, fotos/docs em fila de aprovação, solicitar-exclusão, clientes admin, brindes,
   mensagens admin, imóveis-edit, middleware de paths, redirect de login p/ /dashboard/obras).
3. Exceções individuais da Samara (configuracoes/mensagens) continuam valendo (são do usuário).
4. obras, Ana Luiza e Teste Obras inalterados.
5. Samara passa a "gerente-relacionamento" (após deploy) sem perda de acesso.
6. typecheck e lint limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.41-perfil-gerente-relacionamento.yml`)
- **typecheck/lint:** limpos.

## File List
- DB: `roles` + `role_permissions` (gerente-relacionamento); `users` (Samara) pós-deploy
- ~40 arquivos de checagem de role (ALLOWED_ROLES/STAFF_ROLES/requireRole/inline)
- `packages/web/src/lib/permissions.ts` (getHardcodedPermissions)
- `packages/web/src/lib/permissions-imoveis.ts` (IMOVEIS_EDIT_ROLES)
