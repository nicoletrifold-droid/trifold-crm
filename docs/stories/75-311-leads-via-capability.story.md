# Story 75-311 — Perfis de Acesso 2.0 · F3-10: Leads via capabilities

**Story ID:** 75-311 · **Status:** InReview · **Estimativa:** M (~4 pts)
**Fluxo:** @sm → @po GO(9/10) → @dev → @qa → @devops (esteira contínua)

## Resumo

**15 capabilities enforced (68 no total)** — o módulo mais denso em regras de dono. Rotas:
criar (o furo nº5 do inventário — tela permite GC/SDR, API nega — PRESERVADO e agora VISÍVEL
na matriz), editar_qualquer/apagar/reativar/atribuir/transferir/mover_etapa_qualquer/
acoes_em_massa/anotar_qualquer (com os ramos de DONO e de mundo IMOB intactos — escopo) e as
4 ações de IA fatiadas (handoff [A,S] · retomar [A,S,GC,SDR] · resumo [A,S] · analisar
[+broker no próprio lead]). UI: filtro por corretor (ver_equipe), canReactivate, seletor de
corretor no /new. **Morreram**: o 3º proxy `canAccess("sistema")` (bulk), a MANAGER_ROLES,
o `isAdmin` MORTO da tela de leads (era warning de lint — base caiu 24→23).

`leads.ver_equipe` enforced pela UI; o DADO em si continua na RLS (F4, god-gate).
Drawer "Transferir Corretor" (client, role via JWT) fica como dica de UI — gate real é a
rota assign (migrada); anotado p/ F5.

## Evidências

Espelho estrito ×15 congelado · smoke 10/10 · suíte **2348 passed** · tsc 0 ·
**eslint 23 (MELHOR que a base 24)** · build 0 · 2 testes de rota adaptados (mock pelo seed).

## QA — PASS (95)

O furo tela×API do criar agora é VISÍVEL na matriz (leads.criar sem GC/SDR) — decidir alinhar
é 1 toggle do Marcos, não código. Ramos de dono conferidos um a um (notes/notify/resume/
behavior mantêm o fallback de identidade). Sem concerns novos.
