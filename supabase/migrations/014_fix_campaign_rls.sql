-- Migration 014: Fix Campaign RLS policies
-- Bug: policies used `id = auth.uid()` instead of `auth_id = auth.uid()`

DROP POLICY IF EXISTS "org_access" ON campaigns;
DROP POLICY IF EXISTS "org_access" ON campaign_entries;
DROP POLICY IF EXISTS "org_access" ON campaign_events;

CREATE POLICY "org_access" ON campaigns
  FOR ALL USING (org_id = (SELECT org_id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY "org_access" ON campaign_entries
  FOR ALL USING (org_id = (SELECT org_id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY "org_access" ON campaign_events
  FOR ALL USING (org_id = (SELECT org_id FROM users WHERE auth_id = auth.uid()));
