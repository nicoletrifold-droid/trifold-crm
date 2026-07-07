-- 163_pastas_imobiliaria_fk.sql
-- Story 75-148 — Pastas passam a REFERENCIAR a tabela `imobiliarias` (antes era texto livre).
-- Adiciona `imobiliaria_id` (FK) em `pastas` e `pasta_links`. A coluna `imobiliaria` (texto)
-- é mantida como SNAPSHOT do nome (exibição/filtro sem join); a verdade p/ relatório é o id.
-- Aplicar MANUALMENTE em prod (projeto sem CI/CLI). Aditivo/nullable → sem quebra.

alter table pastas
  add column if not exists imobiliaria_id uuid references imobiliarias(id) on delete set null;

alter table pasta_links
  add column if not exists imobiliaria_id uuid references imobiliarias(id) on delete set null;

create index if not exists idx_pastas_imobiliaria_id on pastas(imobiliaria_id);
create index if not exists idx_pasta_links_imobiliaria_id on pasta_links(imobiliaria_id);

-- Backfill best-effort: casa o texto livre existente com imobiliarias.nome (mesma org,
-- case-insensitive). O que não casar fica sem vínculo (imobiliaria_id null) — não quebra nada.
update pastas p
  set imobiliaria_id = i.id
  from imobiliarias i
  where p.imobiliaria_id is null
    and p.imobiliaria is not null
    and i.org_id = p.org_id
    and lower(trim(i.nome)) = lower(trim(p.imobiliaria));

update pasta_links pl
  set imobiliaria_id = i.id
  from imobiliarias i
  where pl.imobiliaria_id is null
    and pl.imobiliaria is not null
    and i.org_id = pl.org_id
    and lower(trim(i.nome)) = lower(trim(pl.imobiliaria));
