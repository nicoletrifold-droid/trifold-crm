-- Audit Logs: registro imutável de ações críticas dos usuários
-- Usado para rastreamento, auditoria, segurança e resolução de disputas.
-- Inserts apenas via service_role (helper logAudit usa createAdminClient).
-- SELECT apenas para admins da mesma org. UPDATE/DELETE bloqueados (imutável).

CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id       UUID        NOT NULL,
  user_id      UUID        NOT NULL,
  user_name    TEXT        NOT NULL,
  action       TEXT        NOT NULL,
  entity_type  TEXT,
  entity_id    TEXT,
  entity_name  TEXT,
  obra_id      UUID,
  metadata     JSONB       DEFAULT '{}' NOT NULL,
  ip_address   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id      ON audit_logs (org_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id     ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_obra_id     ON audit_logs (obra_id) WHERE obra_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_action      ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at  ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs (entity_type);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- SELECT: apenas admin da mesma org
DROP POLICY IF EXISTS "audit_logs_select_admin" ON audit_logs;
CREATE POLICY "audit_logs_select_admin"
  ON audit_logs FOR SELECT
  USING (
    org_id = (
      SELECT org_id FROM users WHERE auth_id = auth.uid()
    )
    AND (
      SELECT role FROM users WHERE auth_id = auth.uid()
    ) = 'admin'
  );

-- INSERT: bloqueado para usuários autenticados (service_role bypassa RLS)
DROP POLICY IF EXISTS "audit_logs_no_insert" ON audit_logs;
CREATE POLICY "audit_logs_no_insert"
  ON audit_logs FOR INSERT
  WITH CHECK (false);

-- UPDATE: bloqueado (logs são imutáveis)
DROP POLICY IF EXISTS "audit_logs_no_update" ON audit_logs;
CREATE POLICY "audit_logs_no_update"
  ON audit_logs FOR UPDATE
  USING (false)
  WITH CHECK (false);

-- DELETE: bloqueado (logs são imutáveis)
DROP POLICY IF EXISTS "audit_logs_no_delete" ON audit_logs;
CREATE POLICY "audit_logs_no_delete"
  ON audit_logs FOR DELETE
  USING (false);
