-- 078_agent_chat.sql
-- Epic C — Stories C-1
-- Chat sessions and messages for the Meta Ads Intelligence Agent.

-- ── Sessions ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_chat_sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT,                        -- auto-generated from first user message
  context_type TEXT        NOT NULL DEFAULT 'global'
               CHECK (context_type IN ('global', 'campaign')),
  context_id   TEXT,                        -- meta_campaign_id when context_type='campaign'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON agent_chat_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_agent_sessions_user
  ON agent_chat_sessions (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_org
  ON agent_chat_sessions (org_id, updated_at DESC);

-- ── Messages ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_chat_messages (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         UUID        NOT NULL REFERENCES agent_chat_sessions(id) ON DELETE CASCADE,
  role               TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content            TEXT        NOT NULL,

  -- Action card: populated by the agent when suggesting an executable action
  action_card        JSONB,
  -- pending | confirmed | cancelled | executed — NULL when no action card
  action_status      TEXT        CHECK (action_status IN ('pending', 'confirmed', 'cancelled', 'executed')),
  action_executed_at TIMESTAMPTZ,
  action_executed_by UUID        REFERENCES users(id) ON DELETE SET NULL,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_session
  ON agent_chat_messages (session_id, created_at ASC);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE agent_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_chat_messages ENABLE ROW LEVEL SECURITY;

-- Users can only see sessions from their own org (joined via agent_chat_sessions)
CREATE POLICY "org_isolation" ON agent_chat_sessions
  FOR ALL USING (org_id = public.user_org_id());

CREATE POLICY "session_via_org" ON agent_chat_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM agent_chat_sessions s
      WHERE s.id = session_id
        AND s.org_id = public.user_org_id()
    )
  );
