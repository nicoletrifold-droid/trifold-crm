status: Done

# Story 11.4 — Timeline Completa do Lead

## Contexto
Visualizacao cronologica de TUDO que aconteceu com o lead: mensagens (lead, Nicole, corretor), mudancas de etapa, agendamentos, follow-ups, vendas. Cada evento identificado por quem fez.

## Acceptance Criteria
- [ ] AC1: Tab "Timeline" na pagina /dashboard/leads/[id] com visualizacao cronologica
- [ ] AC2: Eventos de mensagens: lead (cinza), Nicole (laranja), corretor (azul)
- [ ] AC3: Eventos de sistema: mudanca de etapa (verde), agendamento (roxo), venda (dourado)
- [ ] AC4: Eventos de follow-up: follow-up enviado (amarelo), alerta ao corretor (vermelho)
- [ ] AC5: Cada evento mostra: icone, quem fez (lead/Nicole/corretor/sistema), descricao, timestamp
- [ ] AC6: Duracao entre eventos chave: "3 dias entre qualificacao e visita"
- [ ] AC7: Card resumo no topo: "Jornada de X dias, Y mensagens, Score Z, Etapa atual"
- [ ] AC8: Filtro: Todos | Lead | Nicole | Corretor | Sistema
- [ ] AC9: API `GET /api/leads/[id]/timeline` que agrega: messages + activities + appointments + follow_up_log
- [ ] AC10: Timeline responsiva (vertical em mobile, horizontal opcional em desktop)

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/api/leads/[id]/timeline/route.ts` — API que agrega todos os eventos do lead
- `packages/web/src/components/leads/timeline/lead-timeline.tsx` — componente principal da timeline
- `packages/web/src/components/leads/timeline/timeline-event.tsx` — componente de evento individual
- `packages/web/src/components/leads/timeline/timeline-filters.tsx` — filtros da timeline
- `packages/web/src/components/leads/timeline/timeline-summary.tsx` — card resumo da jornada

## Dependencias
- Depende de: 11.2
- Bloqueia: Nenhuma

## Estimativa
G — 3-4h

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
