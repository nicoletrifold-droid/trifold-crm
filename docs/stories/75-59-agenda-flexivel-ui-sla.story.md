# Story 75-59 — Agenda comercial flexível: UI por dia + migração do SLA (fecha o épico)

## Metadata
- **Status:** Review · **Epic:** 75 · **Branch:** main · **Complexidade:** L (8 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, vitest]

## Story
**As a** gestão comercial (admin/supervisor/gerente-comercial), **I want** configurar o horário de
funcionamento **por dia da semana** direto na tela da Roleta (cada dia aberto/fechado com seu horário) e que
o **SLA** (alertas e tempo de atendimento) respeite essa mesma agenda, **so that** o sistema responda a
qualquer agenda de forma totalmente consistente — distribuição, contagem por dia E SLA na mesma fonte.

## Contexto
A Story 75-58 entregou o **backend** (tabela `roleta_schedule` por dia + motor único em `business-time.ts`),
já consumido pela **distribuição** e pela **contagem por dia comercial**. Falta: (a) a **UI** pra editar a
agenda por dia (hoje a tela só tem "Início/Fim" dos dias úteis + um fim de semana), e (b) migrar o **SLA**, o
último consumidor que ainda lê o modelo antigo (`roleta_config` via `BusinessHoursCfg`). Esta story **fecha o
épico** (ver [[project-agenda-comercial-flexivel]]). **Feriados** seguem fora (fase posterior).

⚠️ Ponto crítico: a Story 75-58 deixou uma **derivação de transição** no `PATCH /api/roleta/config` (gera as 7
linhas a partir dos campos antigos a cada save). Com a UI nova editando `roleta_schedule` direto, essa derivação
**precisa ser removida** — senão salvar qualquer config (ex.: toggle de notificação) sobrescreveria a agenda
por dia com uma projeção lossy.

## Escopo
**IN — UI por dia:**
1. `dashboard/roleta/_components/roleta-config-panel.tsx` — substituir a seção "HORÁRIO DE FUNCIONAMENTO"
   (toggle de dias + Início/Fim + bloco "fim de semana") por **7 linhas (Dom–Sáb)**, cada uma com: **toggle
   aberto/fechado** + **abre** (time) + **fecha** (time). Tema segue a convenção `/dashboard` (light/dark com
   `dark:`, [[feedback-theme-convention]]) — manter o padrão das classes já usadas no painel.
2. `dashboard/roleta/page.tsx` — carregar as 7 linhas de `roleta_schedule` (via `getOrgSchedule` ou query) e
   passar ao painel como `initialSchedule`.

**IN — Persistência:**
3. Novo endpoint `PATCH /api/roleta/schedule` (mesmos roles: admin/supervisor/gerente-comercial) que faz
   `upsert` das 7 linhas em `roleta_schedule` (`onConflict: org_id,weekday`). O painel passa a salvar a agenda
   por aí; as demais configs (is_active, notify_*, priorizar, max_leads, timezone) continuam no
   `PATCH /api/roleta/config`.
4. `PATCH /api/roleta/config` — **REMOVER** a derivação de transição da 75-58 (não pode mais reescrever a agenda).

**IN — Migração do SLA (último consumidor):**
5. `lib/roleta/business-time.ts` — adicionar versão **ciente da agenda** de minutos de expediente:
   `businessMinutesBetween(from, to, week, tz)` (sobrecarga/nome novo), reusando a lógica existente mas pela
   `WeekSchedule`. Manter a versão `BusinessHoursCfg` se ainda houver consumidor; o objetivo é zerar o uso dela.
6. `api/cron/sla-alerts/route.ts` — trocar `isWithinBusinessHoursNow(bh)`/`businessMinutesBetween(...,bh)`
   (linhas ~111, ~196) pela agenda por dia (`isOpenAtNow`/novo `businessMinutesBetween` com `getOrgSchedule`).
7. `broker/leads/page.tsx` — trocar `businessMinutesBetween(...,bh)` (linha ~122) pela versão por agenda.

