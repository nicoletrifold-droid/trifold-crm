status: Done

# Story 10.3 — Tela de Agenda Mobile (PWA)

## Contexto
O corretor precisa ver sua agenda no celular de forma rapida e pratica. A tela de agenda mobile reutiliza a logica da Story 9.3 mas e otimizada para touch: swipe para confirmar/cancelar, visao de hoje por padrao, pull to refresh. O corretor abre a PWA, ve suas visitas do dia e pode agir com um toque. Ele NAO conversa com leads pela PWA — conversa pelo WhatsApp. A PWA e apenas para gestao.

## Acceptance Criteria
- [ ] AC1: Rota `/corretor/agenda` renderiza layout mobile quando viewport < 768px (responsive, nao rota separada)
- [ ] AC2: Visao padrao: lista de visitas de HOJE, ordenadas por horario
- [ ] AC3: Card de visita mobile com: hora (destaque grande), nome do lead, empreendimento, badge de status
- [ ] AC4: Swipe right no card = confirmar visita (scheduled → confirmed), com feedback haptico e visual
- [ ] AC5: Swipe left no card = abrir opcoes (cancelar, reagendar)
- [ ] AC6: Pull to refresh atualiza lista de agendamentos
- [ ] AC7: Navegacao por dia: swipe horizontal entre dias ou setas no header
- [ ] AC8: Botao flutuante "Hoje" para voltar ao dia atual quando navegando em outro dia
- [ ] AC9: Indicador no topo: "3 visitas hoje" com barra de progresso (completadas/total)
- [ ] AC10: Toque no card abre detalhe inline (expand): endereco, notas, botao "Ver lead", botao "Ligar" (tel: link), botao "WhatsApp" (deeplink)
- [ ] AC11: Estado vazio: "Nenhuma visita hoje. Bom descanso!" (ou similar)
- [ ] AC12: Performance: First Contentful Paint < 1.5s em 4G

## Detalhes Tecnicos

### Arquivos a criar/modificar:
- `packages/web/src/components/appointments/mobile/agenda-mobile.tsx` — Container mobile
- `packages/web/src/components/appointments/mobile/appointment-card-mobile.tsx` — Card com swipe
- `packages/web/src/components/appointments/mobile/day-navigation.tsx` — Navegacao entre dias
- `packages/web/src/components/appointments/mobile/appointment-detail-sheet.tsx` — Bottom sheet de detalhes
- `packages/web/src/app/(dashboard)/corretor/agenda/page.tsx` — Modificar para responsive

### Responsividade na pagina:
```tsx
// corretor/agenda/page.tsx
export default function AgendaPage() {
  return (
    <>
      {/* Desktop: calendar view completo (Story 9.3) */}
      <div className="hidden md:block">
        <CalendarDayView ... />
      </div>

      {/* Mobile: lista otimizada */}
      <div className="block md:hidden">
        <AgendaMobile ... />
      </div>
    </>
  );
}
```

### Swipe com gestos:
```typescript
// Usar @use-gesture/react para gestos touch
import { useSwipeable } from 'react-swipeable';

// Ou implementar com Framer Motion
import { motion, useMotionValue, useTransform } from 'framer-motion';

function AppointmentCardMobile({ appointment, onConfirm, onCancel }: Props) {
  const x = useMotionValue(0);
  const background = useTransform(x, [-100, 0, 100], ['#EF4444', '#FFFFFF', '#22C55E']);

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: -100, right: 100 }}
      style={{ x }}
      onDragEnd={(_, info) => {
        if (info.offset.x > 80) onConfirm(appointment.id);
        if (info.offset.x < -80) onCancel(appointment.id);
      }}
    >
      {/* Card content */}
    </motion.div>
  );
}
```

### Pull to refresh:
```typescript
// Usar react-pull-to-refresh ou implementar com touch events
// Ou usar a API nativa do browser: overscroll-behavior + custom handler

function AgendaMobile() {
  const { data, refetch, isRefetching } = useAppointments({ date: selectedDate });

  return (
    <PullToRefresh onRefresh={refetch} isRefreshing={isRefetching}>
      <div className="space-y-3 px-4 pb-20">
        {/* Header com contagem */}
        <div className="text-center py-4">
          <p className="text-2xl font-bold">{todayAppointments.length}</p>
          <p className="text-sm text-muted-foreground">visitas hoje</p>
        </div>

        {/* Lista de cards */}
        {todayAppointments.map(apt => (
          <AppointmentCardMobile key={apt.id} appointment={apt} />
        ))}
      </div>
    </PullToRefresh>
  );
}
```

### Deeplinks no detalhe:
```tsx
// appointment-detail-sheet.tsx (bottom sheet)
<div className="flex gap-3 mt-4">
  <a href={`tel:${lead.phone}`} className="btn-secondary flex-1">
    <PhoneIcon /> Ligar
  </a>
  <a href={`https://wa.me/${lead.phone}`} className="btn-primary flex-1">
    <WhatsAppIcon /> WhatsApp
  </a>
  <Link href={`/corretor/leads/${lead.id}`} className="btn-outline flex-1">
    <UserIcon /> Ver Lead
  </Link>
</div>
```

## Dependencias
- Depende de: 9.1 (CRUD appointments), 9.3 (hooks e logica base), 10.1 (PWA setup — installable)
- Bloqueia: nenhuma

## Estimativa
M (Media) — 2-3 horas

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
