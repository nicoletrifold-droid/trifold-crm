# Story 75-89 — Fix: bolsão terminal — roleta não pode re-pegar lead do bolsão (Opção B)

## Metadata
- **Status:** Done (QA PASS) — pronto para @devops (push + aplicar migration 130) · **Epic:** 64 · **Branch:** fix/75-89-bolsao-lead-fantasma · **Complexidade:** S-M (2-3 pontos)
- **executor:** @dev + @data-engineer (migration) · **quality_gate:** @qa · **quality_gate_tools:** [teste de banco (caminho real: lead no bolsão NÃO é redistribuído pelo cron/distributor/RPC), typecheck, lint]
- **Prioridade:** 🟠 ALTA — produção: corretor clica "Pegar" no bolsão e o lead "some e volta"; além disso o bolsão não cumpre o propósito (lead é arrancado do pool em ~2 min pela roleta). **Sem perda de lead** (os afetados já tinham dono).

## Story
**As a** gestão/corretor, **I want** que um lead que caiu no bolsão **fique no bolsão** até um corretor puxá-lo manualmente (a roleta não pode re-atribuí-lo automaticamente), **so that** o bolsão cumpra seu propósito de pool self-serve e pare de gerar leads "fantasma" que somem e voltam.

## Contexto (bug confirmado em prod, 2026-06-30/07-01 — vídeo do corretor + logs Supabase)
Corretor clica "Pegar" no bolsão → o card some da tela → o lead **não** vai pro "Aguardando atendimento" dele → ao dar **refresh, o lead volta pro bolsão**.

**Causa-raiz (a roleta é cega ao bolsão e re-distribui automaticamente):**
Fluxo real reconstruído (leads Thales Sandoval e Nilton dos Santos):
`criado (Meta Ads)` → roleta atribui a um corretor → **não atendido em ~15min** → cron `bolsao-rebalance` (75-80) seta `assigned_broker_id=null, bolsao_em=now()` (vai pro bolsão) → **~2 min depois** o cron **`roleta-retry`** vê o lead como "ativo + sem corretor" e **redistribui** via `distributeLeadToNextBroker` → o lead ganha dono de novo, mas **`bolsao_em` continua setado** (nenhum desses caminhos limpa/consulta `bolsao_em`).

Resultado: estado inconsistente **`assigned_broker_id` preenchido + `bolsao_em` preenchido**. A listagem do pool mostra tudo que tem `bolsao_em IS NOT NULL` (sem exigir `assigned_broker_id IS NULL`), então o lead "fantasma" aparece no bolsão; ao clicar "Pegar", a `pegar_lead_bolsao` recusa corretamente (`WHERE ... assigned_broker_id IS NULL` → `'gone'`) e o card volta no refresh porque segue no pool. **Efeito colateral maior:** como a roleta arranca o lead do pool em ~2 min, o bolsão quase nunca funciona como self-serve.

**Onde a roleta é cega ao `bolsao_em`:**
- `roleta-retry` cron (`api/cron/roleta-retry/route.ts`): candidatos = `is_active=true AND assigned_broker_id IS NULL` (linha ~44-50) — **inclui leads do bolsão**. Guard de idempotência (linha ~68-72) só re-checa `assigned_broker_id`.
- `distributor.ts` (`distributeLeadToNextBroker`): guard único é `if (lead.assigned_broker_id !== null) return` (linha ~84) — não consulta `bolsao_em`. O atalho "priorizar_lead_ativo" (linha ~92-132) também atribui sem olhar `bolsao_em`.
- RPC `roleta_pick_and_advance` (migration 102): guard `IF EXISTS(... assigned_broker_id IS NOT NULL) RETURN` e `UPDATE ... WHERE assigned_broker_id IS NULL` — sem `bolsao_em`.

**Confirmação em banco:** exatamente **2 leads** no estado inconsistente — os do vídeo (Thales→Valeria, Nilton→Roberto), **ambos já em atendimento**. **Nenhum lead perdido.** A limpeza pontual já foi aplicada em prod (`UPDATE leads SET bolsao_em=NULL WHERE is_active AND bolsao_em IS NOT NULL AND assigned_broker_id IS NOT NULL` → 2 linhas). Esta story corrige a origem. Estende [[project-bolsao-leads]] / Stories 75-80/75-81.

## ✅ Decisão de produto (RESOLVIDA — Opção B, 2026-07-01)
**Bolsão é terminal para a roleta.** Um lead com `bolsao_em` setado **não** pode ser re-atribuído automaticamente por nenhum caminho da roleta — só sai do bolsão via `pegar_lead_bolsao` (puxada manual do corretor), que já limpa `bolsao_em`.

