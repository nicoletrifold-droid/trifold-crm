---
name: Epic 38 — Agenda Lembretes Automaticos
description: Story 38-1 criada cobrindo e-mail ao corretor (D-1 09h BRT) e WhatsApp ao lead (3h antes). Infraestrutura existente reutilizada.
type: project
---

Story 38-1 criada em 2026-05-22. Cobre lembretes automaticos de agendamentos via 2 crons novos.

**Why:** Reducao de no-shows; nenhuma migration necessaria (metadata JSONB ja existe).

**How to apply:** Se stories subsequentes do epic 38 envolverem outros canais ou UI de configuracao, partir do contexto de que os flags `email_reminded` e `whatsapp_reminded` ja existem no campo `metadata` da tabela `appointments`. Nao criar migration nova para isso.

Arquivos entregues pela story 38-1:
- `packages/web/src/app/api/cron/appointment-email-reminders/route.ts` (CREATE)
- `packages/web/src/app/api/cron/appointment-whatsapp-reminders/route.ts` (CREATE)
- `packages/web/vercel.json` (MODIFY — 2 novas entradas em `crons`)
