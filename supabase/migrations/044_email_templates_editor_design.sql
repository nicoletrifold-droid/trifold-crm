-- Migration 044: Add editor_design column to email_templates
-- Stores the Unlayer JSON design for round-trip visual editing

ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS editor_design JSONB DEFAULT NULL;

COMMENT ON COLUMN email_templates.editor_design IS
  'Unlayer visual editor JSON design — used for re-opening templates in visual mode';
