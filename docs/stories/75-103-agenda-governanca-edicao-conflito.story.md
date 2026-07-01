# Story 75-103 — Agenda: governança de edição/cancelamento + trava de conflito + justificativa

## Metadata
- **Status:** Done (QA PASS) — pronto p/ @devops · **Epic:** Agenda · **Branch:** feat/75-103-agenda-governanca · **Complexidade:** M (5 pontos)
- **executor:** @dev · **quality_gate:** @qa · **Prioridade:** 🟠 controle real (hoje qualquer perfil edita qualquer compromisso).

## Contexto
Agenda é **compartilhada** pra empresa toda (todos os perfis veem tudo — correto, manter). Diagnóstico da tela:
- **Cancelar** (`DELETE`) já trava no dono (`broker_id`) + admin/supervisor/gerente-comercial. ✅
- **Editar** (`PATCH`) **não tem trava nenhuma** — qualquer perfil edita qualquer compromisso. ❌
- **"Marcar realizado"** (update inline na página) sem trava. ❌
- **Conflito de horário** só no CRIAR e só por **local**; **não** vale ao remarcar. ❌
- Compromissos do **Calendly** (cliente marca sozinho) entram via `calendly-sync` com `calendly_event_uri` preenchido, `broker_id=null`, `location`=nome do evento. Calendly **não** sincroniza com Google/nosso sistema → risco de conflito.
- Não há registro de "quem criou" além da categoria `created_by` (admin/broker/nicole). **Regra do diretor:** dono = **corretor atribuído** (`broker_id`); Nicole cria e atribui um corretor → ele é o dono.

## Decisões (diretor)
1. **Editar** = mesma regra do cancelar: só **dono** (`broker_id`) + admin/supervisor/gerente-comercial.
2. **Conflito por LOCAL** (criar **e** remarcar).
3. **Calendly** (cliente sozinho): edição/cancelamento **livres** (sem trava de dono, pois não há dono interno); conflito trava por **HORÁRIO** (ignora o local) pra não colidir com interno.
4. **Justificativa obrigatória** em **qualquer** edição/cancelamento (interno e Calendly) → registrada pra rastrear.

## Escopo
**IN:**
1. **Helper** `lib/appointments/governance.ts`: `canMutateAppointment(role, userId, appt)` — Calendly (`calendly_event_uri` != null) → livre; senão dono (`broker_id===userId`) ou admin/supervisor/gerente-comercial. + `overlaps()` puro (teste unitário).
2. **PATCH `/api/appointments/[id]`**: aplica `canMutateAppointment` (403 se não pode); exige `reason` quando muda detalhes (scheduled_at/duration/location/broker_id/property_id/notes); ao remarcar, roda a trava de conflito; grava `reason` no `activities.metadata`.
3. **DELETE `/api/appointments/[id]`**: troca a checagem atual pelo helper (mesma regra + Calendly livre); exige `reason`; grava no `activities.metadata`.
4. **POST `/api/appointments`**: trava de conflito estendida — bloqueia se sobrepõe no horário **e** (mesmo local **OU** o existente é do Calendly).
5. **"Marcar realizado"** (dashboard `agenda/page.tsx`): passa a checar `canMutateAppointment` (sem `reason` — é status, não edição de dados).
6. **UI** `delete-appointment-button.tsx` (usado por dashboard **e** corretor): textarea de **justificativa obrigatória** no passo de confirmação → enviado no corpo do `DELETE`. Bloqueia enviar vazio.

**OUT:** UI de EDITAR/remarcar (não existe hoje em nenhum lugar; a governança fica garantida na API pra quando existir). Tela de histórico/auditoria visível (rastro via `activities`). Sem migration (reusa `activities`; `calendly_event_uri` já existe).

