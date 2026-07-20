# Story 75-186 — Feedback de visita nas superfícies do gestor (página do lead + drawer)

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core (agenda / visitas)
- **Branch:** feat/75-186-feedback-dashboard-lead-drawer
- **Tipo:** Complemento da 75-185 — reportado pelo Marcos (prints, 2026-07-20)

## Context
A 75-185 pôs o botão de feedback na página do lead do CORRETOR, no dashboard/agenda e no
kanban→Visitou. Marcos mostrou (prints) que faltaram as duas superfícies que o GESTOR mais
usa p/ olhar lead: a **página do lead no dashboard** (`/dashboard/leads/[id]`, aba Info) e o
**drawer do pipeline** (`lead-detail-drawer.tsx`, aberto ao clicar no card).

Mesma regra da 75-185: agendamento com `scheduled_at` no passado, `status` em
scheduled/confirmed/completed e **sem** `visit_feedback` → botão "Registrar visita"
(componente compartilhado `VisitFeedbackButton`). RLS já permite o join org-wide
(`visit_feedback_select`, mig 004).

## Acceptance Criteria
- [x] AC1: página do lead no dashboard — botão no header (junto de etapa/score) quando há
  agendamento pendente de feedback (mesma query da porta 1 da 75-185).
- [x] AC2: drawer do pipeline — botão ao lado de "Conversar no WhatsApp"; consulta via
  Supabase client (padrão da porta 3); some após envio (`onSuccess` limpa o estado).
- [x] AC3: `VisitFeedbackButton` ganha `onSuccess?` opcional (sem quebrar usos da 75-185).
- [x] AC4: type-check/lint/suíte verdes.

## File List
- `docs/stories/75-186-feedback-dashboard-lead-drawer.story.md` (this file)
- `packages/web/src/app/dashboard/leads/[id]/page.tsx` (query + botão no header)
- `packages/web/src/components/leads/lead-detail-drawer.tsx` (query client + botão)
- `packages/web/src/components/appointments/visit-feedback-form.tsx` (onSuccess opcional)

## Change Log
- @sm/@po: fluxo mínimo — gap apontado pelo Marcos com prints; regra idêntica à 75-185.
- @dev (Dex): query pendente-de-feedback nas 2 superfícies (server na página, client no
  drawer); botão compartilhado; onSuccess opcional p/ o drawer esconder o botão após envio.
- @qa (Quinn): PASS — 1093/1093, tsc verde, 0 erros de lint (2 warnings pré-existentes do drawer).
- @devops (Gage): PR squash-merge, deploy prod automático.
