-- 147_lancamento_cards_rich.sql
-- Story Lançamentos-04 — Cartão rico: etiquetas, prazo e responsável.
-- Colunas nullable/DEFAULT → migração segura (cartões existentes não quebram).

ALTER TABLE lancamento_cards
  ADD COLUMN IF NOT EXISTS due_date    timestamptz,
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS labels      text[] NOT NULL DEFAULT '{}';
