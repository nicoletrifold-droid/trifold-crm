-- =============================================================================
-- 180_visit_feedback_appointment_org.sql — Story 75-188
-- =============================================================================
-- A migration 011 nunca chegou ao PROD: visit_feedback ficou sem appointment_id
-- e org_id (ausência documentada na 031 em 2026-05-12 e nunca sanada). Sem a FK,
-- o embed PostgREST `appointments → visit_feedback` retorna PGRST200 e TODO o
-- fluxo de feedback de visita (75-185/186) + pós-visita da Nicole (cron followup)
-- quebra silenciosamente; o INSERT do formulário falha com 42703.
--
-- Espelha a 011 (IF NOT EXISTS → no-op no dev, que já tem as colunas) e cria os
-- índices pulados pela 031. Tabela vazia no prod → DDL instantânea.
-- =============================================================================

ALTER TABLE visit_feedback ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES appointments(id);
ALTER TABLE visit_feedback ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);

CREATE INDEX IF NOT EXISTS idx_visit_feedback_appointment ON visit_feedback(appointment_id);
CREATE INDEX IF NOT EXISTS idx_visit_feedback_org ON visit_feedback(org_id);

-- appointments.property_id é nullable (agendamento sem empreendimento é válido);
-- o feedback herda o empreendimento do agendamento, então também precisa aceitar null.
ALTER TABLE visit_feedback ALTER COLUMN property_id DROP NOT NULL;

-- PostgREST precisa recarregar o schema cache para enxergar a FK nova (embed).
NOTIFY pgrst, 'reload schema';
