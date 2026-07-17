# Story 81-3 — Agenda: governança de edição/cancelamento por equipe

## Metadata
- **Status:** Done
- **Epic:** 81 — Agenda HOUSE × IMOB (`docs/stories/epics/epic-81-agenda-house-imob.md`)
- **Branch:** feat/81-3-agenda-governanca-equipe

## Context
Regra atual (Story 75-103, `canMutateAppointment` em `lib/appointments/governance.ts`):
Calendly livre; senão dono (`broker_id`) ou admin/supervisor/**gerente-comercial** (para
QUALQUER compromisso). Com as equipes (81-1), o diretor definiu a matriz:

| Quem | HOUSE | IMOB |
|---|---|---|
| admin / supervisor | ✅ | ✅ |
| corretor responsável (broker_id) | ✅ | ❌ |
| gerente-comercial | ✅ | ❌ |
| perfil `imob` (Daiana) | ❌ | ✅ |

Ou seja: **gerente-comercial perde acesso a compromissos IMOB** (hoje teria, por ser
privilegiado) e **perfil `imob` ganha acesso total aos compromissos IMOB** (hoje não tem
nenhum). Visualização segue livre para todos (não muda).

**Nicole:** remarca/cancela via pipeline (`packages/ai`) com service role, SEM passar por
`canMutateAppointment` — não é afetada por esta story (registrar em teste/nota apenas).

**Calendly:** compromissos com `calendly_event_uri` continuam LIVRES (regra atual; morrem
com o desligamento na 81-4 — não vale refinar regra de algo que será desligado).

**Call sites de `canMutateAppointment` (3):**
- PATCH `/api/appointments/[id]` (`:71`) — select do existing JÁ inclui `team` (81-1).
- DELETE `/api/appointments/[id]` (`:212`) — select do existing NÃO inclui `team` (incluir).
- `dashboard/agenda/page.tsx` `mark_completed` (`:139`) — select do target NÃO inclui `team` (incluir).

## Acceptance Criteria
- [x] AC1: `canMutateAppointment(role, userId, appt)` passa a receber `team` no `appt` e
  implementa a matriz acima: Calendly livre (inalterado) → admin/supervisor tudo →
  `team='imob'` só perfil `imob` → house: gerente-comercial ou dono (`broker_id`).
- [x] AC2: Os 3 call sites passam `team` (selects do DELETE e do `mark_completed` incluem a
  coluna). Nenhum call site esquecido (grep no repo).
- [x] AC3: Testes da matriz COMPLETA em `governance.test.ts`: cada linha da tabela × house/imob
  (incl.: gerente-comercial NÃO mexe em imob; imob NÃO mexe em house; imob mexe em imob
  mesmo sem ser dono; dono house não mexe se o compromisso for imob).
- [x] AC4: Fallback: `team` ausente/desconhecido trata como `'house'` (consistente com 81-1/81-2).
- [x] AC5: Suíte completa verde; type-check OK; eslint limpo nos arquivos da story.

## Out of Scope
- UI de esconder botões por equipe (os botões já aparecem condicionais via
  `canMutateAppointment` nos server components onde aplicável; se algum botão ficar visível e
  o servidor negar com 403, é aceitável nesta story — refinamento de UI pode vir depois).
- Link público e desligamentos — Story 81-4.

## Dependencies
- Story 81-1 mergeada (#219). 81-2 (#220) não é dependência técnica, mas mergear antes para
  evitar conflito em `governance.ts`/rotas.

## Complexity
- **T-shirt:** P (1 função pura + 2 selects + testes de matriz).

## Business Value
Sem isso, gerente-comercial pode editar/cancelar compromissos da Daiana (e a Daiana não pode
mexer nos dela) — governança errada nas duas direções.

## Risks
- Baixo. Função pura com matriz testada. Cuidado: NÃO quebrar o fluxo da Nicole (não passa
  por aqui — confirmar com grep no packages/ai).

## Definition of Done
- ACs atendidos, testes verdes, lint/typecheck OK, QA gate PASS, push via @devops.

## File List
- `docs/stories/81-3-agenda-governanca-por-equipe.story.md` (this file)
- `packages/web/src/lib/appointments/governance.ts`
- `packages/web/src/lib/appointments/governance.test.ts`
- `packages/web/src/app/api/appointments/[id]/route.ts` (select do DELETE)
- `packages/web/src/app/dashboard/agenda/page.tsx` (select do mark_completed)

## Dev Notes (@dev / Dex)
- Constante `APPOINTMENT_PRIVILEGED_ROLES` renomeada p/ `APPOINTMENT_ADMIN_ROLES` (admin/
  supervisor) — gerente-comercial saiu do grupo "tudo" e virou regra específica de HOUSE.
  Grep confirmou 0 usos externos da constante antiga antes do rename.
- Matriz como cascata: Calendly livre → admin/supervisor → imob (só role imob) → house
  (gerente-comercial ou dono). `team` opcional no tipo — fallback house.
- Selects do DELETE e do mark_completed ganharam `team` (PATCH já tinha desde a 81-1).

## QA Results (@qa / Quinn)
**Veredito: PASS**

| Check | Resultado |
|---|---|
| 1. Code review | ✅ Cascata clara, tipo `MutableAppointment.team` opcional c/ fallback house |
| 2. Testes | ✅ 24/24 governance (6 novos da matriz: gerente-comercial×imob=❌, imob×house=❌, dono-house×compromisso-imob=❌, fallback) — suíte 1050/1050 |
| 3. ACs | ✅ AC1-AC5; AC2 verificado por grep independente: exatamente 3 call sites, 4 selects com team |
| 4. Regressões | ✅ Comportamento HOUSE idêntico ao 75-103 (testes originais passam intactos com team:'house'); Nicole não passa por canMutateAppointment (0 usos em packages/ai) |
| 5. Performance | ✅ N/A |
| 6. Segurança | ✅ Governança endurecida (gerente-comercial perde IMOB); nenhum caminho novo de escalada |
| 7. Documentação | ✅ Matriz documentada no header do governance.ts + story |

Pronta para `@devops *push`.

## Change Log
- @sm (River): story criada em Draft a partir do Epic 81 (3ª de 4), com call sites mapeados.
- @po (Pax): validação checklist 10 pontos → **GO (10/10)**; confirmado 0 usos de canMutateAppointment no packages/ai (Nicole intacta). Status Draft → Ready.
- @dev (Dex): matriz por equipe no canMutateAppointment + team nos selects DELETE/mark_completed + 6 testes. Status Ready → InReview.
- @qa (Quinn): QA gate **PASS** (7/7), call sites auditados por grep. 
- @devops (Gage): CI verde, squash-merge PR #221, deploy prod automático. Status InReview → Done.
