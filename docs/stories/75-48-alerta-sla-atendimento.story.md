# Story 75-48 — Alerta de SLA de atendimento (corretor + escalonamento p/ gestor)

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** L (5 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, vitest]

## Story
**As a** gestor, **I want** que o sistema avise o corretor quando um lead fica parado em
"Aguardando atendimento" além do SLA e escale pra mim se continuar parado, **so that** os leads
sejam atendidos rápido (modo ativo, não só medição).

## Contexto
Pacote SLA (project-sla-atendimento-decisoes). Decisões: relógio **distribuição → atendimento**,
contando **só em horário de expediente** (lê `roleta_config`, decisão F). Tempos (E): corretor em
**30 min**, gestor em **60 min**. Canal: **push** (não exige template Meta; WhatsApp do alerta fica
como follow-up). Parte ativa do uso do trigger `primeiro_atendimento_em` (75-45).

## Escopo
**IN:**
- Migration 113: `roleta_config.sla_alertas_enabled` (default **false** = kill-switch),
  `sla_alerta_corretor_min` (30), `sla_alerta_gestor_min` (60); `leads.sla_alerta_corretor_em`,
  `leads.sla_alerta_gestor_em` (anti-repetição).
- `lib/roleta/business-time.ts`: `businessMinutesBetween` (minutos de expediente, pausa à noite/fim
  de semana) + `isWithinBusinessHoursNow`. 9 testes (overnight, antes da abertura, fim de semana).
- `api/cron/sla-alerts/route.ts`: a cada 10 min, p/ leads ainda em "novo" (não atendidos),
  distribuídos nas últimas 48h: elapsed = businessMinutesBetween(distribuição, agora). >=30 →
  push pro corretor; >=60 → escala pro gestor (`notifyImobiliaria`, lê `notify_user_on_fora_horario`).
  Idempotente (marcadores). Só envia DENTRO do horário comercial. **Dry-run** `?dry=1` (calcula e
  relata, não envia/marca).
- `vercel.json`: cron `*/10 * * * *`.

**OUT:** WhatsApp no alerta (precisa template); UI de configurar os minutos na tela da Roleta
(hoje via banco); indicador na lista (#4, próxima story).

## Acceptance Criteria
1. Relógio = `businessMinutesBetween(distribuição, agora)` — pausa fora do expediente (testado).
2. Corretor alertado (push) ao passar `sla_alerta_corretor_min` (30); gestor escalado ao passar
   `sla_alerta_gestor_min` (60). Cada um no máx 1x por lead (marcadores).
3. Nada é enviado fora do horário da roleta. Kill-switch `sla_alertas_enabled=false` → cron não envia.
4. Dry-run `?dry=1` lista o que enviaria sem enviar.
5. Só considera leads recentes (48h) p/ evitar rajada de leads antigos no 1º ciclo.
6. typecheck/lint/vitest limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.48-alerta-sla-atendimento.yml`)
- Migration 113 aplicada em prod. 28 testes roleta verdes (9 novos business-time). Switch OFF.
- PENDENTE operacional: validar via dry-run em prod e então ligar `sla_alertas_enabled=true`.

## File List
- `supabase/migrations/113_sla_alertas_config.sql` (aplicada)
- `packages/web/src/lib/roleta/business-time.ts` (+ `.test.ts`, 9 testes)
- `packages/web/src/app/api/cron/sla-alerts/route.ts`
- `packages/web/vercel.json`

## Change Log
- 2026-06-24 — @sm/@dev/@qa — Alerta de SLA (push corretor 30min + escala gestor 60min), business-time,
  kill-switch OFF + dry-run. Pacote SLA #1+#5.
