status: Done

# Story 9.6 — Follow-up Pos-Visita

## Contexto
Apos uma visita agendada, o CRM precisa saber o resultado: o lead compareceu? Teve interesse? Quer avancar? A Nicole envia uma mensagem ao corretor (via WhatsApp, no mesmo numero) pedindo feedback 1 hora apos o horario da visita. O corretor responde com texto ou audio — a IA transcreve e salva como nota no lead. Se o corretor nao responder em 24h, recebe lembrete. Isso fecha o ciclo da visita e alimenta o pipeline com dados reais.

## Acceptance Criteria
- [ ] AC1: Job agendado verifica appointments com `scheduled_at` + `duration_minutes` passados ha 1 hora e status `scheduled` ou `confirmed`
- [ ] AC2: Nicole envia mensagem ao corretor via WhatsApp: "Oi [corretor]! Como foi a visita do(a) [lead] ao [empreendimento]? Me conta como foi que eu registro aqui no sistema."
- [ ] AC3: Resposta do corretor (texto) salva como nota no lead (`activity_logs` com type `visit_feedback`)
- [ ] AC4: Resposta do corretor (audio) transcrita pela IA e salva como nota (reusar transcricao de audio se existente no pipeline)
- [ ] AC5: Apos receber feedback, Nicole atualiza appointment status para `completed`
- [ ] AC6: Se corretor responder "nao veio", "nao apareceu", "deu no_show", Nicole atualiza status para `no_show`
- [ ] AC7: Se corretor nao responder em 24h, lembrete: "[corretor], ainda preciso do feedback sobre a visita de [lead]. Como foi?"
- [ ] AC8: Flag `feedback_requested` e `feedback_received` na tabela appointments
- [ ] AC9: No maximo 2 lembretes (1h + 24h) — nao insistir alem disso
- [ ] AC10: Feedback visivel no detalhe do lead (Story 4.5) como activity log

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/bot/src/jobs/post-visit-followup.ts` — Job de follow-up
- `packages/web/src/app/api/cron/followups/route.ts` — Endpoint cron

### Colunas adicionais na tabela appointments:
```sql
ALTER TABLE appointments ADD COLUMN feedback_requested BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE appointments ADD COLUMN feedback_requested_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN feedback_received BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE appointments ADD COLUMN feedback_text TEXT;
ALTER TABLE appointments ADD COLUMN reminder_count INT NOT NULL DEFAULT 0;
```

### Job de follow-up:
```typescript
// post-visit-followup.ts
export async function processPostVisitFollowups() {
  const now = new Date();

  // 1. Visitas que terminaram ha ~1h e ainda nao pediram feedback
  const oneHourAgo = subHours(now, 1);
  const { data: needsFirstFollowup } = await supabase
    .from('appointments')
    .select(`*, lead:leads(name), broker:profiles(id, full_name, phone), property:properties(name)`)
    .in('status', ['scheduled', 'confirmed'])
    .eq('feedback_requested', false)
    .lte('scheduled_at', oneHourAgo) // visita ja passou
    .gte('scheduled_at', subHours(now, 2)); // mas nao ha mais de 2h (evitar reprocessar antigos)

  for (const apt of needsFirstFollowup) {
    await sendFollowupToBroker(apt, 'initial');
    await supabase.from('appointments').update({
      feedback_requested: true,
      feedback_requested_at: now,
      reminder_count: 1
    }).eq('id', apt.id);
  }

  // 2. Visitas com feedback pedido ha 24h+ sem resposta (max 1 reminder extra)
  const twentyFourHoursAgo = subHours(now, 24);
  const { data: needsReminder } = await supabase
    .from('appointments')
    .select(`*, lead:leads(name), broker:profiles(id, full_name, phone), property:properties(name)`)
    .eq('feedback_requested', true)
    .eq('feedback_received', false)
    .eq('reminder_count', 1)
    .lte('feedback_requested_at', twentyFourHoursAgo);

  for (const apt of needsReminder) {
    await sendFollowupToBroker(apt, 'reminder');
    await supabase.from('appointments').update({ reminder_count: 2 }).eq('id', apt.id);
  }
}
```

### Mensagem ao corretor:
```typescript
async function sendFollowupToBroker(appointment: AppointmentWithRelations, type: 'initial' | 'reminder') {
  const { broker, lead, property } = appointment;

  const message = type === 'initial'
    ? `Oi ${broker.full_name}! Como foi a visita do(a) ${lead.name} ao ${property?.name || 'empreendimento'}? Me conta como foi que eu registro aqui no sistema.`
    : `${broker.full_name}, ainda preciso do feedback sobre a visita de ${lead.name}. Como foi?`;

  // Enviar via WhatsApp para o corretor
  // Nota: corretor esta no mesmo numero (Coexistence Mode)
  // A mensagem vai como mensagem da Nicole para o numero do corretor
  await whatsappAdapter.sendText(broker.phone, message);

  // Registrar que estamos esperando feedback deste corretor para este appointment
  await supabase.from('pending_feedbacks').upsert({
    appointment_id: appointment.id,
    broker_id: broker.id,
    broker_phone: broker.phone,
    status: 'pending'
  });
}
```

### Processamento da resposta:
```typescript
// No message-handler, quando recebe mensagem de um numero que e corretor
// E tem pending_feedback, interpretar como feedback de visita

async function handleBrokerFeedback(brokerPhone: string, message: string) {
  const pending = await supabase
    .from('pending_feedbacks')
    .select('appointment_id')
    .eq('broker_phone', brokerPhone)
    .eq('status', 'pending')
    .single();

  if (!pending.data) return false;

  // Detectar se e no_show
  const isNoShow = /n[aã]o (veio|apareceu|compareceu)|no.?show|faltou/i.test(message);
  const newStatus = isNoShow ? 'no_show' : 'completed';

  await supabase.from('appointments').update({
    status: newStatus,
    feedback_received: true,
    feedback_text: message
  }).eq('id', pending.data.appointment_id);

  // Salvar como activity log no lead
  const appointment = await getAppointment(pending.data.appointment_id);
  await createActivityLog({
    lead_id: appointment.lead_id,
    type: 'visit_feedback',
    content: message,
    metadata: { appointment_id: appointment.id, status: newStatus }
  });

  // Limpar pending
  await supabase.from('pending_feedbacks')
    .update({ status: 'completed' })
    .eq('appointment_id', pending.data.appointment_id);

  return true;
}
```

### Vercel Cron:
```json
{
  "crons": [{
    "path": "/api/cron/followups",
    "schedule": "0 * * * *"
  }]
}
```

## Dependencias
- Depende de: 9.1 (schema appointments), 3.7 (WhatsApp adapter — enviar msg ao corretor), 4.9 (activity logs)
- Bloqueia: nenhuma

## Estimativa
G (Grande) — 3-4 horas

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
