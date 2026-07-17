# Story 81-8 — Modal interno: dia + grade de horários LIVRES (padrão do link público)

## Metadata
- **Status:** Done
- **Epic:** 81 — Agenda HOUSE × IMOB (`docs/stories/epics/epic-81-agenda-house-imob.md`)
- **Branch:** feat/81-8-modal-slots-disponiveis

## Context
Pedido do Marcos (2026-07-17): o "Novo Compromisso" interno usava Data/Hora LIVRES — o
usuário só descobria conflito no erro 409. O link público já mostra SÓ os horários
disponíveis (dia dropdown + grade). Aplicar o mesmo padrão no modal interno, para HOUSE
e IMOB: cada equipe vê a disponibilidade DELA (81-1: equipes não se enxergam).

As regras de conflito citadas pelo diretor JÁ estavam ativas no servidor (não mudam):
Nicole não sobrepõe house (isSlotFree), corretor não sobrepõe house no mesmo local
(POST→isConflict→409), link/Daiana não duplica IMOB (recheck no POST→409).

## Acceptance Criteria
- [x] AC1: Lib de grade generalizada: `ImobBusySlot.calendly_event_uri` opcional — Calendly
  legado ocupa o horário em QUALQUER local (regra 75-103; só existe no house). Teste novo.
- [x] AC2: `buildDayOptions` movido da página pública para a lib (fonte única; página
  refatorada para importar). Teste novo.
- [x] AC3: Endpoint autenticado GET `/api/appointments/slots?team&date&location`: devolve
  `days` (14 dias abertos) + `slots` (grade livre/ocupado da EQUIPE). Equipe efetiva espelha
  o `resolveTeam` do POST (imob→imob; admin/supervisor escolhem; resto→house) — corretor não
  consulta grade imob.
- [x] AC4: Modal interno: inputs Data/Hora substituídos por **Dia (dropdown de dias abertos)**
  + **grade de horários** (ocupado = riscado/desabilitado; selecionado = laranja no house,
  violeta no imob). Sem local selecionado → hint. `scheduled_at` = ISO do slot escolhido.
- [x] AC5: 409 na corrida → recarrega a grade automaticamente (slot some da lista).
- [x] AC6: type-check/lint/suíte verdes (1061/1061 — 2 testes novos).

## Out of Scope
- Grade na EDIÇÃO/remarcação de compromisso (fluxo PATCH segue como está — follow-up se pedido).
- Mudar regras de conflito (já corretas no servidor).

## File List
- `docs/stories/81-8-modal-interno-slots-disponiveis.story.md` (this file)
- `packages/web/src/lib/appointments/imob-slots.ts` (+ `.test.ts`)
- `packages/web/src/app/api/appointments/slots/route.ts` (novo)
- `packages/web/src/components/appointments/new-appointment-modal.tsx`
- `packages/web/src/app/agendar/[token]/page.tsx` (importa buildDayOptions da lib)

## Change Log
- @sm/@po: fluxo mínimo (pedido direto do diretor; espelha o padrão validado do link público).
- @dev (Dex): lib generalizada (Calendly bloqueia qualquer local no house) + endpoint + grade
  no modal; fix de ordem de declaração de estado pego pelo type-check.
- @qa (Quinn): PASS — 1061/1061; equipe efetiva do endpoint espelha resolveTeam (corretor não
  vê grade imob); POST permanece como guarda final.
- @devops (Gage): CI verde, squash-merge PR #228, deploy prod automático. Status InReview → Done.
