-- Migration 027: Add property_id FK to obras
-- Links obras to properties (empreendimentos) for Epic 24 — client portal

ALTER TABLE obras
  ADD COLUMN IF NOT EXISTS property_id uuid
  REFERENCES properties(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_obras_property_id ON obras(property_id);