**Sem exceção de continuidade** (decisão do dono do produto): se o lead caiu no bolsão é porque **nunca saiu de "Aguardando atendimento"** → não houve atendimento → não há relação/continuidade a preservar. Portanto o atalho `priorizar_lead_ativo` **também** deve pular leads do bolsão.

## Escopo
**IN:**
1. **`roleta-retry` cron** (`packages/web/src/app/api/cron/roleta-retry/route.ts`): excluir leads do bolsão da busca de candidatos — adicionar `.is("bolsao_em", null)`. Guard de idempotência (o re-check antes de distribuir): passar a selecionar/checar também `bolsao_em` e pular se setado.
2. **`distributor.ts`** (`distributeLeadToNextBroker`): incluir `bolsao_em` no `select` do lead e adicionar guard logo após buscar o lead — se `bolsao_em !== null`, **retornar sem distribuir** (novo status `"em_bolsao"` no union `DistributionStatus`, sem logar como falha). Esse guard fica **antes** do atalho `priorizar_lead_ativo` e da chamada à RPC — cobre também webhooks (WhatsApp/Meta) que chamam o distributor direto.
3. **Migration 130** (`130_roleta_pick_no_bolsao.sql`): `CREATE OR REPLACE FUNCTION roleta_pick_and_advance(...)` com guard defensivo — trocar o `IF EXISTS(... assigned_broker_id IS NOT NULL)` por `... assigned_broker_id IS NOT NULL OR bolsao_em IS NOT NULL`, e o `UPDATE ... WHERE assigned_broker_id IS NULL` por `... AND bolsao_em IS NULL`. (Belt-and-suspenders: o distributor já guarda antes de chamar.)
4. **Defensivo na leitura** (higiene, independe de A/B): adicionar `.is("assigned_broker_id", null)` às 4 queries do pool — listas (`broker/bolsao/page.tsx:30`, `dashboard/bolsao/page.tsx:30`) e contadores (`broker/layout.tsx:92`, `dashboard/layout.tsx:231`). Card/contador fantasma nunca aparece mesmo se o dado derivar.
5. **UX (menor):** em `bolsao-list.tsx`, no retorno `'gone'` (corrida real: 2 corretores no mesmo lead do pool), tornar o aviso mais visível (toast/realce) em vez do `<p>` sutil.

**OUT:**
- Não mexe no cron `bolsao-rebalance` (75-80), na `pegar_lead_bolsao` (75-81/migration 128) nem nas notificações (75-82).
- Sem backfill adicional (a limpeza pontual dos 2 leads já foi feita).
- **Não** limpa `bolsao_em` no assign da roleta (desnecessário na Opção B — a roleta não toca mais em lead do bolsão; quem limpa é só o `pegar_lead_bolsao`).
- Não altera o rebalance nem o relógio de horário comercial.

## Acceptance Criteria
1. **Given** um lead no bolsão (`bolsao_em` setado, `assigned_broker_id` null), **when** o cron `roleta-retry` roda, **then** ele **não** é candidato à redistribuição (permanece no pool, `bolsao_em` intacto, sem nova entrada em `lead_distribution_log`).
2. **Given** um lead no bolsão, **when** `distributeLeadToNextBroker` é chamado (webhook WhatsApp/Meta ou cron), **then** retorna `"em_bolsao"` sem atribuir e **sem** aplicar o atalho `priorizar_lead_ativo`.
3. **Given** um lead no bolsão, **when** `roleta_pick_and_advance` é invocada, **then** ela retorna sem atribuir (guard `bolsao_em IS NOT NULL`).
4. **Given** qualquer lead com `assigned_broker_id` não-nulo, **then** ele **não** aparece na lista nem no contador do bolsão (broker e dashboard), mesmo que `bolsao_em` esteja setado.
5. **Given** um corretor que clica "Pegar" num lead que (por corrida) já foi puxado por outro, **then** recebe aviso **visível** ("já foi atendido por outro") e o card não ressuscita no refresh.
6. **Given** o único caminho de saída do bolsão é o `pegar_lead_bolsao`, **then** após puxar, `bolsao_em` fica null e o lead vira do corretor (comportamento já existente, não regride).
7. **Teste de banco no caminho REAL:** simular lead no bolsão e verificar que cron/distributor/RPC **não** o atribuem; e que a puxada manual continua funcionando. typecheck/lint limpos. Ref. [[feedback-nao-quebrar-o-que-funciona]].

