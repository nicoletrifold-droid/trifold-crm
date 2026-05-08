status: Done

# Story 9.3 — Tela de Agenda do Corretor

## Contexto
O corretor precisa visualizar suas visitas agendadas de forma rapida e clara. A tela de agenda no painel do corretor mostra visao de dia e semana, com todas as informacoes necessarias: nome do lead, empreendimento, horario e status. O corretor pode confirmar, reagendar ou cancelar visitas. Indicadores visuais de conflito (2 visitas no mesmo horario) ajudam a evitar sobreposicoes. Essa mesma logica sera reutilizada na versao mobile (PWA — Story 10.3).

## Acceptance Criteria
- [ ] AC1: Pagina `/corretor/agenda` acessivel pelo menu lateral do painel do corretor
- [ ] AC2: Visao de dia mostra timeline vertical com blocos de visita (08h-20h)
- [ ] AC3: Visao de semana mostra grade 7 dias com indicadores de visitas por horario
- [ ] AC4: Toggle dia/semana com estado persistido (default: dia)
- [ ] AC5: Cada bloco de visita exibe: nome do lead, empreendimento, horario, status (badge colorido)
- [ ] AC6: Status com cores: scheduled (amarelo), confirmed (azul), completed (verde), cancelled (cinza), no_show (vermelho)
- [ ] AC7: Acoes no bloco: "Confirmar" (scheduled → confirmed), "Cancelar" (→ cancelled), "Reagendar" (abre modal com date picker)
- [ ] AC8: Indicador visual de conflito: borda vermelha quando 2+ visitas se sobrepoe no mesmo horario
- [ ] AC9: Filtro por empreendimento (dropdown) e por status (multi-select)
- [ ] AC10: Navegacao por data: setas esquerda/direita para dia anterior/proximo, botao "Hoje" para voltar ao dia atual
- [ ] AC11: Loading skeleton enquanto carrega dados
- [ ] AC12: Estado vazio: "Nenhuma visita agendada para este dia" com ilustracao

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/(dashboard)/corretor/agenda/page.tsx` — Pagina principal
- `packages/web/src/components/appointments/calendar-day-view.tsx` — Visao de dia (timeline)
- `packages/web/src/components/appointments/calendar-week-view.tsx` — Visao de semana (grade)
- `packages/web/src/components/appointments/appointment-card.tsx` — Card de visita
- `packages/web/src/components/appointments/appointment-actions.tsx` — Acoes (confirmar, cancelar, reagendar)
- `packages/web/src/components/appointments/reschedule-modal.tsx` — Modal de reagendamento
- `packages/web/src/hooks/use-appointments.ts` — Hook para fetch e mutate

### Componente de visao dia:
```typescript
// calendar-day-view.tsx
interface DayViewProps {
  date: Date;
  appointments: Appointment[];
  onStatusChange: (id: string, status: AppointmentStatus) => void;
  onReschedule: (id: string, newDate: Date) => void;
}

// Timeline de 08h-20h com slots de 30min
// Posicionar appointments absolutos baseado em scheduled_at e duration_minutes
// Detectar overlaps: se 2 appointments tem horarios sobrepostos, exibir lado a lado com borda vermelha
```

### Hook de dados:
```typescript
// use-appointments.ts
export function useAppointments(filters: {
  dateFrom: Date;
  dateTo: Date;
  propertyId?: string;
  status?: AppointmentStatus[];
}) {
  return useQuery({
    queryKey: ['appointments', filters],
    queryFn: () => fetch(`/api/appointments?${buildParams(filters)}`).then(r => r.json())
  });
}

export function useUpdateAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Appointment> }) =>
      fetch(`/api/appointments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appointments'] })
  });
}
```

### Deteccao de conflitos (frontend):
```typescript
function detectConflicts(appointments: Appointment[]): Set<string> {
  const conflictIds = new Set<string>();
  const sorted = [...appointments].sort((a, b) =>
    new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  );

  for (let i = 0; i < sorted.length; i++) {
    const endA = addMinutes(new Date(sorted[i].scheduled_at), sorted[i].duration_minutes);
    for (let j = i + 1; j < sorted.length; j++) {
      const startB = new Date(sorted[j].scheduled_at);
      if (startB < endA) {
        conflictIds.add(sorted[i].id);
        conflictIds.add(sorted[j].id);
      } else break;
    }
  }
  return conflictIds;
}
```

## Dependencias
- Depende de: 9.1 (CRUD appointments), 6.1 (login corretor — painel existe)
- Bloqueia: 10.3 (versao mobile PWA reutiliza componentes)

## Estimativa
G (Grande) — 3-4 horas

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
