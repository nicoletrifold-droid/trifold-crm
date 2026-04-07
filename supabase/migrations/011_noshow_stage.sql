-- ============================================
-- 011: No-Show Stage + visit_feedback Fix
-- ============================================
-- Adds No-Show kanban stage for leads that miss scheduled visits.
-- Fixes visit_feedback table missing columns (appointment_id, org_id).

-- 1a. Add 'no_show' to stage_type enum
ALTER TYPE stage_type ADD VALUE IF NOT EXISTS 'no_show';

-- 1b. Bump existing stage positions to make room at position 5
UPDATE kanban_stages SET position = position + 1
WHERE org_id = '00000000-0000-0000-0000-000000000001'
AND position >= 5;

-- 1c. Insert No-Show stage at position 5
INSERT INTO kanban_stages (id, org_id, name, slug, type, position, color, is_default)
VALUES (
  '00000000-0000-0000-0001-000000000009',
  '00000000-0000-0000-0000-000000000001',
  'No-Show', 'no-show', 'no_show', 5, '#F43F5E', false
)
ON CONFLICT (org_id, slug) DO UPDATE SET
  position = EXCLUDED.position,
  color = EXCLUDED.color,
  type = EXCLUDED.type;

-- 2. Fix visit_feedback — add missing columns + relax NOT NULLs
ALTER TABLE visit_feedback ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES appointments(id);
ALTER TABLE visit_feedback ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
ALTER TABLE visit_feedback ALTER COLUMN property_id DROP NOT NULL;
ALTER TABLE visit_feedback ALTER COLUMN visited_at DROP NOT NULL;

-- 3. Index for no-show detection cron performance
CREATE INDEX IF NOT EXISTS idx_appointments_noshow_detection
ON appointments(status, scheduled_at)
WHERE status IN ('scheduled', 'confirmed');
