# Story 75-58 — Agenda comercial flexível por dia da semana (motor + schema + migração)

## Metadata
- **Status:** Review · **Epic:** 75 · **Branch:** main · **Complexidade:** L (8 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, vitest]

## Story
**As a** gestão comercial, **I want** que o horário de funcionamento seja configurável **por dia da semana**
(cada dia aberto/fechado com seu próprio horário) e que **distribuição da roleta** e **contagem por dia**
usem a **mesma** fonte de verdade, **so that** o sistema responda a qualquer agenda (ex.: sáb 09–14, dom
fechado) de forma consistente, sem divergência entre o que distribui e o que conta.

## Contexto
Hoje a `roleta_config` só expressa: `business_days` (quais dias abrem) + `business_hour_start/end` (um horário
p/ dias úteis) + `weekend_hour_start/end` (UM par só para sábado+domingo juntos). Não dá pra ter sábado ≠ domingo,
nem horário próprio por dia. Além disso há **lógica duplicada**: a distribuição usa `isWithinBusinessHours`
própria (`distributor.ts:37-56`, lê business_days/weekend) e a contagem por dia (Story 75-57,
`lib/metrics/commercial-day.ts`) só lê `business_hour_end` — ignora dias fechados e fim de semana.

Decisão do usuário (2026-06-25): agenda **por dia independente**; **feriados em fase posterior**. Esta é a
**Story 1 (backend)** do épico — ver memória [[project-agenda-comercial-flexivel]]. A **UI** (7 linhas Seg–Dom)
é a Story 75-59 (separada).

## Escopo
**IN — Schema + migração:**
1. Nova tabela `roleta_schedule` (fonte da verdade da agenda): chave `(org_id, weekday)` com `weekday smallint`
   (0=Dom … 6=Sáb), `is_open boolean`, `open_time time`, `close_time time`. 7 linhas por org. RLS coerente com
   `roleta_config`.
2. Migração: criar a tabela e **semear 7 linhas por org** a partir da `roleta_config` atual:
   - `is_open` = `weekday ∈ business_days`;
   - fim de semana (0/6) com `weekend_hour_*` preenchido → usa esses; senão usa `business_hour_start/end`.
   - **Resultado:** prod hoje (todos os dias 08–20) é replicado fielmente → **zero mudança de comportamento** no deploy.

**IN — Motor único (`packages/web/src/lib/roleta/business-time.ts`):**
3. Estender o motor para agenda por dia: carregar as 7 linhas + timezone; funções `isOpenAt(now, schedule)`,
   `closeOfDay(date, schedule)`, `isOpenOn(date, schedule)`, `nextOpenDay`/`prevOpenDay` (caminham pulando dias
   fechados, com limite de iterações). Reusar/!duplicar o parsing de hora já existente.
4. `commercialDayRange` **ciente da agenda**: o "dia comercial" passa a ser `[fechamento do dia útil anterior,
   fechamento do dia útil atual)`, **pulando dias fechados** (lead de dia fechado/após o fechamento rola pro
   próximo dia útil). Mantém a regra fechamento→fechamento da 75-57, agora por agenda.

**IN — Consumidores unificados:**
5. `lib/metrics/commercial-day.ts`: reescrever para consumir o motor (agenda completa), **mantendo as assinaturas
   exportadas** (`commercialDayRangeForOrg` / `previousCommercialDayRangeForOrg`) p/ os 5 call sites da 75-57 NÃO
   mudarem. Atualizar os testes (`commercial-day.test.ts`) p/ cenários de agenda (dia fechado, sáb curto, virada).
6. `distributor.ts`: substituir a `isWithinBusinessHours` duplicada pelo `isOpenAt` do motor (mesma fonte da
   contagem). Sem mudança de comportamento observável com a config atual.

**IN — Transição sem gap (até a UI da 75-59):**
7. Enquanto a tela antiga (campos `business_hour_*`/`weekend_*`/`business_days`) ainda estiver no ar, salvar a
   config deve **derivar e gravar** as 7 linhas de `roleta_schedule` (no `PATCH /api/roleta/config`), pra a tela
   atual continuar controlando o motor. A 75-59 troca a UI e remove essa derivação.