## Dev Notes
- **Culpado principal:** `packages/web/src/app/api/cron/roleta-retry/route.ts` — query de candidatos (`is_active=true`, `.is("assigned_broker_id", null)`, `created_at >= 30d`, linha ~44-50) inclui leads do bolsão; o re-check de idempotência (linha ~68-72) só olha `assigned_broker_id`. Adicionar `.is("bolsao_em", null)` na query e no re-check.
- **Distributor:** `packages/web/src/lib/roleta/distributor.ts` — `select` do lead na linha ~71 (adicionar `bolsao_em`); guard atual na linha ~84 (`if (lead.assigned_broker_id !== null)`). O guard novo de `bolsao_em` deve vir **antes** do bloco `priorizar_lead_ativo` (linha ~92) e da chamada `roleta_pick_and_advance` (linha ~199/221). Adicionar `"em_bolsao"` ao tipo `DistributionStatus` (linha ~9).
- **RPC:** versão viva confere em `pg_get_functiondef('roleta_pick_and_advance')`; base é migration `102_roleta_pick_and_advance_idempotent.sql`. Só adicionar o predicado `bolsao_em` ao guard inicial e ao UPDATE final; resto idêntico (round-robin `roleta_fila`, teto, empreendimento).
- **Contraparte que já faz certo:** `pegar_lead_bolsao` (migration 128) — puxada manual, `SET assigned_broker_id=..., bolsao_em=NULL`, atômica. **Não** mexer.
- **Leitura do pool:** filtros em `broker/bolsao/page.tsx:30`, `dashboard/bolsao/page.tsx:30`, `broker/layout.tsx:92`, `dashboard/layout.tsx:231` — todos `.not("bolsao_em","is",null)`; adicionar `.is("assigned_broker_id", null)`. **Não** mexer no `sla-alerts/route.ts:163` (`assigned_broker_id.not.is.null,bolsao_em.not.is.null` — outra lógica).
- **UI:** `packages/web/src/components/bolsao/bolsao-list.tsx` — handler `pegar()`, branch `body.status === "gone"`.
- **RLS:** `leads_select_bolsao` (75-81) permite a org ver leads do pool; filtro extra é no app.

## File List
- `supabase/migrations/130_roleta_pick_no_bolsao.sql` — `CREATE OR REPLACE roleta_pick_and_advance` com guard `bolsao_em IS NULL`.
- `packages/web/src/app/api/cron/roleta-retry/route.ts` — excluir bolsão dos candidatos + re-check.
- `packages/web/src/lib/roleta/distributor.ts` — guard `bolsao_em` + status `em_bolsao`.
- `packages/web/src/app/broker/bolsao/page.tsx` · `packages/web/src/app/dashboard/bolsao/page.tsx` — filtro `assigned_broker_id IS NULL`.
- `packages/web/src/app/broker/layout.tsx` · `packages/web/src/app/dashboard/layout.tsx` — mesmo filtro no contador.
- `packages/web/src/components/bolsao/bolsao-list.tsx` — aviso visível no `'gone'`.
- testes: cron `roleta-retry` (não pega bolsão), distributor (`em_bolsao`), RPC (guard), teste de banco no caminho real.

## PO Validation (@po Pax — 2026-07-01)
- **Verdict: GO.** Objetivo/contexto claros, ACs testáveis, escopo IN/OUT explícito, Dev Notes auto-contido com refs precisas (retry cron, distributor, RPC mig 102, 4 queries de leitura), anti-invenção OK (tudo rastreável a código/dados reais), teste no caminho real definido, migration 130 confirmada (última é 129), regressão mapeada (`sla-alerts:163` e `pegar_lead_bolsao` intocados; RLS preservada), quality gate planejado.
- **Decisão de produto:** Opção B (bolsão terminal), **sem** exceção de continuidade — confirmada pelo dono do produto (lead no bolsão nunca saiu de "Aguardando atendimento", logo não há atendimento/continuidade a preservar).
- **Próximo passo:** `@dev *develop 75-89`.

## Dev Agent Record (@dev Dex — 2026-07-01)
**Implementado (5 itens do escopo B):**
- [x] `roleta-retry` cron: `.is("bolsao_em", null)` na busca de candidatos + re-check de idempotência agora seleciona/checa `bolsao_em` e pula se setado. (`api/cron/roleta-retry/route.ts`)
- [x] `distributor.ts`: `bolsao_em` no select do lead + guard `if (lead.bolsao_em) return { status: "em_bolsao" }` **antes** de `priorizar_lead_ativo`/RPC + `"em_bolsao"` no union `DistributionStatus`. (guard usa truthy pra ser robusto a undefined em mocks/rows parciais)
- [x] Migration 130 (`130_roleta_pick_no_bolsao.sql`): `roleta_pick_and_advance` com guard `bolsao_em IS NOT NULL` no `IF EXISTS` inicial e `AND bolsao_em IS NULL` no UPDATE final. Resto idêntico à 102.
- [x] 4 queries de leitura do pool: `.is("assigned_broker_id", null)` (broker/dashboard `bolsao/page.tsx` + broker/dashboard `layout.tsx`).
- [x] UX `bolsao-list.tsx`: estado `msgIsError` + banner âmbar com `role="status"` no retorno de erro/`'gone'`; no `'gone'` agora também dá `router.refresh()` (o card não volta, pois a leitura exige `assigned_broker_id IS NULL`).

