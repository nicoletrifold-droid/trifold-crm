# Story 75-197 — Roleta não regride lead em "Visita Agendada" ao distribuir

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core / sequência direta da 75-196
- **Branch:** fix/75-197-roleta-preserva-visita-agendada
- **Tipo:** Fix — conflito identificado ao responder pergunta do Marcos (2026-07-22)

## Context
Com a 75-196, a Nicole move o lead para "Visita Agendada" ao agendar. Mas a
roleta, ao distribuir o lead quando a conversa esfria (idle ~5min), seta
`stage_id = novo` ("Aguardando atendimento") INCONDICIONALMENTE em 2 pontos de
`packages/web/src/lib/roleta/distributor.ts`:
- `:159` — atalho de continuidade (mesmo telefone já tem corretor): UPDATE
  atômico que atribui corretor + stage novo + distribuido_em.
- `:297` — passo 8 pós-RPC (`roleta_pick_and_advance` não mexe em stage; o JS
  move depois).

Sequência quebrada: Nicole agenda → Visita Agendada → roleta distribui →
REGRIDE p/ Aguardando atendimento.

**DECISÃO (Marcos, 2026-07-22):** roleta vincula o corretor mas PRESERVA
"Visita Agendada". Trade-off aceito: SLA (10/60min) e bolsão só vigiam leads em
"Aguardando atendimento" — lead com visita marcada fica fora desse radar (o
corretor é notificado da visita e há lembretes automáticos).

## Acceptance Criteria
- [x] AC1: atalho de continuidade (`:159`) — se `lead.stage_id ===
  STAGE_IDS.visita_agendada`, o UPDATE atômico atribui corretor/distribuido_em
  SEM incluir `stage_id` (preserva a etapa). Demais casos: comportamento igual.
- [x] AC2: passo 8 pós-RPC (`:297`) — UPDATE de stage ganha filtro no WHERE:
  move p/ novo só quando `stage_id` é NULL ou ≠ visita_agendada (atenção ao
  NULL: `neq` puro filtra NULL fora — usar `.or("stage_id.is.null,...")`).
- [x] AC3: testes unitários dos dois caminhos (preserva visita_agendada;
  continua setando novo p/ lead NULL/novo).
- [x] AC4: guards existentes intactos (perdido terminal `:109`, bolsão `:99`);
  type-check/lint/suíte verdes.

## File List
- `docs/stories/75-197-roleta-preserva-visita-agendada.story.md` (this file)
- `packages/web/src/lib/roleta/distributor.ts`
- `packages/web/src/lib/roleta/distributor.test.ts`

## Change Log
- @sm/@po 2026-07-22: fluxo mínimo (fix pequeno, decisão de produto colhida via
  pergunta com opções; escolhida "Preservar Visita Agendada"). GO.
- @dev (Dex) 2026-07-22: atalho de continuidade omite stage_id do UPDATE quando
  lead está em visita_agendada; passo 8 pós-RPC ganha
  `.or("stage_id.is.null,stage_id.neq.<visita>")` no WHERE. +3 testes (o caminho
  de continuidade não tinha NENHUM — factory própria; mock ganhou `.or`).
- @qa (Quinn) 2026-07-22: PASS — suíte 1140/1140; type-check verde; eslint dos
  arquivos tocados 0 erros (2 warnings pré-existentes); guards bolsão/perdido
  intactos (testes 75-89/75-118 seguem passando); leads imob nunca entram na
  roleta (guard 75-98) — sem interação com o fluxo do link.
