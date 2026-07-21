# Story 75-193 — "Registrar visita" sumia para leads em Visitou sem agendamento no sistema

## Metadata
- **Status:** Done (QA PASS)
- **Epic:** 75 — CRM core (portas de feedback de visita, linhagem 75-185/186/188) / alimenta o Epic 82
- **Branch:** fix/75-193-registrar-visita-sem-agendamento
- **Tipo:** Bug/gap — reportado pelo Marcos (prints, 2026-07-21): na etapa "Visitou",
  só alguns leads mostravam o botão "Registrar visita" no drawer do pipeline.

## Context
As portas do 75-185/186 só mostram o botão quando existe **agendamento passado**
com status scheduled/confirmed/completed sem feedback. Dados de prod (22 leads em
"Visitou"): **13 sem NENHUM agendamento**, 4 só com no-show, 1 só com cancelado —
todos sem porta de registro. Só a Eliane (visita passada pendente) tinha botão.
Leads que visitaram por fora do sistema (walk-in, combinado no WhatsApp, ou
no-show que compareceu em outra data) não tinham COMO registrar o feedback — 
exatamente o dado que alimenta a Análise IA (Epic 82).

## Solução
Porta RETROATIVA: lead na etapa **Visitou**, sem agendamento pendente e sem
feedback já registrado → botão "Registrar visita" que pede a **data da visita**,
cria um agendamento retroativo (notes explicando) e dispara o MESMO ciclo do
feedback normal — núcleo extraído para `visit-feedback-core.ts` (zero duplicação
da lógica da Nicole pós-visita/etapa/activity).

## Acceptance Criteria
- [x] AC1: núcleo do feedback extraído SEM mudança de comportamento
  (`/api/appointments/[id]/feedback` continua idêntico, agora via core).
- [x] AC2: rota nova `POST /api/leads/[id]/visit-feedback` — mesma matriz de
  permissão (admin/supervisor/gerente-comercial; corretor só dono), valida
  visited_at (nunca futuro), guard 409 se existe visita pendente (usa a porta normal).
- [x] AC3: formulário com modo retroativo (campo "Quando foi a visita?", default
  hoje, max hoje; meio-dia local para não voltar um dia em UTC).
- [x] AC4: porta nas 3 telas — drawer do pipeline, /broker/leads/[id] e
  /dashboard/leads/[id] — condição: etapa Visitou + sem pendente + sem feedback.
- [x] AC5: ciclo completo preservado no retro: visit_feedback + appointment
  completed + activity + Nicole pós-visita (cooldown 48h) — via core compartilhado.
- [x] AC6: tsc limpo, eslint limpo nos arquivos tocados, suíte 1107/1107, next build OK.

## File List
- `docs/stories/75-193-registrar-visita-sem-agendamento.story.md` (this file)
- `packages/web/src/lib/appointments/visit-feedback-core.ts` (novo — extração)
- `packages/web/src/app/api/appointments/[id]/feedback/route.ts` (usa o core)
- `packages/web/src/app/api/leads/[id]/visit-feedback/route.ts` (novo — porta retroativa)
- `packages/web/src/components/appointments/visit-feedback-form.tsx` (modo leadId + data)
- `packages/web/src/components/leads/lead-detail-drawer.tsx` (porta no drawer)
- `packages/web/src/app/broker/leads/[id]/page.tsx` (porta no broker)
- `packages/web/src/app/dashboard/leads/[id]/page.tsx` (porta no dashboard)

## Change Log
- @sm/@po: bug confirmado com query em prod (13/22 leads em Visitou sem agendamento); GO.
- @dev (Dex): core extraído; rota retroativa; form com data; porta nas 3 telas.
- @qa (Quinn): PASS — extração fiel (diff do core = copy do bloco original), guard
  anti-duplicidade (409), visited_at não-futuro, permissões espelham 75-185; suíte/build verdes.
- @devops (Gage): PR + squash-merge + verificação pós-deploy.
