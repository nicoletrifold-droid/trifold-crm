# Story 75-82 — Bolsão: notificações (resumo à Fernanda + escalada 60 min só Alexandre)

## Metadata
- **Status:** Ready · **Epic:** 64 · **Branch:** feat/75-82-bolsao-notificacoes · **Complexidade:** M (3-5 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, teste do cron/resumo, teste do escalonamento]
- **depends_on:** 75-80 (`bolsao_em`), template `aviso_bolsao_gestor` (submetido 2026-06-30, id 1028034540162372, PENDING).

## Story
**As a** gerente comercial (Fernanda), **I want** um aviso quando houver leads parados no bolsão,
**so that** eu aja; **and** manter a escalada de 60 min (lead nunca atendido) indo ao diretor (Alexandre).

## Escopo
**IN:**
1. **Resumo periódico à Fernanda:** no cron (reusar `bolsao-rebalance`/`sla-alerts`), contar leads com
   `bolsao_em` há **≥15 min** (horário comercial). Se N>0, enviar **WhatsApp template `aviso_bolsao_gestor`**
   (`{{1}}`=nome, `{{2}}`=N; botão → `/dashboard/bolsao`) + **push** à Fernanda. **Anti-flood:** no máximo 1
   aviso a cada janela (ex.: 30-60 min) enquanto houver pool — reusar padrão de coalescing/claim.
2. **Escalada de 60 min → só Alexandre:** hoje vai p/ Fernanda + Alexandre (`SLA_ESCALATION_PHONES` + push
   Fernanda). Remover a Fernanda desse ponto (ela passa a receber o aviso de bolsão). 60 min permanece
   **absoluto** (desde a 1ª distribuição, `primeiro_atendimento_em` null) — inalterado nessa parte.
3. Corretor (push 10 min) — **já existe** (75-78), não mexer.

**OUT:**
- Não muda o relógio nem o rebalanceamento (75-80). Não cria UI (75-81).

## Acceptance Criteria
1. **Given** N≥1 leads no bolsão há ≥15 min comerciais, **then** Fernanda recebe 1 WhatsApp `aviso_bolsao_gestor`
   (com N) + push; **and** não recebe de novo dentro da janela anti-flood enquanto o pool persistir.
2. **Given** N=0 no bolsão, **then** nenhum aviso de bolsão é enviado.
3. **Given** lead 60 min absoluto sem atendimento, **then** a escalada vai **só pro Alexandre** (Fernanda não recebe mais esse).
4. **Given** o template ainda PENDING/rejeitado na Meta, **then** o envio WhatsApp falha graciosamente (loga) sem quebrar o cron; push da Fernanda ainda sai.
5. typecheck/lint limpos; teste do resumo (N>0/N=0, anti-flood) + teste do destinatário do 60 min.

## Dev Notes
- Template `aviso_bolsao_gestor` (pt_BR, UTILITY) já submetido — confirmar APPROVED antes do go-live (Graph API).
  Envio espelha `sendImobiliariaTemplate`/`sendBoletoWhatsApp` (notify-broker.ts / notificacoes.ts).
- Escalada 60 min: `sla-alerts/route.ts` — hoje usa `SLA_ESCALATION_PHONES` (Alexandre+Fernanda) + push Fernanda.
  Tirar Fernanda (env ou lógica). Confirmar telefone do Alexandre permanece (`5544984070700`).
- Anti-flood do resumo: claim por (org, "bolsao_digest") com janela, igual ao `claim_obra_notif`.

## File List
- `packages/web/src/app/api/cron/bolsao-rebalance/route.ts` (ou sla-alerts) — resumo à Fernanda.
- `packages/web/src/lib/roleta/notify-broker.ts` / `notificacoes.ts` — envio do template do bolsão.
- `packages/web/src/app/api/cron/sla-alerts/route.ts` — 60 min só Alexandre.
- (env) ajustar `SLA_ESCALATION_PHONES`.
- testes.

## QA Results
_(a preencher por @qa)_

## Change Log
- 2026-06-30 — @sm — Story criada (Epic 64). Resumo à Fernanda (template novo) + escalada 60 min só Alexandre.
