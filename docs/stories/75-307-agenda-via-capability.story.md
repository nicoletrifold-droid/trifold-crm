# Story 75-307 — Perfis de Acesso 2.0 · F3-6: Agenda via capabilities

**Story ID:** 75-307
**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** S (~3 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint, next build, smoke em dev]
- **Tipo:** migração de gate (F3-6; a matriz de governança do diretor vira capabilities)

## Story

Como **admin**, quero **a governança da Agenda decidida pela matriz** — `agenda.gerenciar_house`
[A,S,GC,SDR], `agenda.gerenciar_imob` [A,S,IMB], `agenda.escolher_equipe` [A,S] e
`agenda.feedback_visita` [A,S,GC,SDR] — substituindo `APPOINTMENT_ADMIN_ROLES`, duas cópias de
`FEEDBACK_ADMIN_ROLES` e os role-checks de `resolveTeam`/slots/modal.

**Zero mudança de comportamento.** A matriz do diretor (75-103/81-3/75-204) é preservada por
construção: `canMutateAppointment` agora decide sobre GRANTS; admin/supervisor têm as duas
capabilities no seed (= o "tudo" de antes), imob só a de imob, gerente/sdr só a de house, dono
sempre pode o seu, Calendly segue livre.

## Decisões de desenho

1. **`canMutateAppointment(grants, userId, appt)`** — a função continua PURA; os grants
   (2 `can()`) são resolvidos 1× por request (a lista da agenda tem N compromissos — decisão
   por linha fica O(1)). `APPOINTMENT_ADMIN_ROLES` removida.
2. **Testes de governança provam a equivalência**: `grantsFor(role)` deriva os grants do
   PRÓPRIO `CAPABILITY_SEED` — os casos da 75-103/81-3/75-204 rodam intactos sob o modelo novo.
3. **`resolveTeam({ isImobProfile, canChooseTeam })`** — perfil imob segue FORÇADO ao mundo
   imob (escopo); escolher equipe é a capability (POST + grade de slots, mesmo gate).
4. **Modal**: `canPickTeam` deixa de ser calculado por role no client — vem como prop
   resolvida no server. Wrapper do /broker não passa a prop → default `false` (= hoje).
5. **Feedback**: a parte "gestor" das duas rotas vira `can("agenda.feedback_visita")`;
   dono/lead-owner/imob-team seguem por identidade (escopo). `canAccessFeedback` recebe a
   decisão pré-computada (pura de verdade).

## Acceptance Criteria

- [x] **AC1** — Constantes/role-checks removidos (grep = zero fora de comentários);
      2 rotas de mutação + criação + slots + 2 rotas de feedback + página + modal migrados.
- [x] **AC2** — Espelho estrito ×4 congelado; matriz do diretor provada pelos testes de
      governança derivando grants do seed.
- [x] **AC3** — 4 capabilities enforced na matriz/exceções (23 no total).
- [x] **AC4** — Gates verdes + smoke 8/8 (agenda abre; seletor de equipe p/ admin; grade
      IMOB via API; 4 ações na matriz).
- [x] **AC5** — Limites: máscara house p/ imob/consultoria segue role-based (escopo de
      exibição, não autorização); Nicole muta via service role sem passar pela governança
      (inalterado); RLS — F4.

## Change Log

- 2026-08-13 · @sm (River) · Draft (template F3).
- 2026-08-13 · @po (Pax) · **GO (9/10)** — exigido: grants resolvidos 1× por request na
  página (não por linha); testes de governança DEVEM derivar do seed (prova de equivalência,
  não reescrita). → Ready.

## File List

| arquivo | ação |
|---|---|
| `lib/appointments/governance.ts` | `canMutateAppointment` decide sobre grants; constante removida |
| `lib/appointments/governance.test.ts` | `grantsFor(role)` derivado do CAPABILITY_SEED — matriz do diretor intacta |
| `api/appointments/[id]/route.ts` | grants por request (PATCH + DELETE) |
| `api/appointments/route.ts` + `slots/route.ts` | `resolveTeam` novo + grade via escolher_equipe |
| `api/appointments/[id]/feedback/route.ts` + `api/leads/[id]/visit-feedback/route.ts` | FEEDBACK_ADMIN_ROLES (2 cópias!) → can(feedback_visita) |
| `dashboard/agenda/page.tsx` | grants 1× + prop canPickTeam |
| 2 wrappers + `components/appointments/new-appointment-modal.tsx` | prop `canPickTeam` server-resolved |
| `lib/capabilities.ts` + `.test.ts` | 4 enforced + espelhos |
| `visit-feedback/route.test.ts` | mock de can() decide pelo seed |

## Dev Agent Record

**Fable 5 · @dev (Dex) · YOLO · 13/08/2026** · Branch `feat/75-307-agenda-capability`.

- Diff seed×gate ×4: idênticos. As DUAS cópias divergentes-em-potencial de
  `FEEDBACK_ADMIN_ROLES` (appointments + leads) colapsaram numa capability única —
  o tipo de drift que o inventário apontou, morto.
- Smoke (read-only) 8/8 — incl. grade IMOB via `?team=imob` p/ admin (escolher_equipe
  também cobre a LEITURA da grade, espelhando o resolveTeam).
- Gates: suíte **2338 passed** · tsc 0 · eslint base 24 · build 0.
- Não observado: Daiana (imob) mutando compromisso imob em runtime — coberto pela prova de
  equivalência dos testes de governança (grants do seed) + espelho congelado.

## QA Results

### 2026-08-13 · Quinn (@qa) · Round 1 — **PASS · quality score 96**

O padrão "testes antigos provam a equivalência derivando grants do seed" é o mais forte até
aqui — a matriz do diretor não foi re-afirmada, foi DEMONSTRADA sob o modelo novo. Duas
constantes duplicadas mortas. Sem concerns.
