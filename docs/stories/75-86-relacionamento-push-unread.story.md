# Story 75-86 — Chat de Relacionamento: push de nova conversa + indicador de lida/não-lida

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** feat/75-86-relacionamento-push-unread · **Complexidade:** M (3-5 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, teste do unread + push helper]

## Story
**As a** gerente de relacionamento (Samara), **I want** (1) receber push quando um cliente responde no Chat de
relacionamento e (2) ver quais conversas já li ou não, **so that** eu não perca mensagens e saiba o que falta atender.

## Contexto
Chat de relacionamento = `/dashboard/chat` (conversas `is_relationship=true`). Hoje: a Nicole notifica a gerente
SÓ no 1º roteamento (cliente da base encaminhado); **mensagens seguintes não notificam**. E **não há indicador de
lida/não-lida** (lista mostra todas igual). O corretor já tem o padrão de não-lida (`conversations.broker_last_read_at`
+ msgs `role='user'` posteriores → `get_broker_unread_total`) — **reusamos** (relationship convos não vivem no chat
do corretor, então sem cross-talk; sem migration).

## Escopo
**IN:**
1. **Push ao responder (relacionamento):** novo helper `notifyRelationshipOnReply` (espelha `notify-on-reply`):
   quando chega mensagem inbound numa conversa `is_relationship`, push (best-effort) aos usuários ativos com role
   `gerente-relacionamento`. Disparado no webhook, no ramo "já é relacionamento" (1º roteamento já notifica). Push-only.
2. **Lida/não-lida:**
   - Ao abrir `/dashboard/chat/[id]`, marca `conversations.broker_last_read_at = now()` (vira lida).
   - Lista `/dashboard/chat`: por conversa, conta msgs `role='user'` posteriores ao `broker_last_read_at` → mostra
     **indicador de não-lida** (nome em negrito + bolinha/contador); lidas ficam normais.
   - Badge no menu **"Chat"** (sidebar dashboard) com o total de conversas/mensagens não-lidas de relacionamento.

**OUT:**
- Estado de leitura é COMPARTILHADO (inbox de relacionamento é compartilhado; ler por qualquer um = lido). Read
  por-usuário seria tabela nova — fora de escopo. Não muda a lógica da Nicole/IA.

## Acceptance Criteria
1. **Given** um cliente responde numa conversa de relacionamento, **then** os usuários `gerente-relacionamento`
   recebem push com deep-link `/dashboard/chat/{id}`.
2. **Given** a lista do chat, **then** conversas com msgs do cliente posteriores ao último read aparecem como
   **não-lidas** (negrito + indicador); as demais, normais.
3. **Given** que abro uma conversa, **then** ela passa a contar como lida (sem indicador na volta à lista).
4. **Given** não-lidas existentes, **then** o menu "Chat" mostra badge com a contagem; 0 → sem badge.
5. typecheck/lint limpos; teste do cálculo de não-lida + do helper de push.

## Dev Notes
- Reusar `countUnreadForLead`/`get_broker_unread_total` (lib/broker/unread-count). `broker_last_read_at` já existe.
- Push: `sendPushToUser` aos `users` ativos com `role='gerente-relacionamento'`. Best-effort (nunca lança).
- route-inbound.ts: ramo `if (conv?.is_relationship) return true` (~L70) → chamar o push antes de retornar.
- chat list em `dashboard/chat/page.tsx`; detail em `dashboard/chat/[id]/page.tsx`; badge em `dashboard/layout.tsx` (NAV_ITEM_CHAT).

## File List
- `packages/web/src/lib/relacionamento/notify-relationship-on-reply.ts` — NOVO (push).
- `packages/web/src/lib/relacionamento/route-inbound.ts` — chama o push no ramo relacionamento.
- `packages/web/src/app/dashboard/chat/page.tsx` — indicador de não-lida.
- `packages/web/src/app/dashboard/chat/[id]/page.tsx` — marca lida ao abrir.
- `packages/web/src/app/dashboard/layout.tsx` — badge do menu Chat.
- testes.

## QA Results
- **Verdict: PASS.** Push: `notifyRelationshipOnReply` (gerente-relacionamento ativos, deep-link /dashboard/chat/{id})
  chamado no webhook (ramo "já é relacionamento"). Unread: reusa `broker_last_read_at`; lista mostra negrito+dot+contador,
  abrir o detalhe marca lida, badge no menu Chat = nº de convs não-lidas. 
- Real (prod): `broker_last_read_at` existe, 1 gerente-relacionamento ativo (Samara), **6 convs não-lidas** agora (badge correto, bate com a tela). 4 testes novos + 24 do relacionamento (sem regressão), tsc/lint 0.
- Caveat: estado de leitura é COMPARTILHADO (inbox de relacionamento) — ler por qualquer um = lido.

## Change Log
- 2026-06-30 — @sm/@po — Story criada e validada (GO). Push + lida/não-lida no chat de relacionamento (reusa padrão do corretor).
