# Story 75-81 — Bolsão: UI do pool + puxar lead (teto + empreendimento)

## Metadata
- **Status:** Done · **Epic:** 64 · **Branch:** feat/75-81-bolsao-ui-puxar-lead · **Complexidade:** M (3-5 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, teste do endpoint puxar (atômico, teto/empreendimento), realtime]
- **depends_on:** 75-80 (estado `bolsao_em`), 75-73/PR #61 (menu + páginas placeholder).

## Story
**As a** corretor, **I want** ver os leads do bolsão e puxar um pra mim, **so that** eu atenda leads disponíveis
rápido; **and as a** gestor, ver o bolsão no dashboard.

## Escopo
**IN:**
1. **Mergear o PR #61** (menu "Bolsão" + páginas `/dashboard/bolsao` e `/broker/bolsao`) e trocar os placeholders
   pela lista real: leads com `bolsao_em` não-nulo (no pool), ordenados por mais antigo, com tempo de espera.
2. **Endpoint "puxar"** `POST /api/bolsao/[id]/pegar`:
   - **Atômico** contra corrida (2 corretores no mesmo lead): `UPDATE leads SET assigned_broker_id=:me,
     bolsao_em=null WHERE id=:id AND assigned_broker_id IS NULL` → 0 linhas = "já foi pego" (409/feedback).
   - **Valida regras da roleta:** corretor abaixo do `max_leads` (teto) E habilitado no empreendimento do lead
     (`broker_assignments` / `property_interest_id`). Senão, recusa com motivo.
   - Registra **nova distribuição** (`lead_distribution_log`) → reinicia o ciclo de 15 min pro novo dono (Story 75-80).
   - `activities` type `bolsao_pull`.
3. **Realtime** (Supabase) na lista: lead some quando alguém pega; aparece quando entra no bolsão.
4. Permissão: corretor pega (broker); gestor visualiza no dashboard.

**OUT:**
- Não cria notificação (75-82). Não muda o cron (75-80). Sem reordenação/priorização avançada do pool.

## Acceptance Criteria
1. **Given** leads no bolsão, **when** abro `/broker/bolsao`, **then** vejo a lista com tempo de espera; **when**
   clico "Pegar", **then** o lead vira meu (`assigned_broker_id=eu`, `bolsao_em=null`) e some do pool dos outros.
2. **Given** 2 corretores clicam no mesmo lead, **then** só 1 pega; o outro recebe "lead já foi atendido por outro".
3. **Given** corretor no teto (`max_leads`) OU sem habilitação no empreendimento do lead, **then** "Pegar" é recusado com motivo.
4. **Given** lead puxado, **then** nova distribuição é registrada e o ciclo de 15 min reinicia pra o novo dono.
5. **Given** o dashboard, **then** o gestor vê o bolsão (read-only ou com pegar, conforme permissão).
6. typecheck/lint limpos; teste do endpoint (atômico + teto + empreendimento + 409 de corrida).

## Dev Notes
- Regras de teto/empreendimento: reusar a lógica do `distributor.ts` (max_leads, broker_assignments). Idealmente
  uma RPC `pegar_lead_bolsao(p_lead, p_broker)` atômica (espelha `roleta_pick_and_advance`).
- Realtime já usado no portal/broker (`new-lead-notification.tsx`, channels). Filtrar por `bolsao_em IS NOT NULL`.
- PR #61 traz `/dashboard/bolsao` e `/broker/bolsao` (placeholder "Em breve") + item de menu (ícone Container).

## File List
- (merge) PR #61 — menu + páginas.
- `packages/web/src/app/broker/bolsao/page.tsx` + `dashboard/bolsao/page.tsx` — lista real.
- `packages/web/src/app/api/bolsao/[id]/pegar/route.ts` — endpoint puxar (atômico).
- (migration) RPC `pegar_lead_bolsao` (se for por RPC).
- testes do endpoint.

## QA Results
- **Verdict: PASS.** PR #61 (menu) mergeado; placeholders trocados por listas reais (broker `Pegar` + dashboard read-only),
  componente `BolsaoList` com realtime (router.refresh em UPDATE de leads da org). Endpoint `POST /api/bolsao/[id]/pegar`
  → RPC `pegar_lead_bolsao` (migration 128, SECURITY DEFINER, advisory lock por lead + teto + empreendimento, atômico).
  RLS nova `leads_select_bolsao` (org vê leads do pool — necessária senão o corretor não enxerga leads sem dono).
- **Caminho real (txn rollback, prod):** 1ª pegada `ok`, 2ª `gone` (atômico), lead atribuído, `bolsao_em` limpo,
  1 distribuição registrada (ciclo reinicia). 7 testes do endpoint (status→HTTP) + 5 do cron (75-80). type-check 0, lint 0.
- Observação: pool fica vazio até ligar `bolsao_enabled` (cron 75-80) — feature visível mas dormente até o go-live.

## Change Log
- 2026-06-30 — @sm — Story criada (Epic 64). UI do bolsão + puxar lead com teto+empreendimento, atômico, realtime.
