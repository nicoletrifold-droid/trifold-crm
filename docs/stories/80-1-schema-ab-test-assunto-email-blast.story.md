# Story 80-1 — Schema: colunas de teste A/B de assunto em email_blasts e email_logs

## Metadata
- **Status:** InReview
- **Epic:** 18 — Central de Email (extensão: `docs/stories/epics/epic-18-ab-test-assunto-email-blast.md`)
- **Branch:** main

## Context
Primeira story do epic de Teste A/B de Assunto no Email Blast. Antes de qualquer mudança de UI ou lógica de envio, o schema precisa suportar:
- Marcar um blast como "teste A/B ativo"
- Guardar as duas versões de assunto (A e B)
- Marcar, por email enviado (`email_logs`), qual variante ele recebeu

**Decisão de produto (já fechada):** o sistema **não decide vencedor** — só mapeia/exibe números (taxa de abertura e clique) por variante, para o usuário analisar manualmente. Por isso, **não há coluna de "vencedor"** nesta migration — decisão deliberada, não omissão.

Tabelas existentes (migration `018_email_central.sql`):
- `email_blasts`: id, org_id, name, template_id, subject_override, segment_filter, total_recipients, sent_count, status, scheduled_for, started_at, completed_at, created_by, created_at
- `email_logs`: id, org_id, template_id, resend_email_id, to_email, to_name, subject, status, error_message, variables_used, tags, triggered_by, sent_at, delivered_at, opened_at, clicked_at, bounced_at, created_at

## Acceptance Criteria
- [x] AC1: Nova migration adiciona `email_blasts.ab_test_enabled BOOLEAN NOT NULL DEFAULT false`
- [x] AC2: Nova migration adiciona `email_blasts.subject_variant_a TEXT` (nullable)
- [x] AC3: Nova migration adiciona `email_blasts.subject_variant_b TEXT` (nullable)
- [x] AC4: Nova migration adiciona `email_logs.variant TEXT` (nullable) com `CHECK (variant IS NULL OR variant IN ('a','b'))`
- [x] AC5: Nenhuma coluna de "vencedor"/"winner" é criada — confirmar que a migration não inclui isso
- [x] AC6: Migration é idempotente (`ADD COLUMN IF NOT EXISTS`) e não quebra nenhuma query/RLS policy existente sobre as duas tabelas
- [x] AC7: Numeração do arquivo de migration reconfirmada imediatamente antes da criação (não assumir "169" sem checar `ls supabase/migrations/ | sort -V | tail -3` no momento da implementação — repositório tem múltiplas sessões concorrentes criando migrations)

## Out of Scope
- Qualquer mudança de UI (wizard, listagem) — stories 80.2 a 80.5
- Lógica de split de audiência ou envio — story 80.3
- Qualquer coluna ou lógica de "vencedor automático" — decisão de produto já fechada: não existe

## Dependencies
- Nenhuma bloqueante. Reusa tabelas já existentes de `018_email_central.sql`.

## Complexity
- **T-shirt:** P (migration pequena, 4 colunas, sem lógica de aplicação).

## Business Value
Base necessária para todo o epic de A/B de assunto — sem essas colunas, nenhuma story seguinte (UI, split, agregação) pode avançar.

## Risks
- Baixo. Colunas nullable/com default não afetam linhas existentes nem queries atuais sobre `email_blasts`/`email_logs`. Único cuidado real é a numeração da migration em ambiente com múltiplas sessões concorrentes (AC7 cobre isso).

## Definition of Done
- ACs atendidos, migration aplicada em dev antes de prod (conforme convenção do projeto), lint/typecheck OK, QA gate PASS, commit/push via @devops.

## File List
- `docs/stories/80-1-schema-ab-test-assunto-email-blast.story.md` (this file)
- `supabase/migrations/170_email_blast_ab_test_assunto.sql`

## Dev Notes (@dev / Dex)
- **AC7 confirmado na prática:** "169" (calculado antes da implementação) já estava reservado por outra branch remota em andamento (`feat(billing)`, arquivo `169_service_billing_reminders_last_alerted.sql`) — descoberto via `git ls-tree` em todas as branches remotas antes de criar o arquivo. Usei **170**, que estava livre em todas as branches checadas.
- Migration aplicada via Supabase Management API (mesmo método já documentado em memória de sessões anteriores) — **dev primeiro** (`xnxvygyfyyyzwhiuoehz`), depois **produção** (`dsopqkqjkmhytudaaolv`), conforme convenção do projeto.
- Projeto dev estava pausado (`INACTIVE`, plano free) no momento da implementação — precisou de `POST /restore` via Management API e esperar ficar `ACTIVE_HEALTHY` antes de aplicar.
- Verificação pós-aplicação em ambos os ambientes via `information_schema.columns` (as 4 colunas) e `pg_constraint` (a CHECK constraint) — confirmado idêntico em dev e prod.
- Nenhuma coluna de índice novo criada nesta story, conforme decidido no Dev Notes original — Story 80.4 decide se precisa na hora de escrever a query de agregação.

## QA Results (@qa / Quinn)
_Pendente — aguardando QA gate._

## Change Log
- @sm (River): story criada em Draft a partir do epic de Teste A/B de Assunto (docs/stories/epics/epic-18-ab-test-assunto-email-blast.md), primeira de 5 stories do epic.
- @po (Pax): validação via checklist de 10 pontos → **GO** (10/10). Status Draft → Ready.
- @dev (Dex): migration 170 criada, aplicada e verificada em dev e prod. Status Ready → InReview. Pronta para @qa *qa-gate.
