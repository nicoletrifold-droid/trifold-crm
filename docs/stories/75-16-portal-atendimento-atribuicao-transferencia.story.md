# Story 75-16 — Portal: atendente responsável, transferência e participantes

## Metadata
- **Status:** InReview
- **Epic:** 58 — Portal do Cliente / Atendimento
- **Branch:** main

## Context
As conversas do portal (`obra_mensagens`, dupla obra+cliente) eram uma caixa compartilhada — sem dono. Necessidade: toda nova conversa de cliente cair para um **atendente padrão (configurável, começando na Samara)**; durante o atendimento, **transferir/devolver** a conversa entre usuários; e **adicionar participantes**.

Modelo (migration 107): `obra_conversas` (obra+cliente, `assigned_to`, `status`) + `obra_conversas_participants` + `organizations.portal_atendente_padrao_id`. Como `is_admin_or_supervisor()` cobre admin/supervisor/obras/gerente-comercial, toda a equipe já enxerga as conversas — atribuição/participantes servem para roteamento, organização e (Fase 3) notificação.

## Acceptance Criteria
### Fase 1 — atribuição + roteamento + transferência (esta entrega)
- [x] AC1: Migration 107 cria `obra_conversas`, `obra_conversas_participants`, `organizations.portal_atendente_padrao_id` + RLS (staff gerencia; participante vê as suas).
- [x] AC2: Quando o cliente envia mensagem (texto ou upload), a conversa é criada (se nova) e **atribuída ao atendente padrão da org**; se já existe, é reaberta. Helper `lib/portal/conversa.ts` (admin client).
- [x] AC3: Endpoint `GET/PATCH /api/admin/mensagens/conversa` retorna estado (atendente, participantes, staff) e transfere/atribui (valida usuário da org).
- [x] AC4: Na conversa do dashboard, barra mostra **Atendente** (select para transferir/devolver) — UI `ConversaAtendente` no `conversation-panel`.

### Fase 2 — participantes (esta entrega)
- [x] AC5: Endpoint `POST/DELETE /api/admin/mensagens/conversa/participants` adiciona/remove participante. UI: chips + "Adicionar" na barra da conversa.

### Fase 3 — aviso à equipe (PENDENTE — próximo bloco)
- [ ] AC6: Quando o cliente envia mensagem, notificar (push/e-mail) o atendente responsável (+ participantes).

### Config (PENDENTE — próximo bloco)
- [ ] AC7: Tela de Config para escolher o atendente padrão (por ora semeado direto no banco = Samara).

## Out of Scope (por ora)
- Filtro "minhas/não atribuídas/todas" e exibição do atendente na LISTA da caixa (mostra na conversa aberta). Pode entrar depois.
- Participante de role fora do staff (broker) com leitura via RLS de `obra_mensagens` — hoje participantes são staff (já enxergam).

## Dependencies
- Migration 107 aplicada em prod. Após aplicar: semear `organizations.portal_atendente_padrao_id` = Samara.

## Complexity
- **T-shirt:** L (migration + 2 tabelas + roteamento + 2 endpoints + UI).

## Risks
- Médio. RLS nova de conversas/participants; roteamento usa admin client (cliente não tem RLS). Verificar pós-deploy.

## File List
- `supabase/migrations/107_portal_atendimento_conversas.sql` (new)
- `packages/web/src/lib/portal/conversa.ts` (new)
- `packages/web/src/app/api/cliente/obras/[obra_id]/mensagens/route.ts` (routing)
- `packages/web/src/app/api/cliente/obras/[obra_id]/mensagens/upload/route.ts` (routing)
- `packages/web/src/app/api/admin/mensagens/conversa/route.ts` (new — GET/PATCH)
- `packages/web/src/app/api/admin/mensagens/conversa/participants/route.ts` (new — POST/DELETE)
- `packages/web/src/app/dashboard/mensagens/_components/conversa-atendente.tsx` (new — UI)
- `packages/web/src/app/dashboard/mensagens/_components/conversation-panel.tsx` (mount)

## Dev Notes (@dev / Dex)
- Roteamento: `ensureConversaAtribuida` (admin client) chamado no envio + upload do cliente; cria atribuída ao atendente padrão ou reabre.
- Conversa endpoint GET retorna também `staff` (usuários atribuíveis) para alimentar transferência/participantes sem depender de /api/users.
- type-check 0 erros; eslint sem erros novos (1 warning pré-existente em upload/route).

## QA Results (@qa / Quinn)
**Veredito: PASS (Fase 1+2, estático)** — schema + roteamento + transferência + participantes implementados; RLS modelada; UI na conversa. type-check/eslint OK. Pendente: aplicar migration 107 + semear Samara; Fase 3 (notificação) e Config UI ficam para o próximo bloco. Verificar pós-deploy (rotear→Samara, transferir, participantes).

## Change Log
- @sm/@po/@dev/@qa: Fase 1+2 criada, implementada, QA PASS (estático). Pendente migration 107 + push.
