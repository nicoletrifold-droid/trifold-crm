# Story 75-36 — Transferir lead a outro corretor volta para "Aguardando atendimento"

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** S (1 ponto)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]

## Story
**As a** gestor, **I want** que ao transferir um lead para outro corretor ele volte para
"Aguardando atendimento", **so that** o novo corretor receba o lead no início do fluxo,
independente do estágio em que estava com o corretor anterior.

## Contexto
Pedido do usuário (2026-06-23). Ex.: lead em "Atendimento" com o corretor X → ao
transferir para o Y, deve entrar em "Aguardando atendimento". A etapa "Aguardando
atendimento" é `STAGE_IDS.novo` (id ...001). A roleta já reseta para "novo" na
distribuição — esta story aplica o mesmo na transferência manual.

## Escopo
**IN:**
- `/api/leads/bulk`: quando `broker_id` é alterado → `stage_id = STAGE_IDS.novo`
  (perdido prevalece se também finalizar como perdido).
- `/api/leads/[id]` PATCH: quando `assigned_broker_id` muda DE FATO e o `stage_id` não
  foi enviado explicitamente → `stage_id = STAGE_IDS.novo`.
**OUT:** distribuição da roleta (já reseta p/ novo); arrastar no kanban (envia stage_id explícito → não reseta).

## Acceptance Criteria
1. Transferência em massa ("Novo corretor") move os leads para "Aguardando atendimento".
2. Transferência individual (muda o corretor) idem — exceto se a requisição já definiu o stage.
3. Finalizar como perdido continua indo para "Perdido" (prevalece).
4. Reatribuir ao MESMO corretor / editar sem trocar corretor NÃO reseta a etapa.
5. typecheck e lint limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.36-...yml`, quality_score 92)
- **typecheck/lint:** limpos.

## File List
- `packages/web/src/app/api/leads/bulk/route.ts`
- `packages/web/src/app/api/leads/[id]/route.ts`
