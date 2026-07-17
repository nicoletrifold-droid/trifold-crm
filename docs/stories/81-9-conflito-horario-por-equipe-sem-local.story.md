# Story 81-9 — Conflito intra-equipe por HORÁRIO (independente do local)

## Metadata
- **Status:** InReview
- **Epic:** 81 — Agenda HOUSE × IMOB (`docs/stories/epics/epic-81-agenda-house-imob.md`)
- **Branch:** fix/81-9-conflito-horario-por-equipe
- **Tipo:** Bug fix (regra de negócio)

## Context
Bug reportado pelo Marcos (2026-07-17, screenshot da agenda): a house já tinha as 11:00
de sáb. 18/07 ocupadas (Roseli Muniz) e, ao abrir "Novo Compromisso" HOUSE no Decorado
Vind, a grade ofereceu 11:00 como livre — porque o compromisso existente está em OUTRO
local, e a 81-1 codificou o conflito intra-equipe como "mesma equipe E mesmo local".

**Regra correta (diretor):** dentro da MESMA equipe, 1 compromisso por horário,
**independente do local/empreendimento** (Vind às 11h bloqueia Yarden às 11h).
Equipes cruzadas (HOUSE × IMOB) continuam NUNCA conflitando — nem no mesmo decorado.
A Nicole (`packages/ai/src/flows/visit-slot.ts:isSlotFree`) JÁ segue essa regra
(qualquer compromisso house no horário bloqueia) — o resto do sistema é que divergia.

## Acceptance Criteria
- [x] AC1: `isConflict` (governance.ts): mesma equipe + sobreposição de horário = conflito,
  sem olhar local. Caso especial do Calendly vira redundante (removido). Cruzado segue
  nunca conflitando. Testes atualizados.
- [x] AC2: `imobSlotsForDay` (imob-slots.ts): slot ocupado por QUALQUER compromisso ativo
  da equipe no horário, sem filtro de local (grade do modal interno 81-8 E do link
  público 81-4). Testes atualizados.
- [x] AC3: POST público `/api/agendar/[token]`: recheck de conflito sem filtro de local.
- [x] AC4: Mensagens de 409 falam em "horário" (não mais "local e horário").
- [x] AC5: type-check/lint/suíte verdes.

## Out of Scope
- UX do modal (exigir local antes de mostrar grade continua como está — o local segue
  obrigatório para CRIAR; só não influencia mais a disponibilidade).
- Nicole (já correta).

## File List
- `docs/stories/81-9-conflito-horario-por-equipe-sem-local.story.md` (this file)
- `packages/web/src/lib/appointments/governance.ts` (+ `.test.ts`)
- `packages/web/src/lib/appointments/imob-slots.ts` (+ `.test.ts`)
- `packages/web/src/app/api/appointments/route.ts`
- `packages/web/src/app/api/appointments/[id]/route.ts`
- `packages/web/src/app/api/appointments/slots/route.ts`
- `packages/web/src/app/api/agendar/[token]/route.ts`

## Change Log
- @sm/@po: fluxo mínimo — bug de regra reportado direto pelo diretor com reprodução clara.
- @dev (Dex): isConflict e imobSlotsForDay sem local (assinaturas enxutas — location/calendly
  saem dos tipos); rotas de grade computam slots só com date válido (location vira irrelevante
  p/ disponibilidade, segue obrigatório p/ criar); recheck do POST público sem filtro de local;
  409 fala em "horário". Nicole intocada (já correta).
- @qa (Quinn): PASS — 1056/1056, typecheck verde, lint limpo no raio da mudança. Efeito aceito:
  duplicados legados (pré-fix) aparecem ocupados e podem 409 ao editar — comportamento desejado.
