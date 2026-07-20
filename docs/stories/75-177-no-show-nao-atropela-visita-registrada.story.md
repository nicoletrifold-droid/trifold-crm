# Story 75-177 — No-show não atropela visita já registrada pelo corretor

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core (agenda / follow-up)
- **Branch:** fix/75-177-no-show-nao-atropela-visita-registrada
- **Tipo:** Bug fix (regra de negócio) — reportado pela Fernanda (áudio + prints, 2026-07-20)

## Context
Bug reportado pela Fernanda (corretora) com áudio + 2 prints. Lead **Mario Iwamoto**:

| Hora (20/jul) | Quem | Ação |
|---|---|---|
| 09:15 | Fernanda | Moveu etapa: **Visita Agendada → Visitou** |
| 09:20 | Fernanda | **Nota** (`broker_note`) com o feedback da visita |
| **11:00** | **Sistema** | **Visitou → no_show** + *"Visita não realizada — sem feedback do corretor após 48h"* |

O cron de no-show (`processNoShowDetection` em `packages/web/src/app/api/cron/followup/route.ts`)
desfez o trabalho da corretora ~1h40 depois. Ela relata que acontece "com vários".

**Causa raiz:** o detector decide "não compareceu" olhando **só** `appointments.status IN
('scheduled','confirmed')` + `scheduled_at` há +48h. O único ponto do sistema que muda o status
para `completed` é o formulário formal de feedback (`POST /api/appointments/[id]/feedback`).
Quando o corretor registra a visita "no braço" (arrasta o card para Visitou + escreve uma Nota),
o agendamento continua `scheduled` para sempre → 48h depois o cron marca no_show e **puxa o lead
de volta**, resetando o `conversation_state`.

Três lacunas:
1. Ignora a etapa atual do lead (já em Visitou/Negociando/etc. = visita ocorreu).
2. Ignora atividade humana do corretor (Nota / mudança de etapa) posterior ao `scheduled_at`.
3. Arrastar o card para "Visitou" nunca marca o `appointment` como `completed` (assimetria só o
   formulário de feedback faz isso).

Bônus alinhado a convenção existente ([[project-lead-perdido-ressuscitado]],
[[feedback-nicole-nunca-move-etapa]]): hoje o no-show também moveria um lead **Perdido** para a
etapa no_show — ressuscitando um lead terminal. Deve ser blindado junto.

## Acceptance Criteria
- [x] AC1: Detector de no-show **não** marca no_show / não move o lead quando ele já está em etapa
  pós-visita (`visitou`, `proposta`, `negociando`, `fechou`). Nesse caso resolve o agendamento
  pendente marcando-o `completed` (para de reprocessar). — guard (1)
- [x] AC2: Detector **não** marca no_show quando há atividade humana do corretor (`broker_note`,
  `note_added`, `stage_change`, `visit_completed`) com `created_at` posterior ao `scheduled_at`;
  resolve o agendamento como `completed`. — guard (2)
- [x] AC3: Detector **não** ressuscita lead terminal/parqueado (`perdido`, `represamento`): não move
  o lead e cancela o agendamento pendente (`cancelled`). — guard bônus
- [x] AC4: Lead que realmente não compareceu (nenhum dos guards acima) segue o comportamento atual
  (marca `no_show`, move p/ etapa no_show, reseta `conversation_state`, activity log). O contador
  retornado reflete **só** os no-shows reais.
- [x] AC5: Ao mover o lead para etapa pós-visita via `POST /api/leads/[id]/stage`, marca os
  agendamentos abertos (`scheduled`/`confirmed`) do lead como `completed` (best-effort,
  não bloqueia a resposta) — fecha a lacuna na origem. — guard (3)
- [x] AC6: Lógica de decisão extraída em helper puro e testável (`decideStaleAppointment`) com
  testes unitários cobrindo os 4 caminhos. type-check/lint/suíte verdes.

## Out of Scope
- Reprocessamento retroativo dos leads já atropelados (planejar à parte; Marcos pode pedir a
  auditoria no banco). Esta story evita novos casos daqui pra frente.
- Mudar o fluxo do formulário de feedback (continua sendo o caminho "rico" — visit_feedback +
  post-visita da Nicole).
- UX de orientar o corretor a usar o formulário (comunicação, fora de código).

## File List
- `docs/stories/75-177-no-show-nao-atropela-visita-registrada.story.md` (this file)
- `packages/web/src/lib/appointments/no-show-decision.ts` (novo — helper puro)
- `packages/web/src/lib/appointments/no-show-decision.test.ts` (novo — testes)
- `packages/web/src/app/api/cron/followup/route.ts` (processNoShowDetection usa o helper + guards)
- `packages/web/src/app/api/leads/[id]/stage/route.ts` (guard 3 — completa agendamentos ao mover)

## Change Log
- @sm/@po: fluxo mínimo — bug reportado direto pela corretora com reprodução clara (áudio + prints).
- @dev (Dex): helper puro `decideStaleAppointment` (guards 1/2/terminal) + testes; cron
  `processNoShowDetection` batch-carrega etapa e última atividade do corretor por lead e aplica a
  decisão (complete/cancel/no_show) — no-show real intocado; rota `stage` completa agendamentos
  abertos ao mover p/ etapa pós-visita (guard 3, best-effort, filtra org_id).
- @qa (Quinn): PASS — 1076/1076 (10 novos), type-check verde, lint limpo no raio da mudança.
  AC4 (no-show real) preservado; `count` retornado passa a refletir só no-shows reais.
- @devops (Gage): (pendente)
