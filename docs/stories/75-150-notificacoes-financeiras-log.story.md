# Story 75-150 — Notificações Financeiras (extrato de disparos de boleto)

## Metadata
- **Status:** Done
- **Epic:** 75 — Notificações do Portal / Financeiro
- **Branch:** story-75-150-notificacoes-financeiras

## Context
Pedido (Marcos, 2026-07-10): um extrato/relatório sistêmico (legível por gestor, não por dev) das notificações FINANCEIRAS enviadas aos clientes — boleto emitido, vencimento e atraso — com **cliente · empreendimento · data · canal**, dividido por empreendimento. Só a parte financeira (fotos/etapa/documentos fora). Motivação: hoje o Sienge é que mostra quando o e-mail foi enviado; querem tudo no CRM — e deixar o log pronto ANTES de ligar o lembrete de vencimento por e-mail.

Diagnóstico: não existia log unificado. WhatsApp ia para `whatsapp_send_log` (só telefone+template, sem cliente/obra); e-mail e push praticamente não eram logados com contexto. Logo, foi criada uma tabela dedicada escrita no ponto de envio.

Decisões (UX, confirmadas): nome **"Notificações Financeiras"**; local **Sistema › Auditoria** (card ao lado do "Log de Atividades") abrindo página dedicada.

## Acceptance Criteria
- [x] AC1: tabela `financial_notification_log` (org, user, obra, tipo, canal, status, vencimento, created_at) — 1 linha por canal disparado.
- [x] AC2: `notifyNovoBoleto` (tipo novo_boleto) e `notifyBoletoLembrete` (tipo vence_hoje/atraso_5/atraso_15) gravam por canal (whatsapp/email/push) com status sent/failed — sem quebrar o envio (fire-and-forget).
- [x] AC3: quando o lembrete por e-mail for ligado no futuro, ele já cai no log automaticamente (instrumentação por canal, não por template).
- [x] AC4: página `/dashboard/sistema/notificacoes-financeiras` lista cliente · tipo · canal · vencimento · data do envio · status, **agrupada por empreendimento**, com filtros (empreendimento, tipo, canal).
- [x] AC5: acesso admin/supervisor (API 403 + RLS select `is_admin_or_supervisor()`). Escrita via service role (ignora RLS).
- [x] AC6: card "Notificações Financeiras" em Sistema › Auditoria.

## Out of Scope
- Backfill retroativo (o log começa a partir do deploy; disparos anteriores não entram). O envio manual de hoje (10/07) foi por script standalone e não está nesta tabela.
- Ligar de fato o lembrete de vencimento por e-mail (feature separada; este log já a suporta).
- Notificações não-financeiras (fotos/etapa/documentos).

## Dependencies
- `notifyNovoBoleto`/`notifyBoletoLembrete` (notificacoes.ts), `obras`, `users`, `organizations`, `is_admin_or_supervisor()`.

## Complexity
- **T-shirt:** M (migração + instrumentação 2 fluxos × 3 canais + API + página + card).

## Business Value
Gestão passa a ter, dentro do CRM, o extrato completo de cobranças enviadas aos clientes por empreendimento — sem depender do Sienge — e já preparado para o e-mail. Base para auditoria e acompanhamento de inadimplência.

## Risks
- Baixo. Log é aditivo e fire-and-forget (nunca quebra envio). Leitura restrita admin/supervisor. Sem impacto nos envios existentes.

## Definition of Done
- AC1–AC6; migração 167 aplicada em prod; testes 883/883; `tsc`+ESLint limpos; deploy via @devops.

## File List
- `docs/stories/75-150-notificacoes-financeiras-log.story.md` (this file)
- `supabase/migrations/167_financial_notification_log.sql` (nova tabela + RLS)
- `packages/web/src/lib/financeiro/log-financial-notification.ts` (helper + mapeadores)
- `packages/web/src/lib/financeiro/log-financial-notification.test.ts` (testes puros)
- `packages/web/src/lib/notificacoes.ts` (instrumenta novoBoleto + lembrete)
- `packages/web/src/app/api/sistema/notificacoes-financeiras/route.ts` (API do extrato)
- `packages/web/src/app/dashboard/sistema/notificacoes-financeiras/page.tsx` (página agrupada)
- `packages/web/src/app/dashboard/sistema/page.tsx` (card na Auditoria)

## QA Results (@qa / Quinn)
- **Gate: PASS.** Migração 167 aplicada e verificada em prod; `tsc` 0, ESLint limpo, suíte 883/883 (3 novos: marcoToTipo, brDateToIso). Gate admin/supervisor na API + RLS.
- **Nota:** a tabela começa vazia — o extrato popula a partir dos próximos disparos (novos boletos + rodada de lembretes 09h). Validação real: conferir 1ª aparição amanhã.