**OUT:**
- **Feriados** (fase posterior — `isOpenOn` é o ponto de extensão).
- **Remoção das colunas antigas** de `roleta_config` (`business_days`, `business_hour_*`, `weekend_hour_*`) e da
  interface `BusinessHoursCfg` — após esta story ninguém mais as lê; o DROP fica como cleanup futuro (baixo risco).

## Acceptance Criteria
1. **Given** a tela da Roleta, **when** aberta, **then** mostra 7 dias (Dom–Sáb), cada um com aberto/fechado +
   abre + fecha, refletindo `roleta_schedule`.
2. **Given** o gestor edita um dia (ex.: Sáb 09–14, Dom fechado), **when** salva, **then** as linhas de
   `roleta_schedule` são atualizadas via `PATCH /api/roleta/schedule` (sem tocar nos campos antigos).
3. **Given** o gestor salva uma config NÃO-horário (ex.: toggle de notificação), **when** persiste, **then** a
   agenda por dia **NÃO** é alterada (derivação removida do config route).
4. **Given** o SLA (alertas `sla-alerts` e coluna "tempo esperando" em `broker/leads`), **then** usa a agenda
   por dia: pausa em dia fechado e respeita o horário de cada dia (mesma fonte da distribuição/contagem).
5. **Given** a config atual (todos os dias 08–20), **then** comportamento da tela, do SLA e da distribuição é
   idêntico ao de hoje (sem regressão).
6. Permissões: só admin/supervisor/gerente-comercial salvam a agenda (403 caso contrário), igual ao config.
7. typecheck/lint/vitest limpos; testes do `businessMinutesBetween` por agenda (incl. dia fechado).

## Dev Notes
- Backend pronto (75-58): `roleta_schedule` (7 linhas/org), motor em `lib/roleta/business-time.ts`
  (`getOrgSchedule`, `isOpenAtNow`, `commercialDayRange`, `deriveScheduleFromConfig`). `weekday` 0=Dom…6=Sáb.
- Painel atual: `roleta-config-panel.tsx` (client, salva via `fetch PATCH /api/roleta/config`); `DAYS` já é
  `["Dom".."Sáb"]`. Reusar o padrão de classes (`selectCls`, `dark:`).
- SLA consumidores: `api/cron/sla-alerts/route.ts:111,196`; `broker/leads/page.tsx:122`. Hoje montam `bh:
  BusinessHoursCfg` a partir de `roleta_config`. Passar a carregar a agenda (`getOrgSchedule`) e usar as funções
  por `WeekSchedule`.
- Config route: a derivação adicionada na 75-58 (bloco "Story 75-58 (transição)") deve sair.
- Não esquecer: o endpoint novo precisa do mesmo guard de role do `config/route.ts`.

### Testing
- `business-time.test.ts`: cobrir `businessMinutesBetween` por agenda (dia útil normal, pausa em dia fechado,
  sábado curto). Reaproveitar cenários da 75-58.
- Verificação manual: tela salva agenda por dia; SLA pausa em dia fechado; config atual = comportamento idêntico.
- `vitest packages/web` + `tsc --noEmit` + lint.

## Riscos
- **Derivação não removida** → salvar config clobbera a agenda por dia. Mitigação: AC3 + remoção explícita. **Médio.**
- **SLA regressão** ao migrar a base de horário. Mitigação: testes do `businessMinutesBetween` por agenda + AC5
  (config atual idêntica). **Médio.**
- **UI/UX** (7 linhas) divergir do tema. Mitigação: reusar classes existentes; convenção light/dark. **Baixo.**

