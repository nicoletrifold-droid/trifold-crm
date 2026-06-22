---
name: project-epic52
description: Epic 52 — Agente de Tráfego com Acesso Read-Only ao Pipeline do CRM; Stories 52-1, 52-4, 52-3 e 52-2 criadas (Draft 2026-06-15); 52-3 revisada (v0.2) — painel de midia para todos; 52-2 revisada (v0.2) — gate isAdmin explícito para CRM, midia sem regressao para todos os roles
metadata:
  type: project
---

## Epic 52 — Agente de Tráfego Read-Only ao Pipeline CRM

Objetivo: Dar ao agente de tráfego pago (persona "gestor sênior de tráfego pago Meta Ads") acesso de LEITURA ao pipeline comercial do CRM, para cruzar mídia paga × funil de vendas.

**Driving questions:**
- "Qual campanha traz os leads que mais fecham?"
- "Qual o CPL real considerando quem chegou a visitar / fechar?"
- "Onde os leads de cada campanha travam no funil?"

**Why:** Hoje o agente só enxerga `meta_campaigns`, `meta_insights_daily`, `meta_alerts` e uma fatia de `leads` — sem cruzamento com funil ou conversas.

**How to apply:** Stories do epic 52 devem sempre preservar as decisões travadas (acesso admin-only, read-only absoluto, profundidade total incluindo conversas e PII).

## Decisões Travadas (não reabrir)
1. ACESSO ADMIN-ONLY — somente `role = 'admin'`; supervisor/obras/gerente-comercial FORA
2. READ-ONLY ABSOLUTO — enforcement técnico (não só prompt); sem INSERT/UPDATE/DELETE pelo caminho do agente
3. PROFUNDIDADE = TUDO — agregados + drill de lead + conteúdo de conversa (PII inclusa)

## Sequenciamento de Stories (travado no épico)
| ID | Titulo | Status | Depende de |
|----|--------|--------|------------|
| 52-1 | Camada de Leitura Read-Only do Pipeline | Draft 2026-06-15 | — |
| 52-4 | Auditoria de Acesso a PII | — | 52-1 |
| 52-3 | Guard Admin-Only + Read-Only Enforcement | Draft 2026-06-15 | 52-1 |
| 52-2 | Injeção de Contexto Integrado no Agente | — | 52-1, 52-3, 52-4 |
| 52-5 | UX da Resposta Integrada | Draft 2026-06-15 | 52-2 |

**CRÍTICO:** 52-2 NÃO pode iniciar antes de 52-3 e 52-4. PII só flui para o modelo após guards + auditoria existirem.

## Âncoras Técnicas (Epic 52)
- Agente existente: `packages/web/src/lib/agent/context-builder.ts` (`buildGlobalContext`), `system-prompt.ts` (`AGENT_SYSTEM_PROMPT`)
- Endpoint: `packages/web/src/app/api/agent/chat/route.ts`
- Tabelas do agente: `agent_chat_sessions`, `agent_chat_messages` (migration 078)
- Tabelas-base pipeline: `leads`, `kanban_stages`, `conversations`, `conversation_state`, `messages` (migration 001; RLS em 004)
- NÃO usar `is_admin_or_supervisor()` (migration 084) — ampla demais (CON-2)
- Verificação de role: `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'`

## Story 52-4 — Notas Críticas (Draft criada 2026-06-15)
- Migration: `097_agent_pii_access_log.sql` (confirmar numeração via `ls supabase/migrations/`)
- Tabela `agent_pii_access_log`: `id`, `org_id`, `admin_user_id`, `session_id` (nullable FK), `accessed_at`, `data_type` (CHECK: 'lead_drill'|'conversation_content'|'aggregated_metrics'), `scope` JSONB, `view_or_source`
- Função `public.log_pii_access(...)` RETURNS BOOLEAN — SECURITY DEFINER, verifica role admin internamente, retorna FALSE em qualquer falha (fail-safe)
- GRANT SELECT, INSERT apenas — sem UPDATE/DELETE (append-only duplo: GRANT + RLS)
- Contrato fail-closed para 52-2: chamar `log_pii_access` ANTES de expor PII ao modelo; se retornar FALSE ou erro → NEGAR acesso sensível
- `'aggregated_metrics'` no enum por completude; fail-closed opcional para esse tipo (decisão da 52-2)
- Executor: @data-engineer; Quality Gate: @dev

