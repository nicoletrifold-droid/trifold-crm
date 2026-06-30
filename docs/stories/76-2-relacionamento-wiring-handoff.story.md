# Story 76-2 — Wiring no webhook + handoff de relacionamento (cliente → Samara)

## Metadata
- **Status:** Done · **Epic:** 76 · **Branch:** main · **Complexidade:** M (3 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, test]

## Story
**As a** sistema, **I want** que, ao identificar (alta confiança por telefone) que o contato
do WhatsApp já é cliente da base de obras, a conversa vire RELACIONAMENTO — saia do funil de
leads, a Nicole pare de responder e a Samara seja avisada, **so that** o cliente não seja
tratado como lead nem caia em corretor sem contexto.

## Contexto
Continuação do épico 76 (doc do usuário). Usa o helper da 76-1. Decisões confirmadas:
(1) Nicole manda uma mensagem curta de encaminhamento antes de silenciar; (2) o cliente sai
do funil (`leads.is_active=false`); (3) Samara é avisada por push+e-mail já nesta story.

## Escopo
**IN:**
- Migration 110: `conversations` ganha `is_relationship`, `relationship_checked`,
  `relationship_cliente_id`, `relationship_obra_id` + índice parcial.
- `lib/relacionamento/route-inbound.ts`: `maybeRouteInboundToRelationship` — gate no inbound
  (só roda enquanto não classificada; ignora lead já atribuído a corretor); em `phone_match`:
  marca relacionamento + handoff (is_ai_active=false), arquiva o lead, envia msg de
  encaminhamento, notifica a Samara. Helper puro `actionFromIdentify` testado.
- `lib/relacionamento/notify-relationship.ts`: push+e-mail à(s) gerente(s) de relacionamento.
- Webhook `whatsapp/route.ts`: chama o gate antes do pipeline da Nicole; se tratado, Nicole não responde.
**OUT:** caso por nome/ambíguo + perguntar qual obra (múltiplas) + resumo de contexto (76-3);
módulo Chat/UI + resposta da Samara (76-4); visibilidade/remover Obras do Mensagens (76-5).

## Acceptance Criteria
1. Inbound de telefone que casa com cliente da base → conversa marcada `is_relationship`,
   `is_ai_active=false`, lead `is_active=false`; Nicole não responde como bot de lead.
2. Cliente recebe a mensagem curta de encaminhamento; ela é registrada em `messages`.
3. Gerente(s) de relacionamento recebem push+e-mail.
4. Conversa já marcada relacionamento → Nicole segue silente (sem re-notificar).
5. Lead já atribuído a corretor NÃO é sequestrado (marca checked e segue normal).
6. name/ambíguo → fluxo normal por ora (sem marcar checked, p/ 76-3 tratar). typecheck/lint/test limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/76.2-relacionamento-wiring-handoff.yml`)
- **typecheck/lint/test:** limpos (20 testes em lib/relacionamento).

## File List
- `supabase/migrations/110_conversations_relationship.sql` (novo; aplicada em prod)
- `packages/web/src/lib/relacionamento/route-inbound.ts` (novo) + `.test.ts`
- `packages/web/src/lib/relacionamento/notify-relationship.ts` (novo)
- `packages/web/src/app/api/webhook/whatsapp/route.ts` (gate antes do pipeline da Nicole)
