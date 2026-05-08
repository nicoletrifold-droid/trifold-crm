status: Done

# Story 9.1 — Schema e CRUD de Agendamentos

## Contexto
A agenda de visitas e o proximo passo natural apos qualificacao e handoff. Quando o corretor combina uma visita com o lead pelo WhatsApp, o sistema precisa registrar esse agendamento. Esta story cria a fundacao: tabela `appointments` no Supabase com RLS e API routes CRUD completas. A agenda e 100% interna (sem integracao Google Calendar) — o CRM e a fonte unica de verdade para visitas.

## Acceptance Criteria
- [ ] AC1: Tabela `appointments` criada no Supabase com campos: `id` (uuid), `organization_id`, `lead_id` (FK leads), `broker_id` (FK profiles), `property_id` (FK properties, nullable), `scheduled_at` (timestamptz), `duration_minutes` (int, default 30), `location` (text, default "Stand Trifold"), `status` (enum: scheduled/confirmed/completed/cancelled/no_show), `notes` (text, nullable), `created_by` (enum: nicole/broker/admin), `created_at`, `updated_at`
- [ ] AC2: RLS policies: corretor ve apenas seus agendamentos (`broker_id = auth.uid()`), admin/supervisor ve todos da organizacao
- [ ] AC3: API route `GET /api/appointments` retorna agendamentos filtrados por `broker_id`, `date_from`, `date_to`, `status`, `property_id`
- [ ] AC4: API route `POST /api/appointments` cria agendamento com validacao de campos obrigatorios (lead_id, broker_id, scheduled_at)
- [ ] AC5: API route `PUT /api/appointments/[id]` atualiza agendamento (status, horario, notas)
- [ ] AC6: API route `DELETE /api/appointments/[id]` faz soft delete (status = cancelled) — nunca deleta fisicamente
- [ ] AC7: Validacao: nao permite agendar no passado
- [ ] AC8: Validacao: alerta (nao bloqueia) se conflito de horario para o mesmo corretor
- [ ] AC9: Activity log registrado em toda operacao CRUD (created, updated, cancelled)
- [ ] AC10: Seed com 3-5 agendamentos de exemplo para dev/staging

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/api/appointments/route.ts` — GET (list) e POST (create)
- `packages/web/src/app/api/appointments/[id]/route.ts` — GET (detail), PUT (update), DELETE (cancel)
- `packages/web/src/lib/types/appointment.ts` — Types TypeScript
- `supabase/migrations/XXXXXX_create_appointments.sql` — Migration

### Schema SQL:
```sql
CREATE TYPE appointment_status AS ENUM ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show');
CREATE TYPE appointment_creator AS ENUM ('nicole', 'broker', 'admin');

CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  lead_id UUID NOT NULL REFERENCES leads(id),
  broker_id UUID NOT NULL REFERENCES profiles(id),
  property_id UUID REFERENCES properties(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 30,
  location TEXT NOT NULL DEFAULT 'Stand Trifold',
  status appointment_status NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  created_by appointment_creator NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX idx_appointments_broker ON appointments(broker_id, scheduled_at);
CREATE INDEX idx_appointments_lead ON appointments(lead_id);
CREATE INDEX idx_appointments_org_date ON appointments(organization_id, scheduled_at);
CREATE INDEX idx_appointments_status ON appointments(status);

-- RLS
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Corretores veem seus agendamentos"
  ON appointments FOR SELECT
  USING (broker_id = auth.uid());

CREATE POLICY "Admin ve todos da org"
  ON appointments FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
  ));

CREATE POLICY "Admin e corretor podem criar"
  ON appointments FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Admin e corretor podem atualizar"
  ON appointments FOR UPDATE
  USING (
    broker_id = auth.uid() OR
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor'))
  );
```

### Deteccao de conflitos:
```typescript
async function checkConflicts(brokerId: string, scheduledAt: Date, durationMinutes: number) {
  const endTime = addMinutes(scheduledAt, durationMinutes);
  const { data: conflicts } = await supabase
    .from('appointments')
    .select('id, scheduled_at, duration_minutes, lead:leads(name)')
    .eq('broker_id', brokerId)
    .in('status', ['scheduled', 'confirmed'])
    .gte('scheduled_at', subMinutes(scheduledAt, 60))
    .lte('scheduled_at', endTime);
  return conflicts;
}
```

## Dependencias
- Depende de: 1.2 (Supabase schema base), 1.5 (auth e roles), 4.4 (leads existem)
- Bloqueia: 9.2 (deteccao IA), 9.3 (tela agenda corretor), 9.4 (tela agenda admin), 9.5 (lembretes), 9.6 (follow-up)

## Estimativa
M (Media) — 2-3 horas

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
