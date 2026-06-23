# Story 75-25 — Conversas (dashboard) estilo chat + filtro por corretor (gerente/supervisor/admin)

## Metadata
- **Status:** Done
- **Epic:** 75 (ajustes operacionais / UX)
- **Branch:** main (mudança incremental, padrão do repo)
- **Complexidade:** M (3 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]

## Story

**As a** gerente-comercial (e também supervisor/admin),
**I want** a tela de Conversas do dashboard na mesma experiência de chat do corretor,
   com filtro por corretor,
**so that** eu veja todas as conversas dos corretores, entre numa específica e ajude a
   destravar negociações — filtrando pelo corretor quando precisar.

## Contexto

Pedido do usuário (conversa 2026-06-23). Diagnóstico (exploração do código):
- Gerente-comercial **já** vê todas as conversas (RLS `is_admin_or_supervisor`, M084),
  **já** tem o menu "Conversas" (permissão `conversas`=true no banco) e **já** pode
  responder (`/dashboard/conversas/[id]`, `gerente-comercial` em `CAN_SEND_ROLES`).
- Ao responder, o lead vê o nome do atendente (`buildTransitionText(lead.name, appUser.name)`).
- **Faltava:** a tela `/dashboard/conversas` é uma tabela simples, sem filtros e sem
  mostrar de qual corretor é cada conversa.

`LeadFilters` (`@web/components/lead-filters`) já suporta o filtro de Corretor (prop
`brokers`, param `broker_id`) + Etapa/Empreendimento/Sem-contato. A página `/broker/chat`
já tem o layout de cards. Esta story leva esse layout para o dashboard e liga o filtro.

## Escopo

**IN:**
- Reescrever `/dashboard/conversas/page.tsx` no estilo chat (cards) espelhando
  `/broker/chat`, mas listando TODAS as conversas ativas (RLS já amplia p/ gestão).
- Filtros: busca (`LeadSearch`), Etapa, Empreendimento, **Corretor** e Sem-contato
  (`LeadFilters` com `brokers`). Aplicados em JS (q/stage/property/broker_id/days).
- Cada card mostra o **corretor responsável** e linka para `/dashboard/conversas/[id]`.
- Vale para gerente-comercial, supervisor e admin (mesma página, todos veem tudo).

**OUT:**
- Página de detalhe/resposta `/dashboard/conversas/[id]` (já funciona — sem mudança).
- Permissões / RLS (já cobrem os três perfis).
- Chat do corretor `/broker/chat` (inalterado).

## Acceptance Criteria
1. `/dashboard/conversas` exibe cards (avatar, nome, preview, horário, badges canal/empreendimento/etapa) como `/broker/chat`, listando TODAS as conversas ativas.
2. Filtro **Corretor** aparece e filtra as conversas pelo `assigned_broker_id` do lead.
3. Busca + filtros Etapa/Empreendimento/Sem-contato funcionam (JS).
4. Cada card mostra o corretor responsável e abre `/dashboard/conversas/[id]` ao clicar.
5. Funciona para gerente-comercial, supervisor e admin.
6. typecheck e lint limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.25-...yml`, quality_score 90)
- **typecheck/lint:** limpos.
- **Embed corretor:** validado em prod (leads.assigned_broker_id → users).
- **Nota:** filtro "Sem contato" (dias) é no-op, igual ao /broker/chat (evita Date.now no render).

## File List
- `packages/web/src/app/dashboard/conversas/page.tsx` (reescrita)
