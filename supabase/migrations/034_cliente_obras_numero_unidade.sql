-- Migration 034: Número de Unidade no Vínculo Cliente-Obra
-- Story 32.1 — Epic 32
--
-- Propósito: Adicionar campo opcional numero_unidade à tabela cliente_obras
-- para registrar qual unidade/apartamento pertence a cada cliente vinculado.
-- Campo NULL por padrão — obras sem numeração de unidades não são impactadas.

ALTER TABLE public.cliente_obras
  ADD COLUMN IF NOT EXISTS numero_unidade text NULL;