## File List
- `packages/web/src/app/dashboard/roleta/_components/roleta-config-panel.tsx` — seção de horário vira 7 linhas (Dom–Sáb: toggle aberto/fechado + abre/fecha); salva via `/api/roleta/schedule`; removido `toggleDay`.
- `packages/web/src/app/dashboard/roleta/page.tsx` — carrega `roleta_schedule` (7 linhas) e passa `initialSchedule`.
- `packages/web/src/app/api/roleta/schedule/route.ts` (novo) — GET + PATCH (role guard + validação HH:MM) upsert das 7 linhas.
- `packages/web/src/app/api/roleta/config/route.ts` — **removida** a derivação de transição (e o import).
- `packages/web/src/lib/roleta/business-time.ts` — `businessMinutesBetweenSchedule(from,to,week,tz)` (versão por agenda).
- `packages/web/src/lib/roleta/business-time.test.ts` — +3 testes do `businessMinutesBetweenSchedule` (dia útil, pausa noturna, dia fechado).
- `packages/web/src/app/api/cron/sla-alerts/route.ts` — usa `getOrgSchedule`/`isOpenAtNow`/`businessMinutesBetweenSchedule`.
- `packages/web/src/app/broker/leads/page.tsx` — coluna "tempo esperando" usa `getOrgSchedule`/`businessMinutesBetweenSchedule`.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.59-agenda-flexivel-ui-sla.yml`) · readiness 9/10
- 7/7 checagens OK. **265/265 testes web verdes** (motor: 22, inclui `businessMinutesBetweenSchedule` em dia fechado); typecheck exit 0.
- Anti-alucinação: AC3 confirmado (config route não escreve schedule — só comentário); SLA migrado **sem órfãos** (grep); funções antigas sem consumidor de produção.
- AC5: com a config atual (08–20 todos os dias) o SLA dá resultado idêntico ao modelo antigo.
- **Observação low:** mudança de UI sem teste de renderização — recomendada verificação VISUAL manual da tela /dashboard/roleta pós-deploy.

## Dev Agent Record
- **Agent Model:** Claude Opus 4.8 (1M)
- **Completion Notes:**
  - UI: 7 linhas por dia, auto-salvam (toggle no clique; horas no `onBlur`) via `PATCH /api/roleta/schedule`. Tema light/dark mantido.
  - **Derivação removida** do config route → salvar config não-horário não toca mais a agenda (AC3).
  - **SLA migrado** (último consumidor): `sla-alerts` e `broker/leads` agora leem a agenda por dia → TODOS os consumidores (distribuição, contagem, SLA) na mesma fonte (`roleta_schedule`). As funções antigas `BusinessHoursCfg` (`businessMinutesBetween`/`isWithinBusinessHoursNow`) ficaram **sem consumidor de produção** (só testes) — cleanup junto com o DROP das colunas (futuro).
  - **Validação:** `vitest packages/web` → **265/265 verdes** (motor: 22, inclui `businessMinutesBetweenSchedule` com dia fechado); `tsc --noEmit` (web) **exit 0**.
  - Sem migration nesta story (a 115 da 75-58 já criou a tabela). Verificação visual da tela 7-dias = recomendada no QA/manual.

## Change Log
- 2026-06-25 — @sm — Story criada. Fecha o épico de agenda flexível: UI por dia (7 linhas) + endpoint de
  schedule + remoção da derivação de transição + migração do SLA (último consumidor) pra agenda por dia.
  Feriados e DROP das colunas antigas ficam fora. Ver [[project-agenda-comercial-flexivel]].
- 2026-06-25 — @po — Validação (10 pontos): **GO**, 9/10. Anti-alucinação: SLA migrável (`sla-alerts` tem
  admin+org loop e monta bh@103; `broker/leads` tem supabase+orgId); derivação a remover confirmada (config
  route 75-86). Após migrar SLA, funções `BusinessHoursCfg` ficam sem consumidor (cleanup com o DROP futuro).
  Status Draft → Ready.
- 2026-06-25 — @dev — Implementado: UI 7 dias + endpoint `/api/roleta/schedule` + derivação removida do config
  route + SLA migrado (sla-alerts, broker/leads) pra agenda por dia. 265/265 testes web verdes, typecheck limpo.
  Status Ready → Review.
- 2026-06-25 — @qa — Gate **PASS** (9/10). AC3 confirmado (config não escreve schedule); SLA sem órfãos; 265/265
  verdes. Observação: verificar VISUALMENTE a tela 7-dias pós-deploy. Épico fechado (3 consumidores na mesma fonte).
