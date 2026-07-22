# Story 75-198 — Teto de leads ativos: excluir Perdido/Não Qualificado (bolsão + roleta) e corrigir contagem truncada na tela de Corretores

## Metadata
- **Status:** InReview
- **Epic:** 75 — CRM core / relacionado ao Epic 64 (bolsão) e à Story 75-153 (perdido = ETAPA)
- **Branch:** fix/bolsao-limite-robson (worktree isolado)
- **Tipo:** Bug — reportado pelo corretor Robson via Marcos (2026-07-22, print do WhatsApp):
  ao pegar lead do bolsão recebeu "Você atingiu seu limite de leads ativos", mas a tela
  Config › Corretores mostrava 198/300.

## Context
Diagnóstico de 2026-07-22, confirmado no banco de PROD:

1. **Bug raiz — régua do teto desatualizada.** As RPCs `pegar_lead_bolsao`
   (mig 164, guard `teto`) e `roleta_pick_and_advance` (mig 156, filtro de
   elegibilidade) contam o teto como `COUNT(*) ... is_active = true`, **sem excluir
   as etapas Perdido/Não Qualificado**. A Story 75-153/mig 170 firmou a convenção
   "perdido = ETAPA, nunca lost_reason" e corrigiu as 6 contagens de
   `get_broker_dashboard_counts`, mas as duas RPCs de distribuição ficaram para trás.
   Números do Robson em prod: **301** pela régua antiga (≥ 300 → `teto`) vs **89**
   excluindo as etapas de perdido. Efeito colateral pior: a roleta também está
   **pulando o Robson silenciosamente** (mesmo critério).
2. **Bug de exibição — contagem truncada.** `GET /api/brokers`
   (`packages/web/src/app/api/brokers/route.ts:39-44`) baixa os leads ativos da org
   e conta em JS, sem paginação. O PostgREST corta em 1000 linhas e a org tem
   **1440** leads ativos atribuídos → todas as frações X/Y da tela de Corretores
   estão subcontadas (Robson: 198 exibido vs 301 real pela mesma régua).

## Regra de contagem (decisão)
"Leads ativos" para o TETO passa a usar **o mesmo critério do `total` de
`get_broker_dashboard_counts` (mig 170)**, para o corretor ver o mesmo número que
trava a distribuição:
`org_id + segmento = 'principal' + is_active = true + lost_reason IS NULL +
stage_id NOT IN (Perdido, Não Qualificado)`.
- ACERVO (Corretores Antigos / Represamento) **continua contando** — decisão do
  diretor registrada na mig 170; fora de escopo mudar.
- Bolsão e roleta são features do mundo principal → filtrar `segmento='principal'`
  segue a convenção do mundo IMOB isolado.
- UUIDs literais (Postgres não enxerga `stage-filters.ts`):
  `'00000000-0000-0000-0001-000000000008'` = Perdido,
  `'95327bd7-3e88-4038-aa16-250a74ab085c'` = Não Qualificado.
- Para não duplicar a régua em 3 lugares, criar função SQL única
  `broker_active_leads_count(p_org_id uuid, p_broker_user_id uuid) RETURNS integer`
  e usá-la nas duas RPCs; a tela consome a mesma régua via RPC de listagem.

## Scope
**IN:**
- Migration `185_teto_leads_exclui_perdidos.sql`:
  - `broker_active_leads_count(...)` (nova, SECURITY DEFINER, STABLE);
  - `pegar_lead_bolsao` — guard `teto` passa a usar a função (resto IDÊNTICO à 164);
  - `roleta_pick_and_advance` — filtro `max_leads` passa a usar a função (resto
    IDÊNTICO à 156);
  - `get_brokers_active_lead_counts(p_org_id uuid)` (nova) — retorna
    `(user_id, active_leads)` por corretor da org usando a MESMA função, para a tela.
- `GET /api/brokers`: substituir o download+reduce em JS pela RPC
  `get_brokers_active_lead_counts` (elimina o truncamento em 1000).
- `dashboard/configuracoes/corretores/page.tsx` (a tela do print — server
  component que DUPLICA a mesma contagem truncada): mesma troca pela RPC.

**OUT:**
- Mudar a regra do ACERVO (continua contando).
- `get_broker_dashboard_counts` (já correto desde a mig 170).
- Limpeza/arquivamento dos ~212 leads do Robson em etapas de perdido.
- Distribuidor TS (`lib/roleta/distributor.ts`) — não tem contagem própria de teto
  (delega à RPC); além disso está sendo editado pela 75-197 em outra branch.
- `max_leads_per_day` (régua diária da roleta, baseada em `lead_distribution_log`).

