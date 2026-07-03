-- 157_signature_envelopes.sql
-- Story 75-120 — Integração Clicksign: assinatura eletrônica a partir do módulo Pastas.
-- Vincula um envelope da Clicksign a uma pasta/documento e guarda o status.
-- Dashboard acessa via sessão (RLS org-scoped). O webhook usa o admin client
-- (service role, ignora RLS) — mesmo padrão do módulo Pastas.

create table if not exists signature_envelopes (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id) on delete cascade,
  pasta_id            uuid not null references pastas(id) on delete cascade,
  pasta_documento_id  uuid references pasta_documentos(id) on delete set null,
  provider            text not null default 'clicksign',
  clicksign_envelope_id text,
  clicksign_document_id text,
  clicksign_signer_id   text,
  signer_name         text not null,
  signer_email        text,
  signer_phone        text,
  auth_method         text not null default 'email',
  status              text not null default 'draft'
                        check (status in ('draft','running','signed','refused','canceled','closed','error')),
  signed_storage_path text,
  last_event          text,
  created_by          uuid references users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_signature_envelopes_org on signature_envelopes(org_id);
create index if not exists idx_signature_envelopes_pasta on signature_envelopes(pasta_id);
create unique index if not exists idx_signature_envelopes_clicksign
  on signature_envelopes(clicksign_envelope_id)
  where clicksign_envelope_id is not null;

alter table signature_envelopes enable row level security;

drop policy if exists signature_envelopes_org_rw on signature_envelopes;
create policy signature_envelopes_org_rw on signature_envelopes
  for all to authenticated
  using (org_id in (select u.org_id from public.users u where u.auth_id = auth.uid()))
  with check (org_id in (select u.org_id from public.users u where u.auth_id = auth.uid()));
