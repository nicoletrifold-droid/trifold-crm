# Story 75-60 — Tempo médio de atendimento em horário comercial (unifica com o SLA)

## Metadata
- **Status:** Review · **Epic:** 75 · **Branch:** main · **Complexidade:** M (3-5 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, vitest]

## Story
**As a** diretoria/gestão comercial, **I want** que o "tempo médio de atendimento" (da distribuição até o
atendimento) seja medido em **horário comercial** (pausando noites, dias fechados e fins de semana) em **todos**
os relatórios — tela Analytics, PDF/e-mail semanal e WhatsApp diário —, **so that** o número seja justo e
**consistente** com o SLA (que já usa horário comercial), sem inflar com tempo em que ninguém trabalha.

## Contexto
Hoje há uma **inconsistência**: o SLA (alertas ao corretor/gestor em `sla-alerts` e a coluna "tempo esperando"
em `broker/leads`) já usa **horário comercial** (`businessMinutesBetweenSchedule`, agenda por dia — Stories
75-48/75-59). Mas o **"tempo médio de atendimento"** que vai pra gestão usa **relógio cru**
(`(atendido − distribuição)/60000`) em 3 lugares. Resultado: números inflados (ex.: Valeria 87h47min, dominado
por 2 leads distribuídos 17/06 e atendidos 24/06 = 168h cru cada, contando 7 dias corridos com noites e fim de
semana). Confirmado em código E nos dados de produção (média crua = 87h46min).

Decisão do usuário (2026-06-25): **unificar tudo no horário comercial.** Fecha o pacote de decisões de SLA que
estava pausado (ver [[project-sla-atendimento-decisoes]]). Motor e `getOrgSchedule` já existem (Stories 75-58/59).

> Nota: mesmo em horário comercial, leads que ficaram dias parados continuarão com número alto (sinal
> operacional real) — a correção torna a métrica justa/consistente, não menor artificialmente.

## Escopo
**IN — trocar relógio cru por `businessMinutesBetweenSchedule` (agenda por dia) em 3 lugares:**
1. `packages/web/src/app/dashboard/analytics/page.tsx` (~linhas 250-264) — card "Tempo Médio de Atendimento".
   Hoje: `const diffMs = atendido − Math.max(...dists); cur.totalMinutes += diffMs/60000`. Trocar por
   `businessMinutesBetweenSchedule(new Date(Math.max(...dists)), new Date(atendido), week, tz)`. Carregar
   `getOrgSchedule(appUser.orgId, supabase)` uma vez.
2. `packages/web/src/lib/analytics-report-data.ts` (~linhas 285-299) — mesmo card no **PDF/e-mail semanal**.
   Mesma troca; carregar a agenda via `getOrgSchedule(orgId, supabase)`.
3. `packages/web/src/lib/reports/daily-leads-report.ts` (~linhas 154-161) — `durations` do **WhatsApp diário**.
   Hoje: `const min = (atendido − Math.max(...dists))/60000`. Trocar por `businessMinutesBetweenSchedule(...)`;
   carregar a agenda via `getOrgSchedule(orgId, admin)` (a função já chama `previousCommercialDayRangeForOrg`,
   que carrega schedule internamente — aqui é uma chamada explícita p/ obter `{week, timezone}`).

**OUT:**
- SLA e coluna "tempo esperando" — **já** usam horário comercial; não mexer.
- Não mudar a definição da janela (continua distribuição → primeiro_atendimento_em) nem o filtro `is_active`.
- Não mudar formatadores (`formatDuration`/`formatTempo`) nem layout/cores dos cards.
- Não mexer no `commercialDayRange` (janela do "dia"); aqui é só a DURAÇÃO do atendimento.

## Acceptance Criteria
1. **Given** o card "Tempo Médio de Atendimento" da tela Analytics, **then** cada corretor é calculado com
   `businessMinutesBetweenSchedule` (pausa noite/dia fechado), não mais relógio cru.
2. **Given** o PDF/e-mail semanal (cron `analytics-report`), **then** o tempo médio usa horário comercial — mesmo
   resultado da tela para o mesmo período (consistência tela ↔ PDF, regra [[feedback-relatorio-segue-tela]]).
3. **Given** o WhatsApp diário ao diretor (cron `daily-report`), **then** o `durations`/tempo usa horário comercial.
4. **Given** um lead distribuído antes do fechamento e atendido no dia seguinte (atravessa a noite), **then** o
   tempo conta só os minutos de expediente (igual ao SLA), não o relógio cru.
5. **Given** a config atual (08–20 todos os dias), **then** os 3 lugares e o SLA usam a MESMA agenda
   (`roleta_schedule`) — sem divergência de fonte.
6. typecheck/lint/vitest limpos.

