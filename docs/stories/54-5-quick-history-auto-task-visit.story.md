# Story 54-5 — Quick History Modal: Auto-task, Empreendimento em Visita e Agenda

## Metadata
- **Status:** Done
- **QA:** 2026-06-10 — PASS (typecheck limpo, lógica revisada)
- **Priority:** P1
- **Complexity:** M (~2-3h)
- **Created:** 2026-06-10
- **Author:** @sm (River)
- **Validated:** 2026-06-10 by @po (Pax) — GO (9/10)

## User Story
**Como** corretor, **quero** que ao registrar um contato com retorno agendado o sistema
crie automaticamente a tarefa correspondente, que visitas tenham campo de empreendimento,
e que visitas futuras já apareçam na agenda,
**para que** eu não precise criar tarefas ou compromissos manualmente.

## Acceptance Criteria

### AC1 — Auto-criar tarefa no retorno
- Quando "Agendou retorno = Sim" e data preenchida em QUALQUER tipo de ação, ao salvar:
  - `POST /api/leads/{id}/tasks` com `title = "Retorno - {Tipo}"`, `action_type`, `due_at = data+hora`
- Tarefa aparece imediatamente na seção TAREFAS do drawer

### AC2 — Campo Empreendimento em Visita
- Quando `actionType === "visita"`, exibir select "Empreendimento/Imóvel"
- Propriedades buscadas via Supabase client (mesmo padrão dos stages)
- Campo opcional — não bloqueia salvar

### AC3 — Criar compromisso na agenda para visitas futuras
- Quando `actionType === "visita"` + "Agendou retorno = Sim" + data > hoje:
  - `POST /api/appointments` com `lead_id`, `scheduled_at`, `property_id` (se selecionado), `duration_minutes: 60`
  - `broker_id` é inferido pelo servidor via `requireAuth()` (não enviar)
- Compromisso aparece na agenda do corretor com o fluxo de lembretes existente

### AC4 — Feedback ao usuário
- Se criar tarefa E compromisso: toast/mensagem "Tarefa e compromisso criados na agenda"
- Se criar só tarefa: mensagem "Tarefa criada"
- Erros não bloqueiam o salvamento do histórico

## Scope
**IN:** `quick-history-modal.tsx` apenas

**OUT:**
- Modificar a agenda ou o fluxo de lembretes (já existe)
- Criar task para visitas sem retorno

## Tasks
- [x] T1: Auto-criar task via `POST /api/leads/{id}/tasks` quando retorno = Sim
- [x] T2: Campo Empreendimento no formulário de Visita
- [x] T3: Criar appointment via `POST /api/appointments` em visita futura
- [x] T4: Feedback inline ao usuário
- [x] T5: Typecheck clean

## Files
- `packages/web/src/app/broker/_components/quick-history-modal.tsx`
