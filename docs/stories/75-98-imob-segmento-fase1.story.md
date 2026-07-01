# Story 75-98 — Mundo IMOB · Fase 1a: campo `segmento` + isolamento crítico

## Metadata
- **Status:** Done (QA PASS) — pronto para @devops (aguardando decisão de push do epic) · **Epic:** IMOB (mundo isolado) · **Branch:** feat/75-98-imob-segmento-fase1 · **Complexidade:** M (3 pontos)
- **executor:** @dev + @data-engineer (migration) · **quality_gate:** @qa · **quality_gate_tools:** [migration em txn rollback, verificação NO-OP (contagens inalteradas), typecheck, lint]
- **Prioridade:** 🟠 ALTA — fundação do "mundo IMOB" (2 empresas no mesmo sistema).

## Contexto / decisões (confirmadas pelo diretor)
Criar um **mundo IMOB isolado**: leads/pipeline do IMOB não se misturam com o principal. Perfis já configurados na matriz: `imob`+`consultoria` só veem o módulo IMOB; `broker`/`gerente-comercial` só o principal; `admin`/`supervisor` veem os dois. Leads IMOB são **manuais** (criados pelos perfis imob/consultoria), **nunca** entram por roleta/campanha. Pipeline IMOB usa **as mesmas etapas** do funil, só filtrado.

**Fato-chave:** hoje não há lead `imob` (campo novo → tudo `principal`). Logo, adicionar `segmento='principal'` nas queries do principal é **NO-OP no dado atual** (não muda nada), e só isola quando os leads IMOB existirem (Fase 2). Baixo risco.

## Escopo — Fase 1a (só o crítico)
**IN:**
1. **Migration 135**: `leads.segmento text NOT NULL DEFAULT 'principal'` + CHECK IN ('principal','imob') + índice `(org_id, segmento)`.
2. **Blindar automação** (senão um lead IMOB seria "puxado" pro mundo principal):
   - `roleta-retry` cron: `+ .eq("segmento","principal")` na busca de candidatos e no re-check.
   - `distributor.ts`: incluir `segmento` no fetch do lead + guard `if (lead.segmento === "imob") return { status: "em_bolsao" }`-equivalente (não distribui). (novo status ou reuso de "sem_corretor_disponivel").
   - `bolsao-rebalance` cron: `+ .eq("segmento","principal")` nos candidatos.
3. **Mundos distintos** (o pipeline/leads principal NÃO mostra IMOB):
   - `dashboard/leads/page.tsx`: `+ .eq("segmento","principal")` (query + countQuery).
   - `dashboard/pipeline/page.tsx`: `+ .eq("segmento","principal")` (query por stage).

**OUT (vai pra Fase 1b, antes da Fase 2 subir):** contadores do `dashboard/page.tsx`, `analytics` + `analytics-report-data.ts` + `daily-leads-report.ts`, telas `/broker/*`, e demais crons (followup, sla-alerts, email-automations, enrich, campaign-poll). Seguro adiar: não há lead IMOB ainda. **Fase 2 não sobe antes da 1b.**

## Acceptance Criteria
1. **Given** a migration, **then** `leads.segmento` existe (default 'principal', CHECK), todo lead atual = 'principal'.
2. **Given** o dado ATUAL (sem IMOB), **then** as queries alteradas retornam **exatamente as mesmas contagens** de antes (NO-OP) — nada quebra pro mundo principal.
3. **Given** (futuro) um lead `segmento='imob'` sem corretor, **then** o `roleta-retry`/`distributor`/`bolsao` **não** o pegam.
4. **Given** (futuro) um lead `imob`, **then** ele **não** aparece no `/dashboard/leads` nem no `/dashboard/pipeline` principais.
5. migration em txn rollback; contagens NO-OP verificadas; typecheck/lint limpos.