**OUT:**
- **Feriados** (fase posterior — motor deve ser desenhado p/ encaixar `isOpenOn` consultando feriados depois).
- **UI por dia** (Story 75-59).
- Remoção das colunas antigas de `roleta_config` (cleanup futuro, após a UI nova).
- **Migrar os consumidores de SLA para a agenda por dia** (`api/cron/sla-alerts/route.ts:111,196` e
  `broker/leads/page.tsx:122`, que usam `businessMinutesBetween`/`isWithinBusinessHoursNow` com a `BusinessHoursCfg`
  antiga) → **fast-follow** (Story futura). NESTA story o motor deve permanecer **retrocompatível**: as funções
  `businessMinutesBetween`/`isWithinBusinessHoursNow` (assinatura `BusinessHoursCfg`) continuam existindo e
  funcionando, para SLA e broker/leads não quebrarem. As funções novas (agenda por dia) são adicionadas ao lado.

## Acceptance Criteria
1. **Given** a migração aplicada, **when** consultada `roleta_schedule`, **then** cada org tem 7 linhas refletindo
   exatamente a `roleta_config` anterior (prod = todos os dias 08–20) — sem mudança de comportamento.
2. **Given** uma agenda "sáb 09–14, dom fechado, seg–sex 08–20", **when** chega um lead **domingo 10:00**, **then**
   a contagem o atribui ao **próximo dia útil** (segunda); **when** chega **sábado 15:00** (após fechar), **then**
   conta na segunda; **when** chega **sábado 11:00**, **then** conta no sábado.
3. **Given** o motor, **when** `isOpenAt(now)` é chamado num dia/horário fechado, **then** retorna false usando a
   agenda por dia (não a regra antiga).
4. **Given** a distribuição da roleta, **when** decide `fora_horario`, **then** usa o MESMO motor da contagem
   (sem função duplicada) — comportamento idêntico ao atual com a config vigente.
5. **Given** os 5 call sites da Story 75-57, **then** continuam funcionando sem alteração (assinaturas mantidas);
   o número de "Leads hoje" agora respeita dias fechados.
6. **Given** a tela atual da Roleta salvando horário, **then** as 7 linhas de `roleta_schedule` são derivadas e
   atualizadas (transição sem gap até a 75-59).
7. typecheck/lint/vitest limpos; testes do motor e do commercial-day cobrindo dia fechado, sábado curto, virada de
   fechamento, e roll-forward sobre múltiplos dias fechados.

## Dev Notes
- Servidor em `America/Sao_Paulo` (`instrumentation.ts`); o motor já lida com timezone via `BusinessHoursCfg`.
- Motor a estender: `packages/web/src/lib/roleta/business-time.ts` — exports atuais: `BusinessHoursCfg`,
  `isWithinBusinessHoursNow`, `businessMinutesBetween`. NÃO quebrar `businessMinutesBetween` (usado pelo SLA, Story 75-48).
- Distribuição: `packages/web/src/lib/roleta/distributor.ts:37-56` (`isWithinBusinessHours`) e o SELECT da config em ~68-69.
- Métrica: `packages/web/src/lib/metrics/commercial-day.ts` + `commercial-day.test.ts` (regra fechamento→fechamento da 75-57).
- Save da config: `packages/web/src/app/api/roleta/config/route.ts` (PATCH, upsert em `roleta_config`, roles admin/supervisor/gerente-comercial).
- Migração: conferir próximo número livre em `supabase/migrations/` (última = 114).
- Premissa de design p/ feriados (fase futura): `isOpenOn(date)` deve ser o ponto único onde, depois, entra a
  checagem de feriado.

### Testing
- `business-time.test.ts` (estender) e `commercial-day.test.ts` (reescrever): cenários — dia fechado, sábado
  09–14, virada no fechamento por dia, roll-forward sobre 1+ dias fechados, agenda "todos 08–20" (igual hoje).
- Migração idempotente; verificar seed de 7 linhas por org.
- `vitest packages/web` + `tsc --noEmit` + lint.

## Riscos
- **Migração/seed incorreto** muda comportamento silenciosamente. Mitigação: AC1 + teste de que "todos 08–20" se
  mantém; revisar derivação weekend. **Médio.**
- **Gap de transição** (tela antiga deixa de controlar o motor). Mitigação: AC6 (derivar schedule no save). **Médio.**
- **Quebrar `businessMinutesBetween`/SLA** ao mexer no motor. Mitigação: não alterar assinatura; testes do SLA verdes. **Baixo.**
- **Complexidade do roll-forward** (loops de dias fechados). Mitigação: limite de iterações + testes de borda. **Baixo.**

