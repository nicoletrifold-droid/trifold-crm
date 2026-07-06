-- 161_pasta_links.sql
-- Story 75-146 — Auto-cadastro de Pasta pela imobiliária (link público de CRIAÇÃO).
-- Um link POR imobiliária parceira: a imobiliária roda o wizard e cria a pasta SEM
-- login (service role valida o token). O link é rastreável e revogável (ativo=false).
-- Aplicar MANUALMENTE em prod (SQL Editor / Management API — projeto sem CI/CLI).
--
-- Todas as colunas novas são nullable/defaulted → pastas e fluxo interno pré-existentes
-- seguem válidos SEM backfill.

create table if not exists pasta_links (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id) on delete cascade,
  imobiliaria        text not null,
  token              text not null unique,
  ativo              boolean not null default true,
  -- Defaults opcionais de corretor (pré-preenchem, editáveis, a Tela 1 do wizard público).
  corretor_nome      text,
  corretor_telefone  text,
  corretor_email     text,
  created_by         uuid references users(id),
  created_at         timestamptz not null default now()
);

create index if not exists idx_pasta_links_org on pasta_links(org_id);
create index if not exists idx_pasta_links_token on pasta_links(token);

-- RLS org-scoped espelhando pastas_org_rw. O público NÃO usa esta policy (passa pelo
-- service role, que ignora RLS); ela só protege leitura/escrita cross-org por usuários
-- autenticados (dashboard).
alter table pasta_links enable row level security;

drop policy if exists pasta_links_org_rw on pasta_links;
create policy pasta_links_org_rw on pasta_links
  for all to authenticated
  using (org_id in (select u.org_id from public.users u where u.auth_id = auth.uid()))
  with check (org_id in (select u.org_id from public.users u where u.auth_id = auth.uid()));

-- Sinalização de origem da pasta + rastreio do link que a criou.
-- origem default 'interno' → pastas existentes seguem válidas; 'auto_cadastro' = via link público.
alter table pastas
  add column if not exists origem text not null default 'interno'
    check (origem in ('interno','auto_cadastro'));

alter table pastas
  add column if not exists link_id uuid references pasta_links(id) on delete set null;
