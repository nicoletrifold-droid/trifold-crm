# Story 75-315 — Perfis de Acesso 2.0 · F4-2: o god-gate fatiado

**Story ID:** 75-315 · **Status:** InReview · **Estimativa:** M (~5 pts)
**Fluxo:** @sm → @po GO(9/10) → @dev/@data-engineer → @qa → @devops · **mig 229 APLICADA e verificada em prod**

## Resumo

A decisão "a matriz manda nos DADOS" executada: **61 policies regeneradas** a partir do
pg_policies de PROD (não de memória) — todas as que usavam `is_admin_or_supervisor()` (42),
`is_admin()` (9) e `user_role()='admin'`/arrays inline (10) agora decidem por
`has_capability('<ação do domínio>')`, com os ramos de dono/participante/cliente preservados
VERBATIM. **Verificação pós-aplicação: 0 policies restantes com o god-gate; 57 via
has_capability.**

## Prova usuário-a-usuário (pré-aplicação)

Simulação velho×novo para TODOS os usuários ativos nos 6 domínios-chave: **13 deltas, todos
True→False, zero concessão indevida** — exatamente as caronas aprovadas (Joabe/Thielly perdem
DADOS de clientes/imóveis/obras; Samara/Ana Luiza perdem leads/KB; nenhuma tela deles usava —
os fluxos privilegiados usam admin client). + o corte decidido: **obras fora de
conversas.ver_qualquer** (seed atualizado em prod e no registro).

## Verificações pós-aplicação

- god-gate em policies: **0** · has_capability em policies: **57** ✓
- Toda tabela com ALL fatiada tem SELECT próprio (kanban/properties/units/brokers/... ×15
  conferidas) — leituras gerais intactas ✓
- **RLS ao vivo, PostgREST autenticado como admin real: 5/5** (leads, obras, conversations,
  knowledge_base, clientes retornam linhas) ✓
- `chamados.apagar` e `conversas.ver_qualquer` agora ENFORCED (a RLS obedece a matriz —
  aparecem na matriz/exceções com efeito real): **96/102**.

## Fora desta story (F4-3/F5, anotado)

`users_update_admin` (estrutura admin-qualquer × GC-só-corretor sem capability equivalente) ·
`leads_select_consultoria` (mundo imob, dedicada) · RPCs/views com role interno
(pipeline_funnel ×2, creative_performance ×2, log_pii_access, roleta_pick_and_advance
[precisa de user_has_capability(p_user_id) — o check é no CANDIDATO, não no caller], v_* ×4).

## QA — PASS (94)

O padrão "gerar do pg_policies + simular velho×novo por usuário + verificar por query" é o
teto de rigor que uma mudança de RLS em prod sem staging permite. O falso-alarme do smoke
(páginas vazias) foi corretamente atribuído ao dev server (flake conhecido) e DESMENTIDO
pelo teste direto no PostgREST — a ordem certa de diagnóstico. Sem concerns bloqueantes;
observação: monitorar prod nas próximas horas (qualquer 403/tela vazia inesperada = olhar
policy da tabela).
