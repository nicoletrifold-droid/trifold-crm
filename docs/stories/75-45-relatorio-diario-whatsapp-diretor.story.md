# Story 75-45 — Relatório diário de leads via WhatsApp (diretor Alexandre)

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** L (5-8 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, vitest]
- **dependências externas:** aprovação de template HSM na Meta (operacional)

## Story
**As a** diretor (Alexandre), **I want** receber todos os dias às 07:59 um relatório simples
por WhatsApp com os números de leads das últimas 24h, **so that** eu acompanhe a captação e
a velocidade de atendimento dos corretores sem precisar abrir o sistema.

## Contexto
Pedido do diretor Alexandre (WhatsApp `44984070700` — **apenas destinatário; NÃO é
corretor/usuário do sistema**, não criar login). Envio às **07:59** (BRT) de propósito: a
roleta reabre às 08:00, então 07:59 fecha o dia anterior e mede o que foi realmente
distribuído. Servidor já roda em horário de Brasília (Story 75-33).

Investigação (2026-06-24) confirmou:
- Itens 1-4 são extraíveis do schema atual (`leads`, `lead_distribution_log`, `kanban_stages`).
- **Tempo de atendimento NÃO existe retroativamente**: não há tabela de histórico nem
  timestamp de mudança de estágio. `stage_id` é alterado em ~20 lugares do código → carimbar
  no app seria furado. Solução: **trigger no banco** (mesmo padrão do `set_updated_at` já
  existente em `leads`) → mede daqui pra frente, pega todos os caminhos.
- "Aguardando atendimento" = stage `slug='novo'`, position 0.

## Escopo
**IN:**
1. **Migration — carimbo de atendimento:**
   - Coluna `leads.primeiro_atendimento_em timestamptz NULL`.
   - Trigger `BEFORE UPDATE` em `leads`: quando `stage_id` muda do estágio "novo" para outro
     E `primeiro_atendimento_em IS NULL` → seta `primeiro_atendimento_em = now()`. Só a 1ª
     saída (idempotente). Lead que nunca passou por "novo" não recebe carimbo.
2. **Builder do relatório** (`lib/reports/daily-leads-report.ts`): função que monta os números
   da janela de 24h (até 07:59):
   - (1) total de leads recebidos no período;
   - (2) leads por canal de entrada (`channel`/`source`);
   - (3) por corretor: distribuídos no período (`lead_distribution_log` status='distributed');
   - (4) destes, quantos saíram de "Aguardando atendimento" (stage atual ≠ novo);
   - (5) tempo de atendimento (média + min/max) a partir de `primeiro_atendimento_em − created_at`,
     só dos leads com carimbo no período. Antes de haver dados → linha "começando a medir".
3. **Template HSM na Meta** (pt_BR, categoria UTILITY): `relatorio_diario_leads`. Como variável
   de template **não aceita quebra de linha**, desenhar o corpo com **uma variável de texto
   achatada** (separadores `·`/`|`) OU estrutura fixa — decisão @dev/@architect. Submeter e
   aguardar aprovação (operacional/externo).
4. **Envio** (`lib/reports/send-daily-report.ts` + reuso de `sendWhatsApp` template em
   notificacoes.ts): envia ao(s) destinatário(s) configurado(s).
5. **Cron diário 07:59 BRT** (`api/cron/daily-report/route.ts` + entrada no `vercel.json`).
   Vercel cron roda em UTC → **10:59 UTC** (BRT = UTC−3). Proteger com `CRON_SECRET` como os
   outros crons.
6. **Destinatários configuráveis** (não hardcodar o número): env `DAILY_REPORT_RECIPIENTS`
   (lista E.164) OU tabela de config simples. Começa com o número do Alexandre.

**OUT:**
- Histórico retroativo de tempo de atendimento (impossível; só daqui pra frente).
- Dashboard/UI do relatório (é só WhatsApp).
- Relatório por e-mail (pode ser story futura reusando o builder).
- Tornar Alexandre usuário/corretor.

## Acceptance Criteria
1. Após a migration, mover um lead de "Aguardando atendimento" para outro estágio (por
   QUALQUER caminho: kanban, API, webhook) grava `primeiro_atendimento_em` uma única vez;
   mover de volta e re-mover não sobrescreve.
2. O builder retorna corretamente, para a janela de 24h: total, por canal, por corretor
   (distribuídos + saíram de aguardando) e, quando há carimbo, o tempo médio/min/máx.
