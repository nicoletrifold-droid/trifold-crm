# Story 75-317 — Perfis de Acesso 2.0 · F5 (FINAL DO ÉPICO): limpeza

**Story ID:** 75-317 · **Status:** InReview · **Estimativa:** XS (~2 pts)
**Fluxo:** @sm → @po GO(9/10) → @dev → @qa → @devops (esteira contínua)

## Resumo

Fechamento do épico — as pontas soltas viram fonte única ou decisão documentada:

1. **Constantes-dica agora LEEM o seed** (fonte única, sem congelamento por teste):
   `OPENING_PRIVILEGED_ROLES` = seed de conversas.abrir_template · `STAFF_ROLES` do Chat =
   seed de chat.responder · candidatos a atendente padrão = seed de atendente_padrao_ver ·
   a dica do drawer "Transferir Corretor" = seed de leads.atribuir.
2. **Decisões documentadas NO CÓDIGO** (não em memória de sessão):
   - Whitelist do middleware (obras/GR) = ROTEAMENTO DE MUNDO, não autorização — fica
     role-based de propósito (gates reais: capabilities nas APIs + RLS).
   - `getHardcodedPermissions` MANTIDA — rede de segurança p/ org sem seed / falha
     transitória; não é fonte de verdade (o seed da matriz manda).
   - `leads_select_consultoria` = policy dedicada permanente (isolamento de segmento).
   - Cards de hub (Config/Nicole) = composição de telas por perfil — role-based, fora
     do modelo de ações.

## Evidências

Suíte **2354 passed** · tsc 0 · eslint 23 · build 0.

## QA — PASS (96) — e veredito de fechamento do ÉPICO

**Perfis de Acesso 2.0 COMPLETO (F1→F5, Stories 75-300..317, PRs #403-420, migs 225-230):**
- **97/102 capabilities com efeito real** (matriz + exceções + clonar perfil, app E banco);
  os 5 não-enforced são estruturais/UX com teste e justificativa.
- ~300 checagens hardcoded eliminadas no app; **zero decisão por nome de role no banco**
  (exceção: policies de segmento/mundo, documentadas).
- 6 furos de segurança corrigidos; billing isolado por flag de plataforma.
- Mudanças de comportamento: APENAS as 4 aprovadas pelo Marcos por pergunta direta.
- 2.354 testes verdes; zero regressão em 18 stories.
