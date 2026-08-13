# Story 75-313 — Perfis de Acesso 2.0 · F3-12 (FINAL): Sistema, Roleta, Corretores, Nicole & Agente

**Story ID:** 75-313 · **Status:** InReview · **Estimativa:** M (~4 pts)
**Fluxo:** @sm → @po GO(9/10) → @dev → @qa → @devops (esteira contínua) — **fecha a F3**

## Resumo

**16 capabilities enforced — TOTAL FINAL: 94 de 102 com gate real.**
- **Sistema**: auditoria_ver (system-events, audit-logs ×2, webhook-logs, /sistema/logs),
  emails_gerenciar (settings/templates/automações/stats/logs — 8 rotas), emails_disparar
  (blasts ×4, send-quick, resend — 6 rotas). ⚠️ billing-panel/billing-reminders NÃO migram:
  são permissão de PLATAFORMA (decisão do épico — `is_platform_admin` fora da matriz, F4).
- **Roleta**: configurar (config/schedule/fila ×5) · distribuir_manual [A,S].
- **Corretores**: gerenciar [A,GC] (brokers ×2).
- **Nicole**: personalidade_editar [A] (agent-config, agent-prompts ×3, action + página),
  treinamento_gerenciar [A,S,GC] / treinamento_apagar [A] (KB + página, incl. o branch de
  entradas do site), midia_gerenciar [A,S,GC] / midia_enviar (biblioteca + envio a lead).
- **Agente (Lídia)**: contexto_crm [A] e contexto_criativo [A,S,GC] — os helpers
  `isAdmin`/`isAdminOrSupervisor` de `lib/agent/auth-helpers` viraram async via can()
  (docstrings/contratos das Stories 52-x atualizados) — confirmar_acoes [A] · ver_log [A,S].
- **Alertas**: followup_ver [A,S].

**Não-enforced FINAIS (todos com teste garantindo):** bolsao.puxar / puxar_dashboard
(estruturais — pegar_lead_bolsao exige linha em brokers; can() de admin mentiria),
roleta.atender_todo_empreendimento (vive na RPC — F4), dashboard.ver_equipe (UX),
obras.solicitar_exclusao (fluxo), conversas.ver_qualquer (RLS — F4),
imob.imobiliarias_gerenciar (guard composto usa pastas.gerenciar; F3 do IMOB decidirá),
configuracoes.horario_editar (a TELA decide hoje — nota).
Cards do hub Nicole/Config (composição por role) seguem role-based — nota F5.

## Evidências

Espelho estrito ×16 congelado (37 sites de API + 6 páginas/helpers) · smoke 13/13 ·
suíte **2353 passed** · tsc 0 · eslint 23 · build 0 · zero `role !== "admin"` inline nos
diretórios migrados · 1 teste adaptado (roleta/config, mock pelo seed).

## QA — PASS (95) — e veredito de fechamento da F3

12 stories, ~300 checagens hardcoded eliminadas, 94 capabilities com gate real, 4 proxies
`canAccess("sistema")` mortos, 6 constantes duplicadas/divergentes eliminadas, 2 migrations
aditivas (226/227) aplicadas com verificação, zero regressão em 2.353 testes. Os 8 não-
enforced restantes têm teste + justificativa cada. Pronto para F4 (RLS) — que herda a lista
de decisões: consultoria×Obras, furo criar-lead, is_platform_admin, god-gate.