3. O cron dispara às 07:59 BRT (10:59 UTC) e envia o relatório via template ao número do
   Alexandre; protegido por `CRON_SECRET`.
4. Template aprovado na Meta e mensagem entregue (`accepted`) em smoke test real.
5. Lead sem passagem por "novo" (ex.: importado direto em outro estágio) não entra na média
   de tempo. Período sem nenhum atendimento carimbado → relatório mostra texto explicativo,
   não erro/divisão por zero.
6. typecheck/lint/vitest limpos; teste unitário do builder com dados mockados.

## Riscos
- **Template (newline):** variável HSM não aceita `\n`/tab/4+ espaços → corpo precisa ser
  achatado ou estrutura fixa. Definir formato antes de submeter à Meta.
- **Aprovação Meta:** dependência externa de prazo (operacional). O código pode ficar pronto
  e aguardar o template ativo (igual stories 75-23/24).
- **Fuso/cron:** confirmar 10:59 UTC = 07:59 BRT (sem horário de verão no BR atualmente).
- **Janela de 24h vs "dia":** alinhar se é exatamente últimas 24h (07:59 d-1 → 07:59 d) ou
  dia-calendário. Pedido do diretor = últimas 24h.
- **Trigger:** garantir que identifica o estágio "novo" por slug (não por nome, que pode ser
  renomeado) e que é idempotente.

## Dependências
- Aprovação do template HSM na Meta (externo).
- `whatsapp_config` da org já configurado (número da Nicole). Envio reusa `sendWhatsApp`.

## Criteria of Done
- ACs 1-3, 5, 6 verificados; AC4 confirmado após aprovação do template na Meta.
- QA gate PASS. Smoke test real do envio ao Alexandre.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.45-relatorio-diario-whatsapp-diretor.yml`)
- Migration 112 aplicada + trigger testado em prod (rollback): mover lead de "novo" carimba
  `primeiro_atendimento_em`. 14 testes (formatadores) verdes. type-check/lint limpos.
- AC4 (envio real) PENDENTE de aprovação do template HSM na Meta + env. Smoke test pós-aprovação.

## Dev Notes
- **Detecção por keyword** não se aplica aqui. Tempo medido via trigger no banco (migration 112,
  `stamp_primeiro_atendimento` BEFORE UPDATE) — pega todos os ~20 caminhos de mudança de estágio.
- **Builder** agrega em JS (volume diário pequeno). Janela = últimas 24h até `now` (injetável p/ teste).
- **Template** `relatorio_diario_leads` (pt_BR, 6 vars body) submetido na Meta em 2026-06-24
  (status "Em análise"). Envio reusa `whatsapp_config` (número da Nicole).
- **Cron** `59 10 * * *` (UTC) = 07:59 BRT. Protegido por `CRON_SECRET`.
- **Config de deploy (pós-merge):** setar env `DAILY_REPORT_RECIPIENTS` em Vercel Production =
  `5544984070700` (Alexandre, E.164). Opcional `DAILY_REPORT_ORG_ID` (default = Trifold).
  Enquanto template não aprovado, o cron loga erro de envio (inofensivo) e passa a funcionar
  sozinho quando aprovar.

## File List
- `supabase/migrations/112_leads_primeiro_atendimento.sql` (coluna + trigger) — APLICADA em prod
- `packages/web/src/lib/reports/daily-leads-report.ts` (builder, novo)
- `packages/web/src/lib/reports/daily-leads-report.test.ts` (14 testes, novo)
- `packages/web/src/lib/reports/send-daily-report.ts` (envio, novo)
- `packages/web/src/app/api/cron/daily-report/route.ts` (cron, novo)
- `packages/web/vercel.json` (entrada do cron 10:59 UTC)

## Change Log
- 2026-06-24 — @sm — Story criada (Draft). Pedido do diretor Alexandre. Tempo de atendimento
  via trigger no banco (mede daqui pra frente). Alexandre é só destinatário. Template HSM a
  submeter na Meta.
- 2026-06-24 — @po — Validada GO. Draft → Ready.
- 2026-06-24 — @dev — Migration 112 aplicada (coluna+trigger, testada). Builder + envio + cron
  + vercel.json + 14 testes. Template submetido na Meta (Em análise). InProgress → InReview.
- 2026-06-24 — @qa — Gate PASS (AC4 pendente de aprovação Meta). InReview → (push).
- 2026-06-24 — @devops — Push para main. → Done (envio ativa quando template aprovar + env set).
