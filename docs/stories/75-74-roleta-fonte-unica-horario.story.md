# Story 75-74 — Roleta como fonte única de horário (fecha divergência do fallback)

## Metadata
- **Status:** Review · **Epic:** 75 · **Branch:** feature/75-74-roleta-fonte-unica-horario · **Complexidade:** S (1-2 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]

## Story
**As a** gestão, **I want** que o horário de funcionamento seja definido **exclusivamente** pela agenda por dia da
Roleta, **so that** qualquer mudança ali reflita em tudo (distribuição, SLA, tempo de atendimento, contagem por dia,
relatórios) sem nenhum caminho paralelo que divirja.

## Contexto
Tudo que depende de horário já usa `getOrgSchedule()`, que lê **`roleta_schedule`** (a agenda por dia da tela) como
fonte. PORÉM existia um vetor de divergência: o `getOrgSchedule` cai num **fallback** que lê os campos legados
`roleta_config.business_hour_*`/`business_days` quando a agenda por dia está vazia — e esses campos (a) divergiam
(estavam 08–20 vs agenda 08–21) e (b) continuavam **editáveis** via `PATCH /api/roleta/config`. Ver
[[project-agenda-comercial-flexivel]].

## Escopo
**IN:**
1. **Travar a entrada:** remover `business_hour_start/end`, `weekend_hour_start/end` e `business_days` da lista
   `allowed` de `PATCH /api/roleta/config`. O painel ainda envia o config inteiro, mas esses campos passam a ser
   **ignorados** (não quebra o save; a agenda por dia é editada por `/api/roleta/schedule`).
2. **Sincronizar o dado em prod:** `UPDATE roleta_config` alinhando `business_hour_*`/`weekend_hour_*`/`business_days`
   à agenda (08–21, 7 dias) — para o fallback dormente também concordar.

**OUT:**
- Não remove as colunas legadas (migration/refactor maior) — anotado como limpeza futura.
- Não altera `getOrgSchedule` nem os consumidores (já corretos).

## Acceptance Criteria
1. **Given** um `PATCH /api/roleta/config` com `business_hour_*`/`business_days`, **then** esses campos são
   ignorados (não persistem) — só a agenda por dia define horário.
2. **Given** salvar outras configs (is_active, max_leads, notify) pelo painel, **then** continua funcionando.
3. **Given** `roleta_config` em prod, **then** os campos de horário batem com a agenda (08–21, 7 dias).
4. typecheck/lint limpos.

## Dev Notes
- `getOrgSchedule` (business-time.ts): lê `roleta_schedule` primeiro; fallback `deriveScheduleFromConfig(roleta_config)`
  só quando não há agenda por dia. Após esta story, os campos do fallback ficam congelados e alinhados.
- Consumidores (todos via getOrgSchedule): distributor, sla-alerts, analytics page, analytics-report, daily-leads-report,
  commercial-day, broker/leads.

## File List
- `packages/web/src/app/api/roleta/config/route.ts` — remove campos de horário da lista `allowed`.
- _(prod data)_ `roleta_config` sincronizado via Management API (não é arquivo).

## QA Results
- **Verdict:** PASS — tsc 0, lint 0. Sync em prod verificado (antes 08–20 → depois 08–21; `business_days` 7 dias).
- Painel não quebra (campos ignorados, não rejeitados). Horário agora 100% amarrado à agenda da Roleta.

## Change Log
- 2026-06-29 — @dev — Roleta vira fonte única de horário: campos legados de horário não-editáveis via /config +
  dado de prod sincronizado à agenda (08–21). Fecha o único vetor de divergência (fallback). Limpeza futura:
  remover colunas legadas de roleta_config. Ver [[project-agenda-comercial-flexivel]].
