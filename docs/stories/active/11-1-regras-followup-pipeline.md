status: Done

# Story 11.1 — Regras de Follow-up por Etapa do Pipeline

## Contexto
Cada etapa do pipeline tem regras de follow-up configuraveis. Admin define: dias sem contato para alerta ao corretor, dias para Nicole assumir, mensagem template por etapa.

## Acceptance Criteria
- [ ] AC1: Tabela `follow_up_rules` criada: id, org_id, stage_id (FK kanban_stages), alert_days (int), nicole_takeover_days (int), message_template (text), is_active (bool), created_at, updated_at
- [ ] AC2: Seed com regras default por etapa (Em Qualificacao: 1/2 dias, Qualificado: 1/2, Visita Agendada: confirm 1 dia antes, Visitou: 2/4, Negociando: 3/5)
- [ ] AC3: Pagina /dashboard/pipeline/config com etapas e regras de follow-up editaveis
- [ ] AC4: API GET/PATCH /api/stages/[id]/followup para editar regras por etapa
- [ ] AC5: Toggle ativar/desativar follow-up por etapa
- [ ] AC6: Mensagem template editavel com variaveis ({nome}, {empreendimento}, {dias_sem_contato})
- [ ] AC7: Validacao: alert_days < nicole_takeover_days (corretor age antes da Nicole)
- [ ] AC8: RLS: apenas admin/supervisor edita regras

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/dashboard/pipeline/config/page.tsx` — pagina de configuracao de etapas e follow-up
- `packages/web/src/app/api/stages/[id]/followup/route.ts` — API GET/PATCH regras de follow-up por etapa
- `supabase/migrations/XXXXXX_create_follow_up_rules.sql` — migracao da tabela follow_up_rules + seed + RLS

## Dependencias
- Depende de: Nenhuma
- Bloqueia: 11.2

## Estimativa
M — 2-3h

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
