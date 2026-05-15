---
name: Story 30.2 FASE 1 entregue (ultima do Epic 30)
description: Story 30.2 FASE 1 entregue 2026-05-14; mig 038 com 2 cols + funcao + trigger AFTER INSERT + backfill 27 rows; FASE 2 (@dev page.tsx) pendente
type: project
---

Story 30.2 — ULTIMA story do Epic 30. FASE 1 (data-engineer) entregue em 2026-05-14.

Trabalho realizado:
- Migration `038_conversations_last_message_preview_remote_only.sql` criada (slot 038 confirmado livre).
- 5 statements aplicados via Management API:
  1. ALTER conversations ADD last_message_preview text (1622ms)
  2. ALTER conversations ADD last_message_role varchar(20) (1498ms)
  3. CREATE OR REPLACE FUNCTION public.update_conversation_last_msg (1743ms, plpgsql, single-row UPDATE)
  4. DROP+CREATE TRIGGER trg_messages_update_conv AFTER INSERT ON messages (2178ms, multi-stmt no mesmo POST OK)
  5. Backfill UPDATE DISTINCT ON (1540ms, 27 conversations)
- Tracking 038 registrado em supabase_migrations.schema_migrations.
- Trigger validado com INSERT manual + cleanup (DELETE + UPDATE re-backfill).
- EXPLAIN ANALYZE da query consumidora: 0.513ms exec / 3ms planning (Seq Scan pelo volume baixo de 27 rows).
- Build PASS.

Decisoes / dados confirmados no spike:
- conversations.last_message_at JA EXISTE (mig 010) - apenas atualizamos via trigger
- messages.role valores reais: 'user', 'assistant' (max 9 chars, varchar(20) com folga)
- Volume backfill: 27 conv / 365 msgs / 27 conv with msgs - 1 UPDATE unico (sem batches)
- Zero triggers concorrentes em messages

Why: epic 30.2 era a ultima e mais arriscada (trigger em tabela hot messages). Volume real em prod e baixo (365 msgs) entao trigger overhead e desprezivel.

How to apply: padrao plpgsql AFTER INSERT + dollar-quote $UPDATE_FUNC$ no JSON da Management API funciona perfeitamente. Multi-statement (DROP+CREATE TRIGGER) num so POST OK. INSERT/SELECT em chamadas separadas para evitar CTE snapshot.

Proximo: FASE 2 (@dev) - reescrever packages/web/src/app/dashboard/conversas/page.tsx para usar last_message_preview da query unica de conversations (remover fetch separado de messages).
