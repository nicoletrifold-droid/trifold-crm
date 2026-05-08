status: Done

# Story 9.5 — Lembrete Automatico ao Lead

## Contexto
Leads esquecem visitas. A Nicole envia um lembrete automatico via WhatsApp antes da visita agendada. Isso reduz no-show drasticamente. O lembrete usa template de utilidade da Meta (utility template), que e gratuito se enviado dentro da janela de 24h do ultimo contato, ou custa R$0,04 fora dela. Se o lead responder ao lembrete (cancelar, confirmar, perguntar algo), a Nicole interage normalmente dentro da janela de conversa.

## Acceptance Criteria
- [ ] AC1: Job agendado (cron) roda a cada 30 minutos e verifica appointments com `scheduled_at` proximo
- [ ] AC2: Lembrete enviado X horas antes da visita (configuravel em `agent_config.reminder_hours_before`, default: 2)
- [ ] AC3: Mensagem enviada via WhatsApp Cloud API usando template de utilidade pre-aprovado
- [ ] AC4: Template do lembrete: "Oi [nome]! Lembrete da sua visita ao [empreendimento] hoje as [hora]. Endereco: [endereco stand]. Te esperamos!"
- [ ] AC5: Se template nao aprovado ainda, fallback para mensagem normal (so funciona dentro de janela 24h)
- [ ] AC6: Flag `reminder_sent` na tabela appointments para evitar envio duplicado
- [ ] AC7: Se lead responder ao lembrete com cancelamento (ex: "nao vou poder ir", "cancela"), Nicole detecta e:
  - Atualiza status para `cancelled`
  - Notifica corretor: "[Lead] cancelou a visita de [data/hora]"
  - Pergunta se quer reagendar: "Sem problema! Quer marcar outro dia?"
- [ ] AC8: Se lead confirmar (ex: "ok", "estarei la", "confirmado"), Nicole atualiza status para `confirmed`
- [ ] AC9: Lembrete NAO enviado para appointments com status cancelled ou completed
- [ ] AC10: Log de envio: timestamp, message_id da Meta, status (sent/failed)

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/bot/src/jobs/appointment-reminder.ts` — Job de lembrete
- `packages/bot/src/templates/reminder-template.ts` — Template WhatsApp
- `packages/web/src/app/api/cron/reminders/route.ts` — Endpoint cron (Vercel Cron)

### Coluna adicional na tabela appointments:
```sql
ALTER TABLE appointments ADD COLUMN reminder_sent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE appointments ADD COLUMN reminder_sent_at TIMESTAMPTZ;
```

### Job de lembrete:
```typescript
// appointment-reminder.ts
export async function processReminders() {
  const config = await getAgentConfig(orgId);
  const hoursBeforeReminder = config.reminder_hours_before || 2;

  const now = new Date();
  const reminderWindow = addHours(now, hoursBeforeReminder);
  const bufferEnd = addMinutes(reminderWindow, 30); // janela de 30min do cron

  // Buscar appointments que precisam de lembrete
  const { data: appointments } = await supabase
    .from('appointments')
    .select(`*, lead:leads(id, name, phone), property:properties(id, name, address)`)
    .in('status', ['scheduled', 'confirmed'])
    .eq('reminder_sent', false)
    .gte('scheduled_at', reminderWindow)
    .lte('scheduled_at', bufferEnd);

  for (const apt of appointments) {
    await sendReminder(apt);
    await supabase
      .from('appointments')
      .update({ reminder_sent: true, reminder_sent_at: new Date() })
      .eq('id', apt.id);
  }
}
```

### Envio via template:
```typescript
// reminder-template.ts
export async function sendReminder(appointment: AppointmentWithRelations) {
  const { lead, property } = appointment;
  const time = format(new Date(appointment.scheduled_at), 'HH:mm', { timeZone: 'America/Sao_Paulo' });

  // Tentar enviar via template (funciona fora da janela 24h)
  try {
    await whatsappAdapter.sendTemplate(lead.phone, 'visit_reminder', {
      body: [
        { type: 'text', text: lead.name },           // {{1}} nome
        { type: 'text', text: property?.name || '' }, // {{2}} empreendimento
        { type: 'text', text: time },                 // {{3}} hora
        { type: 'text', text: appointment.location }  // {{4}} endereco
      ]
    });
  } catch (error) {
    // Fallback: mensagem normal (so funciona dentro de janela 24h)
    const message = `Oi ${lead.name}! Lembrete da sua visita ao ${property?.name} hoje as ${time}. Endereco: ${appointment.location}. Te esperamos!`;
    await whatsappAdapter.sendText(lead.phone, message);
  }
}
```

### Vercel Cron (vercel.json):
```json
{
  "crons": [{
    "path": "/api/cron/reminders",
    "schedule": "*/30 * * * *"
  }]
}
```

### Deteccao de cancelamento pelo lead:
```typescript
// Adicionar no pipeline de processamento da Nicole (message-handler)
// Quando lead responde apos lembrete, checar se e cancelamento
// Usar o contexto da conversa: se ultimo envio foi lembrete de visita e lead diz "nao posso ir"
// Nicole ja tem capacidade de usar tool call — adicionar tool CANCEL_APPOINTMENT e CONFIRM_APPOINTMENT
```

## Dependencias
- Depende de: 9.1 (schema appointments), 3.7 (WhatsApp Cloud API adapter), 3.1 (personalidade Nicole — tom da mensagem)
- Bloqueia: nenhuma

## Estimativa
M (Media) — 2-3 horas

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