## Acceptance Criteria
- [x] AC1: `broker_active_leads_count` criada com a régua acima + as duas RPCs
  reescritas usando-a; nenhum outro comportamento das RPCs muda (lock, guards
  `gone`/`ex_dono`/`sem_corretor`/`empreendimento`, logging).
- [ ] AC2: com a mig aplicada, o Robson (89 leads reais / max 300) consegue pegar
  lead do bolsão e volta a ser elegível na roleta.
- [x] AC3: `GET /api/brokers` E a tela Config › Corretores (`corretores/page.tsx`)
  mostram `active_leads_count` exato para TODOS os corretores mesmo com >1000 leads
  ativos na org, usando a mesma régua do teto (tela e trava não divergem mais).
- [ ] AC4 (não quebrar o que funciona): comportamento intacto para corretor NO teto
  real (contagem nova ≥ max_leads → `teto`); `ex_dono` continua bloqueando antes do
  teto; testes existentes de bolsão/roleta verdes.
- [ ] AC5: migration aplicada em DEV e PROD (validar schema remoto — lição 75-188)
  e registrada em `schema_migrations`; conferência pós-aplicação com os números do
  Robson (SELECT da função = 89±movimentação do dia).
- [x] AC6: type-check/lint/suíte verdes.

## Risks
- `segmento` pode não existir no dev DB (lição da mig 184 — usar DO block defensivo
  OU confirmar coluna antes; em prod existe).
- Corrida de numeração de migration com a 75-197 (outra aba) — conferir `185` livre
  antes do push.
- Corretores hoje "salvos" pela régua antiga (bloqueados indevidamente) passarão a
  receber leads da roleta de novo — é o comportamento desejado, mas o volume
  distribuído pode mudar de um dia para o outro; avisar o gestor.
- A tela passa a exibir números MAIORES ou MENORES que antes (régua exata + sem
  truncamento); comunicar que a referência agora bate com o dashboard do corretor.

## File List
- `docs/stories/75-198-teto-leads-exclui-perdidos.story.md` (this file)
- `supabase/migrations/185_teto_leads_exclui_perdidos.sql` (nova)
- `packages/web/src/app/api/brokers/route.ts` (contagem via RPC)
- `packages/web/src/app/api/brokers/route.test.ts` (novo — cobre GET com RPC)
- `packages/web/src/app/dashboard/configuracoes/corretores/page.tsx` (contagem via RPC)

## Dev Notes
- Prod numbers (2026-07-22): Robson `user_id 25b550d5-41fd-44c4-bb17-cd0e3cca849c`,
  `max_leads 300`; 301 ativos pela régua antiga, 89 pela nova; org com 1440 ativos
  atribuídos (fonte do truncamento em 1000 do PostgREST).
- Régua nova CONFIRMADA em prod antes do draft: 89 = mesmo número do dashboard do
  corretor (critério mig 170).

## Change Log
- @sm (River) 2026-07-22: draft criado a partir do diagnóstico da sessão (print do
  Robson + contagens confirmadas em prod via service role, somente leitura).
- @po (Pax) 2026-07-22: GO 10/10 → Ready. Premissas conferidas: mig 164 é a versão
  viva de `pegar_lead_bolsao` e mig 156 de `roleta_pick_and_advance` (nenhuma
  posterior); régua nova confirmada em prod = 89 p/ Robson; DESCOBERTA: a tela do
  print é `corretores/page.tsx` (server component) que duplica a contagem truncada
  do `/api/brokers` — ambos entraram no escopo; detalhe do corretor e painel da
  roleta não contam leads (fora). Branch rebased em origin/main pós-merge da 75-197
  (#261); numeração 185 livre.
- @dev (Dex) 2026-07-22: implementado. Régua única em `broker_active_leads_count`
  (DO block cria variante sem `segmento` quando a coluna não existe — dev DB);
  RPCs reescritas com diff cirúrgico (só o teto); telas via
  `get_brokers_active_lead_counts` (guard de org via `public_user_id()`, grant só
  authenticated/service_role). Migration aplicada e smoke-testada no DEV (variante
  sem segmento confirmada; registrada em schema_migrations).
- @qa (Quinn) 2026-07-22: PASS — suíte 1144/1144; type-check 8/8 verde; lint com 12
  erros PRÉ-EXISTENTES da main, nenhum em arquivo da story; diff das RPCs 185 vs
  164/156 = somente as linhas do teto; ex_dono continua avaliado ANTES do teto;
  teste novo cobre RPC + fallback 0 + data null + 401. AC2/AC5 pendentes de PROD
  (@devops).
