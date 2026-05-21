-- ============================================
-- LEAD TASKS (tarefas agendadas por corretor)
-- ============================================

CREATE TABLE lead_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  action_type text NOT NULL DEFAULT 'outro',
  due_at timestamptz,
  completed_at timestamptz,
  completed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual',
  supremo_lead_id integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_tasks_lead ON lead_tasks(lead_id);
CREATE INDEX idx_lead_tasks_org ON lead_tasks(org_id);
CREATE INDEX idx_lead_tasks_assigned ON lead_tasks(assigned_to);
CREATE INDEX idx_lead_tasks_due ON lead_tasks(due_at) WHERE completed_at IS NULL;

ALTER TABLE lead_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_tasks_select" ON lead_tasks
  FOR SELECT USING (org_id = public.user_org_id());

CREATE POLICY "lead_tasks_manage" ON lead_tasks
  FOR ALL USING (org_id = public.user_org_id());

CREATE TRIGGER set_updated_at BEFORE UPDATE ON lead_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
