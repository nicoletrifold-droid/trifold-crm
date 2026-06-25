# Story 75-57 — "Dia comercial" para métricas de leads (corte no fechamento, não meia-noite)

## Metadata
- **Status:** Review · **Epic:** 75 · **Branch:** main · **Complexidade:** M (5 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, vitest]

## Story
**As a** diretoria/gestão comercial, **I want** que toda contagem de leads "por dia" (card do dashboard,
Analytics e relatório diário do diretor) use o **dia comercial** — virando no **horário de fechamento**
(`roleta_config.business_hour_end`, hoje 20:00 BRT) em vez da meia-noite —, **so that** um lead que chega
fora do horário (ex.: 21:00, sem corretor pra atender) seja contado no dia em que será **efetivamente
trabalhado** (o seguinte), refletindo a operação real e não escondendo dados.

## Contexto
Decisão do usuário (2026-06-25): o "dia" das métricas de lead deve ir de **fechamento a fechamento**, não
de meia-noite a meia-noite. Hoje o card "Leads hoje" (`dashboard/page.tsx`) conta `created_at >= 00:00 BRT`.
O fuso já está correto (servidor em `America/Sao_Paulo` via `instrumentation.ts`), mas o **corte** é o
problema: leads que chegam após as 20:00 ninguém atende naquele dia — são trabalho do dia seguinte. Contá-los
no dia de chegada distorce a leitura operacional.

**Regra do dia comercial** (fechamento = `business_hour_end`, hoje 20:00 BRT):
- bucket do dia D = `[fechamento(D-1), fechamento(D))` (intervalo semiaberto, usar `gte`/`lt`).
- Lead 21:00 de hoje → conta **amanhã**. Lead 02:00 (madrugada) → conta **hoje**. Lead 14:00 → **hoje**.
- "Dia comercial atual" = aquele que contém `now`: se `now < fechamento` de hoje, começou no fechamento de
  ontem; se `now >= fechamento`, começou no fechamento de hoje.

Premissa: a `roleta_config` opera todos os dias (`business_days = [0..6]`, 08:00–20:00). Por isso o corte
simples fechamento→fechamento basta. **Fim de semana/feriado fora de escopo** (ver OUT).

Regra da casa relevante: **"relatório segue a tela do analytics"** — por isso a mudança vale para dashboard,
Analytics E relatório diário **de forma consistente** (mesma definição de dia nos três).

## Escopo
**IN — Helper compartilhado (fonte única):**
- Criar `packages/web/src/lib/metrics/commercial-day.ts` com:
  - `commercialDayRange(now: Date, closeHour: string, tz?: string): { from: Date; to: Date }` — início/fim do
    dia comercial que contém `now` (`to` exclusivo). Puro/testável.
  - `commercialDayRangeForOrg(orgId, supabase, now?)` — lê `roleta_config.business_hour_end` do org; fallback
    `"20:00"` se ausente. Reusa `commercialDayRange`.
  - (opcional) `previousCommercialDayRange(now, closeHour)` — o dia comercial COMPLETO anterior, para o relatório.

**IN — Grupo A (contadores de lead por dia → usar dia comercial):**
1. `packages/web/src/app/dashboard/page.tsx:24-35` — card "Leads hoje": trocar `today.setHours(0,0,0,0)` +
   `gte(created_at, today)` por `gte(created_at, commercialDayRangeForOrg(...).from)`.
2. `packages/web/src/app/dashboard/leads/page.tsx:109-117` — filtro `criados=hoje`: mesma troca (fonte única).
3. `packages/web/src/app/api/dashboard/metrics/route.ts:12-88` — `leads_today`: hoje usa `Date.UTC()`
   (meia-noite **UTC** — bug latente, conta desde 21:00 BRT do dia anterior). Trocar para o helper (corrige o
   fuso E adota o dia comercial de uma vez).

**IN — Grupo B (relatório diário + Analytics → mesma definição):**
4. `packages/web/src/lib/reports/daily-leads-report.ts:87-92` — hoje usa janela rolante `now - 24h`. Trocar
   pela janela do **dia comercial anterior completo** (`previousCommercialDayRange`), pois o cron roda 07:59 BRT
   (= antes da abertura) e deve reportar o último dia comercial fechado.
5. `packages/web/src/lib/analytics-report-data.ts:125-186` — **apenas `leadsToday`** passa a usar o dia comercial
   atual (alinha com o card do dashboard e o relatório). `leadsWeek`/`leadsMonth` **NÃO mudam**: no código atual
   são ancorados em **calendário** (`weekStart` = segunda-feira, `monthStart` = dia 1), e isso permanece — a
   preocupação do usuário é o corte do DIA, não das agregações semana/mês (ver OUT).
