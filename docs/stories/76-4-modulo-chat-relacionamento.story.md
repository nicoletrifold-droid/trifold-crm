# Story 76-4 — Módulo Chat (Relacionamento) + resposta da Samara via WhatsApp

## Metadata
- **Status:** Done · **Epic:** 76 · **Branch:** main · **Complexidade:** L (5 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, test]

## Story
**As a** gerente de relacionamento (Samara), **I want** uma tela de Chat com as conversas de
clientes encaminhadas e poder responder por WhatsApp (texto/áudio/arquivo), **so that** eu
atenda os clientes que a Nicole identificou — fechando o ciclo do épico 76.

## Contexto
Decisão do usuário: composer completo (reusa a infra de WhatsApp do corretor, incl. o áudio
consertado na 75-40). Descoberta: a RLS de `leads`/`conversations`/`messages` exige
admin/supervisor/corretor-dono — a gerente-relacionamento (role novo) não passa. Por isso o
módulo lê via ADMIN client (após `canAccess("chat")`) e as rotas de envio passam a usar admin
client para o grupo privilegiado (neutro p/ admin/supervisor; habilita a Samara).

## Escopo
**IN:**
- Novo módulo `chat` (permissions-modules + fallback de permissões + role_permissions no banco
  p/ gerente-relacionamento/supervisor/admin) + item no menu (`permissions["chat"]`).
- `/dashboard/chat` (lista de conversas `is_relationship`) e `/dashboard/chat/[id]` (thread +
  `BrokerMessageInput`), ambos com ADMIN client gated por `canAccess("chat")`.
- `send-message` e `send-file`: grupo privilegiado (admin/supervisor/gerente-comercial/
  gerente-relacionamento) lê/escreve via `db = admin client` (neutro p/ os antigos).
**OUT:** caso por nome/ambíguo + perguntar obra (76-3); visibilidade/tirar Obras do Mensagens (76-5).

## Acceptance Criteria
1. Perfil gerente-relacionamento (+ supervisor/admin) vê o item "Chat" e a lista de conversas de relacionamento.
2. Abrir uma conversa mostra a thread; a Samara envia texto/áudio/arquivo e chega no WhatsApp do cliente.
3. Mensagens da Samara aparecem na thread (role=broker).
4. Outros perfis (corretor, obras) NÃO acessam /dashboard/chat (canAccess nega → redirect).
5. Envio do corretor (não-privilegiado) segue inalterado (client de sessão + RLS).
6. typecheck/lint/test limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/76.4-modulo-chat-relacionamento.yml`)
- **typecheck/lint/test:** limpos (20 testes em lib/relacionamento; lint sem erros novos).

## File List
- `packages/web/src/lib/permissions-modules.ts` (módulo `chat`)
- `packages/web/src/lib/permissions.ts` (fallback gerente-relacionamento + chat)
- DB: `role_permissions` chat=true (gerente-relacionamento/supervisor/admin)
- `packages/web/src/app/dashboard/layout.tsx` (NAV_ITEM_CHAT)
- `packages/web/src/app/dashboard/chat/page.tsx` + `[id]/page.tsx` (novos)
- `packages/web/src/app/api/leads/[id]/send-message/route.ts` + `send-file/route.ts` (db admin p/ privilegiado)
