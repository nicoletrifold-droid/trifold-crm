status: Done

# Story 11.5 — Alertas Integrados ao Pipeline

## Contexto
Leads com follow-up pendente ou sem contato sao destacados no pipeline kanban. Badge na sidebar mostra contagem. Corretor ve alertas na sua area.

## Acceptance Criteria
- [ ] AC1: Cards no pipeline kanban com borda vermelha para leads sem contato > alert_days
- [ ] AC2: Badge "X dias" no card indicando tempo sem contato
- [ ] AC3: Indicador de quem precisa agir: icone corretor ou icone Nicole
- [ ] AC4: Badge na sidebar com contagem total de leads precisando acao
- [ ] AC5: Pagina /dashboard/alertas com lista ordenada por urgencia (mais tempo sem contato primeiro)
- [ ] AC6: Cada alerta mostra: lead, etapa, dias sem contato, empreendimento, corretor designado
- [ ] AC7: Acoes rapidas: "Nicole enviar agora" (dispara follow-up), "Marcar como feito", "Ver conversa"
- [ ] AC8: Alertas para corretor em /broker/alertas (filtrado pelos seus leads)
- [ ] AC9: Auto-dismiss: alerta some quando corretor ou Nicole entra em contato
- [ ] AC10: API `GET /api/alerts` com filtro por broker_id, stage_id, urgencia

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/dashboard/alertas/page.tsx` — pagina de alertas do admin/supervisor
- `packages/web/src/app/broker/alertas/page.tsx` — pagina de alertas do corretor
- `packages/web/src/app/api/alerts/route.ts` — API de alertas com filtros
- `packages/web/src/components/pipeline/alert-badge.tsx` — badge de alerta no card do pipeline
- `packages/web/src/components/sidebar/alert-counter.tsx` — contador de alertas na sidebar

## Dependencias
- Depende de: 11.2
- Bloqueia: Nenhuma

## Estimativa
G — 3-4h

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
