# Story 75-316 — Perfis de Acesso 2.0 · F4-3 (FINAL da F4): RPCs, views e unificação

**Story ID:** 75-316 · **Status:** InReview · **Estimativa:** S (~3 pts)
**Fluxo:** @sm → @po GO(9/10) → @dev/@data-engineer → @qa → @devops · **mig 230 APLICADA e verificada em prod**

## Resumo

O último role-check do banco morreu. Mig 230 (corpos regenerados de
pg_get_functiondef/pg_views, nunca de memória):

1. **`user_has_capability(p_user_id, key)`** — resolução POR USUÁRIO (o check da roleta é
   sobre o corretor CANDIDATO, não sobre quem chama a RPC).
2. **`roleta_pick_and_advance`**: o bypass hardcoded `role='sdr'` virou
   `user_has_capability(candidato, 'roleta.atender_todo_empreendimento')` — enforced
   (**97/102**). Verificado: Thielly (SDR) true; corretores false.
3. **RPCs do agente**: pipeline_funnel ×2 e log_pii_access → `agente.contexto_crm`;
   creative_performance ×2 → `agente.contexto_criativo`.
4. **Views v_* ×4** (contexto CRM da Lídia) → `agente.contexto_crm`, com
   `security_invoker=on` PRESERVADO (verificado por reloptions).
5. **`users_update_admin`** reescrita: `usuarios.editar AND (usuarios.trocar_perfil OU
   alvo-é-corretor)` — preserva "admin edita qualquer; GC só corretores" e generaliza
   para perfis futuros via matriz.
6. **`has_module_access()` DROPADA** — as 6 policies que a usavam (brindes ×4, bolsão,
   broker_assignments) unificadas em `has_capability()` (resolução idêntica p/ módulo).

`leads_select_consultoria` fica como policy dedicada PERMANENTE (leitura do mundo imob —
policy genérica por módulo vazaria p/ corretor; lição da consultoria de 08/07).

## Gotchas de geração (registrados p/ o futuro)

- Corpos de função qualificam chamadas (`public.f()`) — substituição QUALIFICADA-PRIMEIRO,
  senão nasce `public.public.f()`.
- `public.public_user_id()` é função legítima — assert de duplicação tem que ser
  `public.public.` (com ponto), senão falso-positivo.
- 2 aplicações abortadas limpas pela transação implícita antes da 3ª correta — zero
  estado parcial em todas.

## Evidências

Verificações em prod 6/6 (resíduos=0 nas funções; views admin-gate=0; security_invoker=on ×4;
has_module_access=0; bypass da roleta por capability; users policy via capability) ·
suíte **2354 passed** · tsc 0 · eslint 23 · build 0.

## QA — PASS (95)

F4 completa: ZERO decisão de acesso por nome de role no banco (a exceção documentada é a
policy dedicada do mundo imob, que é isolamento de segmento, não role-gate). Sem concerns.
