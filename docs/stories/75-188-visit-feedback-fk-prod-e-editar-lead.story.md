# Story 75-188 — visit_feedback sem FK no prod (feedback quebrado) + "Editar Lead" abre edição de verdade

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core (agenda / visitas / UX corretor)
- **Branch:** fix/75-188-visit-feedback-fk-e-editar-lead
- **Tipo:** Bug — reportado pelo Marcos (prints do corretor Robson, 2026-07-21)

## Context
Marcos reportou 3 falhas na visão do corretor:
1. Drawer do lead (Meus Leads) sem botão de feedback de visita ("engessado num local só").
2. Lápis e "Editar Lead" no drawer abrem a MESMA tela de conversa — nenhuma edição.
3. "Ver completo" abre a mesma tela também ("visivelmente errado").

**Root cause da falha 1 (e mais grave que o reportado):** a migration 011 nunca foi
aplicada no prod — `visit_feedback` NÃO TEM `appointment_id` nem `org_id` (ausência
documentada na mig 031, 2026-05-12, e nunca sanada). Consequências em produção:
- Embed `feedback:visit_feedback(id)` a partir de `appointments` → PGRST200 (sem FK)
  → botões query-driven das 75-185/186 NUNCA renderizam (página do lead broker,
  página do lead dashboard, drawer compartilhado).
- `POST /api/appointments/[id]/feedback` insere `appointment_id`/`org_id` → 42703 →
  TODO submit de feedback falha (500). `visit_feedback` tem 0 linhas no prod.
- Cron `followup` (pós-visita da Nicole) usa o mesmo embed → pós-visita MORTO no prod.
O botão "Dar feedback" da agenda aparece por não depender da query — mas o submit falha.

**Falhas 2/3:** no drawer compartilhado, lápis, "Editar Lead" e "Ver completo" apontam
os 3 para `${leadBasePath}/${leadId}` sem distinção. A página do corretor TEM edição
(LeadDetailsPanel, atrás do "⋮"), mas nada a abre diretamente.

## Acceptance Criteria
- [x] AC1 (DB): migration `180_visit_feedback_appointment_org.sql` — espelha a 011
  (`ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES appointments(id)`,
  `org_id uuid REFERENCES organizations(id)`) + índices `idx_visit_feedback_appointment`
  e `idx_visit_feedback_org` (pulados na 031) + `property_id` DROP NOT NULL +
  `NOTIFY pgrst, 'reload schema'`. Aplicada no PROD via Management API e registrada
  em `schema_migrations` ('180').
- [x] AC2 (verificação prod): embed `appointments→visit_feedback` responde sem erro
  (testado com o agendamento real fe02dc2d); INSERT completo smoke-testado em
  transação com ROLLBACK — shape ok.
- [x] AC3 (UI): no drawer compartilhado, lápis e "Editar Lead" linkam para
  `${leadBasePath}/${leadId}?edit=1`; "Ver completo" continua sem query param.
- [x] AC4 (broker): `/broker/leads/[id]?edit=1` abre o `LeadDetailsPanel` já aberto
  (prop `initialOpen`); sem o param, comportamento atual.
- [x] AC5 (dashboard): `/dashboard/leads/[id]?edit=1` cai na aba Info com o
  `EditLeadToggle` já em modo edição (prop `initialEditing`, só quando `canEdit`).
- [x] AC6: type-check/lint/suíte verdes (1093/1093).
- [x] AC7 (descoberto no dev): API de feedback não enviava `property_id`/`visited_at`
  (NOT NULL) — insert falharia com 23502 mesmo com a FK. Corrigida: herda
  `property_id`/`scheduled_at` do agendamento. `broker_id` fica de fora
  (visit_feedback.broker_id→brokers(id) × appointments.broker_id→users(id)).

## Scope
- **OUT:** redesign da página do corretor p/ lead sem conversa; layout do "Ver
  completo"; backfill de feedbacks (0 linhas — nada a restaurar; os enviados antes
  falharam com 500 e foram perdidos).

## File List
- `docs/stories/75-188-visit-feedback-fk-prod-e-editar-lead.story.md` (this file)
- `supabase/migrations/180_visit_feedback_appointment_org.sql`
- `packages/web/src/components/leads/lead-detail-drawer.tsx` (links ?edit=1)
- `packages/web/src/app/broker/leads/[id]/page.tsx` (searchParams edit → initialOpen)
- `packages/web/src/app/broker/leads/[id]/_components/lead-details-panel.tsx` (prop initialOpen)
- `packages/web/src/app/dashboard/leads/[id]/page.tsx` (searchParams edit → initialEditing)
- `packages/web/src/app/dashboard/leads/[id]/_components/edit-lead-toggle.tsx` (prop initialEditing)
- `packages/web/src/app/api/appointments/[id]/feedback/route.ts` (property_id/visited_at no insert)

## Change Log
- @sm (River)/@po (Pax): draft + GO — root cause achado com queries no prod (embed
  PGRST200, insert 42703, tabela vazia); escopo cobre DB + UX de edição. Draft → Ready.
- @dev (Dex)/@data-engineer (Dara): mig 180 aplicada no prod (Management API) +
  registrada; embed e insert verificados no banco real; ?edit=1 nas 2 páginas;
  AC7 descoberto e corrigido junto.
- @qa (Quinn): PASS — 1093/1093, tsc verde, lint 0 erros nos arquivos tocados
  (2 warnings pré-existentes do drawer). Efeito colateral positivo verificado:
  pós-visita da Nicole (cron followup) volta a funcionar — usava o mesmo embed.
- @devops (Gage): PR squash-merge, deploy prod automático.
