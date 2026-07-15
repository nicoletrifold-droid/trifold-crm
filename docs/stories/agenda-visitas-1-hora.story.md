# Story — Agenda: compromissos travados em 1 hora (hora cheia)

**Status:** Ready (aguardando conferência de preview + merge)
**Epic:** Agenda comercial ([[project-agenda-comercial-flexivel]], [[project-agenda-governanca]])
**Relacionado:** [[project-nicole-agendamento]] (Nicole já agenda visita em 1h/hora cheia — `visit-slot.ts`), conflito por local (Story 75-103)
**Complexidade:** S (modal + POST + PATCH; sem migration)

## Contexto
Pedido do diretor: **visitas/compromissos de 1 em 1 hora** — travar os horários em blocos de 1 hora.
Hoje o modal "Novo Compromisso" deixa escolher horário de **30 em 30 min** e duração **30/45/60/90**
(padrão 30). Não há coluna `type` no banco; o que diferencia visita de reunião é o **local**. Decisão
de produto (confirmada): a trava de 1h vale para **TODO compromisso** da agenda, e **sem** restringir a
faixa de horário (o bloqueio de conflito por local, que já existe, impede duas coisas no mesmo
horário/local). A Nicole já cria visita em 1h/hora cheia — isso alinha o cadastro manual à IA.

## Acceptance Criteria
1. **AC1** — No modal "Novo Compromisso" (dashboard e corretor — componente compartilhado), o horário
   é escolhido em **hora cheia** (step de 1h) e qualquer valor é normalizado para `:00`.
2. **AC2** — A **duração é fixa em 1 hora** — o seletor de duração vira um rótulo "1 hora (horário
   fixo)"; não é mais escolhível.
3. **AC3** — O servidor (`POST /api/appointments`) **força** `duration_minutes = 60` e início em hora
   cheia, independente do payload (guard autoritativo).
4. **AC4** — Ao **remarcar** (`PATCH`) mudando o horário, o novo horário é normalizado (hora cheia + 1h).
   Edições que **não** mexem no horário (só local/nota) mantêm a duração existente.
5. **AC5** — O bloqueio de conflito por local (já existente) continua impedindo dois compromissos
   sobrepostos no mesmo local — com blocos de 1h isso trava um por hora/local.
6. **AC6** — Sem restrição de faixa de horário (qualquer hora do dia permitida). Nicole e Calendly
   inalterados (Nicole já é 1h/hora cheia; Calendly segue a config externa dele).
7. **AC7** — Sem migration.

## Tasks
- [x] `components/appointments/new-appointment-modal.tsx`: `step={3600}` + snap `:00`; duração fixa 60
      (rótulo "1 hora"); remove seletor de duração; snap no `scheduledAt`.
- [x] `api/appointments/route.ts` POST: `duration = 60` + `newStart.setMinutes(0,0,0)`; insert usa o
      horário normalizado.
- [x] `api/appointments/[id]/route.ts` PATCH: ao mudar horário, normaliza (hora cheia + 60) e persiste.
- [x] Verificação: tsc 0, eslint 0, build OK, `npm test` 975 pass.
- [ ] Conferência visual no preview (modal mostra hora cheia + "1 hora"; salvar OK; remarcar OK).

## Out of Scope
- Restringir faixa de horário / horário comercial (decisão: não).
- Nicole (`visit-slot.ts`) e Calendly-sync (config externa) — já conformes / fora de escopo.
- Grade da agenda (visualização) — sem mudança.
- Coluna `type` de compromisso — não existe e não será criada nesta story.

## Riscos
- Compromissos antigos com duração ≠ 60 continuam como estão (mudança é p/ frente); só normalizam se
  forem remarcados no horário.
- Calendly com duração própria não é forçado (correto — evento externo).

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-15 | 1.0 | Agenda: todo compromisso travado em 1h/hora cheia (modal + POST + PATCH); sem faixa de horário; Nicole/Calendly inalterados. tsc/eslint/build OK, 975 testes. | @dev+@qa |

## Dev Agent Record
### File List
- `packages/web/src/components/appointments/new-appointment-modal.tsx`
- `packages/web/src/app/api/appointments/route.ts`
- `packages/web/src/app/api/appointments/[id]/route.ts`
- `docs/stories/agenda-visitas-1-hora.story.md` (novo)

## QA Results
### Review Date: 2026-07-15 — Reviewed By: Quinn
| Check | Veredito | Evidência |
|-------|----------|-----------|
| Code review | PASS | UI trava hora cheia + 1h; servidor força 60 + hora cheia no POST e no PATCH (só ao mudar horário). |
| Unit tests | PASS | 975 tests, sem regressão. |
| Acceptance criteria | PASS | AC1-AC7 (visual final no preview). |
| No regressions | PASS | Conflito por local intacto; Nicole/Calendly não tocados; edições não-horário mantêm duração. |
| Security | PASS | Endpoints já autenticados; sem mudança de escopo/role. |
| Documentation | PASS | Story + gate. |

Build: tsc 0 · eslint 0 · next build OK · npm test 975 pass.
Gate: PASS → docs/qa/gates/agenda-visitas-1-hora.yml
— Quinn 🛡️
