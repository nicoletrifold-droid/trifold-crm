-- Migration 019: Portal do Cliente — Enum value
-- Epic 20 — Portal do Cliente (Story 20.1a)
--
-- Adds the 'cliente' value to the user_role enum.
--
-- WHY THIS IS A SEPARATE MIGRATION:
-- PostgreSQL forbids using a newly added enum value within the same
-- transaction (SQLSTATE 55P04 — "unsafe use of new value of enum type").
-- The helper function is_cliente() in migration 020 references 'cliente',
-- so the enum value must be committed in its own transaction first.
-- Each Supabase migration runs in its own transaction by default.
--
-- IF NOT EXISTS is supported since PostgreSQL >= 9.6 (Supabase runs PG 15+).

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'cliente';
