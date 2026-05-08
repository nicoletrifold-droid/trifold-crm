# Story 15.1 — Migration: Campaign Engine (campaigns + entries + events)

## Status
Done

## Executor Assignment
executor: "@data-engineer"
quality_gate: "@dev"
quality_gate_tools: ["schema-validation", "migration-review"]

## Story
**As a** sistema CRM,
**I want** ter tabelas dedicadas para gerenciar campanhas de marketing, cadastros e eventos de tracking,
**so that** cada acao de marketing (PDV, eventos, feiras) tenha dados estruturados e rastreio de performance.

## Contexto

**Epic 15 — Campaign Engine + Google Forms Integration (Fase 1 MVP)**

Primeira story do epic. Cria a fundacao do modelo de dados para o Campaign Engine conforme documento de arquitetura (`docs/architecture/supermuffato-google-forms-integration.md`, secao 4.1).

**Primeira acao:** Concurso Vind Residence no Supermuffato. Mas o modelo e generico para N campanhas futuras.

**Dependencias:** Nenhuma. Esta story e pre-requisito para todas as outras do epic.

## Acceptance Criteria

1. [ ] AC1: Tabela `campaigns` criada conforme schema da arquitetura (secao 4.1), com todos os campos: name, slug, description, starts_at, ends_at, type, form_url, google_form_id, last_polled_at, last_response_at, field_mapping, whatsapp_template_name, email_enabled, email_subject, email_body_html, property_id, status
2. [ ] AC2: Tabela `campaign_entries` criada com todos os campos: name, phone, email, custom_data, google_response_id, whatsapp_status, email_status, is_valid_phone, is_valid_email, has_responded, nicole_outbound_at, nicole_outbound_by, nicole_conversation_id, raw_payload
3. [ ] AC3: Tabela `campaign_events` criada com campos: channel, event_type, metadata
4. [ ] AC4: `ALTER TYPE lead_source ADD VALUE 'google_forms'` executado
5. [ ] AC5: `ALTER TABLE organizations ADD COLUMN google_oauth_tokens JSONB` executado (para armazenar tokens OAuth2)
6. [ ] AC6: Constraints CHECK aplicados: campaigns.status IN ('draft','active','paused','ended'), campaign_entries.whatsapp_status IN ('pending','sent','delivered','read','failed'), campaign_entries.email_status IN ('pending','sent','delivered','opened','bounced','failed'), campaign_events.channel IN ('whatsapp','email')
7. [ ] AC7: UNIQUE constraints: campaigns(org_id, slug), campaign_entries(campaign_id, phone), campaign_entries(campaign_id, google_response_id)
8. [ ] AC8: Indexes criados: idx_campaign_entries_campaign, idx_campaign_entries_phone, idx_campaign_entries_lead, idx_campaign_entries_valid, idx_campaign_events_entry, idx_campaign_events_type
9. [ ] AC9: RLS habilitado nas 3 tabelas com policies `org_access` conforme arquitetura
10. [ ] AC10: FKs: campaigns.org_id → organizations, campaigns.property_id → properties, campaign_entries.campaign_id → campaigns, campaign_entries.lead_id → leads, campaign_events.campaign_id → campaigns, campaign_events.entry_id → campaign_entries
11. [ ] AC11: Migration roda sem erros em `supabase db push` ou `supabase migration up`
12. [ ] AC12: `pnpm run type-check` passa sem erros

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled in `core-config.yaml`.
> Quality validation will use manual review process only.

## Tasks / Subtasks

- [x] Task 1: Criar migration file (AC1-AC10)
  - [x] 1.1: Criar `supabase/migrations/013_campaign_engine.sql`
  - [x] 1.2: CREATE TABLE campaigns com todos os campos e constraints
  - [x] 1.3: CREATE TABLE campaign_entries com todos os campos, constraints e UNIQUE
  - [x] 1.4: CREATE TABLE campaign_events com campos e constraints
  - [x] 1.5: ALTER TYPE lead_source ADD VALUE 'google_forms'
  - [x] 1.6: ALTER TABLE organizations ADD COLUMN google_oauth_tokens JSONB
  - [x] 1.7: Criar todos os indexes
  - [x] 1.8: Habilitar RLS e criar policies org_access para as 3 tabelas

- [ ] Task 2: Validar migration (AC11, AC12)
  - [ ] 2.1: Executar migration localmente (requer supabase local)
  - [x] 2.2: Verificar type-check

## Dev Notes

### Schema Completo

Referencia: `docs/architecture/supermuffato-google-forms-integration.md` secao 4.1

**campaigns:**
```sql
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL DEFAULT 'google_forms',
  form_url TEXT,
  google_form_id TEXT,
  last_polled_at TIMESTAMPTZ,
  last_response_at TIMESTAMPTZ,
  field_mapping JSONB DEFAULT '{}',
  whatsapp_template_name TEXT,
  email_enabled BOOLEAN DEFAULT true,
  email_subject TEXT,
  email_body_html TEXT,
  property_id UUID REFERENCES properties(id),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'ended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, slug)
);
```

**campaign_entries:** Ver arquitetura secao 4.1 para schema completo.
**campaign_events:** Ver arquitetura secao 4.1 para schema completo.

### Source Tree Relevante

- `supabase/migrations/001_base_schema.sql` — schema base, enum lead_source (linhas 22-31)
- `packages/shared/src/constants/stages.ts` — STAGE_IDS para referencia

### Testing

- Validar migration com `supabase db push`
- `pnpm run type-check` deve passar

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-16 | 1.0 | Story criada | @sm (River) |
| 2026-05-08 | @po | Story closed — implementada em produção, Campaign Engine verificado | — |
