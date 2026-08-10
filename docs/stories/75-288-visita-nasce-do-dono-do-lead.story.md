# Story 75-288 — Visita criada via UI nasce de quem CRIOU, não do dono do lead

**Story ID:** 75-288
**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** P (~2 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint]
- **Tipo:** bug fix (SDC/YOLO) — irmã da 75-247/75-249

---

## Story

Como **gestor**, quando alguém agenda uma visita para um lead que já tem dono, quero que a
visita nasça **do dono do lead** — não de quem clicou em salvar.

---

## Context

Caso real (10/08, lead Matheus): a Thielly (SDR) transferiu o lead pro Odair às 09:08:51 e
criou a visita das 18:30 às 09:09:30 — **39s depois**. A visita nasceu com `broker_id` =
Thielly; a Agenda mostrava ela, e o lembrete de WhatsApp da visita iria pra ela
(`appointment-whatsapp-reminders` lê `users!broker_id` DA VISITA).

A 75-249 ("a visita futura pertence a quem atende o lead") cobre a **troca de dono** — aqui
não havia visita quando o dono trocou. O buraco é na **criação**:

- `api/appointments/route.ts:249` — `broker_id: body.broker_id || appUser.id` → sem corretor
  explícito, carimba **quem criou**;
- o modal "Novo Compromisso" do /dashboard só envia `broker_id` quando a Agenda está filtrada
  por corretor — no fluxo normal não envia nada;
- a criação **não notifica ninguém** — o dono nem fica sabendo que ganhou visita.

**Dado de prod já corrigido manualmente** (visita 9169923b → Odair + activity), com
`origem: correção manual 75-288`.

---

## Acceptance Criteria

- [x] **AC1 — lead com dono ⇒ visita nasce do dono.** `POST /api/appointments` (team house)
      sem `broker_id` explícito: lead com `assigned_broker_id` carimba o dono; lead sem dono
      ou sem lead vinculado mantém o comportamento atual (quem criou). Cobre também o caminho
      `client_phone` → lead existente encontrado por telefone.
- [x] **AC2 — corretor explícito continua valendo.** `body.broker_id` enviado (Agenda
      filtrada, admin agendando para alguém) não é sobrescrito; `""` não conta como explícito.
- [x] **AC3 — dono é avisado.** Dono ≠ criador recebe push/e-mail/WhatsApp (roleta_config)
      com a variante nova `scheduled_by_other` — "Visita marcada no seu lead … (marcada por
      Thielly)". Best-effort: `notifyBrokerOfAppointment` nunca lança.
- [x] **AC4 — IMOB intocado.** Guard `team === "house"` — visita IMOB mantém o fluxo do
      Epic 81 (dono = imobiliária/corretor parceiro).
- [x] **AC5 — regra testável.** `resolveVisitBrokerOnCreate` (função pura em
      `sync-visit-owner.ts`, junto da irmã 75-249) com 5 testes: explícito > dono > criador,
      notify só quando dono ≠ criador, `""` não é explícito.
- [x] **AC6 — zero regressão.** 2080 testes verdes (+5), type-check limpo, lint 0 erros.

---

## Tasks

- [x] Função pura `resolveVisitBrokerOnCreate` em `lib/appointments/sync-visit-owner.ts`
- [x] Variante `scheduled_by_other` (+ `actorName`) em `notify-appointment.ts`
- [x] Rota: buscar dono do lead quando aplicável, carimbar e notificar pós-insert
- [x] Testes (vitest) + lint + typecheck
- [ ] Smoke pós-deploy (próxima visita agendada por SDR deve nascer do dono + notificar)

## File List

- `packages/web/src/lib/appointments/sync-visit-owner.ts` (`resolveVisitBrokerOnCreate`)
- `packages/web/src/lib/appointments/sync-visit-owner.test.ts` (+5 testes)
- `packages/web/src/lib/broker/notify-appointment.ts` (variante `scheduled_by_other` + `actorName`)
- `packages/web/src/app/api/appointments/route.ts` (resolve dono no POST + notifica)
- `docs/stories/75-288-visita-nasce-do-dono-do-lead.story.md`

## QA Results (@qa)

**Gate: PASS** — vitest 2080 verdes (7 expected fail pré-existentes), type-check limpo, lint
0 erros (21 warnings pré-existentes). Lookup do dono usa o client user-scoped (RLS igual à do
criador; lead invisível → fallback = comportamento antigo, nunca 500). Raio de impacto: só o
POST de criação; PATCH/remarcação e pipeline da Nicole intocados. Pendência consciente: smoke
pós-deploy com agendamento real.
