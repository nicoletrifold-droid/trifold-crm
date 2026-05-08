status: Done

# Story 11.3 — Nicole SDR: Feedback Pos-Visita

## Contexto
Apos visita (appointment status=completed), Nicole pede feedback ao corretor e envia follow-up ao lead. A Nicole atua como SDR apoiando o corretor em todo o ciclo.

## Acceptance Criteria
- [ ] AC1: Quando appointment muda para "completed", Nicole envia mensagem ao lead: "Oi {nome}, que bom que voce veio conhecer o {empreendimento}! O que achou?"
- [ ] AC2: Nicole envia notificacao ao corretor pedindo feedback (via atividade no CRM ou mensagem)
- [ ] AC3: Formulario de feedback do corretor no CRM: como foi, nivel de interesse (frio/morno/quente), proximos passos
- [ ] AC4: Feedback do corretor salvo em visit_feedback + registrado na timeline
- [ ] AC5: Se corretor nao responde em 24h, marca como "feedback pendente" com alerta visual
- [ ] AC6: Nicole adapta follow-up ao lead baseado no feedback do corretor (se quente: propor proximos passos, se frio: manter contato leve)
- [ ] AC7: Se lead nao responde ao follow-up pos-visita, Nicole tenta mais 1 vez apos 3 dias (maximo 2 tentativas)
- [ ] AC8: Activity log tipo "followup_pos_visita" registrado para cada acao

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/api/appointments/[id]/feedback/route.ts` — API para submeter feedback do corretor
- `packages/web/src/components/appointments/visit-feedback-form.tsx` — formulario de feedback pos-visita
- `packages/web/src/lib/nicole-post-visit.ts` — logica de follow-up pos-visita da Nicole
- `supabase/migrations/XXXXXX_create_visit_feedback.sql` — migracao da tabela visit_feedback + RLS

## Dependencias
- Depende de: 11.2, 9.1 (appointments)
- Bloqueia: Nenhuma

## Estimativa
G — 3-4h

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
