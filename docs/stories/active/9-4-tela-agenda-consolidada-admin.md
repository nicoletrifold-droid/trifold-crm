status: Done

# Story 9.4 — Tela de Agenda Consolidada (Admin)

## Contexto
O supervisor/admin precisa de visao completa da agenda de TODOS os corretores. Quantas visitas por dia, quem esta sobrecarregado, quem tem horarios livres. Isso permite distribuir melhor os leads e criar agendamentos manuais (designar lead para corretor em horario especifico). A tela consolida dados de todos os corretores em uma unica visao, com filtros granulares.

## Acceptance Criteria
- [ ] AC1: Pagina `/admin/agenda` acessivel pelo menu lateral do painel admin
- [ ] AC2: Visao consolidada mostra todos os corretores em colunas (estilo Kanban horizontal por corretor)
- [ ] AC3: Cada coluna de corretor mostra blocos de visita no dia selecionado
- [ ] AC4: Filtro por corretor (multi-select — pode selecionar 1 ou mais)
- [ ] AC5: Filtro por empreendimento (dropdown)
- [ ] AC6: Filtro por periodo (date range picker — default: semana atual)
- [ ] AC7: Cards de metricas no topo: total visitas no periodo, visitas por status (scheduled/confirmed/completed/no_show), taxa de comparecimento (%)
- [ ] AC8: Botao "Novo Agendamento" abre modal pra criar manualmente: selecionar lead, corretor, data/hora, empreendimento, local
- [ ] AC9: Drag and drop de visita entre corretores (reassignar broker_id)
- [ ] AC10: Visao de tabela alternativa (toggle): lista com colunas sortaveis (corretor, lead, data, empreendimento, status)
- [ ] AC11: Export CSV dos agendamentos filtrados
- [ ] AC12: Indicador visual de carga por corretor: "2 visitas", "5 visitas" — cores verde/amarelo/vermelho baseado em threshold

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/(dashboard)/admin/agenda/page.tsx` — Pagina principal
- `packages/web/src/components/appointments/consolidated-calendar.tsx` — Visao consolidada por corretor
- `packages/web/src/components/appointments/create-appointment-modal.tsx` — Modal criacao manual
- `packages/web/src/components/appointments/appointments-table.tsx` — Visao tabela
- `packages/web/src/components/appointments/agenda-metrics.tsx` — Cards de metricas

### Visao consolidada:
```typescript
// consolidated-calendar.tsx
interface ConsolidatedCalendarProps {
  date: Date;
  brokers: Broker[];
  appointments: Appointment[];
}

// Layout: header com nome do corretor + count
// Body: timeline 08h-20h com blocos
// Scroll horizontal se muitos corretores
```

### Modal criacao manual:
```typescript
// create-appointment-modal.tsx
// Campos:
// - Lead: combobox com busca (nome ou telefone)
// - Corretor: dropdown dos corretores ativos
// - Data/Hora: date-time picker
// - Empreendimento: dropdown (opcional)
// - Local: text input (default: Stand Trifold)
// - Duracao: select (30min, 45min, 1h)
// - Notas: textarea

// Validacao: checa conflitos antes de criar
// created_by: 'admin'
```

### Metricas:
```typescript
// agenda-metrics.tsx
function calculateMetrics(appointments: Appointment[]) {
  return {
    total: appointments.length,
    scheduled: appointments.filter(a => a.status === 'scheduled').length,
    confirmed: appointments.filter(a => a.status === 'confirmed').length,
    completed: appointments.filter(a => a.status === 'completed').length,
    noShow: appointments.filter(a => a.status === 'no_show').length,
    attendanceRate: completed / (completed + noShow) * 100
  };
}
```

### API query consolidada:
```typescript
// Fetch all appointments para a org no periodo
const { data } = await supabase
  .from('appointments')
  .select(`
    *,
    lead:leads(id, name, phone),
    broker:profiles(id, full_name),
    property:properties(id, name)
  `)
  .eq('organization_id', orgId)
  .gte('scheduled_at', dateFrom)
  .lte('scheduled_at', dateTo)
  .neq('status', 'cancelled')
  .order('scheduled_at', { ascending: true });
```

## Dependencias
- Depende de: 9.1 (CRUD appointments), 5.4 (gestao corretores — lista de corretores), 1.5 (auth roles — admin)
- Bloqueia: nenhuma

## Estimativa
G (Grande) — 4-5 horas

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
