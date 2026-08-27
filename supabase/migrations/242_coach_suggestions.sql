-- =============================================================================
-- 242_coach_suggestions.sql — Story 90-1 (Epic 90 — Live Coach)
-- =============================================================================
-- Sugestões do Live Coach: quando o LEAD levanta uma objeção numa conversa que o
-- CORRETOR assumiu (Nicole calada), o webhook gera aqui uma sugestão de resposta
-- ancorada no RAG. Uma linha por objeção detectada.
--
-- Quem escreve: só o service-role, dentro do `after()` do webhook
-- (`api/webhook/whatsapp/route.ts`) via `lib/coach/generate-suggestion.ts`.
--
-- Quem lê: o corretor, na thread do `/broker/leads/[id]` (Story 90-2), via
-- Realtime. Por isso — diferente de lead_forms (232) e fvs_* (219), que são
-- RLS-sem-policy — esta tabela PRECISA de policy de SELECT: a entrega de eventos
-- do Realtime é filtrada pela RLS da sessão. Sem a policy o card nunca aparece,
-- e o sintoma enganoso é "realtime não funciona".
--
-- A policy espelha `messages_select` (229_f4_god_gate_fatiado.sql) — mesma regra
-- de visibilidade da conversa que a originou, sem inventar critério novo.
--
-- IA nunca fala com o lead: nada aqui é enviado automaticamente. `used_at` e
-- `dismissed_at` registram a decisão HUMANA (a rota que os escreve por ação do
-- corretor é da Story 90-2; nesta story só o supersede automático usa dismissed_at).
-- =============================================================================

-- ============================================================================
-- 1. Tabela
-- ============================================================================
CREATE TABLE IF NOT EXISTS coach_suggestions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  lead_id         uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  -- A mensagem do lead que originou a sugestão. O id vem do
  -- `.select("id, created_at")` do INSERT inbound — sem query extra.
  message_id      uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,

  -- ---- Contrato do épico ---------------------------------------------------
  -- A objeção detectada, em uma frase, na linguagem do lead.
  objecao         text NOT NULL,
  -- Classe da objeção. Texto livre com CHECK: a lista é de produto e pode crescer
  -- sem migration de tipo (enum exigiria ALTER TYPE).
  tipo            text NOT NULL CHECK (tipo IN (
                    'preco', 'prazo', 'localizacao', 'concorrente',
                    'decisor', 'financiamento', 'indeciso', 'outro'
                  )),
  -- Só `alta`/`media` chegam a ser persistidas (o detector descarta o resto).
  confianca       text NOT NULL CHECK (confianca IN ('alta', 'media')),
  -- Rascunhos prontos para o corretor colar e editar: array de strings (1-2).
  respostas       jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Trechos/fontes do RAG e do perfil que sustentam as respostas.
  ancoras         jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- `true` só quando há ao menos uma âncora real. Honestidade sobre a origem,
  -- mesmo espírito do `dados_faltando` da análise de comportamento (Epic 82).
  ancorada        boolean NOT NULL DEFAULT false,
  -- O que NÃO prometer neste caso (desconto não autorizado, prazo não confirmado).
  cuidado         text,

  -- ---- Ciclo de vida (é isto que mede adoção) ------------------------------
  -- Corretor usou a sugestão no input (Story 90-2).
  used_at         timestamptz,
  -- Descartada pelo corretor OU superseded por uma sugestão mais nova da mesma
  -- conversa (regra "uma sugestão ativa por conversa").
  dismissed_at    timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. Índices
-- ============================================================================
-- Busca da sugestão ativa da conversa (thread do corretor + supersede).
CREATE INDEX IF NOT EXISTS idx_coach_suggestions_conversation
  ON coach_suggestions(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coach_suggestions_org
  ON coach_suggestions(org_id);

-- ============================================================================
-- 3. updated_at
-- ============================================================================
-- Função `update_updated_at()` (001_base_schema.sql:279); o trigger se chama
-- `set_updated_at` em todas as tabelas do projeto.
DROP TRIGGER IF EXISTS set_updated_at ON coach_suggestions;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON coach_suggestions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 4. RLS — espelho de messages_select (229)
-- ============================================================================
ALTER TABLE coach_suggestions ENABLE ROW LEVEL SECURITY;

-- Visibilidade idêntica à da conversa que originou a sugestão: mesma org E
-- (capability de ver qualquer conversa OU ser o corretor dono do lead).
-- Escrita continua exclusiva do service-role (nenhuma policy de INSERT/UPDATE).
DROP POLICY IF EXISTS "coach_suggestions_select" ON public.coach_suggestions;
CREATE POLICY "coach_suggestions_select" ON public.coach_suggestions FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = coach_suggestions.conversation_id) AND (c.org_id = user_org_id()) AND (has_capability('conversas.ver_qualquer'::text) OR (EXISTS ( SELECT 1
           FROM leads l
          WHERE ((l.id = c.lead_id) AND (l.assigned_broker_id = ( SELECT brokers.user_id
                   FROM brokers
                  WHERE (brokers.id = user_broker_id())))))))))));

-- ============================================================================
-- 5. Realtime
-- ============================================================================
-- Pré-requisito da Story 90-2: o card chega ao corretor por `postgres_changes`.
-- Idempotente, mesmo padrão de 102_realtime_messages.sql.
-- REPLICA IDENTITY: não alterada — o default basta para o payload de INSERT.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'coach_suggestions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.coach_suggestions;
  END IF;
END $$;