## File List
- `supabase/migrations/115_roleta_schedule.sql` (novo) — tabela + RLS + seed das 7 linhas/org.
- `packages/web/src/lib/roleta/business-time.ts` — motor de agenda por dia (DaySchedule/WeekSchedule, `isOpenAtNow`, `commercialDayRange`/`previousCommercialDayRange` cientes da agenda, `deriveScheduleFromConfig`, `getOrgSchedule`); funções `BusinessHoursCfg` antigas intactas.
- `packages/web/src/lib/roleta/business-time.test.ts` — +testes de agenda (dom fechado, sáb curto, virada, roll-forward).
- `packages/web/src/lib/metrics/commercial-day.ts` — vira adaptador fino sobre o motor (assinaturas `*ForOrg` mantidas).
- `packages/web/src/lib/metrics/commercial-day.test.ts` — **removido** (testes da assinatura antiga; cobertura migrou p/ business-time.test.ts).
- `packages/web/src/lib/roleta/distributor.ts` — usa `isOpenAtNow(getOrgSchedule)`; removida a `isWithinBusinessHours` duplicada.
- `packages/web/src/app/api/roleta/config/route.ts` — deriva e grava as 7 linhas no save (transição sem gap).

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.58-agenda-flexivel-motor-backend.yml`) · readiness 9/10
- 7/7 checagens OK. **262/262 testes web verdes** (motor: 19, inclui domingo fechado/sáb curto/roll-forward); typecheck exit 0.
- Anti-alucinação: **zero referências órfãs** aos exports/função removidos; 5 call sites com assinaturas preservadas.
- **Retrocompat confirmada:** SLA (`sla-alerts`, `broker/leads`) usa as funções `BusinessHoursCfg` intactas → sem regressão.
- **Ordem de deploy SEGURA:** se o código subir antes da migration 115, `getOrgSchedule` cai no fallback (deriva da `roleta_config`) → comportamento idêntico.
- **Pós-deploy (@devops):** aplicar migration 115 e confirmar o seed (AC1: 7 linhas, todas 08–20 abertas).
- Observações low (não bloqueiam): campos antigos da `RoletaConfig` sem uso; config route re-deriva schedule em todo save.

## Dev Agent Record
- **Agent Model:** Claude Opus 4.8 (1M)
- **Completion Notes:**
  - Motor reaproveita os helpers tz-aware existentes (`tzParts`/`wallToUtcMs`/`tzMinutesOfDay`) — agenda 100% no fuso configurado.
  - `commercialDayRange` acha a âncora = 1º dia aberto ≥ hoje com fechamento > now, e o `from` = fechamento do dia aberto anterior (loops com teto de 14, fallback defensivo se agenda toda fechada).
  - **Retrocompatível:** `businessMinutesBetween`/`isWithinBusinessHoursNow` (assinatura `BusinessHoursCfg`) intactas → SLA (`sla-alerts`, `broker/leads`) não quebra. Migrar SLA p/ agenda por dia = fast-follow.
  - Distribuição lê `roleta_schedule` (fonte da verdade) via `getOrgSchedule` — mesma fonte da contagem. Campos de horário antigos da `RoletaConfig`/select ficaram sem uso (cleanup futuro, junto com a remoção das colunas).
  - **Validação:** `vitest packages/web` → **262/262 verdes** (motor: 19, inclui dom fechado/sáb curto/roll-forward); `tsc --noEmit` (web) **exit 0**.
  - **Migration 115 NÃO aplicada em prod** (responsabilidade @devops no deploy). Seed preserva o comportamento atual (todos 08–20).

## Change Log
- 2026-06-25 — @sm — Story criada. Backend do épico de agenda flexível: tabela `roleta_schedule` (por dia) +
  migração que preserva o comportamento atual + motor único (`business-time.ts`) consumido por distribuição e
  contagem (75-57) + transição sem gap. Feriados e UI fora de escopo. Ver [[project-agenda-comercial-flexivel]].
- 2026-06-25 — @po — Validação (checklist 10 pontos): **GO**, score 9/10. Anti-alucinação: `roleta_schedule`
  inexistente (ok criar); motor tem consumidores de SLA reais (`sla-alerts`, `broker/leads`). Refinado escopo:
  motor permanece RETROCOMPATÍVEL (`BusinessHoursCfg`) p/ SLA não quebrar; migrar SLA p/ agenda por dia = fast-follow.
  Status Draft → Ready.
- 2026-06-25 — @dev — Implementado: migration 115 (`roleta_schedule` + seed), motor de agenda por dia em
  `business-time.ts`, commercial-day vira adaptador, distribuição unificada, config route deriva schedule no save.
  262/262 testes web verdes, typecheck limpo. Status Ready → Review.
- 2026-06-25 — @qa — Gate **PASS** (9/10). 262/262 verdes; sem referências órfãs; retrocompat do SLA confirmada;
  ordem de deploy segura (fallback). Pendente @devops: aplicar migration 115 + confirmar seed (AC1).