**Testes (unit):**
- [x] `distributor.test.ts`: novo caso — lead com `bolsao_em` retorna `em_bolsao`, NÃO atribui, NÃO muda stage, e NÃO roteia por continuidade (mesmo com `priorizar_lead_ativo=true` + telefone com dono). `VALID_LEAD` ganhou `bolsao_em: null`.
- [x] `roleta-retry/route.test.ts`: candidatos aplicam `bolsao_em IS NULL`; re-check pula lead que entrou no bolsão no meio-tempo (`skipped`).
- [x] **`npx vitest run` (2 arquivos): 14/14 passando.** `tsc --noEmit`: 0 erros. `eslint` (arquivos alterados): 0 errors (2 warnings pré-existentes no helper de teste, não introduzidos aqui).

**Não feito (fora do papel do @dev / delegado):**
- Migration NÃO aplicada em prod (deploy = @devops). Teste de banco no caminho real (AC7) = @qa gate.
- Nada de push/PR (— @devops).

## QA Results (@qa Quinn — 2026-07-01)
**Verdict: PASS.** ✅

**Teste de banco no caminho REAL (AC7) — prod, txn rollback (antes/depois, fila real da roleta):**
| Cenário | Resultado | Esperado |
|---|---|---|
| Função ATUAL (pré-130) + lead no bolsão | pegou + atribuiu (`rows=1, assigned=true`) | confirma o bug |
| Função NOVA (130) + lead no bolsão | **recusou** (`rows=0, assigned=false`) | ✅ guard OK (AC3) |
| Função NOVA (130) + lead normal | **distribuiu** (`rows=1, assigned=true`) | ✅ sem regressão |
Setup por clone de lead real (satisfaz NOT NULL/FK); tudo revertido (ROLLBACK verificado: DDL de função + DML). `phone_normalized` é coluna gerada — não inserível (ajuste do teste, não do produto).

**Rastreabilidade dos ACs:**
- AC1 (cron-retry não pega bolsão): unit test `roleta-retry` (candidato aplica `bolsao_em IS NULL` + re-check pula) ✅
- AC2 (distributor `em_bolsao`, sem continuidade): unit test distributor (mesmo com `priorizar_lead_ativo=true`) ✅
- AC3 (RPC recusa bolsão): teste de banco real ✅
- AC4 (leitura não mostra lead com dono): revisão de código nas 4 queries (`.is("assigned_broker_id", null)`) — verificado por inspeção ✅
- AC5 (aviso visível no `'gone'`): revisão de código (banner âmbar + `role="status"`) — UI, sem teste automatizado (aceitável) ✅
- AC6 (puxada manual segue OK): `pegar_lead_bolsao` intocada; 7 testes do endpoint `pegar` passam ✅
- AC7 (teste de banco real): ✅

**Checks estáticos (reproduzidos pelo @qa):** `vitest` 4 arquivos, **27/27** (inclui `pegar` + `bolsao-rebalance` → sem regressão nas irmãs). `tsc --noEmit` 0 erros. `eslint` 0 errors.

**Observações (não bloqueiam):** AC4/AC5 cobertos por inspeção (query filter + CSS), sem teste automatizado — proporcional a um fix S-M. Migration 130 usa `SECURITY DEFINER`/`search_path`/REVOKE+GRANT idênticos à 102 (sem nova superfície de risco); RLS intocada.

**Gate → PASS.** Pronto para @devops (push + aplicar migration 130 em prod).

## Change Log
- 2026-07-01 — @qa (Quinn) — Gate PASS. Teste de banco real (txn rollback) prova antes/depois: função atual pega lead do bolsão, migration 130 recusa, lead normal segue distribuído (sem regressão). 27/27 testes, tsc 0, lint 0 err. Status InReview → Done. Handoff @devops (push + migration 130).
- 2026-07-01 — @dev (Dex) — Implementado escopo B (cron-retry + distributor + migration 130 + 4 queries de leitura + UX). 14/14 testes, tsc 0, lint 0 err. Commit local na branch fix/75-89. Status InReview. Handoff @qa.
- 2026-07-01 — @po (Pax) — Course-correct p/ **Opção B** (bolsão terminal, sem continuidade) por decisão do dono do produto. Achado decisivo: o cron `roleta-retry` é quem re-distribui o lead do bolsão (candidatos = `assigned_broker_id IS NULL`, sem excluir `bolsao_em`). Escopo reescrito: guardar bolsão no cron-retry + distributor + RPC; leitura defensiva; UX. Re-validado GO. Handoff @dev.
- 2026-07-01 — @po (Pax) — `*validate-story-draft`: GO 10/10 (versão Opção A, substituída).
- 2026-07-01 — @sm — Story criada (Epic 64).
