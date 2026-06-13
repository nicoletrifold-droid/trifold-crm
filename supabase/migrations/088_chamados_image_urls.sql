-- Migration 088: Suporte a múltiplas imagens por chamado
-- Story 52-2

ALTER TABLE public.chamados
  ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}';

-- Migra dados existentes: se há image_url, copia para image_urls[0]
UPDATE public.chamados
  SET image_urls = ARRAY[image_url]
  WHERE image_url IS NOT NULL AND image_urls = '{}';
