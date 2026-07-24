# Story 75-218 — Lead nunca nasce sem etapa (leads invisíveis da Valeria)

**Status:** Done
**Tipo:** Bug fix + backfill
**Epic:** Leads / Pipeline
**Complexidade:** S

## Contexto
Incidente 24/07 (Marcos): leads cadastrados manualmente pela Valeria (ex.: Diellys,
Giovani Koaski) apareciam só em "criados hoje" — **invisíveis no Pipeline, nos filtros
ativos/perdidos e, ao virar o dia comercial, sumiam de tudo**. Causa: o modal do
corretor deixa a etapa opcional (vazia) e `POST /api/leads` gravava
`stage_id: body.stage_id || null`. Pipeline agrupa por etapa; stage null não entra em
lugar nenhum. 9 leads afetados em prod (broker_sponsored + whatsapp_organic antigos,
desde 22/05). Já era pendência anotada da 75-196 ("modal broker cria lead sem etapa").

## Acceptance Criteria
1. **AC1** — `POST /api/leads` sem `stage_id` → lead criado na etapa default do Kanban
   (`is_default`, fallback primeira por posição). Nunca null.
2. **AC2** — Helper compartilhado `lib/leads/default-stage.ts` (reusado pelo webhook
   Meta — remove a cópia local de `process-lead.ts`).
3. **AC3** — Backfill: os 9 leads com stage null em prod movidos para "Aguardando
   atendimento" (feito 24/07 via PostgREST, service role).

## Dev Agent Record
### File List
- `packages/web/src/lib/leads/default-stage.ts` (novo)
- `packages/web/src/lib/leads/default-stage.test.ts` (novo — 3 testes)
- `packages/web/src/app/api/leads/route.ts`
- `packages/web/src/lib/meta/process-lead.ts` (usa o helper compartilhado)
- `docs/stories/75-218-lead-sempre-com-etapa.story.md` (novo)

## QA Results
### Review Date: 2026-07-24 — Reviewed By: Quinn
| Check | Veredito | Evidência |
|-------|----------|-----------|
| AC1 default no servidor | PASS | Guard cobre modal broker, cadastro dashboard e chamadas futuras; payload com stage explícito preservado. |
| AC2 helper único | PASS | Mesma lógica do webhook (is_default → posição → fallback fixo); teste cobre os 3 níveis. |
| AC3 backfill | PASS | 9 leads corrigidos (Diellys, Giovani, Vera Lucia, Alexandre Bonacim, Loraine, Mara Ag, Everton +2); conferido stage_id=is.null → 0. |
| No regressions | PASS | Suíte 1217 pass; tsc/eslint/build limpos; NULL→default não carimba primeiro_atendimento (etapa default é pré-atendimento). |

Gate: PASS
— Quinn 🛡️

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-24 | 1.0 | Guard no servidor + helper compartilhado + backfill dos 9. QA PASS. | @dev (Dex) + @qa (Quinn) |
