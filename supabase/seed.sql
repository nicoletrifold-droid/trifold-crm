-- seed.sql
-- Dados iniciais do Trifold CRM
-- Idempotente: pode rodar multiplas vezes sem duplicar

-- ============================================
-- ORGANIZACAO
-- ============================================
INSERT INTO organizations (id, name, slug, settings)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Trifold Engenharia',
  'trifold',
  '{"city": "Maringa", "state": "PR", "address": "Maringa, PR"}'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  settings = EXCLUDED.settings;

-- ============================================
-- KANBAN STAGES
-- ============================================
INSERT INTO kanban_stages (id, org_id, name, slug, type, position, color, is_default) VALUES
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', 'Novo',             'novo',             'novo',        1, '#3B82F6', true),
  ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', 'Em Qualificacao',   'em-qualificacao',  'qualificado', 2, '#F59E0B', false),
  ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000001', 'Qualificado',       'qualificado',      'qualificado', 3, '#10B981', false),
  ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-000000000001', 'Visita Agendada',   'visita-agendada',  'agendado',    4, '#8B5CF6', false),
  ('00000000-0000-0000-0001-000000000009', '00000000-0000-0000-0000-000000000001', 'No-Show',           'no-show',          'no_show',     5, '#F43F5E', false),
  ('00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0000-000000000001', 'Visitou',           'visitou',          'visitou',     6, '#06B6D4', false),
  ('00000000-0000-0000-0001-000000000006', '00000000-0000-0000-0000-000000000001', 'Negociando',        'negociando',       'proposta',    7, '#F97316', false),
  ('00000000-0000-0000-0001-000000000007', '00000000-0000-0000-0000-000000000001', 'Fechou',            'fechou',           'fechado',     8, '#22C55E', false),
  ('00000000-0000-0000-0001-000000000008', '00000000-0000-0000-0000-000000000001', 'Perdido',           'perdido',          'perdido',     9, '#EF4444', false)
ON CONFLICT (org_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  position = EXCLUDED.position,
  color = EXCLUDED.color;

-- ============================================
-- AGENT CONFIG
-- ============================================
INSERT INTO agent_config (id, org_id, personality_prompt, greeting_message, out_of_hours_message, business_hours, model_primary, model_secondary, temperature, max_tokens)
VALUES (
  '00000000-0000-0000-0002-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Voce e a Nicole, assistente virtual da Trifold Engenharia. Simpatica, natural e boa praca.',
  'Oi! Eu sou a Nicole, da Trifold Engenharia! Como posso te ajudar hoje?',
  'Oi! No momento estamos fora do horario de atendimento. Vou anotar seus dados e retorno no proximo dia util!',
  '{"monday": {"start": "08:00", "end": "18:00"}, "tuesday": {"start": "08:00", "end": "18:00"}, "wednesday": {"start": "08:00", "end": "18:00"}, "thursday": {"start": "08:00", "end": "18:00"}, "friday": {"start": "08:00", "end": "18:00"}, "saturday": {"start": "08:00", "end": "12:00"}}',
  'claude-sonnet-4-5-20250514',
  'claude-haiku-4-5-20251001',
  0.7,
  1024
)
ON CONFLICT (id) DO UPDATE SET
  personality_prompt = EXCLUDED.personality_prompt,
  greeting_message = EXCLUDED.greeting_message,
  out_of_hours_message = EXCLUDED.out_of_hours_message,
  business_hours = EXCLUDED.business_hours;

-- ============================================
-- AGENT PROMPTS (placeholders)
-- ============================================
INSERT INTO agent_prompts (id, org_id, name, slug, content, type) VALUES
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 'Personalidade Nicole',             'system-personality',      '[placeholder — Story 3.1]', 'system'),
  ('00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0000-000000000001', 'Fluxo de Qualificacao',            'qualification-flow',      '[placeholder — Story 3.4]', 'qualification'),
  ('00000000-0000-0000-0003-000000000003', '00000000-0000-0000-0000-000000000001', 'Apresentacao de Empreendimentos',  'property-presentation',   '[placeholder — Story 3.3]', 'system'),
  ('00000000-0000-0000-0003-000000000004', '00000000-0000-0000-0000-000000000001', 'Agendamento de Visitas',           'visit-scheduling',        '[placeholder — Story 3.8]', 'system'),
  ('00000000-0000-0000-0003-000000000005', '00000000-0000-0000-0000-000000000001', 'Resumo para Corretor',             'handoff-summary',         '[placeholder — Story 3.10]', 'handoff'),
  ('00000000-0000-0000-0003-000000000006', '00000000-0000-0000-0000-000000000001', 'Guardrails da IA',                 'guardrails',              '[placeholder — Story 3.6]', 'guardrail'),
  ('00000000-0000-0000-0003-000000000007', '00000000-0000-0000-0000-000000000001', 'Mensagem Fora do Horario',         'off-hours',               '[placeholder — Story 3.8]', 'system')
ON CONFLICT (org_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  content = EXCLUDED.content,
  type = EXCLUDED.type;
