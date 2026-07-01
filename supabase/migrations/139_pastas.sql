-- 139_pastas.sql
-- Story 75-104 — Módulo "Pastas": interessado faz upload dos documentos por link público.
-- Não amarra ao CRM/lead. Público acessa via admin client (service role) usando o token;
-- o dashboard acessa via sessão do usuário (RLS org-scoped abaixo).

create table if not exists pastas (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  nome          text not null,
  tipo          text not null default 'pf' check (tipo in ('pf','pj')),
  casado        boolean not null default false,
  empreendimento text,
  token         text not null unique,
  status        text not null default 'aberta' check (status in ('aberta','completa','arquivada')),
  form_data     jsonb not null default '{}'::jsonb,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists pasta_documentos (
  id            uuid primary key default gen_random_uuid(),
  pasta_id      uuid not null references pastas(id) on delete cascade,
  slug          text not null,
  label         text not null,
  titular       text not null default 'interessado' check (titular in ('interessado','conjuge','representante')),
  required      boolean not null default true,
  situacao      text not null default 'pendente' check (situacao in ('pendente','entregue','deferido','recusado')),
  storage_path  text,
  filename      text,
  file_size_bytes bigint,
  uploaded_at   timestamptz,
  ordem         int not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists idx_pastas_org on pastas(org_id);
create index if not exists idx_pastas_token on pastas(token);
create index if not exists idx_pasta_documentos_pasta on pasta_documentos(pasta_id);

-- Bucket PRIVADO. Upload/download só via API (service role no público; signed URL no dashboard).
insert into storage.buckets (id, name, public)
values ('pastas', 'pastas', false)
on conflict (id) do nothing;

-- RLS: dashboard (usuário autenticado) só enxerga pastas da própria org. O público
-- NÃO usa estas policies (passa pelo service role, que ignora RLS).
alter table pastas enable row level security;
alter table pasta_documentos enable row level security;

drop policy if exists pastas_org_rw on pastas;
create policy pastas_org_rw on pastas
  for all to authenticated
  using (org_id in (select u.org_id from public.users u where u.auth_id = auth.uid()))
  with check (org_id in (select u.org_id from public.users u where u.auth_id = auth.uid()));

drop policy if exists pasta_documentos_org_rw on pasta_documentos;
create policy pasta_documentos_org_rw on pasta_documentos
  for all to authenticated
  using (exists (
    select 1 from pastas p join public.users u on u.org_id = p.org_id
    where p.id = pasta_documentos.pasta_id and u.auth_id = auth.uid()
  ))
  with check (exists (
    select 1 from pastas p join public.users u on u.org_id = p.org_id
    where p.id = pasta_documentos.pasta_id and u.auth_id = auth.uid()
  ));