6. Crons `api/cron/daily-report` e `api/cron/analytics-report` — não mudam diretamente (consomem os builders
   acima); validar que continuam coerentes.

**OUT:**
- Grupo C permanece inalterado: agenda/appointments (`dashboard/agenda`, `broker/agenda` — visitas por horário
  real), rate-limit de email (`lib/email.ts` — quota por calendário BRT), labels "Hoje/Ontem" do chat, e o
  filtro de tarefas (`lib/broker/task-date-range.ts` — `lead_tasks.due_at`).
- **Fim de semana/feriado:** com a config atual (todos os dias úteis) não há "rolagem" de dias não-trabalhados;
  se um dia `business_days` excluir dias, revisar a regra. NÃO implementar agora.
- **Agregações semana/mês do Analytics** (`leadsWeek`/`leadsMonth`): permanecem como hoje (calendário —
  segunda-feira / dia 1). Só o corte do DIA é comercial.
- Não mexer no template do PDF/WhatsApp — só na janela de dados.

## Acceptance Criteria
1. **Given** `commercialDayRange(now, "20:00")`, **when** `now` = 21:00, **then** `from` = 20:00 de hoje e
   `to` = 20:00 de amanhã; **when** `now` = 02:00, **then** `from` = 20:00 de ontem e `to` = 20:00 de hoje;
   **when** `now` = 14:00, **then** `from` = 20:00 de ontem e `to` = 20:00 de hoje.
2. **Given** o card "Leads hoje", **when** um lead chega às 21:00, **then** ele NÃO aparece no "hoje" atual —
   aparece a partir do próximo dia comercial.
3. **Given** o filtro `criados=hoje` da página Leads, **then** usa exatamente o mesmo range do card (fonte única).
4. **Given** `/api/dashboard/metrics`, **then** `leads_today` usa o dia comercial em BRT (não mais meia-noite UTC).
5. **Given** o relatório diário (cron 07:59 BRT), **then** a janela é o **dia comercial anterior completo**
   `[fechamento(D-2), fechamento(D-1))`, não mais "últimas 24h".
6. **Given** o Analytics, **then** `leadsToday` usa o dia comercial atual (e `leadsWeek`/`leadsMonth` permanecem
   inalterados — calendário). Dashboard, Analytics (`leadsToday`) e relatório diário reportam o MESMO número
   para o mesmo dia comercial (consistência).
7. **Given** o horário de fechamento, **then** o corte vem de `roleta_config.business_hour_end` (não chumbado);
   ausência → fallback 20:00.
8. **Given** o Grupo C (agenda, email, chat, tarefas), **then** permanece inalterado.
9. typecheck/lint/vitest limpos; testes unitários do helper cobrindo bordas (antes/depois do fechamento, virada).

## Dev Notes
- Servidor em `America/Sao_Paulo` (`packages/web/src/instrumentation.ts` seta `process.env.TZ`), então
  `new Date()`/`setHours` já são BRT — o helper pode trabalhar em horário local, mas DEVE ser testável com `now`
  injetado (não chamar `new Date()` interno sem permitir override, p/ testes determinísticos).
- `roleta_config.business_hour_end` é `time` (ex.: `"20:00:00"`); parsear hora:min.
- Inventário de pontos (Explore 2026-06-25): Grupo A = `dashboard/page.tsx:24-35`, `dashboard/leads/page.tsx:109-117`,
  `api/dashboard/metrics/route.ts:12-88`; Grupo B = `lib/reports/daily-leads-report.ts:87-92`,
  `lib/analytics-report-data.ts:125-186`; Grupo C (NÃO tocar) = `dashboard/agenda/page.tsx`,
  `broker/agenda/page.tsx`, `lib/email.ts:219-238`, `lib/broker/task-date-range.ts`, `cliente/.../chat-feed.tsx`.
- Manter `is_active = true` nos contadores de lead (comportamento atual; não regredir).
- Relacionadas: Story 75-45/75-46 (relatório diário e tempo de atendimento) — esta muda a JANELA de dia, não o
  cálculo de duração. Memória: [[feedback-relatorio-segue-tela]].

### Testing
- Novo `commercial-day.test.ts` (vitest): bordas com `now` injetado — 19:59, 20:00, 20:01, 00:30, 08:00; close
  vindo de config e fallback; `to` exclusivo.
- `vitest packages/web` (ou pacote correspondente) + `tsc --noEmit` + `lint`.
- Verificação manual: card "Leads hoje" vs filtro Leads vs `/api/dashboard/metrics` devolvem o mesmo número.