## Acceptance Criteria
1. **Given** compromisso interno, **when** um perfil que não é o dono nem admin/supervisor/gerente-comercial tenta editar (PATCH) ou cancelar (DELETE), **then** 403.
2. **Given** compromisso do Calendly (`calendly_event_uri` != null), **then** qualquer usuário autenticado pode editar/cancelar (livre) — mas ainda exige justificativa.
3. **Given** editar (mudar dados) ou cancelar **sem** `reason`, **then** 400; **com** `reason`, grava em `activities.metadata.reason`.
4. **Given** criar/remarcar num horário que sobrepõe outro no **mesmo local**, ou que sobrepõe um do **Calendly** (qualquer local), **then** 409 (conflito).
5. **Given** "marcar realizado" por quem não pode, **then** não altera (guard). Dono/privilegiado marca normalmente, sem justificativa.
6. **Given** cancelar na UI, **then** há campo de justificativa obrigatório (dashboard e corretor, mesmo componente). tsc/lint/testes limpos.

## Dev Agent Record (@dev — 2026-07-01)
- [x] `lib/appointments/governance.ts`: `canMutateAppointment` (Calendly livre / dono / admin·supervisor·gerente-comercial), `overlaps`, `isConflict` (mesmo local OU existente Calendly). +teste `governance.test.ts` (10 casos).
- [x] **PATCH** `[id]/route.ts`: guard `canMutateAppointment` (403); `reason` obrigatório se muda DETAIL_FIELDS (400); revalida conflito ao remarcar (scheduled_at/duration/location); grava `reason` em `activities.metadata`.
- [x] **DELETE**: troca a checagem manual pelo helper (Calendly livre); `reason` obrigatório (400); grava em `activities.metadata`.
- [x] **POST**: conflito agora usa `isConflict` — mesmo local **ou** existente do Calendly (por horário).
- [x] **mark_completed** (dashboard `agenda/page.tsx`): guard `canMutateAppointment` (reusa `getServerUser` já chamado; sem `reason` — é status).
- [x] **UI** `delete-appointment-button.tsx` (dashboard **e** corretor): textarea de justificativa obrigatória + erro inline; envia `{reason}` no DELETE. Label "cancelar".
- **Checks:** `tsc` 0 · `eslint` 0 · `vitest` 10/10. Sem migration (reusa `activities`; `calendly_event_uri` já existe).
- **Files:** `lib/appointments/governance.ts`(+test), `api/appointments/[id]/route.ts`, `api/appointments/route.ts`, `dashboard/agenda/page.tsx`, `dashboard/_components/delete-appointment-button.tsx`, story.
- **Decisões de borda (documentadas):** (a) editar NÃO tem UI hoje em nenhum lugar (nenhum caller de PATCH) → governança garantida na API p/ quando existir; (b) rastro via `activities` (sem coluna nova / sem tela de histórico — follow-up se quiserem visível); (c) "marcar realizado" não exige justificativa (é status, não edição); (d) cancelar é via DELETE (com reason) — cancelar via PATCH status não é caminho de UI.

## QA Results (@qa — 2026-07-01)
- **PASS.** AC1-6 cobertos.
- **Guard:** helper unitado (10/10) cobre dono/privilegiado/Calendly/negado (imob/consultoria). PATCH e DELETE aplicam; mark_completed idem.
- **Conflito:** `isConflict` testado (mesmo local sim; local diferente interno não; Calendly sobreposto sim independente do local; sem sobreposição não). Aplicado em POST (criar) e PATCH (remarcar).
- **Justificativa:** 400 sem reason no cancelar e na edição de dados; gravado em `activities.metadata.reason` (rastreável: quem/quando/o quê/porquê). UI bloqueia envio vazio (botão disabled + erro).
- **Não quebra:** DELETE só é chamado pelo `DeleteAppointmentButton` (dashboard+corretor, ambos agora mandam reason); rota de cancelamento por token do cliente é outra (`cancel/[token]`), intocada. Compartilhamento da agenda mantido (todos veem tudo).
- **Sem risco de dado:** sem migration; mudanças são guardas + validações + log.

## Change Log
- 2026-07-01 — @dev/@qa — governança de edição/cancelamento + conflito (local/Calendly) + justificativa obrigatória. Done.
- 2026-07-01 — @po — GO (10/10).
- 2026-07-01 — @sm — Story criada a partir da conferência da agenda (furos: editar sem trava, conflito só no criar, sem justificativa; Calendly livre).
