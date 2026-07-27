-- 193_marketing_posts.sql
-- Story 75-219 — Módulo Campanhas › aba "Agente": fila de aprovação de posts
-- do agente de marketing IA. O agente INSERE sugestões (status='sugerido'),
-- o humano aprova/rejeita/edita; publicação é SEMPRE manual nesta fase.
--
-- Fluxo de status (validado server-side no PATCH):
--   sugerido → aprovado | rejeitado
--   aprovado → publicado
--   rejeitado e publicado são TERMINAIS. Rejeitado não é DELETE — permanece
--   consultável como histórico/aprendizado.
--
-- Segurança: RLS HABILITADA SEM POLICIES → acesso exclusivamente via rotas API
-- gateadas requireRole(['admin','supervisor']) com service-role (admin client).
-- Mesmo padrão de lancamentos (mig 145), imobiliarias (131) e imob_* (129).
-- org_id é OBRIGATÓRIO em todo INSERT (tabela multi-org, sem trigger que preencha).

CREATE TABLE IF NOT EXISTS marketing_posts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  empreendimento_id uuid REFERENCES properties(id) ON DELETE SET NULL,  -- NULL = post institucional
  canal             text NOT NULL CHECK (canal IN ('instagram', 'facebook')),
  copy              text NOT NULL,
  arte_url          text,                                               -- link do design Canva colado manualmente nesta fase
  scheduled_for     date,                                               -- DIA sugerido de publicação (hora = decisão manual fora do CRM)
  status            text NOT NULL DEFAULT 'sugerido'
                      CHECK (status IN ('sugerido', 'aprovado', 'rejeitado', 'publicado')),
  justificativa     text,                                               -- por que o agente sugeriu (cita dados de performance)
  origem            text NOT NULL DEFAULT 'agente' CHECK (origem IN ('agente', 'humano')),
  created_by        uuid REFERENCES users(id) ON DELETE SET NULL,       -- humano criador; NULL quando origem='agente'
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_posts_org_status ON marketing_posts(org_id, status);

ALTER TABLE marketing_posts ENABLE ROW LEVEL SECURITY;
-- (sem CREATE POLICY de propósito: acesso só via service-role/admin client + API gated)

COMMENT ON TABLE marketing_posts IS
  'Story 75-219: fila de aprovação do agente de marketing IA (aba Agente do módulo Campanhas). Agente insere sugestões, humano aprova/rejeita/publica manualmente. RLS sem policies — acesso via admin client em rotas requireRole(admin/supervisor).';
COMMENT ON COLUMN marketing_posts.empreendimento_id IS
  'FK properties; NULL = post institucional (sem empreendimento específico).';
COMMENT ON COLUMN marketing_posts.status IS
  'sugerido → aprovado | rejeitado; aprovado → publicado. Rejeitado/publicado são terminais; rejeitado nunca é deletado.';
COMMENT ON COLUMN marketing_posts.justificativa IS
  'Motivação da sugestão citando dados reais (CPL, funil CRM por criativo, leads válidos vs cadastros).';
COMMENT ON COLUMN marketing_posts.origem IS
  'agente = sugerido pela IA (created_by NULL); humano = cadastro manual via "+ Novo post".';
COMMENT ON COLUMN marketing_posts.scheduled_for IS
  'Data (dia) sugerida de publicação — sem hora de propósito; nada é publicado automaticamente nesta fase.';
