status: Done

# Story 1.2 — Setup Supabase e Schema Base

## Contexto
O Supabase e a fundacao de dados de todo o sistema. O schema precisa contemplar todas as entidades imobiliarias (empreendimentos, tipologias, unidades) alem das tabelas ja existentes no agente-linda (organizations, users, leads, conversations, messages, etc.). A extensao pgvector tambem precisa ser habilitada para RAG.

## Acceptance Criteria
- [x] AC1: Projeto Supabase criado (staging: dsopqkqjkmhytudaaolv)
- [x] AC2: Extensoes habilitadas: `vector`, `uuid-ossp`
- [x] AC3: Migration `001_base_schema.sql` criada com TODAS as tabelas base adaptadas do agente-linda: `organizations`, `users`, `leads`, `conversations`, `messages`, `kanban_stages`, `agent_prompts`, `agent_config`, `knowledge_base`, `conversation_state`, `activities`
- [x] AC4: Migration `002_property_schema.sql` criada com tabelas novas: `properties`, `typologies`, `units`, `property_media`, `brokers`, `broker_assignments`, `lead_property_interest`, `visit_feedback`
- [x] AC5: Migration `003_whatsapp_config.sql` criada com tabela `whatsapp_config` (substituindo `whatsapp_instances` do Z-API) com campos: `id`, `org_id`, `waba_id`, `phone_number_id`, `access_token`, `verify_token`, `webhook_url`, `coexistence_enabled`, `status`, `created_at`, `updated_at`
- [x] AC6: Todos os campos de `leads` incluem os campos imobiliarios novos: `property_interest_id`, `has_down_payment`, `preferred_bedrooms`, `preferred_floor`, `preferred_view`, `preferred_garage_count`, `qualification_status`, `qualification_score`, `source`, `utm_*`, `assigned_broker_id`, `ai_summary`, `visit_scheduled_at`
- [x] AC7: Todos os campos de `conversation_state` incluem: `current_property_id`, `qualification_step`, `collected_data`, `materials_sent`, `visit_proposed`
- [x] AC8: Enums criados: `property_status`, `unit_status`, `qualification_status`, `broker_type`, `lead_source`, `media_type`, `stage_type`, `interest_level`
- [x] AC9: Foreign keys e constraints definidos conforme diagrama de relacionamentos do PRD (secao 3.3)
- [x] AC10: Indexes criados em campos de busca frequente: `leads.phone`, `leads.assigned_broker_id`, `units.property_id`, `units.status`, `messages.conversation_id`
- [x] AC11: Supabase URL e keys obtidos e documentados no `.env.example`

## Detalhes Tecnicos

### Arquivos a criar:
- `supabase/migrations/001_base_schema.sql`
- `supabase/migrations/002_property_schema.sql`
- `supabase/migrations/003_whatsapp_config.sql`
- `packages/db/src/index.ts` — Supabase client export
- `packages/db/src/types.ts` — Types gerados (ou placeholder para `supabase gen types`)
- `.env.example` — Template com todas as variaveis

### Schema `properties`:
```sql
CREATE TABLE properties (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  name varchar(255) NOT NULL,
  slug varchar(255) NOT NULL UNIQUE,
  status property_status NOT NULL DEFAULT 'launching',
  address text NOT NULL,
  neighborhood varchar(255),
  city varchar(255) NOT NULL,
  state varchar(2) NOT NULL,
  lat decimal,
  lng decimal,
  google_maps_url text,
  concept text,
  description text,
  differentials jsonb DEFAULT '[]',
  amenities jsonb DEFAULT '[]',
  delivery_date date,
  total_units integer,
  total_floors integer,
  units_per_floor integer,
  type_floors integer,
  basement_floors integer,
  leisure_floors integer,
  faq jsonb DEFAULT '[]',
  restrictions jsonb DEFAULT '[]',
  commercial_rules jsonb DEFAULT '{}',
  video_tour_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### Schema `typologies`:
```sql
CREATE TABLE typologies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  private_area_m2 decimal(8,2),
  total_area_m2 decimal(8,2),
  bedrooms integer,
  suites integer,
  bathrooms integer,
  has_balcony boolean DEFAULT false,
  balcony_bbq boolean DEFAULT false,
  floor_plan_url text,
  humanized_plan_url text,
  differentials jsonb DEFAULT '[]',
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### Schema `units`:
```sql
CREATE TABLE units (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  typology_id uuid REFERENCES typologies(id),
  identifier varchar(50) NOT NULL,
  floor integer NOT NULL,
  position varchar(50),
  view_direction varchar(100),
  garage_count integer NOT NULL DEFAULT 1,
  garage_type varchar(50),
  garage_area_m2 decimal(8,2),
  private_area_m2 decimal(8,2),
  status unit_status NOT NULL DEFAULT 'available',
  price decimal(12,2),
  price_per_m2 decimal(10,2),
  notes text,
  reserved_by_lead_id uuid REFERENCES leads(id),
  reserved_at timestamptz,
  sold_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### Referencia agente-linda:
- Adaptar de `~/agente-linda/supabase/migrations/` — tabelas `organizations`, `users`, `leads`, `conversations`, `messages`, `knowledge_base`, `agent_prompts`, `kanban_stages`, `conversation_state`, `activities`
- Adicionar campos imobiliarios novos em `leads` e `conversation_state`

## Dependencias
- Depende de: 1.1 (repo existe)
- Bloqueia: 1.3, 1.5, 1.6, 1.7, e todo o Bloco 2

## Estimativa
G (Grande) — 3-4 horas

## File List

### Created/Modified
- `supabase/migrations/001_base_schema.sql` — Tabelas base: organizations, users, leads, conversations, messages, kanban_stages, agent_prompts, agent_config, knowledge_base, conversation_state, activities
- `supabase/migrations/002_property_schema.sql` — Tabelas: properties, typologies, units, property_media, brokers, broker_assignments, lead_property_interest, visit_feedback
- `supabase/migrations/003_whatsapp_config.sql` — Tabela whatsapp_config
- `packages/db/src/index.ts` — Supabase client export
- `packages/db/src/types.ts` — Types TypeScript gerados
- `.env.example` — Template com todas as variaveis

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
