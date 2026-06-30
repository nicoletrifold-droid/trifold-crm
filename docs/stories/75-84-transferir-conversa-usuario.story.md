# Story 75-84 — Transferir conversa para outro usuário (admin/supervisor)

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** feat/75-84-transferir-conversa · **Complexidade:** M (3-5 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, teste do endpoint (permissão, motivo, roteamento), validação real]

## Story
**As a** admin/supervisor acompanhando as conversas, **I want** transferir uma conversa para outro usuário
(corretor ou atendente de chat), **so that** quem deve atender realmente assuma — com motivo registrado.

## Contexto
Tela `/dashboard/conversas/[id]`. Hoje não há como reatribuir a conversa. Modelos de atendimento (verificado):
corretor atende em `/broker` (por `leads.assigned_broker_id`); quem tem o módulo `chat` (admin, supervisor,
**gerente-relacionamento**) atende em `/dashboard/chat` (por `conversations.is_relationship=true`, caixa
compartilhada). Cliente/obras não têm caixa de atendimento.

## Escopo
**IN:**
1. **Botão "Transferir conversa"** abaixo das mensagens em `/dashboard/conversas/[id]`, **só admin/supervisor**.
2. Ao clicar: modal com **seleção do usuário destino** (lista = corretores **+** usuários com módulo `chat`:
   admin/supervisor/gerente-relacionamento) **+ caixa de motivo OBRIGATÓRIA**.
3. **Endpoint** `POST /api/leads/[id]/transferir` (admin/supervisor): valida motivo e destino; reatribui
   `leads.assigned_broker_id = destino`; roteia a conversa:
   - destino **corretor** → `is_relationship=false` (cai em `/broker`);
   - destino **com módulo chat** → `is_relationship=true` (cai em `/dashboard/chat`).
   - `is_ai_active=false` (IA não reassume após transferência manual).
   - registra `activities` type `transfer` com `{from_user_id, to_user_id, motivo}`; **push** ao destino.
4. Efeito: corretor antigo **perde a conversa** (RLS por `assigned_broker_id`); destino é notificado e passa a vê-la.

**OUT:**
- Não cria caixa de chat por-usuário (a de relacionamento é compartilhada — limitação aceita).
- Não mexe em roleta/bolsão/SLA (transferência é reatribuição manual deliberada).

## Acceptance Criteria
1. **Given** admin/supervisor na conversa, **then** vê o botão "Transferir"; **given** outros perfis, **then** NÃO vê (e o endpoint recusa — 403).
2. **Given** transferência sem motivo, **then** bloqueia (UI) e o endpoint recusa (400).
3. **Given** destino corretor, **then** `assigned_broker_id=destino`, `is_relationship=false`; o corretor antigo deixa de ver; o destino vê em `/broker` e recebe push.
4. **Given** destino com módulo chat (ex.: gerente-relacionamento), **then** `assigned_broker_id=destino`, `is_relationship=true`; aparece em `/dashboard/chat`; push ao destino.
5. **Given** destino sem perfil de atendimento (cliente/obras/gerente-comercial sem chat), **then** o endpoint recusa (não está na lista).
6. **Given** a transferência, **then** há 1 `activities` type `transfer` com motivo e from/to.
7. typecheck/lint limpos; teste do endpoint (permissão, motivo, roteamento corretor x chat).

## Dev Notes
- Página: `dashboard/conversas/[id]/page.tsx` (server). Lista de destino: roles com módulo `chat` (via
  `role_permissions`+`roles`, can_access) ∪ `broker`; users ativos nesses roles. `is_relationship` no destino =
  role tem módulo chat.
- Push: `sendPushToUser`; URL = `/dashboard/chat` (relationship) ou `/broker/leads/{id}` (corretor).
- `assigned_broker_id` guarda user_id (vale p/ não-broker também; RLS leads_select usa `public_user_id()`).

## File List
- `packages/web/src/app/dashboard/conversas/[id]/page.tsx` — busca destinos + render do botão (admin/supervisor).
- `packages/web/src/app/dashboard/conversas/[id]/_components/transfer-conversa.tsx` — modal client (select + motivo).
- `packages/web/src/app/api/leads/[id]/transferir/route.ts` — endpoint.
- `packages/web/src/app/api/leads/[id]/transferir/route.test.ts` — testes.

## QA Results
- **Verdict: PASS.** Endpoint `POST /api/leads/[id]/transferir` (admin/supervisor): valida motivo (400), destino
  válido (corretor OU role com módulo chat, senão 422), reatribui `assigned_broker_id`, roteia conversa
  (`is_relationship` corretor=false/chat=true + `is_ai_active=false`), activity `transfer` c/ motivo, push ao destino.
  UI: botão abaixo das mensagens só p/ admin/supervisor + modal com select + motivo obrigatório.
- Real (prod): query de roles-chat retorna admin/gerente-relacionamento/supervisor; `conversations.is_relationship`
  existe; `activities.type` varchar. 6 testes (permissão/motivo/roteamento/inválido/mesmo-dono). type-check 0, lint 0.

## Change Log
- 2026-06-30 — @sm/@po — Story criada e validada (GO). Lista de destino confirmada (corretor→corretor incluído).
  Motivo obrigatório. Roteamento por perfil (corretor=/broker, chat=/dashboard/chat).
