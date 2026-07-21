# Story 82-1 — Schema: ab_test_variable + colunas de template por variante

## Metadata
- **Status:** InReview
- **Epic:** 82 — Teste A/B de Corpo no Email Blast (`docs/stories/epics/epic-82-ab-test-corpo-email-blast.md`)
- **Branch:** main

## Context
Primeira story do Epic 82, que estende o Epic 18 (Done, 5/5 stories) para permitir testar **corpo** do email além de assunto — uma variável por vez, nunca as duas juntas no mesmo blast. Esta story só cria o schema; wizard, envio e UI vêm nas próximas stories (82.2–82.4).

**Nota de processo:** o arquivo do epic (`docs/stories/epics/epic-82-ab-test-corpo-email-blast.md`) foi criado pelo @pm mas ainda não foi commitado (agente PM não tem ferramenta git). Esta story deve commitar o arquivo do epic junto com a migration — mesmo padrão usado quando a Story 80-1 commitou o `epic-18` doc junto com a primeira migration daquele epic.

## Acceptance Criteria
- [x] AC1: Nova migration em `supabase/migrations/` adicionando em `email_blasts`: `ab_test_variable TEXT NOT NULL DEFAULT 'subject' CHECK (ab_test_variable IN ('subject', 'body'))`
- [x] AC2: Migration adiciona `body_variant_a_template_id UUID REFERENCES email_templates(id)` (nullable) e `body_variant_a_slug TEXT` (nullable)
- [x] AC3: Migration adiciona `body_variant_b_template_id UUID REFERENCES email_templates(id)` (nullable) e `body_variant_b_slug TEXT` (nullable)
- [x] AC4: Migration aplicada em dev antes de prod (Supabase Management API, seguir convenção do projeto)
- [x] AC5: `ab_test_variable` com default `'subject'` não quebra nenhum blast já existente (todos os blasts do Epic 18, incluindo os já enviados, continuam válidos — implicitamente "testando assunto")
- [x] AC6: Nenhuma coluna nova em `email_logs` — confirmar que a coluna `variant` (já existente, Epic 18) é suficiente e agnóstica ao que está sendo testado

## Out of Scope
- Wizard (seletor Assunto/Corpo, dropdowns de template) — Story 82.2
- Lógica de split/envio usando o template por variante — Story 82.3
- Endpoint de stats e UI de detalhe — Story 82.4
- Qualquer lógica de vencedor automático — não existe neste epic (herdado do Epic 18)

## Dependencies
- Epic 18 (Done) — schema base (`ab_test_enabled`, `email_logs.variant`) já existe e é reaproveitado

## Complexity
- **T-shirt:** P (migration simples, 5 colunas nullable/com default, sem lógica de aplicação).

## Business Value
Habilita a extensão do teste A/B para testar corpo do email (via templates existentes), respondendo diretamente a uma necessidade real do usuário identificada nesta sessão. Sem esta story, nenhuma das demais do epic pode avançar.

## Risks
- Baixo. Migration puramente aditiva (colunas nullable + 1 coluna com default), sem alteração em colunas/constraints existentes. Único cuidado: confirmar numeração livre no momento da aplicação (repositório de alta concorrência — 182 já foi reservado por outra sessão durante o draft desta story; usar 183 ou o próximo número livre confirmado no momento da implementação).

## Definition of Done
- ACs atendidos, migration aplicada em dev e prod, verificação independente via `information_schema.columns`/`pg_constraint` (mesmo padrão da Story 80-1), QA gate PASS, commit/push via @devops.

## File List
- `docs/stories/82-1-schema-ab-test-corpo-email-blast.story.md` (this file)
- `docs/stories/epics/epic-82-ab-test-corpo-email-blast.md` (criado pelo @pm, commitado junto por não ter o @pm ferramenta git)
- `supabase/migrations/183_email_blast_ab_test_corpo.sql` (novo — número a reconfirmar no momento da implementação)

## Dev Notes (@dev / Dex)
- Reconfirmar numeração da migration antes de criar o arquivo (checar `ls supabase/migrations/` + branches remotos, mesmo processo já usado nas Stories 80-1, 78-1 etc.) — 182 já estava reservado por outra sessão (`182_leads_behavior_analysis.sql`) no momento do draft desta story.
- `body_variant_a_slug`/`body_variant_b_slug` existem para evitar um join extra no momento do envio (Story 82.3) — mesmo padrão já usado para o template principal do blast (`template_slug` é passado separado do `template_id` na criação do blast).
- Aplicar em dev primeiro, depois prod, via Supabase Management API (ver memória de projeto sobre PAT e endpoint de queries diretas).
- Teste de verificação: consulta a `information_schema.columns` confirmando as 5 colunas novas + `pg_constraint` confirmando o CHECK de `ab_test_variable`, em ambos os ambientes.

## Dev Agent Record

### Completion Notes
- AC1-AC3: migration `183_email_blast_ab_test_corpo.sql` criada seguindo exatamente o estilo da migration 170 (Epic 18) — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, constraint via `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` (idempotente).
- AC4: aplicada em dev (`xnxvygyfyyyzwhiuoehz`) primeiro, depois prod (`dsopqkqjkmhytudaaolv`), via Supabase Management API. Projeto dev estava `ACTIVE_HEALTHY` (sem necessidade de restore).
- AC5: verificado via `information_schema.columns` (5 colunas, tipos e nullability corretos) + `pg_constraint` (CHECK correto) em **ambos** os ambientes, independentemente do resultado `[]` do POST de aplicação. Consulta adicional em prod confirmou 0 linhas em `email_blasts` no momento — o `DEFAULT 'subject'` garante retrocompatibilidade de qualquer forma, mesmo se a tabela tivesse dados.
- AC6: nenhuma alteração em `email_logs` — a migration só toca `email_blasts`.
- Reconfirmei numeração da migration (183) imediatamente antes de criar o arquivo — 182 seguia reservado por outra sessão, sem novos conflitos em 183+.

### File List
- `supabase/migrations/183_email_blast_ab_test_corpo.sql` (novo)
- `docs/stories/epics/epic-82-ab-test-corpo-email-blast.md` (commitado junto — criado pelo @pm, sem ferramenta git)
- `docs/stories/82-1-schema-ab-test-corpo-email-blast.story.md` (this file)

## QA Results (@qa / Quinn)
_Pendente — aguardando QA gate._

## Change Log
- @sm (River): story criada em Draft a partir do Epic 82, primeira story. Confirmada numeração de migration livre (183, já que 182 foi reservado por outra sessão concorrente durante o draft). Epic doc do @pm marcado no File List para ser commitado junto por esta story.
- @po (Pax): validação via checklist de 10 pontos → **GO** (10/10). Título claro, contexto completo (inclusive a nota de processo sobre commitar o epic doc junto), 6 ACs testáveis e específicos por coluna/constraint, escopo bem delimitado (Out of Scope lista as 3 próximas stories), dependência do Epic 18 mapeada, complexidade e valor de negócio claros, risco de numeração de migration documentado e reconfirmado nesta validação (183 continua livre — sem colisão com branches remotos). Alinhamento com a seção 82.1 do epic confirmado. Status Draft → Ready.
- @dev (Dex): AC1-AC6 implementados. Migration 183 aplicada em dev e prod via Supabase Management API, verificada independentemente em ambos (colunas + constraint via `information_schema`/`pg_constraint`). Status Ready → InReview. Pronta para @qa *qa-gate.
