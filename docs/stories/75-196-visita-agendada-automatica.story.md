# Story 75-196 — Agendou visita → lead entra em "Visita Agendada" (Nicole, link IMOB e agendamento interno)

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core / relacionado aos Epics 81 (agenda HOUSE×IMOB) e 73 (agendamento da Nicole)
- **Branch:** feat/75-196-visita-agendada-automatica
- **Tipo:** Feature + fix — reportado pelo Marcos (2026-07-22): lead do link público da
  imobiliária (Kaíke, visita 24/07 17:00) invisível no pipeline IMOB, Etapa "—".

## Context
Diagnóstico de 2026-07-22:
1. O link público `/api/agendar/[token]` cria o lead **sem `stage_id`** (NULL) →
   invisível no pipeline IMOB (`dashboard/imob/pipeline/page.tsx` consulta
   `stage_id = stage.id` por coluna) e Etapa "—" na aba Leads.
2. **Nenhum** fluxo move o lead para "Visita Agendada" ao criar appointment — nem o
   link, nem o POST interno (`api/appointments/route.ts`), nem a Nicole. Único
   caminho hoje é arrasto manual no kanban.
3. O POST interno também cria lead (find-or-create) sem `stage_id`.

**DECISÃO DE PRODUTO (Marcos, 2026-07-22) — muda a regra da Nicole:** quando a
Nicole agenda visita, o lead PODE ir direto para "Visita Agendada". Esta é a
ÚNICA exceção à regra "Nicole nunca move etapa" (Stories 65-1/75-56/73-1); todo o
resto da regra permanece (qualificação continua só em qualification_score/status).

Roteamento de pipeline (já garantido pelo `segmento`, esta story NÃO mexe nisso):
- Link externo (imobiliárias) → lead `segmento='imob'` → aparece SÓ no pipeline IMOB.
- Nicole → lead `segmento='principal'` → aparece SÓ no pipeline HOUSE.
- A etapa vive na mesma tabela `kanban_stages` para os dois mundos; mover a etapa
  nunca altera `segmento`.

## Scope
**IN:**
- Helper único `advanceToVisitaAgendada` (guard "só avança") reutilizado nos 3
  pontos de criação de visita + remarcação da Nicole.
- Backfill dos leads `imob_link` com etapa NULL.
- Atualização do comentário-regra em `pipeline.ts:896-900`.

**OUT:**
- Tela de Agenda (`/dashboard/agenda`): NENHUMA mudança — visual atual (selo IMOB,
  borda violeta, nome da imobiliária) permanece como está.
- Segmento/roteamento de pipeline (já correto via `leads.segmento`).
- Cancelamento de visita NÃO regride etapa (fica para story futura se preciso).
- Etapas `acao_muffato`/`importar_crm`/`represamento`/`proposta` não entram no
  allowlist (leads nelas não são movidos por agendamento).

## Regra do guard (não regredir)
`advanceToVisitaAgendada(supabase, leadId)` move o lead para
`STAGE_IDS.visita_agendada` **somente se** o `stage_id` atual for
`NULL | novo | em_qualificacao | qualificado | no_show` **e** `lost_reason IS NULL`.
- `no_show` entra no allowlist de propósito: remarcou → volta para Visita Agendada.
- `visitou/proposta/negociando/fechou` etc. NUNCA regridem.
- `perdido` é TERMINAL para automação (Story 75-118) — não é ressuscitado.
- O update é condicional no banco (`.in("stage_id", ...)`/`is null` no WHERE), não
  read-then-write, para não atropelar movimento concorrente do corretor.
- Nunca toca `segmento`.

## Acceptance Criteria
- [ ] AC1: Helper `advanceToVisitaAgendada` criado em local importável pelos dois
  mundos (`packages/ai` e `packages/web`) com a regra do guard acima + testes
  unitários cobrindo: NULL→move, novo→move, no_show→move, visitou→NÃO move,
  perdido→NÃO move, lost_reason preenchido→NÃO move.
- [ ] AC2 (Nicole): em `packages/ai/src/chat/pipeline.ts`, após INSERT bem-sucedido
  do appointment (bloco Story 75-162) E após remarcação bem-sucedida (bloco Story
  75-163), chama o helper. Comentários das regras antigas (`:896-900` e `:979`)
  atualizados citando esta story. Lead da Nicole é `segmento='principal'` → aparece
  no pipeline HOUSE.
- [ ] AC3 (link público): `POST /api/agendar/[token]` — no ramo CREATE o lead nasce
  com `stage_id: STAGE_IDS.visita_agendada` direto; no ramo lead-já-existe chama o
  helper após criar o appointment. `segmento='imob'` intacto → aparece SÓ no
  pipeline IMOB, com etapa visível na aba Leads (sem "—").
