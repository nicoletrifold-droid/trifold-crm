# Story 75-90 — Bolsão: gerente-comercial pode puxar lead e atender pelo dashboard

## Metadata
- **Status:** Done (QA PASS) — pronto para @devops (push + PR + deploy; sem migration) · **Epic:** 64 · **Branch:** feat/75-90-bolsao-gerente-comercial-puxar · **Complexidade:** S (1-2 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [teste do gate canPull por role, typecheck, lint, validação do fluxo de atendimento no dashboard]
- **Prioridade:** 🟢 Média — pedido do diretor: a gerente comercial também ajudar a esvaziar o bolsão.

## Story
**As a** gerente comercial, **I want** puxar um lead do bolsão e atendê-lo pelo dashboard, **so that** eu ajude a esvaziar o bolsão e atender leads rápido — não só os corretores.

## Contexto
A Story 75-89 tornou o bolsão **terminal** (a roleta não re-pega). Hoje **só o corretor** puxa, em `/broker/bolsao` (`canPull`). A gerente comercial vê `/dashboard/bolsao`, mas **read-only** (`canPull={false}`, linha 43). Investigação (2026-07-01) confirmou que **falta só ligar o botão** — o resto já existe:
- **Backend pronto:** a gerente comercial (Fernanda, user `c149cf2e…`) **já tem perfil de corretor** (`broker_id f26ad46f`, `is_available=true`, teto 300). A RPC `pegar_lead_bolsao` **já a aceita** (exige `brokers` + `is_available`) — sem mudança de backend.
- **Atendimento no dashboard já existe:** `/dashboard/pipeline` é kanban **arrastável** (dropar muda `stage_id` → dá pra sair de "Aguardando atendimento"); `/dashboard/conversas/[id]` tem **envio de mensagem** (reusa `BrokerMessageInput` do corretor) e a lista `/dashboard/conversas` filtra por `assigned_broker_id`; o menu Bolsão já é visível pra ela (`showBolsao` inclui gerente-comercial).

Ou seja: puxou → o lead vira dela em "Aguardando atendimento" → ela atende pelo pipeline + conversas do dashboard. Não precisa de tela nova nem de acesso ao `/broker`.

## ✅ Decisão de alcance (dono do produto — 2026-07-01)
**Infra de hierarquia + gate ativo só na gerente-comercial.** Construir agora o **helper de hierarquia comercial reutilizável** (deixa o sistema pronto pro futuro — ver [[feedback-hierarquia-perfis-comercial]]), mas manter esta capacidade **ativa só pra gerente-comercial** (política interna: é ela quem atende). Supervisor/admin estão acima na hierarquia e herdariam, porém dependem de perfil de corretor + filtros de atendimento (follow-up) — então **não** mexer no backend agora. Escalar depois = 1 linha (trocar o gate por `commercialRoleAtLeast(role, "gerente-comercial")`).

## Escopo
**IN:**
1. **Novo módulo puro** `lib/roles-hierarchy.ts` com `COMMERCIAL_ROLE_RANK` (broker=1, gerente-comercial=2, supervisor=3, admin=4) + `commercialRoleAtLeast(role, min)` + a capacidade `canPullBolsaoDashboard(role)` (hoje = `role === "gerente-comercial"`, com comentário do one-liner p/ escalar). Sem deps server-side (reusável em client/server). Não colocar em `permissions.ts` (é server-side).
2. `/dashboard/bolsao` (`page.tsx:43`): trocar `canPull={false}` por `canPull={canPullBolsaoDashboard(user.role)}`.
3. Validar (sem código esperado) que o lead puxado pela gerente aparece pra ela atender: `/dashboard/pipeline` (filtro corretor = ela) e `/dashboard/conversas` (envio via `BrokerMessageInput`) + mover etapa no kanban.

**OUT:**
- **Não** inclui admin/supervisor neste story (ver Follow-up — bloqueados por não ter perfil de corretor).
- **Não** mexe no relógio/SLA/`primeiro_atendimento_em` (decisão do dono do produto).
- **Não** altera a RPC `pegar_lead_bolsao` (128), o `/broker/bolsao`, nem a 75-89.
- **Não** cria tela de atendimento nova (reusa pipeline/conversas do dashboard).

## Acceptance Criteria
1. **Given** gerente-comercial em `/dashboard/bolsao`, **then** vê o botão **"Pegar"** em cada card do pool.
2. **Given** ela clica "Pegar" num lead do bolsão, **then** o lead vira dela (`assigned_broker_id` = user dela, `bolsao_em=null`), sai do pool, e **permanece em "Aguardando atendimento"** (nenhum stage muda no ato).
3. **Given** o lead puxado, **then** ele aparece pra ela em `/dashboard/pipeline` (filtro por corretor) e em `/dashboard/conversas`, e ela consegue **responder** (BrokerMessageInput) e **mover a etapa** no kanban.
4. **Given** admin/supervisor em `/dashboard/bolsao` (neste story), **then** segue **read-only** (sem botão) — sem regressão.
5. **Given** corretor, **then** nada muda: `/broker/bolsao` continua puxando normalmente.
6. typecheck/lint limpos; teste do gate `canPull` por role.

## Dev Notes
- **Mudança central:** `packages/web/src/app/dashboard/bolsao/page.tsx:43` — `canPull` derivado de `user.role` (o `getServerUser()` já entrega `role`). Hoje: `canPull={false}`.
- **Hierarquia (princípio do dono do produto — ver [[feedback-hierarquia-perfis-comercial]]):** perfis comerciais são cumulativos (corretor ⊂ gerente-comercial ⊂ supervisor ⊂ admin). Não existe helper de hierarquia hoje (verificado — grep vazio; permissões em `lib/permissions*.ts` são por nome de role). Implementar o gate **preparado pra escalonar** — ex.: um helper pequeno tipo `canPullBolsao(role)` (ou `COMMERCIAL_ROLE_RANK` + `roleAtLeast`) em `lib/permissions.ts` — mas **liberando só gerente-comercial** nesta entrega. Evitar espalhar `role === '...'`.
- **Backend:** `POST /api/bolsao/[id]/pegar` usa `requireAuth` + `pegar_lead_bolsao(lead, appUser.id)`; a função gate por `brokers`+`is_available`. Fernanda passa. **Sem mudança de backend.** (A UI não deve mostrar "Pegar" a quem a função recusaria, pra não gerar erro `sem_corretor`.)
- **Atendimento (já existe, validar):** `/dashboard/conversas/[id]` renderiza `BrokerMessageInput` (envio) e não trava por `is_relationship`/role; `/dashboard/pipeline` `KanbanBoard` é `@dnd-kit` (arrastável, muda stage). Lista `/dashboard/conversas` já filtra `assigned_broker_id` e o dropdown de corretor inclui `gerente-comercial`.

## Follow-up (backlog — não neste story)
- **Escalonar o "Pegar" do bolsão pro supervisor e admin**, conforme a hierarquia (eles estão ACIMA da gerente-comercial, então deveriam herdar). Bloqueio atual: **não têm perfil de corretor** e a `pegar_lead_bolsao` exige `brokers`+`is_available`. Resolver dando perfil de corretor a eles **ou** relaxando a função pra aceitar esses papéis. Quando resolver, o mesmo gate de hierarquia já cobre. Ver [[feedback-hierarquia-perfis-comercial]] e [[project-roles-permissoes]].

## File List
- `packages/web/src/lib/roles-hierarchy.ts` (novo) — `COMMERCIAL_ROLE_RANK`, `commercialRoleAtLeast`, `canPullBolsaoDashboard`.
- `packages/web/src/lib/roles-hierarchy.test.ts` (novo) — hierarquia + gate por role.
- `packages/web/src/app/dashboard/bolsao/page.tsx` — `canPull={canPullBolsaoDashboard(user.role)}`.

## PO Validation (@po Pax — 2026-07-01)
- **Verdict: GO.** Escopo IN/OUT claro, ACs testáveis, decisão de alcance registrada (infra + gate gerente), Dev Notes com refs precisas, sem invenção (backend/telas já verificados). Helper puro reutilizável = groundwork da hierarquia ([[feedback-hierarquia-perfis-comercial]]). Sem risco de regressão (muda 1 flag + adiciona módulo novo). Status Draft → Approved. Próximo: `@dev`.

## Dev Agent Record (@dev Dex — 2026-07-01)
- [x] `lib/roles-hierarchy.ts` (novo, módulo puro): `COMMERCIAL_ROLE_RANK` (broker1<gc2<sup3<admin4), `commercialRoleAtLeast(role,min)` (cumulativo; roles fora da escala → false), `canPullBolsaoDashboard(role)` (= `role === "gerente-comercial"`, com o one-liner de escalonamento comentado).
- [x] `dashboard/bolsao/page.tsx`: `canPull={false}` → `canPull={canPullBolsaoDashboard(user.role)}` + import.
- [x] `lib/roles-hierarchy.test.ts` (novo): 7 casos — ranking, `atLeast` cumulativo + fora-da-escala, e o gate (gerente-comercial sim; supervisor/admin/corretor/obras não).
- **Checks:** `vitest` 7/7; `tsc --noEmit` 0; `eslint` (arquivos alterados) 0.
- **Sem backend:** `pegar_lead_bolsao` intocada (Fernanda já é broker+available → aceita). Atendimento reusa pipeline/conversas do dashboard (validação = @qa).
- Branch `feat/75-90-bolsao-gerente-comercial-puxar`, commit local (sem push).

## QA Results (@qa Quinn — 2026-07-01)
**Verdict: PASS.** ✅

**Teste de caminho real (prod, txn rollback):**
| Verificação | Resultado | AC |
|---|---|---|
| Gerente-comercial (Fernanda `c149cf2e…`) puxa lead do bolsão | `pegar_lead_bolsao` → lead `assigned_broker_id` = ela | AC2 |
| `bolsao_em` limpo após puxar | true | AC2 |
| Etapa preservada (não muda no ato de puxar) | true (stage_id == original) | AC2 |
| Admin (Alexandre, sem perfil de corretor) puxa | recusado — não pegou | política/gate |
| Lead do admin continua no bolsão | true | — |
Setup por clone de lead real, tudo revertido (ROLLBACK).

**Rastreabilidade:**
- AC1 (gerente vê "Pegar") / AC4 (admin/sup read-only) / AC5 (corretor inalterado): `canPullBolsaoDashboard` testado (7/7) — true só p/ gerente-comercial; `/broker/bolsao` intocado.
- AC2 (puxar → dela, bolsao null, mesma etapa): teste de banco real ✅.
- AC3 (atende no dashboard): validado por inspeção — `/dashboard/pipeline` (kanban `@dnd-kit`, move etapa; filtro corretor inclui gerente-comercial) + `/dashboard/conversas` (lista filtra `assigned_broker_id`, `[id]` usa `BrokerMessageInput` p/ enviar). Reuso, sem tela nova.
- AC6: `vitest` 7/7, `tsc` 0, `eslint` 0.

**Observações (não bloqueiam):** capacidade ativa só p/ gerente-comercial por política; helper de hierarquia (`commercialRoleAtLeast`) fica como groundwork p/ escalonar supervisor/admin quando resolverem o pré-requisito de perfil de corretor (follow-up). Backend (`pegar_lead_bolsao`) intocado.

**Gate → PASS.** Pronto para @devops (push + PR + merge/deploy). Sem migration nesta story.

## Change Log
- 2026-07-01 — @po (Pax) — GO. Alcance confirmado: infra de hierarquia + gate ativo só gerente-comercial. Status Draft → Approved.
- 2026-07-01 — @sm — Story criada (Epic 64). Libera a gerente-comercial a puxar lead do bolsão e atender pelo dashboard (backend + telas de atendimento já existem; muda só o `canPull`). Escopo só gerente-comercial; supervisor/admin viram follow-up por dependerem de perfil de corretor. Sem mexer no relógio/SLA. Gate desenhado com hierarquia em mente ([[feedback-hierarquia-perfis-comercial]]).
