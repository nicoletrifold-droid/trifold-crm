-- 158_pastas_wizard_campos.sql
-- Story 75-123 — Módulo "Pastas": novo "Nova Pasta" em wizard progressivo.
-- Captura a origem (corretor/imobiliária — texto livre, NÃO amarra ao CRM), os
-- contatos do interessado e a marcação PIX (que injeta 1 documento no checklist).
--
-- Todas as colunas são nullable exceto tem_pix (default false) → pastas existentes
-- seguem válidas sem backfill.

alter table pastas
  add column if not exists corretor_nome        text,
  add column if not exists corretor_telefone     text,
  add column if not exists corretor_email        text,
  add column if not exists imobiliaria           text,
  add column if not exists interessado_telefone  text,
  add column if not exists interessado_email     text,
  add column if not exists tem_pix               boolean not null default false;