- [ ] AC4 (interno): `POST /api/appointments` — lead criado no find-or-create nasce
  com `stage_id: STAGE_IDS.visita_agendada`; lead existente passa pelo helper após
  o INSERT do appointment.
- [ ] AC5 (backfill): migration `184_backfill_imob_link_stage.sql` — leads
  `segmento='imob'` com `stage_id IS NULL` e `lost_reason IS NULL`: com appointment
  futuro `scheduled/confirmed` → `visita_agendada`; demais → `novo`. Aplicada em
  DEV e PROD (validar schema remoto — lição 75-188) e registrada em
  `schema_migrations`. Kaíke visível no pipeline IMOB em "Visita Agendada".
- [ ] AC6 (não quebrar o que funciona): tela de Agenda inalterada; fluxo pós-visita
  (visit-feedback → `visitou`) e no-show decision inalterados; guard de duplicata
  da Nicole (appointment futuro existente → não move de novo, idempotente).
- [ ] AC7: type-check/lint/suíte verdes.

## Risks
- Trigger genérico em `appointments` foi DESCARTADO de propósito: pegaria fluxos
  que não devem mover etapa (ex.: agendamento retroativo da 75-193, que já move
  para `visitou` via visit-feedback-core — conflito direto). Por isso a chamada é
  explícita nos 3 call sites.
- Concorrência corretor×automação mitigada pelo update condicional no WHERE.
- Backfill em prod: rodar com SELECT de conferência antes (contagem esperada ~2
  leads hoje) e BEGIN/ROLLBACK de ensaio.

## File List
- `docs/stories/75-196-visita-agendada-automatica.story.md` (this file)
- `packages/shared/src/leads/advance-to-visita-agendada.ts` (novo — helper + guard)
- `packages/shared/src/leads/advance-to-visita-agendada.test.ts` (novo — 16 testes)
- `packages/shared/src/index.ts` (export do helper)
- `packages/ai/src/chat/pipeline.ts` (Nicole: agendar + remarcar; comentários-regra)
- `packages/web/src/app/api/agendar/[token]/route.ts` (link público)
- `packages/web/src/app/api/appointments/route.ts` (POST interno)
- `supabase/migrations/184_backfill_imob_link_stage.sql` (backfill)

## Dev Notes
- **Ajuste de desenho sobre AC3/AC4 (aprovado @po in-loop):** o INSERT do lead
  acontece ANTES do INSERT do appointment nos dois POSTs; se o agendamento
  falhar (ex.: conflito de horário), um lead nascido direto em "Visita Agendada"
  ficaria com visita fantasma. Implementado: lead novo nasce em **"Novo"** e o
  helper avança para "Visita Agendada" **após** o appointment gravar — caminho
  único para lead novo e existente, à prova de falha. A migration 184 segue a
  mesma regra (sem visita futura → "Novo").
- Follow-up (fora do escopo): modal "Novo lead" do broker ainda permite criar
  lead do funil principal com `stage_id null` (`api/leads/route.ts:155`).

## Change Log
- @sm (River) 2026-07-22: draft criado a partir do diagnóstico da sessão (leads do
  link IMOB sem etapa + decisão do Marcos de mudar a regra da Nicole).
- @po (Pax) 2026-07-22: GO 10/10 → Ready. Premissas conferidas no código:
  `@trifold/shared` importável dos dois mundos (pipeline.ts:38 já importa
  STAGE_IDS); find-or-create dos dois POSTs confirmado; appointments não tem
  coluna `type` — todo appointment é visita atrelada a lead (no-show/pós-visita já
  tratam assim), AC4 vale para qualquer criação.
- @dev (Dex) 2026-07-22: implementado. Helper estrutural em @trifold/shared (sem
  dependência de supabase-js), 16 testes. Ajuste de desenho (ver Dev Notes):
  lead novo nasce em "Novo" e avança após o appointment gravar — caminho único e
  à prova de falha de agendamento.
- @qa (Quinn) 2026-07-22: PASS — type-check 5 pacotes verde; suíte 1137/1137;
  lint: 12 erros PRÉ-EXISTENTES na main, nenhum em arquivo da story; guard
  verificado por teste caso a caso (move: NULL/novo/em_qualificacao/qualificado/
  no_show; não move: visitou/proposta/negociando/fechou/perdido/lost_reason);
  sem conflito com 75-193 (agendamento retroativo NÃO passa pelo helper — o
  pós-visita continua dono do movimento p/ "Visitou"); tela de Agenda intocada.
- @devops (Gage) 2026-07-22: PR #260 squash-merge → main (49598f74), deploy
  automático Vercel. Migration 184 aplicada em PROD via Management API (ensaio
  SELECT antes: 1 lead afetado; pós: Kaíke em "Visita Agendada", registrada em
  supabase_migrations.schema_migrations) e em DEV (no-op defensivo — dev DB não
  tem leads.segmento; DO block checa a coluna). Status → Done.
