# Story 75-39 — Kill switch para pausar notificações do portal do cliente

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** S (1 ponto)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]

## Story
**As a** gestor de obras, **I want** pausar temporariamente as notificações do portal do
cliente (foto/documento/mensagem/progresso) em todos os canais (WhatsApp + e-mail + push),
**so that** clientes que ainda não receberam login não recebam avisos de novidades que não
conseguem acessar — retomando quando o rollout de logins terminar.

## Contexto
Pedido do usuário (2026-06-23). O dispatcher `notifyClientes` (lib/notificacoes.ts) dispara
e-mail + WhatsApp (template `atualizacao_obra_cliente`) + push a cada nova foto/documento/
mensagem/progresso. Como o envio de logins aos clientes ainda está em andamento, clientes
sem acesso recebem avisos confusos. Precisamos de uma chave reversível, sem deletar config
nem código, que retoma só removendo a variável e redeployando. `whatsapp_config` é
compartilhado (corretor também usa) e NÃO deve ser tocado.

## Escopo
**IN:**
- Flag `PORTAL_NOTIF_PAUSED` (env): quando `"1"`/`"true"`, `notifyClientes` retorna cedo
  e não dispara NENHUM canal (WhatsApp, e-mail, push).
- Helper `portalNotificacoesPausadas()` exportado p/ legibilidade/teste.
- Log informativo quando pausado.
**OUT:** UI de toggle; pausar por canal individual; mexer em `whatsapp_config`; notificações
de corretor/roleta (não afetadas).

## Acceptance Criteria
1. Com `PORTAL_NOTIF_PAUSED=1` (ou `true`), nenhum cliente recebe notificação do portal
   (e-mail, WhatsApp e push), independente das preferências.
2. Sem a variável (ou com qualquer outro valor), o comportamento atual é preservado.
3. Notificações de corretor/roleta/lead seguem inalteradas.
4. Retomar = remover a variável no Vercel e redeployar (sem mudança de código).
5. typecheck e lint limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.39-pausar-notificacoes-portal-cliente.yml`)
- **typecheck/lint:** limpos.

## File List
- `packages/web/src/lib/notificacoes.ts`