## Riscos
- **Números mudam de valor** (esperado): o "Leads hoje" e o relatório vão diferir do que era antes. Comunicar à
  diretoria que a definição mudou (operacional, não calendário). **Médio** (expectativa, não técnico).
- **Inconsistência se algum ponto ficar de fora:** mitigado pela fonte única (helper) e pelo AC6 de consistência.
- **Config ausente/zerada:** fallback 20:00 evita quebra. **Baixo.**
- **Semana/mês rolantes:** decisão de ancorar só a borda no fechamento pode gerar dúvida; documentado no AC6.

## File List
- `packages/web/src/lib/metrics/commercial-day.ts` (novo)
- `packages/web/src/lib/metrics/commercial-day.test.ts` (novo)
- `packages/web/src/app/dashboard/page.tsx`
- `packages/web/src/app/dashboard/leads/page.tsx`
- `packages/web/src/app/api/dashboard/metrics/route.ts`
- `packages/web/src/lib/reports/daily-leads-report.ts`
- `packages/web/src/lib/analytics-report-data.ts`

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.57-dia-comercial-metricas-lead.yml`) · readiness 9/10
- Corte do dia comercial **correto e testado** (9 casos); 261/261 testes web verdes; typecheck limpo; bug de fuso
  UTC corrigido.
- **CONCERNS (AC6) RESOLVIDO:** usuário optou por alinhar `is_active=true` nas 3 superfícies (API, Analytics,
  relatório). @dev aplicou; agora os números batem (não contam não-leads). Re-teste: 261/261 verdes.
- **Decisão resolvida:** data do cabeçalho do relatório = **dia reportado** (mantida a mudança do @dev).
- **Perf (baixo, aceito):** +1 query a `roleta_config` por carga; lookup indexado leve.

## Dev Agent Record
- **Agent Model:** Claude Opus 4.8 (1M)
- **Completion Notes:**
  - Helper `lib/metrics/commercial-day.ts`: `commercialDayRange`, `previousCommercialDayRange` (puros) +
    `*ForOrg` (lê `roleta_config.business_hour_end`, fallback 20:00) + `getCloseHour`. 9 testes (bordas 19:59/20:00,
    madrugada, formato HH:MM:SS, string vazia → fallback, `to` exclusivo, encaixe prev↔atual).
  - Grupo A: `dashboard/page.tsx`, `dashboard/leads/page.tsx`, `api/dashboard/metrics/route.ts` (este também
    **corrigiu o bug de fuso UTC** — `leads_today` agora é dia comercial em BRT).
  - Grupo B: `daily-leads-report.ts` — janela 24h → dia comercial anterior completo, com `.lt(untilIso)` nas 3
    queries (leads, atendidos, distribuídos). `analytics-report-data.ts` — só `leadsToday` (week/month intactos).
  - **DECISÃO p/ confirmar (@qa/usuário):** no relatório diário, mudei a `data` exibida de "data de envio" (`now`)
    para **o dia comercial reportado** (`reportedDay = to − 1ms`), pra o cabeçalho casar com a janela. Se preferirem
    manter a data de envio, é trivial reverter essa linha.
  - **Validação:** `vitest packages/web` → **261/261 verdes** (29 arquivos, sem regressão); `tsc --noEmit` (web) limpo.
    `buildDailyLeadsReport` (I/O) não tem teste unitário, mas delega ao helper testado.

## Change Log
- 2026-06-25 — @sm — Story criada. Dia comercial (corte no fechamento) para métricas de lead em dashboard,
  Analytics e relatório diário; helper compartilhado; Grupo C preservado; corrige de brinde o bug de fuso UTC
  em `/api/dashboard/metrics`. Inventário via Explore.
- 2026-06-25 — @po — Validação (checklist 10 pontos): **GO**, score 9/10. Anti-alucinação confirmou os 3 pontos
  do Grupo B no código. Corrigido escopo: `leadsWeek`/`leadsMonth` do Analytics são calendário (segunda/dia 1) e
  PERMANECEM — só o DIA vira comercial. Status Draft → Ready. Obs.: `quality_gate=@qa` segue convenção da casa.
- 2026-06-25 — @dev — Implementado: helper `commercial-day.ts` (+9 testes), 5 call sites (Grupo A/B), corrige bug
  de fuso UTC em `/api/dashboard/metrics`. 261/261 testes web verdes, typecheck limpo. Status Ready → Review.
- 2026-06-25 — @qa — Gate **CONCERNS** (AC6: is_active divergente entre superfícies) → após decisão do usuário,
  @dev alinhou `is_active=true` em API/Analytics/relatório (261/261 verdes) → Gate **PASS**. Data do relatório =
  dia reportado (confirmado).