## Dev Notes
- Motor: `packages/web/src/lib/roleta/business-time.ts` → `businessMinutesBetweenSchedule(from, to, week, tz)` e
  `getOrgSchedule(orgId, supabase)` (retorna `{ week, timezone }`). Já usados por `sla-alerts` e `broker/leads`.
- `analytics/page.tsx`: tem `appUser.orgId` + `supabase` (server client). Cálculo do broker em ~250-264
  (filtro `HIDDEN_BROKER_NAMES` permanece).
- `analytics-report-data.ts`: recebe `supabase` + `orgId`; já chama `commercialDayRangeForOrg`. O bloco de tempo
  por corretor está ~285-299.
- `daily-leads-report.ts`: recebe `admin` + `orgId`; bloco `durations` ~154-161.
- Padrão de chamada (igual ao broker/leads): `const { week, timezone } = await getOrgSchedule(orgId, client)` e
  depois `businessMinutesBetweenSchedule(new Date(Math.max(...dists)), new Date(atendido), week, timezone)`.

### Testing
- `business-time.test.ts` já cobre `businessMinutesBetweenSchedule` (dia útil, pausa noturna, dia fechado) — sem
  novos testes de unidade obrigatórios (a função não muda). Garantir `vitest packages/web` + `tsc --noEmit` + lint.
- Verificação manual: na tela Analytics, o tempo médio deve cair vs o relógio cru (ex.: o caso de 87h, que
  contava 7 dias corridos, deve refletir só o expediente).

## Riscos
- **Inconsistência se um dos 3 ficar de fora** → mitigação: AC2/AC5 (consistência) + revisar os 3 no QA. **Médio.**
- **Performance**: +1 `getOrgSchedule` por carga em cada um (lookup indexado). **Baixo.**
- **Números mudam** (caem) vs o que a diretoria via → comunicar a mudança de base (relógio→comercial). **Baixo/expectativa.**

## File List
- `packages/web/src/app/dashboard/analytics/page.tsx` — card "Tempo Médio" usa `businessMinutesBetweenSchedule` (+`getOrgSchedule`).
- `packages/web/src/lib/analytics-report-data.ts` — PDF/e-mail semanal idem.
- `packages/web/src/lib/reports/daily-leads-report.ts` — `durations` do WhatsApp diário idem.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.60-tempo-atendimento-horario-comercial.yml`) · readiness 9/10
- Grep confirmou: **zero relógio cru** restante nos 3; cada um com `businessMinutesBetweenSchedule`+`getOrgSchedule`; SLA/broker-leads intactos. 265/265 verdes; typecheck exit 0.
- AC5 (mesma fonte que o SLA) confirmado. Validado em dados (Valeria 87h46→42h46).
- Observação low: cálculo duplicado analytics page/report-data (pré-existente). Recomendada verificação visual do card pós-deploy.

## Dev Agent Record
- **Agent Model:** Claude Opus 4.8 (1M)
- **Completion Notes:**
  - Os 3 lugares trocaram `(atendido − distribuição)/60000` por `businessMinutesBetweenSchedule(dist, atendido, week, tz)`, carregando `getOrgSchedule(orgId, client)` uma vez cada. Mesma agenda/fonte do SLA.
  - **Validação:** `vitest packages/web` → **265/265 verdes**; `tsc --noEmit` (web) **exit 0**.
  - **Impacto verificado nos dados da Valeria:** média **87h46min (cru) → 42h46min (comercial)**. Caso típico Iolanda 13h31→1h31 (removeu a noite); Neme/Flavio 168h→84h (esperaram 7 dias reais — sinal operacional legítimo, não bug).
  - Sem migration; sem mudança de formatadores/layout. Recomenda-se verificação visual do card pós-deploy.

## Change Log
- 2026-06-25 — @sm — Story criada. Unifica "tempo médio de atendimento" (tela Analytics + PDF semanal + WhatsApp
  diário) no horário comercial (`businessMinutesBetweenSchedule`), consistente com o SLA. Confirmado por código +
  dados (87h cru = noites/fins de semana). Ver [[project-sla-atendimento-decisoes]].
- 2026-06-25 — @po — Validação (10 pontos): **GO**, 9/10. Anti-alucinação confirmou os 3 blocos de relógio cru
  (analytics/page.tsx:258-261, analytics-report-data.ts:293-297, daily-leads-report.ts:159) e o motor disponível.
  Obs.: cálculo duplicado em analytics page/report-data permanece (cada um ganha sua chamada). Status Draft → Ready.
- 2026-06-25 — @dev — Implementado nos 3 lugares (tela Analytics, PDF semanal, WhatsApp diário). 265/265 testes
  verdes, typecheck limpo. Validado em dados: média Valeria 87h46→42h46 comercial. Status Ready → Review.
- 2026-06-25 — @qa — Gate **PASS** (9/10). Grep: zero relógio cru restante; 3 lugares com a função+agenda; SLA
  intacto; 265/265 verdes. Recomendada verificação visual do card pós-deploy.
