# Story 75-312 — Perfis de Acesso 2.0 · F3-11: Configurações & Usuários via capabilities

**Story ID:** 75-312 · **Status:** InReview · **Estimativa:** S (~3 pts)
**Fluxo:** @sm → @po GO(9/10) → @dev → @qa → @devops (esteira contínua)

## Resumo

**10 capabilities enforced (78 no total)**: usuarios.criar/editar/trocar_perfil (morre o 4º
proxy `canAccess("sistema")` — botão Novo usuário + RoleDropdown), **perfis.gerenciar** (as 5
server actions que EDITAM a própria matriz — updatePermission/createRole/deleteRole/exceções —
agora obedecem à matriz, com exceção individual podendo delegar), configuracoes.empresa_editar,
pipeline_editar [A] + pipeline_followup [A,S], integracoes_gerenciar (Google ×3),
atendente_padrao_ver [staff-5] / _editar [A,S]. GET /api/users = a TELA
`configuracoes.usuarios` (mesma chave da matriz). STAFF_ROLES da rota do atendente sobrevive
SÓ como seleção de candidatos, congelada ao seed por teste. `/api/admin/roles` (lookup de
labels p/ 5 perfis) classificado ESCOPO — segue como está. GERENTE_ALLOWED (cards da tela de
config p/ GC) = composição de telas, segue role-based (nota p/ F5).

## Evidências

Espelho estrito ×10 congelado · smoke 9/9 (APIs users/atendente 200; botão Novo usuário;
6 ações na matriz — incluindo a matriz se auto-gateando por perfis.gerenciar) ·
suíte **2350 passed** · tsc 0 · eslint 23 · build 0.

## QA — PASS (95)

Ponto alto: perfis.gerenciar fecha o ciclo — a matriz governa até quem governa a matriz
(admin bypass garante que ninguém se tranca fora; exceção individual NEGANDO perfis.gerenciar
a um admin é possível e honrada — feature, documentada). Sem concerns.
