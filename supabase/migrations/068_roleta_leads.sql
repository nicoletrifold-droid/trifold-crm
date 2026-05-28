-- 068_roleta_leads.sql
-- Distribuidor automático de leads (roleta round-robin)

-- ============================================
-- ROLETA CONFIG (por organização)
-- ============================================
CREATE TABLE roleta_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  -- 0=dom, 1=seg, 2=ter, 3=qua, 4=qui, 5=sex, 6=sab
  business_days integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  business_hour_start time NOT NULL DEFAULT '08:00',
  business_hour_end time NOT NULL DEFAULT '18:00',
  timezone varchar(50) NOT NULL DEFAULT 'America/Sao_Paulo',
  notify_push boolean NOT NULL DEFAULT true,
  notify_email boolean NOT NULL DEFAULT true,
  notify_whatsapp boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE roleta_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roleta_config_org" ON roleta_config
  USING (org_id = user_org_id());

CREATE TRIGGER set_updated_at BEFORE UPDATE ON roleta_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ROLETA FILA (posição de cada corretor)
-- ============================================
CREATE TABLE roleta_fila (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  broker_id uuid NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
  position integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, broker_id),
  UNIQUE(org_id, position)
);

CREATE INDEX idx_roleta_fila_org ON roleta_fila(org_id, position);

ALTER TABLE roleta_fila ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roleta_fila_org" ON roleta_fila
  USING (org_id = user_org_id());

CREATE TRIGGER set_updated_at BEFORE UPDATE ON roleta_fila
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- LEAD DISTRIBUTION LOG (auditoria)
-- ============================================
CREATE TABLE lead_distribution_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  broker_id uuid REFERENCES brokers(id),
  -- 'distributed' | 'sem_corretor_disponivel' | 'fora_horario' | 'roleta_inativa' | 'sem_config'
  status varchar(50) NOT NULL,
  skipped_brokers jsonb NOT NULL DEFAULT '[]',
  notified_push boolean NOT NULL DEFAULT false,
  notified_email boolean NOT NULL DEFAULT false,
  notified_whatsapp boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_dist_log_lead ON lead_distribution_log(lead_id);
CREATE INDEX idx_lead_dist_log_org ON lead_distribution_log(org_id, created_at DESC);

ALTER TABLE lead_distribution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_dist_log_org" ON lead_distribution_log
  USING (org_id = user_org_id());