## Dev Notes
- `roleta-retry`: candidatos ~linha 44-50 (add `.is`/`.eq`); re-check ~68-74 (select + condição).
- `distributor.ts`: fetch do lead (add `segmento` no select) + guard antes do `priorizar_lead_ativo`/RPC (padrão igual ao guard `bolsao_em` da 75-89).
- `bolsao-rebalance`: candidatos (add `.eq("segmento","principal")`).
- `dashboard/leads` + `dashboard/pipeline`: add `.eq("segmento","principal")` no builder (query + count).
- Verificação NO-OP: contar leads ativos por org antes/depois do filtro (devem bater, pois todos são 'principal').

## File List
- `supabase/migrations/135_leads_segmento.sql` (novo).
- `packages/web/src/app/api/cron/roleta-retry/route.ts`.
- `packages/web/src/lib/roleta/distributor.ts`.
- `packages/web/src/app/api/cron/bolsao-rebalance/route.ts`.
- `packages/web/src/app/dashboard/leads/page.tsx`.
- `packages/web/src/app/dashboard/pipeline/page.tsx`.

## PO Validation (@po Pax — 2026-07-01)
- **Verdict: GO.** Fundação do epic; escopo 1a = só o crítico (automação + mundos distintos), com NO-OP no dado atual (baixíssimo risco). 1b enumerada e sequenciada antes da Fase 2. Ref. [[feedback-nao-quebrar-o-que-funciona]]. Status → Approved.

## Dev Agent Record (@dev Dex — 2026-07-01)
- [x] Migration `135_leads_segmento.sql`: `segmento` default 'principal' + CHECK + índice.
- [x] `roleta-retry`: `.eq("segmento","principal")` nos candidatos + re-check (select+condição).
- [x] `distributor.ts`: `segmento` no fetch + guard `if (lead.segmento === "imob") return sem_corretor_disponivel`.
- [x] `bolsao-rebalance`: `.eq("segmento","principal")` nos candidatos.
- [x] `dashboard/leads/page.tsx`: `.eq("segmento","principal")` (query + count).
- [x] `dashboard/pipeline/page.tsx`: `.eq("segmento","principal")` (query por stage).
- **Checks:** `tsc` 0; `eslint` 0 errors (warning `isAdmin` pré-existente). Migration em txn rollback OK.
- Branch `feat/75-98-imob-segmento-fase1` (off main). Commit local (sem push). Migration NÃO aplicada em prod (=@devops).

## QA Results (@qa Quinn — 2026-07-01)
**Verdict: PASS.** ✅
- **Migration (txn rollback, prod):** `segmento` criado; **1153 leads → 1153 'principal', 0 não-principal** = filtros são **NO-OP** no dado atual (mundo principal inalterado). CHECK barrou 'xyz'. Revertido.
- **Rastreabilidade:** AC1 (coluna+default+CHECK) ✅; AC2 (NO-OP: contagens iguais) ✅; AC3 (roleta/distributor/bolsão excluem imob) — filtros aplicados, ativam quando existir lead imob; AC4 (leads/pipeline principais excluem imob) ✅; AC5 (rollback + tsc/lint) ✅.
- **Observação:** cobertura da 1a = automação crítica + mundos distintos. **Fase 1b** (dashboard counts, analytics, relatórios, /broker, demais crons) deve ser concluída ANTES da Fase 2 subir (sem ela, quando existir lead imob, ele poderia aparecer em métricas/telas do corretor). Seguro agora (0 leads imob).

**Gate → PASS.** Pronto para @devops (push + PR + aplicar migration 135) — mas recomendo subir junto com/ordem do epic.

## Change Log
- 2026-07-01 — @qa (Quinn) — Gate PASS (migration rollback: NO-OP 1153/1153 principal; CHECK ok; tsc/lint 0). Status → Done. Fase 1b pendente antes da Fase 2.
- 2026-07-01 — @dev (Dex) — Fase 1a: migration 135 + isolamento crítico (roleta/distributor/bolsão + leads/pipeline principais). NO-OP no dado atual. Sem push.
- 2026-07-01 — @po (Pax) — GO. Fatiamento 1a/1b confirmado. Status Draft → Approved.
- 2026-07-01 — @sm — Story criada (Epic mundo IMOB). Fase 1a: segmento + isolamento crítico (roleta/bolsão/distributor + leads/pipeline principais).
