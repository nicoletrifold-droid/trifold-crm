-- ============================================
-- 063: Add Proposta and Represamento kanban stages
-- ============================================
-- Proposta (UUID 9d3ddf3c-...): UUID já hardcoded no supremo-sync para id_situacao=10261.
--   Leads com situação PROPOSTA no Supremo já têm esse stage_id no banco — eles estavam
--   invisíveis porque o stage não existia na tabela. Ao inserir, aparecem automaticamente.
--
-- Represamento (UUID 00000000-...-010): novo stage para id_situacao=10688.
--   O supremo-sync mapeava 10688 → perdido (errado). Após essa migration e a atualização
--   do cron, o próximo full-sync move os leads para a coluna correta.

-- 'represamento' foi adicionado ao enum em 046, safe to repeat
ALTER TYPE stage_type ADD VALUE IF NOT EXISTS 'represamento';

-- ── Passo 1: abrir espaço para Proposta na posição 7 ──────────────────────────
-- Shift Negociando (7→8), Fechou (8→9), Perdido (9→10)
UPDATE kanban_stages
SET position = position + 1
WHERE org_id = '00000000-0000-0000-0000-000000000001'
  AND position >= 7;

-- ── Passo 2: inserir Proposta na posição 7 ────────────────────────────────────
INSERT INTO kanban_stages (id, org_id, name, slug, type, position, color, is_default)
VALUES (
  '9d3ddf3c-8049-4dd8-9e8b-81bba99ee529',
  '00000000-0000-0000-0000-000000000001',
  'Proposta', 'proposta', 'proposta', 7, '#0EA5E9', false
)
ON CONFLICT (id) DO UPDATE SET
  name     = EXCLUDED.name,
  slug     = EXCLUDED.slug,
  type     = EXCLUDED.type,
  position = EXCLUDED.position,
  color    = EXCLUDED.color;

-- ── Passo 3: abrir espaço para Represamento na posição 10 ─────────────────────
-- Shift Perdido (10→11)
UPDATE kanban_stages
SET position = position + 1
WHERE org_id = '00000000-0000-0000-0000-000000000001'
  AND position >= 10;

-- ── Passo 4: inserir Represamento na posição 10 ───────────────────────────────
INSERT INTO kanban_stages (id, org_id, name, slug, type, position, color, is_default)
VALUES (
  '00000000-0000-0000-0001-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'Represamento', 'represamento', 'represamento', 10, '#9333EA', false
)
ON CONFLICT (id) DO UPDATE SET
  name     = EXCLUDED.name,
  slug     = EXCLUDED.slug,
  type     = EXCLUDED.type,
  position = EXCLUDED.position,
  color    = EXCLUDED.color;

-- ── Resultado final de posições ───────────────────────────────────────────────
--  1  Novo
--  2  Em Qualificação
--  3  Qualificado
--  4  Visita Agendada
--  5  No-Show
--  6  Visitou
--  7  Proposta          ← novo (leads com id_situacao=10261 já aparecem aqui)
--  8  Negociando
--  9  Fechou
-- 10  Represamento      ← novo (próximo full-sync move leads de id_situacao=10688)
-- 11  Perdido