## Story 52-3 — Notas Críticas (v0.2 revisada 2026-06-15 com decisao PO)
- SEM migration — TypeScript puro; executor: @dev; Quality Gate: @qa
- DECISAO PO TRAVADA: somente capacidade CRM e admin-only; painel de midia mantido para todos os roles sem regressao
- 3 arquivos modificados (previsao revisada): cancel/route.ts + confirm/route.ts + auth-helpers.ts (novo)
- Rotas que ganham `requireRole`: APENAS POST /api/agent/action/cancel (confirm ja tem; chat NAO recebe guard)
- `action/cancel/route.ts` NAO tem guard — bug de assimetria fechado por esta story
- `action/confirm/route.ts` JA TEM guard — apenas hardening da whitelist (ALLOWED_ACTION_TYPES constante; 400→403)
- NOVO: utilitario `isAdmin(user): boolean` exportado de `packages/web/src/lib/agent/auth-helpers.ts` — verificacao estrita `user.role === 'admin'`; contrato documentado em JSDoc para consumo pela 52-2
- NAO modificar: rotas de chat, pages-server de campaigns-meta, AgentChatPanel (FAB continua para todos)
- AMBIGUIDADE RESOLVIDA pelo PO: painel de midia permanece para todos os roles; AC7 garante nao-regressao explicita

## Story 52-5 — Notas Críticas (Draft criada 2026-06-15)
- SEM migration — TypeScript/React puro; executor: @ux-design-expert (coordenar com @dev)
- Scope minimo: (1) FunnelBar CSS-only sem biblioteca de chart; (2) robustez do parser de tabela `renderMarkdown` para valores `fmtBRL`/`fmtPct`; (3) empty state atualizado com perguntas de pipeline
- RECOMENDACAO RIVER: mesclar itens 2 e 3 na 52-2 como subtarefas triviais; manter 52-5 somente se @po quiser FunnelBar como entrega separada
- Convencao de marcacao do bloco FunnelBar deve ser acordada com 52-2 ANTES de implementar T3 (bloqueia T3)
- Arquivo principal: `packages/web/src/components/agent/agent-chat-panel.tsx`
- Renderizador markdown JA suporta tabelas (linhas 43-60 do arquivo) — FR-9 ~80% coberto pelo baseline

## Story 52-2 — Notas Críticas (v0.2 revisada 2026-06-15 com decisao de produto travada)
- SEM migration — TypeScript puro; executor: @dev; Quality Gate: @qa
- DECISAO STAKEHOLDER TRAVADA: SOMENTE CRM e admin-only; analise de midia (Meta Ads) continua para todos os roles SEM REGRESSAO
- Gate explícito: `const isAdmin = appUser.role === 'admin'` em `chat/route.ts` ANTES de qualquer helper de pipeline
- Bloco `if (isAdmin)`: chama `fetchPipelineAggregates` (eager) + `fetchLeadDrill`/`fetchLeadConversations` on-demand (fail-closed via `log_pii_access`)
- Bloco sem isAdmin: contexto de midia intacto, sem chamada a nenhum helper de pipeline (nem log)
- RLS da 52-1 e backstop (0 rows para non-admin), mas a aplicacao nao tenta buscar para economizar custo e reforcar defesa em profundidade
- AC13: non-admin nao recebe CRM (verificavel via logs); midia funciona normalmente
- AC14: admin recebe CRM conforme regras (agregados eager + on-demand fail-closed)
- R9: vazamento de CRM por gate ausente — mitigacao: bloco condicional explícito + RLS backstop + cenario de teste 12 por role
- Dependência crítica de 52-3: campo `appUser.role` disponível em `chat/route.ts` + padrão `isAdmin` estrito

## Story 52-1 — Notas Críticas
- Migration: `096_crm_pipeline_readonly_layer.sql` (próxima livre confirmada)
- 4 views: `v_pipeline_funnel_by_campaign`, `v_pipeline_stage_distribution`, `v_lead_drill`, `v_lead_conversations`
- `v_lead_drill` EXCLUI `phone` e `email` (minimização de PII)
- `v_lead_conversations` inclui PII/conteúdo sensível — RLS admin-only explícita
- Contrato de dados para 52-2: documentado na seção Dev Notes da story (placeholder; confirmado após implementação de T4)
- RLS: SECURITY INVOKER vs DEFINER — @data-engineer decide e documenta no Change Log
- Executor: @data-engineer; Quality Gate: @dev
