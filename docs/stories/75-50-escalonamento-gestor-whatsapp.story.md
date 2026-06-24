# Story 75-50 — Escalonamento do SLA pro gestor via WhatsApp (Fernanda + Alexandre)

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** S (2 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, vitest]
- **dependências externas:** aprovação do template HSM `alerta_sla_gestor` na Meta

## Story
**As a** diretor/gestor, **I want** receber por WhatsApp quando um lead estoura o SLA sem
atendimento, **so that** eu possa cobrar o corretor rapidamente.

## Contexto
Complementa o alerta de SLA (75-48). O escalonamento (60 min) ia só por push/e-mail pro gestor
da roleta (Fernanda). Decisão do usuário: enviar **por WhatsApp** para os gestores **Fernanda E
Alexandre**. Alexandre NÃO é usuário do sistema (só telefone) → o template vai por lista de
telefones. Template `alerta_sla_gestor` (pt_BR/UTILITY) submetido na Meta em 2026-06-24.

## Escopo
**IN:**
- Env `SLA_ESCALATION_PHONES` (E.164, vírgula) = `5518996352250,5544984070700` (Fernanda, Alexandre).
- `api/cron/sla-alerts`: no escalonamento (>= gestorMin), envia template `alerta_sla_gestor`
  (body: {{1}}=lead, {{2}}=corretor, {{3}}=tempo via `formatDuration`) a cada telefone +
  mantém push pro gestor-usuário (Fernanda). Config do WhatsApp lida 1x por org.
**OUT:** UI p/ gerenciar a lista de gestores (hoje via env); WhatsApp no alerta do corretor (segue push).

## Acceptance Criteria
1. Ao estourar o SLA do gestor (60 min), envia o template `alerta_sla_gestor` a todos os
   telefones de `SLA_ESCALATION_PHONES`; idempotente (`sla_alerta_gestor_em`).
2. Push continua indo pro gestor-usuário (Fernanda); Alexandre recebe só WhatsApp (não é usuário).
3. Respeita kill-switch + horário comercial + dry-run (não envia em dry-run).
4. typecheck/lint/vitest limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.50-escalonamento-gestor-whatsapp.yml`)
- 28 testes roleta verdes. Env setada em prod. PENDENTE: aprovação do template na Meta + ligar
  alertas (amanhã 08:00 via pg_cron). Push do gestor funciona independente do template.

## File List
- `packages/web/src/app/api/cron/sla-alerts/route.ts`
- env Vercel `SLA_ESCALATION_PHONES` (produção)

## Change Log
- 2026-06-24 — @sm/@dev/@qa — Escalonamento por WhatsApp p/ Fernanda + Alexandre (template
  alerta_sla_gestor) + push pra Fernanda. Telefones via env.
