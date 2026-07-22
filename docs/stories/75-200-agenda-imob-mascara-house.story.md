# Story 75-200 — Agenda: perfil imob vê HOUSE só como slot ocupado (sem excluir)

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core (mundo IMOB) / revisa decisão do Epic 81
- **Branch:** fix/75-200-agenda-imob-mascara-house
- **Tipo:** Ajuste de produto — Marcos (prints da Daiana, 2026-07-22): perfil imob
  via leads/corretores da HOUSE na /dashboard/agenda e o botão Excluir aparecia
  (a API negava com 403 — governança 81-3 — mas a UI expunha tudo).

## Context
Decisão original do Epic 81 era "agenda compartilhada, todos veem tudo".
REVISÃO (Marcos, 2026-07-22): perfil imob (e consultoria) deve ver compromissos
HOUSE como o corretor vê os dos outros — slot ocupado genérico ("Lead"), sem
nomes, sem detalhes, sem ações. Só o que é team='imob' é pertinente a ela.
A agenda continua compartilhada (a grade mostra o horário ocupado — evita
choque de horário), mas o CONTEÚDO da house é mascarado.

## Acceptance Criteria
- [x] AC1: `maskHouse` p/ roles imob/consultoria; helper `isMaskedApt` (team ≠
  imob). Nas 3 visões (dia/semana/mês) o card HOUSE mostra só horário + "Lead"
  (sem nome do lead, sem link p/ o lead, sem corretor, sem notas).
- [x] AC2: painel "Detalhes do Agendamento" mascarado p/ HOUSE sob perfil imob:
  Lead "-", sem telefone, sem campo Corretor, sem Notas (fica data/status/
  empreendimento/local — espelho da visão do corretor).
- [x] AC3: botão Excluir segue `canMutateAppointment` (matriz 81-3) p/ TODOS os
  perfis — imob não vê Excluir em HOUSE; gerente-comercial não vê em IMOB
  (antes o botão aparecia sempre e a API devolvia 403). "Ver feedback" e
  "Registrar visita" também ocultos em item mascarado.
- [x] AC4: filtro "Todos os corretores" oculto p/ perfil imob (lista de
  corretores é detalhe da house).
- [x] AC5: admin/supervisor/gerente-comercial seguem vendo tudo como hoje;
  compromissos IMOB p/ a Daiana seguem completos (imobiliária, corretor
  parceiro, Excluir). type-check/lint/suíte verdes.

## File List
- `docs/stories/75-200-agenda-imob-mascara-house.story.md` (this file)
- `packages/web/src/app/dashboard/agenda/page.tsx`

## Change Log
- @sm/@po 2026-07-22: fluxo mínimo (ajuste de UI; governança server-side 81-3 já
  bloqueava a mutação — sem mudança de API). GO.
- @dev (Dex) 2026-07-22: máscara nas 3 visões + painel; Excluir/feedback gated
  por canMutateAppointment; filtro de corretores oculto p/ imob.
- @qa (Quinn) 2026-07-22: PASS — suíte 1144/1144; type-check/eslint verdes;
  matriz 81-3 é a MESMA função nos dois lados (UI agora honesta com a API);
  visão de admin/supervisor/gerente-comercial inalterada p/ house.
