-- Story 75-167 — Busca de lead sem acento + fuzzy (typo).
-- Aditivo: cria extensões, coluna normalizada gerada, índice trigram e RPC fuzzy.
-- Não altera dados nem queries existentes.

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- unaccent de 1 arg é STABLE; a forma de 2 args (com dicionário) é IMMUTABLE — necessário
-- para usar numa coluna GERADA. Wrapper fixa o dicionário e marca IMMUTABLE.
create or replace function public.f_unaccent(text)
returns text
language sql
immutable
parallel safe
strict
as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;

-- Coluna normalizada (minúsculo + sem acento) do nome, mantida pelo Postgres.
alter table public.leads
  add column if not exists name_search text
  generated always as (lower(public.f_unaccent(coalesce(name, '')))) stored;

-- Índice trigram: cobre ILIKE '%...%' (accent-insensitive) e o operador de similaridade '%'.
create index if not exists idx_leads_name_search_trgm
  on public.leads using gin (name_search extensions.gin_trgm_ops);

-- RPC: ids de leads cujo nome é PARECIDO (trigram) com o termo — tolera typo (maicon≈maicom).
-- Termo já normalizado no app (lower + sem acento). Respeita org (+ RLS via security invoker).
create or replace function public.fuzzy_lead_ids(
  p_org uuid,
  p_term text,
  p_limit int default 30
)
returns table(id uuid)
language sql
stable
security invoker
as $$
  select l.id
  from public.leads l
  where l.org_id = p_org
    and l.name_search operator(extensions.%) p_term
  order by extensions.similarity(l.name_search, p_term) desc
  limit p_limit
$$;
